const RdfBookParser = require('./RdfBookParser');
const Author = require('../models/Author');

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
        await this.knex('book_artist').del();
        await this.knex('book_subject').del();
        await this.knex('book').del();
        await this.knex('artist').del();
    }


    /**
     * addressing n+1 problem for authors
     *
     * @param {string[]} authorsNames
     * @return {Promise<Map<string, number>>}
     */
    async getAuthorsIdsPerNames(authorsNames){

        authorsNames = [...new Set(authorsNames)].filter(name => name);

        if(!authorsNames.length){
            return new Map;
        }
        let rows = await this.knex('author').select('id', 'name').whereIn('name', authorsNames);
        
        let idsPerNames = new Map(); 
        for(let row of rows){
            idsPerNames.set(row['name'], parseInt(row['id']));
        }
        return idsPerNames;
    }


    async storeAuthorWithName(name){
        let author = new Author();
        author.name = name;

        let ids = this.knex('author').returning('id').insert({name});
        debugger;
        author.id = ids[0];
        return author;
    }

    /**
     * @param {RdfBook} rdfBook
     * @param {?Map<string, number>} authorsIdsPerNamesStored
     * @return {Promise<number>}
     */
    async storeBookWithRelations(rdfBook, authorsIdsPerNamesStored= null){
        
        if(authorsIdsPerNamesStored){
            authorsIdsPerNamesStored = await this.getAuthorsIdsPerNames(rdfBook.authors || [])
        }

        let bookIdSaved = this.knex.transaction(async (trx) => {
            try{

                let newAuthors = [];
                let authorsIdsSet = new Set;

                for(let authorName of (rdfBook.authors || [])){
                    let authorId = authorsIdsPerNamesStored.get(authorName);
                    if(!authorId){
                        let author = await this.storeAuthorWithName(name);
                        newAuthors.push(author);
                        authorId = author.id;
                    }
                    authorsIdsSet.add(authorId);
                }

                let bookId = await this.knex('book').returning('id').insert({
                    title: rdfBook.title,
                    publisher: rdfBook.publisher,
                    published_at: rdfBook.publishedAt,
                    language: rdfBook.language,
                    license: rdfBook.licenses.join('; '),
                });

                for(let subject of rdfBook.subjects || []){
                    await this.knex('book_subject').insert({
                        book_id: bookId,
                        subject,
                    });
                }

                for(let authorId of authorsIdsSet.entries()){
                    await this.knex('book_author').insert({
                        book_id: bookId,
                        author_id: authorId,
                    });
                }

                trx.commit();

                for(let author of newAuthors){
                    authorsIdsPerNamesStored.set(author.name, author.id);
                }
                return bookId;
            }
            catch (e) {
                trx.rollback(e);
            }
        });

        return bookIdSaved;
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
                existingBooksIds = this.knex('book').select('id').whereIn('id', chunkIds).map(row => row['id']);
                // todo: should we handle case when book was deleted on source site?
            }

            let books = [];

            for(let bookId of chunkIds){
                if(existingBooksIds.has(bookId)){
                    continue;
                }
                //authorsIdsPerNamesStored = await this.getAuthorsIdsPerNames(book.authors || [])

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

            let chunkAuthorsNames = books.reduce((acc,book) => book.authors && acc.push(...book.authors), []);
            let authorsIdsPerNames = await this.getAuthorsIdsPerNames(chunkAuthorsNames);

            for(let book of books){
                try{
                    await this.storeBookWithRelations(book, authorsIdsPerNames);
                }
                catch (e) {
                    e.message = `unable to store book #${bookId}: ${e.message}`;
                    throw e;
                }
            }

            indexChunkStart += chunkIds.length;
        }


    }
}

module.exports = BookService;