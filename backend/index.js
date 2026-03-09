require('dotenv').config();
const express = require('express');
const authRouter = require('./modules/auth.js').router;
const { secureApiRouter } = require('./modules/auth.js');

const app = express();
const port = process.argv.length > 2 ? process.argv[2] : 3000;

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.use(express.json());
app.use(express.static('dist'));

app.use('/api', authRouter);
app.use('/api', secureApiRouter);


// Default error handler
app.use(function (err, req, res, next) {
    res.status(500).send({ type: err.name, message: err.message });
});

// Return the application's default page if the path is unknown
app.use((_req, res) => {
    res.sendFile('index.html', { root: 'dist' });
});

const httpService = app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
