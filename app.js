const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();

// =========================
// DATABASE
// =========================
let pool;

async function initializeDatabase() {
    const dbName = process.env.DB_NAME;

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    try {
        await connection.query(
            `CREATE DATABASE IF NOT EXISTS \`${dbName}\``
        );

        await connection.query(
            `USE \`${dbName}\``
        );

        // Users table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Scores table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS scores (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INT NOT NULL DEFAULT 0,
                time_mode INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_time (username, time_mode)
            )
        `);

        console.log('✅ Database initialized successfully');

    } finally {
        await connection.end();
    }

    pool = mysql.createPool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: dbName,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    console.log('✅ MySQL connection pool created');
}

// =========================
// MIDDLEWARE
// =========================
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

app.use(flash());

// =========================
// EJS
// =========================
app.set('view engine', 'ejs');

// =========================
// GLOBAL VARIABLES
// =========================
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.currentUser = req.session.user || null;
    res.locals.currentPath = req.path;
    next();
});

// =========================
// ROUTES
// =========================
app.get('/', (req, res) => {
    res.render('index');
});

app.get('/game', (req, res) => {
    res.render('game');
});

app.get('/leaderboard', (req, res) => {
    res.render('leaderboard');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.get('/result', (req, res) => {
    res.render('result');
});

app.get('/settings', (req, res) => {
    res.render('settings');
});

app.get('/instructions', (req, res) => {
    res.render('instructions');
});

// =========================
// DATABASE TEST ROUTE
// =========================
app.get('/test-db', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT NOW() AS currentTime'
        );

        res.json(rows);

    } catch (error) {
        console.error(error);
        res.status(500).send('Database connection failed');
    }
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;

initializeDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(
                `🚀 Server running at http://localhost:${PORT}`
            );
        });
    })
    .catch((error) => {
        console.error(
            '❌ Database initialization failed:',
            error
        );
    });