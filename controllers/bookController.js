const async = require('async');
var Book = require('../models/book');
var Author = require('../models/author');
var Genre = require('../models/genre');
var BookInstance = require('../models/bookinstance');

const {body, validationResult} = require('express-validator');

exports.index = function(req, res) {

    async.parallel({
        book_count: function(callback) {
            Book.countDocuments({}, callback); // Pass an empty object as match condition to find all documents of this collection
        },
        book_instance_count: function(callback) {
            BookInstance.countDocuments({}, callback);
        },
        book_instance_available_count: function(callback) {
            BookInstance.countDocuments({status:'Available'}, callback);
        },
        author_count: function(callback) {
            Author.countDocuments({}, callback);
        },
        genre_count: function(callback) {
            Genre.countDocuments({}, callback);
        }
    }, function(err, results) {
        if (err){
            console.log(err);
        }
        res.render('index', { title: 'Local Library Home', error: err, data: results });
    });

   // res.send('NOT IMPLEMENTED: Site Home Page');
};

// Display list of all books.
exports.book_list = function(req, res, next) {

    Book.find({}, 'title author')
    .sort({title: 1}) // sorts in alphabetical order
    .populate('author') // replaces the author id with the author fields from the document
    .exec(function (err, list_books){
        if (err) return next(err);
        console.log(list_books);
        res.render('book_list', {title: 'Book List', book_list: list_books})
    });
};


// Display detail page for a specific book.
exports.book_detail = function(req, res, next) {

    async.parallel({
        book: function(callback) {

            Book.findById(req.params.id)
              .populate('author')
              .populate('genre')
              .exec(callback);
        },
        book_instance: function(callback) {

          BookInstance.find({ 'book': req.params.id })
          .exec(callback);
        },
    }, function(err, results) {
        if (err) {
            console.log(err);
             return next(err); }
        if (results.book==null) { // No results.
            var err = new Error('Book not found');
            err.status = 404;
            return next(err);
        }
        // Successful, so render.
        res.render('book_detail', { title: results.book.title, book: results.book, book_instances: results.book_instance } );
    });

};

// Display book create form on GET.
exports.book_create_get = function(req, res, next) {
    async.parallel({
        authors: function (callback){
            Author.find(callback);
        },
        genres: function(callback){
            Genre.find(callback);
        },
        // author: function(callback){
        //     if(req.params.authorid){
        //         // console.log(req.params.authorid)
        //         Author.findById(req.params.authorid).exec(callback);
        //     }
        // }
    }, function (err, results){
        if (err) {return next(err);}
        // if (results.author){
        //     res.render('book_form', {title: 'Create Book', authors: results.authors, genres: results.genres, theAuthor: results.author});
        // }
        res.render('book_form', {title: 'Create Book', authors: results.authors, genres: results.genres});

    });
};

// Handle book create on POST.
exports.book_create_post = [
    // Convert the genre to an array 
    (req, res, next)=>{
        if (!(req.body.genre instanceof Array)){
            if (typeof req.body.genre === 'undefined')
            req.body.genre = [];
            else 
            req.body.genre = new Array(req.body.genre);
        }
        next();
    },

    // Validate and sanitize the fields
    body('title', 'Title must not be empty.').trim().isLength({min: 1}).escape(),
    body('author', 'Author must not be empty.').trim().isLength({min: 1}).escape(),
    body('summary', 'Summary must not be empty.').trim().isLength({min: 1}).escape(),
    body('isbn', 'ISBN must not be empty').trim().isLength({min: 1}).escape(),
    body('genre.*').escape(),

    // Process request after validation and sanitization
    (req, res, next)=>{
        // Extract the validation errors from a request.
        const errors = validationResult(req);

        // Create a book object with escaped and trimmed data.
        const book = new Book({
            title: req.body.title,
            author: req.body.author,
            summary: req.body.summary,
            isbn: req.body.isbn,
            genre: req.body.genre
        });

        if (!errors.isEmpty()){
            // There are errors. Render form again with sanitized values/error messages.
            async.parallel({
                authors: function(callback){
                    Author.find(callback);
                },
                genres: function(callback){
                    Genre.find(callback);
                },
            }), function (err, results){
                if (err){return next(err);}

                // Mark our selected genre as checked.
                for (let i = 0; i < results.genres.length; i ++){
                    if (book.genre.indexOf(results.genres[i]._id) > -1){
                        results.genres[i].checked = 'true';
                    }
                }
                res.render('book_form', {title: 'Create Book', authors: results.authors, genres: results.genres, book: book, errors: errors.array()});
                return;
            }
        }
        else {
            // Data from form is valid. Save book.
            book.save(function (err){
                if (err) { return next(err);}
                // successful - redirect to new book record.
                res.redirect(book.url);

            })
        }
    }

];

