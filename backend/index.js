require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const DB = require('./modules/database.js');

const { MONGOUSER, MONGOPASSWORD, MONGOHOSTNAME, DB_NAME } = process.env;
if (!MONGOUSER || !MONGOPASSWORD || !MONGOHOSTNAME || !DB_NAME) {
  throw new Error('Database not configured. Set environment variables');
}
const dbUri = `mongodb+srv://${encodeURIComponent(MONGOUSER)}:${encodeURIComponent(MONGOPASSWORD)}@${MONGOHOSTNAME}`;
DB.init(dbUri, DB_NAME);

const { router: authRouter, secureApiRouter } = require('./modules/auth.js');

const app = express();
const port = process.argv.length > 2 ? process.argv[2] : process.env.PORT || 3000;

app.use(helmet());

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

app.use('/api', authRouter);
app.use('/api', secureApiRouter);

// Catch unhandled API routes so they don't fall through to the HTML catch-all
app.use('/api', (req, res) => {
    res.status(404).send({ error: `API route not found: ${req.method} ${req.url}` });
});

// Default error handler
app.use((err, req, res, next) => {
    console.error(err);
    if (process.env.NODE_ENV === 'production') {
        res.status(500).send({ error: 'An unexpected error occurred.' });
    } else {
        res.status(500).send({ error: err.message, type: err.name, stack: err.stack });
    }
});

// Return the application's default page if the path is unknown
app.use((req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.sendFile('index.html', { root: path.join(__dirname, '../dist') });
    } else {
        // In development, prevent the server from crashing when looking for dist/index.html
        res.status(404).send(
            `Cannot ${req.method} ${req.url} <br><br>
            <strong>Development Mode:</strong> You hit the Express backend fallback route. 
            Make sure you are accessing the Vite server (http://localhost:${process.env.FRONTEND_PORT || 5173}) in your browser.`
        );
    }
});

const httpService = app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
