class RdfBook{
    constructor() {
        /** @type {?number} */
        this.id = null;

        /** @type {?string} */
        this.title = null;

        /** @type {?string[]} */
        this.authors = null;

        /** @type {?string} */
        this.publisher = null;

        /** @type {?Date} */
        this.publishedAt = null;

        /** @type {?string} */
        this.language = null;

        /** @type {?string[]} */
        this.subjects = null;

        /** @type {?string[]} */
        this.licenses = null;
    }
}

module.exports = RdfBook;
