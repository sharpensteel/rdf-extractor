const RdfBookParser = require('./RdfBookParser');
const Author = require('../models/Author');
const Knex = require('knex');

/**
 * service for storing RdfBook models in database
 */
class BookService{

    /**
     * @param {Knex} knex
     * @param {RdfBookParser} rdfBookParser
     */
    constructor({knex, rdfBookParser}) {

        /** @type {Knex} */
        this.knex = knex;

        /** @type {RdfBookParser} */
        this.rdfBookParser = rdfBookParser;
    }


    async cleanAll(){
        await this.knex('book_author').del();
        await this.knex('book_subject').del();
        await this.knex('book').del();
        await this.knex('author').del();
    }


    /**
     * addressing n+1 problem for authors
     *
     * @param {string[]} authorsNamesLc
     * @return {Promise<Map<string, number>>}
     */
    async getAuthorsIdsPerNamesLc(authorsNamesLc){

        authorsNamesLc = [...new Set(authorsNamesLc)].filter(name => name).map(name => name.toLocaleLowerCase());

        if(!authorsNamesLc.length){
            return new Map;
        }
        let rows = await this.knex('author').select('id', 'name').whereIn(this.knex.raw('LOWER(NAME)'), authorsNamesLc);
        
        let idsPerNames = new Map(); 
        for(let row of rows){
            idsPerNames.set(row['name'].toLocaleLowerCase(), parseInt(row['id']));
        }
        return idsPerNames;
    }


    /**
     * @param {string} name
     * @param {?Knex.Transaction} transaction
     * @return {Promise<Author>}
     */
    async storeAuthorWithName(name, transaction){
        let author = new Author();
        author.name = name;

        let res = await (transaction || this.knex).insert({name}).into('author');
        author.id = res[0];
        return author;
    }

    /**
     * @param {RdfBook} rdfBook
     * @param {?Map<string, number>} authorsIdsPerNamesLcStored
     * @return {Promise}
     */
    async storeBookWithRelations(rdfBook, authorsIdsPerNamesLcStored= null){
        
        if(!authorsIdsPerNamesLcStored){
            authorsIdsPerNamesLcStored = await this.getAuthorsIdsPerNamesLc(rdfBook.authors || [])
        }

        let newAuthors = [];

        await this.knex.transaction(async (trx) => {

            let authorsIdsSet = new Set;

            for(let authorName of (rdfBook.authors || [])){
                let authorId = authorsIdsPerNamesLcStored.get(authorName.toLocaleLowerCase());
                if(!authorId){
                    let author = await this.storeAuthorWithName(authorName, trx);
                    newAuthors.push(author);
                    authorId = author.id;
                }
                authorsIdsSet.add(authorId);
            }

            await trx.insert({
                id: rdfBook.id,
                title: rdfBook.title,
                publisher: rdfBook.publisher,
                published_at: rdfBook.publishedAt || '0000-00-00 00:00:00',
                language: rdfBook.language,
                license: rdfBook.licenses.join('; '),
            }).into('book');

            for(let subject of rdfBook.subjects || []){
                await trx.insert({
                    book_id: rdfBook.id,
                    subject,
                }).into('book_subject');
            }

            for(let authorId of authorsIdsSet.values()){
                await trx.insert({
                    book_id: rdfBook.id,
                    author_id: authorId,
                }).into('book_author');
            }
        });

        for(let author of newAuthors){
            let nameLc = author.name && author.name.toLocaleLowerCase();
            nameLc && authorsIdsPerNamesLcStored.set(nameLc, author.id);
        }
    }


    /**
     *
     * @param {boolean} needCleanAll  if true: all tables truncated; if false: stored only books that was not stored earlier
     * @return {Promise<void>}
     */
    async storeAllBooks(needCleanAll){

        if(needCleanAll){
            await this.cleanAll();
        }

        let booksIds = await this.rdfBookParser.scanBooksIds();


        let indexChunkStart = 0;
        let chunkSize = 1000;
        while(indexChunkStart < booksIds.length){

            let chunkIds = booksIds.slice(indexChunkStart, indexChunkStart + chunkSize);

            let existingBooksIds = new Set;
            if(!needCleanAll){
                let existingRows = await this.knex('book').select('id').whereIn('id', chunkIds);
                existingBooksIds = new Set(existingRows.map(row => row['id']));
                // todo: should we handle case when book was deleted on source site?
            }

            let books = [];

            for(let bookId of chunkIds){
                if(existingBooksIds.has(bookId)){
                    continue;
                }

                let book;
                try{
                    book = await this.rdfBookParser.parseRdfBookById(bookId);
                }
                catch (e) {
                    console.warn(`book rdf #${bookId} parse error: ${e}`);
                    continue;
                }
                books.push(book);
            }

            let chunkAuthorsNames = books.reduce((acc,book) => { book.authors && acc.push(...book.authors); return acc; }, []);
            let authorsIdsPerNamesLc = await this.getAuthorsIdsPerNamesLc(chunkAuthorsNames);

            for(let book of books){
                try{
                    await this.storeBookWithRelations(book, authorsIdsPerNamesLc);
                }
                catch (e) {
                    e.message = `unable to store book #${book.id}: ${e.message}`;
                    throw e;
                }
            }
            indexChunkStart += chunkIds.length;

            console.log(`${indexChunkStart} books done`);

        }


    }
}

module.exports = BookService;