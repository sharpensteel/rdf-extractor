const RdfBook = require('../models/RdfBook');
const Agent = require('../models/Agent');
const Knex = require('knex');

/**
 * service for storing RdfBook models in database
 */
class BookService{

    /**
     * @param {Knex} knex
     */
    constructor({knex}) {

        /** @type {Knex} */
        this.knex = knex;
    }


    async cleanAll(){
        await this.knex('book_creator').del();
        await this.knex('book_subject').del();
        await this.knex('book').del();
        await this.knex('agent').del();
    }


    /**
     * addressing n+1 problem for agents
     *
     * @param {string[]} agentsUris
     * @return {Promise<Map<string, number>>}
     */
    async getAgentsIdsByUris(agentsUris){

        let rows = await this.knex('agent').select('id', 'rdf_uri').whereIn('rdf_uri', agentsUris);
        
        let idsPerUris = new Map();
        for(let row of rows){
            idsPerUris.set(row['rdf_uri'], parseInt(row['id']));
        }
        return idsPerUris;
    }


    /**
     * @param {Agent} agent
     * @param {?Knex.Transaction} transaction
     * @return {Promise<number>} new id
     */
    async storeAgent(agent, transaction){

        let res = await (transaction || this.knex).insert({
            name: agent.name,
            rdf_uri: agent.rdfUri,
        }).into('agent');

        return res[0];
    }

    /**
     * @param {RdfBook} rdfBook
     * @param {?Map<string, number>} agentsIdsByUrisStored
     * @return {Promise}
     */
    async storeBookWithRelations(rdfBook, agentsIdsByUrisStored= null){
        
        if(!agentsIdsByUrisStored){
            agentsIdsByUrisStored = await this.getAgentsIdsByUris((rdfBook.creators || []).map(agent => agent.rdfUri))
        }

        /** @type {Map<string, number>}  key: agent's rdfUri */
        let newAgentsIdsByUris = new Map;

        await this.knex.transaction(async (trx) => {

            let creatorsIdsSet = new Set;

            for(let agent of (rdfBook.creators || [])){
                let agentId = agentsIdsByUrisStored.get(agent.rdfUri);
                if(!agentId){
                    let agentId = await this.storeAgent(agent, trx);
                    newAgentsIdsByUris.set(agent.rdfUri, agentId);
                    agentId = agent.id;
                }
                creatorsIdsSet.add(agentId);
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

            for(let agentId of creatorsIdsSet.values()){
                await trx.insert({
                    book_id: rdfBook.id,
                    agent_id: agentId,
                }).into('book_creator');
            }
        });

        for(let [uri, id] of newAgentsIdsByUris.entries()){
            agentsIdsByUrisStored.set(uri, id);
        }
    }


    /**
     *
     * @param {AsyncGenerator<Array<number|RdfBook|Error>>} generatorBooksWithIds
     * @param {boolean} needCleanAll  if true: all tables truncated; if false: stored only books that was not stored earlier
     * @return {Promise<void>}
     */
    async storeAllBooks(generatorBooksWithIds, needCleanAll){

        if(needCleanAll){
            await this.cleanAll();
        }

        let chunkSize = 1000;
        let countDone = 0;

        /** @type {RdfBook[]} */
        let chunkBooks = [];

        while(true){

            let {value, done} = await generatorBooksWithIds.next();

            let [book, bookId] = value || [];


            if(done){
                if(!chunkBooks.length){
                    break;
                }
            }
            else{
                countDone++;

                if(book instanceof RdfBook){
                    chunkBooks.push(book);
                }
                else{
                    console.warn(`book rdf #${bookId} parse error: ${book}`);
                    continue;
                }
            }

            if(!done && chunkBooks.length < chunkSize){
                continue;
            }


            let existingBooksIds = new Set;
            let booksToStore = chunkBooks;

            if(!needCleanAll){
                let existingRows = await this.knex('book').select('id').whereIn('id', chunkBooks.map(book => book.id));
                existingBooksIds = new Set(existingRows.map(row => row['id']));
                booksToStore = chunkBooks.filter(book => !existingBooksIds.has(book.id));

                // todo: should we handle case when book was deleted on source site?
            }

            /** @type {Agent[]} */
            let agents = booksToStore.reduce((acc,book) => { book.creators && acc.push(...book.creators); return acc; }, []);
            let agentsIdsPerUris = await this.getAgentsIdsByUris(agents.map(agent => agent.rdfUri));

            for(let book of booksToStore){
                try{
                    await this.storeBookWithRelations(book, agentsIdsPerUris);
                }
                catch (e) {
                    e.message = `unable to store book #${book.id}: ${e.message}`;
                    throw e;
                }
            }

            chunkBooks.length = 0;
            console.log(`${countDone} books done`);

        }


    }
}

module.exports = BookService;