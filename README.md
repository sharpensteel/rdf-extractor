Change list
--
1. Authors previously where wrongly identified by names. Now authors uniquely identified by rdf:about uri.
    
    need to recreate all tables:     
    ```
    npm run init-database-schema
    ```
2. Introduced decent Dependency Injection with `awilix`

3. `BookService` is completely decoupled from `RdfBookParser`


Setup
-----

1. Run: 
```
npm install
```
2. Copy `local.json.example` file to `local.json` and setup params to valid  
    MySQL database.

3. Run:
```
npm run init-database-schema
```
4. Run:
```
npm run download-files
``` 
     

Parse individual rdf:
--
```
npm run parse-single-book --id=9999
``` 
where `9999` is any gutenberg's book id 


Parse all rdfs:
--
This will delete previously stored books, then parse and store all books in database:
 ```
npm run parse-all-books-clean
```
Fast version, for subsequent times:
 ```
npm run parse-all-books
```