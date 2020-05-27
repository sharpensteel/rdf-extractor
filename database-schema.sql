
DROP TABLE IF EXISTS `book_author`;
DROP TABLE IF EXISTS `book_subject`;
DROP TABLE IF EXISTS `author`;
DROP TABLE IF EXISTS `book`;

CREATE TABLE `author` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `name` varchar(255) DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;


CREATE TABLE `book` (
    `id` int(11) NOT NULL,
    `title` text,
    `publisher` varchar(255) DEFAULT NULL,
    `published_at` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
    `language` varchar(255) DEFAULT NULL,
    `license` varchar(255) DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `published_at` (`published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;


CREATE TABLE `book_author` (
       `id` int(11) NOT NULL AUTO_INCREMENT,
       `book_id` int(11) DEFAULT NULL,
       `author_id` int(11) DEFAULT NULL,
       PRIMARY KEY (`id`),
       KEY `book_id` (`book_id`),
       KEY `author_id` (`author_id`),
       CONSTRAINT `idx__book_author__book_id` FOREIGN KEY (`book_id`) REFERENCES `book` (`id`) ON DELETE CASCADE,
       CONSTRAINT `idx__book_author__author_id` FOREIGN KEY (`author_id`) REFERENCES `author` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `book_subject` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `book_id` int(11) DEFAULT NULL,
    `subject` text,
    PRIMARY KEY (`id`),
    KEY `idx__book_subject__subject` (`subject`(100)),
    CONSTRAINT `idx__book_subject__book_id` FOREIGN KEY (`book_id`) REFERENCES `book` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

