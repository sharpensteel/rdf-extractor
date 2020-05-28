
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
const {createContainer, asFunction, asClass, asValue} = require('awilix')

const RdfBookParser = require("./services/RdfBookParser");
const BookService = require("./services/BookService");



const RDF_DIRECTORIES_DIR = path.join(__dirname, 'cache', 'epub');



/**
 * @typedef {object} RootContainerCradle
 * @property {Object} dbConfig
 * @property {Knex} knex
 * @property {RdfBookParser} rdfBookParser
 * @property {BookService} bookService
 */

/**
 * @typedef {AwilixContainer} RootContainer
 * @property {RootContainerCradle} cradle
 */



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




function parseArguments(){
    return yargs
        .command('download-files', 'Download rdf-files.tar.zip​and extract files', {})
        .command('init-database-schema', 'Reinitialize necessarily tables', {})
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

    /** @type {RootContainer} */
    const container = createContainer();


    if(!config.has('dbConfig')){
        throw new Error(`Unable to find "dbConfig" section in configuration files!`);
    }
    const dbConfig = config.get('dbConfig');

    container.register({

        dbConfig: asValue(dbConfig),

        knex: asFunction(function createKnex({dbConfig}){
            return Knex({
                client: 'mysql',
                connection: {
                    multipleStatements: true,
                    ...dbConfig,
                },
            });
        })
            .scoped()
            .disposer(knex => knex.destroy()),

        rdfBookParser: asClass(RdfBookParser)
            .inject(() => ({rdfDirectoriesDir: RDF_DIRECTORIES_DIR}))
            .scoped(),

        bookService: asClass(BookService)
            .scoped(),
    });

    const argv = parseArguments();

    const rootCradle = container.cradle;

    switch (argv._[0]){
        case 'download-files':{
            await rootCradle.rdfBookParser.downloadFiles();
            break;
        }
        case 'init-database-schema':{
            await initDatabaseSchema(rootCradle.knex);
            break;
        }
        case 'parse-single-book':{
            let book = await rootCradle.rdfBookParser.parseRdfBookById(argv.id);
            console.log('parsed book: ', book);
            break;
        }
        case 'parse-all-books-clean':{
            let generator = rootCradle.rdfBookParser.iterateAllBooksWithIds();
            await rootCradle.bookService.storeAllBooks(generator, true);
            break;
        }
        case 'parse-all-books':{
            let generator = rootCradle.rdfBookParser.iterateAllBooksWithIds();
            await rootCradle.bookService.storeAllBooks(generator, false);
            break;
        }
        default:{
            yargs.showHelp();
            console.error('Must provide a valid command!');
        }

    }


    await container.dispose();
}

main()
    .catch(e => {
        console.error(e);
        debugger;
    });