// Display book delete form on GET.
exports.book_delete_get = function(req, res, next) {

    async.parallel({
        book: function (callback){
            Book.findById(req.params.id).exec(callback);
        }, 
        bookinstances: function(callback){
            BookInstance.find({'book': req.params.id}).exec(callback);
        }
    }, function(err, results){
        if (err){return next(err);}
        if (results.book == null){ // book is not in database
            res.redirect('/catalog/books');
        }

        res.render('book_delete.pug',{title: 'Delete Book', book: results.book, bookinstances: results.bookinstances })
    });
};

// Handle book delete on POST.
exports.book_delete_post = function(req, res) {

    async.parallel({
        book: function (callback){
            Book.findById(req.params.id).exec(callback);
        }, 
        bookinstances: function(callback){
            BookInstance.find({'book': req.params.id}).exec(callback);
        }
    }, function(err, results){
        if (err){return next(err);}
       
        if(results.bookinstances.length > 0){
            res.render('book_delete.pug',{title: 'Delete Book', book: results.book, bookinstances: results.bookinstances })
            return;
        }
        else {
            Book.findByIdAndRemove(req.body.bookid, function deleteAuthor(err){
                if (err){return next(err);}
                // Success - go to book list 
                res.redirect('/catalog/books/');
            });
        }
    });
};

// Display book update form on GET.
exports.book_update_get = function(req, res) {
    // Get book, authors and genres for form.
    async.parallel({
        book: function(callback){
            Book.findById(req.params.id).populate('author').populate('genre').exec(callback);
        }, 
        authors: function(callback){
            Author.find(callback);
        },
        genres: function(callback){
            Genre.find(callback);
        },
    }, function(err, results){
        if(err) {return next(err);}
        if (results.book == null){
            const err = new Error ('Book not found');
            err.status = 404;
            return next(err);
        }
        // Success. 
        // Mark our selected genres as checked. 
        for (let all_g_iter = 0 ; all_g_iter < results.genres.length; all_g_iter++){
            for (let book_g_iter = 0; book_g_iter < results.book.genre.length; book_g_iter++){
                if (results.genres[all_g_iter]._id.toString()===results.book.genre[book_g_iter]._id.toString()){
                    results.genres[all_g_iter].checked='true';
                }
            }
        }
    
    res.render('book_form', {title: 'Update Book', authors: results.authors, genres: results.genres, book: results.book});
});
};

// Handle book update on POST.
exports.book_update_post = [
    // Convert the genre to an array 
    (req, res, next)=>{
        if(!(req.body.genre instanceof Array)){
            if(typeof req.body.genre === 'undefined')
                req.body.genre=[];
            else 
                req.body.genre = new Array(req.body.genre);
        }
        next();
    }, 

    // Validate and sanitize fields.
    body('title', 'Title must not be empty.').trim().isLength({min: 1}).escape(),
    body('author', 'Author must not be empty.').trim().isLength({min:1}).escape(),
    body('summary', 'Summary must not be empty').trim().isLength({min:1}).escape(), 
    body('isbn', 'ISBN must not be empty').trim().isLength({min:1}).escape(),
    body('genre.*').escape(), 

    // Process request after validation and sanitization
    (req, res, next)=>{

        // Extract the validation errors from a request.
        const errors = validationResult(req);

        // Create a Book object with escaped/trimmed data and old id.
        const book = new Book({
            title: req.body.title, 
            author: req.body.author, 
            summary: req.body.summary, 
            isbn: req.body.isbn,
            genre: (typeof req.body.genre==='undefined') ? [] : req.body.genre, 
            _id: req.params.id // This is required, or a new ID will be assigned!!

        });

        if (!errors.isEmpty()){
            // There are errors. Render pug form with sanitized values/error messages 

            // Get all authors and genres for form.
            async.parallel({
                authors:function(callback){
                    Author.find(callback);
                }, 
                genres: function(callback){
                    Genre.find(callback);
                }
            }, function(err, results){
                if(err){return next(err);}

                // Mark our selected genres as checked 
                for (let i = 0; i < results.genres.length;i++){
                    if(book.genre.indexOf(results.genres[i]._id) > -1){
                        results.genres[i].checked='true';
                    }
                }
                res.render('book_form', {title: 'Update Book', authors: results.authors, genres: results.genres, book: book, errors: errors.array()})
            });
            return;
        }
        else {
            // data is valid 
            Book.findByIdAndUpdate(req.params.id, book, {}, function(err, thebook){
                if (err){return next(err);}
                // successful - redirect to updated resource
                res.redirect(thebook.url);
            });
        }
    }
];
