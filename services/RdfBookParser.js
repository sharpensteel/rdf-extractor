const xml2js = require('xml2js');
const _ = require('lodash');
const path = require('path');
const fse = require('fs-extra');
const download = require('download');
const assert = require("chai").assert;
const RdfBook = require("../models/RdfBook");
const {traverseDownAndAggregate} = require("../helpers/RdfHelper");
const {execPromisified} = require("../helpers/NodeHelper");


/**
 *
 * Service implements downloading, extracting and parsing rdf files.
 *
 * At final point, service returns RdfBook instances to consumer
 *
 */
class RdfBookParser {

    /**
     * @param {string} rdfDirectoriesDir directory that contains numbered rdf directories 
     */
    constructor({rdfDirectoriesDir}) {
        this.rdfDirectoriesDir = rdfDirectoriesDir;
    }
    

    subjectToText(subjectNode){

        let member = traverseDownAndAggregate(subjectNode, ['dcam:memberOf', '$', 'rdf:resource'])[0];

        /**
         * https://www.dublincore.org/specifications/dublin-core/dcmi-terms/
         */
        let term = _.last((member || '').split('/'));

        let rdfValue = traverseDownAndAggregate(subjectNode, ['rdf:value'])[0];

        switch(term){
            case 'LCC':{
                return RdfBookParser.SUBJECT_LLC_CODES.get(rdfValue);
            }
            case 'LCSH':{
                return rdfValue;
            }
            default:{
            }
        }

    }

    /**
     *
     * @param {string} xmlContent
     * @return {Promise<RdfBook>}
     */
    async parseRdfBook(xmlContent){
        let book = new RdfBook;

        /** rdf analyzed in the simplest possible way, i.e. without namespaces resolving, XSD validation, etc. */

        let xmlDoc = await xml2js.parseStringPromise(xmlContent);
        let rdfRoot = xmlDoc['rdf:RDF'];
        assert(rdfRoot, 'must be "rdf:RDF" in root of rdf document');

        let pgTerms = _.get(rdfRoot, ['pgterms:ebook', 0]) || {};
        assert.isObject(pgTerms, `there must be "pgterms:ebook"`);

        let about = traverseDownAndAggregate(pgTerms, ['$','rdf:about'])[0];
        assert.isString(about, `there must be "rdf:about" in "pgterms:ebook"`);

        let idMatches = about.match(/^ebooks\/(\d+)$/);
        assert.isNotEmpty(idMatches, '"rdf:about" must be valid');
        book.id = parseInt(idMatches[1]);

        book.title = traverseDownAndAggregate(pgTerms, ['dcterms:title'])[0] || '';

        book.authors = traverseDownAndAggregate(pgTerms, ['dcterms:creator', 'pgterms:agent', 'pgterms:name']);

        book.publisher = traverseDownAndAggregate(pgTerms, ['dcterms:publisher'])[0] || '';

        let publishedAt = traverseDownAndAggregate(pgTerms, ['dcterms:issued', '_'])[0];
        publishedAt = publishedAt && new Date(publishedAt);
        book.publishedAt = publishedAt && !isNaN(publishedAt) && publishedAt || null;

        book.language = traverseDownAndAggregate(pgTerms, ['dcterms:language','rdf:Description', 'rdf:value', '_'])[0]

        let subjectsNodes = traverseDownAndAggregate(pgTerms, ['dcterms:subject', 'rdf:Description']);
        book.subjects = [];
        for(let sn of subjectsNodes){
            let subject = this.subjectToText(sn);
            if(subject){
                book.subjects.push(subject);
            }
        }

        book.licenses = traverseDownAndAggregate(rdfRoot, ['cc:Work', 'cc:license', '$', 'rdf:resource']);

        return book;

    }

    /**
     * @param {number} id
     * @return {Promise<RdfBook>}
     */
    async parseRdfBookById(id){
        let rdfPath = path.join(this.rdfDirectoriesDir, `${id}`, `pg${id}.rdf`);
        let xmlContent = (await fse.readFile(rdfPath)).toString();
        return this.parseRdfBook(xmlContent);
    }

    /**
     * @return {Promise<number[]>}
     */
    async scanBooksIds(){
        let baseNames = await fse.readdir(this.rdfDirectoriesDir);
        return baseNames.map(bn => parseInt(bn, 10)).filter(id => id);
    }

    /**
     * @return {Promise<void>}
     */
    async downloadFiles(){

        let zipUrl = 'https://www.gutenberg.org/cache/epub/feeds/rdf-files.tar.zip';
        let zipPath = path.join(__dirname, 'rdf-files.tar.zip');

        console.log('cleaning files ...');

        await fse.remove(this.rdfDirectoriesDir);
        await fse.remove(zipPath);

        console.log(`downloading ${zipUrl} ...`);
        await download(zipUrl, path.dirname(zipPath), {filename: path.basename(zipPath)});

        console.log(`extracting ${zipPath} ...`);
        await execPromisified(`tar xfz ${zipPath}`);

        console.log('downloadFiles() finished.');
    }

}

/**
 * https://www.dublincore.org/specifications/dublin-core/dcmi-terms/#http://purl.org/dc/terms/LCC
 * https://www.loc.gov/catdir/cpso/lcco/
 * @type {Map<string, string>}
 */
RdfBookParser.SUBJECT_LLC_CODES = new Map([
    ['A', 'GENERAL WORKS'],
    ['B', 'PHILOSOPHY. PSYCHOLOGY. RELIGION'],
    ['C', 'AUXILIARY SCIENCES OF HISTORY'],
    ['D', 'WORLD HISTORY AND HISTORY OF EUROPE, ASIA, AFRICA, AUSTRALIA, NEW ZEALAND, ETC.'],
    ['E', 'HISTORY OF THE AMERICAS'],
    ['F', 'HISTORY OF THE AMERICAS'],
    ['G', 'GEOGRAPHY. ANTHROPOLOGY. RECREATION'],
    ['H', 'SOCIAL SCIENCES'],
    ['J', 'POLITICAL SCIENCE'],
    ['K', 'LAW'],
    ['L', 'EDUCATION'],
    ['M', 'MUSIC AND BOOKS ON MUSIC'],
    ['N', 'FINE ARTS'],
    ['P', 'LANGUAGE AND LITERATURE'],
    ['Q', 'SCIENCE'],
    ['R', 'MEDICINE'],
    ['S', 'AGRICULTURE'],
    ['T', 'TECHNOLOGY'],
    ['U', 'MILITARY SCIENCE'],
    ['V', 'NAVAL SCIENCE'],
    ['Z', 'BIBLIOGRAPHY. LIBRARY SCIENCE. INFORMATION RESOURCES (GENERAL)'],
]);

module.exports = RdfBookParser;