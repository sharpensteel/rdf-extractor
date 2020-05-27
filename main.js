/**
 * Disclaimer:
 *
 * - rdf analyzed in the simplest possible way, i.e. without namespaces resolving, XSD validation, etc.
 *
 * - due to lack of time, there is no test coverage
 *
 * - probably it make sense to further normalize table `book`, so `publisher` and `license` can be in separate tables
 *
 */

const config = require('config');
const Knex = require('knex');
const yargs = require('yargs');
const fse = require('fs-extra');
const path = require('path');

const RdfBookParser = require("./services/RdfBookParser");
const BookService = require("./services/BookService");



const RDF_DIRECTORIES_DIR = path.join(__dirname, 'cache', 'epub');


/**
 * @param {Knex} knex
 * @return {Promise<void>}
 */
async function initDatabaseSchema(knex){
    const sqlPath = path.join(__dirname, 'database-schema.sql');
    let sql = (await fse.readFile(sqlPath)).toString();
    await knex.raw(sql);
    console.log('initDatabaseSchema() finished.');
}


/**
 * @return {Knex}
 */
function createKnex(){
    if(!config.has('dbConfig')){
        throw new Error(`Unable to find "dbConfig" section in configuration files!`);
    }
    let knex = Knex({
        client: 'mysql',
        connection: {
            multipleStatements: true,
            ...config.get('dbConfig')
        },
    });
    return knex;
}


function parseArguments(){
    return yargs
        .command('download-files', 'Download rdf-files.tar.zip​and extract files', {})
        .command('init-database-schema', 'Create necessarily tables', {})
        .command('parse-single-book', 'Parse single .rdf file from cache',  {
            id: {
                demandOption: true,
                describe: 'id of rdf .file',
                type: 'number',
            }
        })
        //.help()
        .help('help')
        .demandCommand(1,1)
        .alias('help', 'h')
        .argv;
}


async function main() {
    //debugger;

    /**
     * simple functions for working with dependencies:
     */

    let _knex;
    const getKnex = () => {
        return _knex ?
            _knex :
            _knex = createKnex()
    };

    let _rdfBookParser;
    const getRdfBookParser = () => {
        return _rdfBookParser ?
            _rdfBookParser :
            _rdfBookParser = new RdfBookParser({rdfDirectoriesDir: RDF_DIRECTORIES_DIR});
    }

    let _BookService;
    const getBookService = () => {
        return _BookService ?
            _BookService :
            _BookService = new BookService({
                rdfBookParser: getRdfBookParser(),
                knex: getKnex(),
            });
    }

    const argv = parseArguments();

    switch (argv._[0]){
        case 'download-files':{
            let parser = getRdfBookParser();
            await parser.downloadFiles();
            break;
        }
        case 'init-database-schema':{
            await initDatabaseSchema(getKnex());
            break;
        }
        case 'parse-single-book':{
            let parser = getRdfBookParser();
            let book = await parser.parseRdfBookById(argv.id);
            console.log('parsed book: ', book);
            break;
        }
        case 'parse-all-books-clean':{
            let BookService = getBookService();
            await BookService.storeAllBooks(true);
            break;
        }
        case 'parse-all-books':{
            let BookService = getBookService();
            await BookService.storeAllBooks(false);
            break;
        }
        default:{
            yargs.showHelp();
            console.error('Must provide a valid command!');
        }

    }

    if(_knex){
        _knex.destroy();
    }
}

main()
    .catch(e => {
        console.error(e);
        debugger;
    });