const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

const SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

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

        // Password resets table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                token VARCHAR(64) NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

app.get('/forgot-password', (req, res) => {
    res.render('forgot-password');
});

app.get('/reset-password/:token', (req, res) => {
    res.render('reset-password', { token: req.params.token });
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
// AUTH API ROUTES
// =========================
app.post('/api/register', async (req, res) => {
    const username = (req.body.username || '').trim();
    const password = (req.body.password || '').trim();

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    if (username.length < 3 || username.length > 50) {
        return res.status(400).json({ message: 'Username must be between 3 and 50 characters.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        await pool.query(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            [username, hashedPassword]
        );

        res.status(201).json({ username });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'That username is already taken.' });
        }

        console.error(error);
        res.status(500).json({ message: 'Registration failed. Please try again.' });
    }
});

app.post('/api/login', async (req, res) => {
    const username = (req.body.username || '').trim();
    const password = (req.body.password || '').trim();

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        const user = rows[0];

        if (!user) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        const passwordMatches = await bcrypt.compare(password, user.password);

        if (!passwordMatches) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        req.session.user = user.username;

        res.json({ username: user.username });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Login failed. Please try again.' });
    }
});

app.post('/api/forgot-password', async (req, res) => {
    const username = (req.body.username || '').trim();

    if (!username) {
        return res.status(400).json({ message: 'Username is required.' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        const user = rows[0];

        if (!user) {
            return res.status(404).json({ message: 'No account found with that username.' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

        await pool.query('DELETE FROM password_resets WHERE username = ?', [username]);

        await pool.query(
            'INSERT INTO password_resets (username, token, expires_at) VALUES (?, ?, ?)',
            [username, token, expiresAt]
        );

        const resetUrl = `/reset-password/${token}`;

        console.log(`Password reset requested for "${username}": ${resetUrl}`);

        res.json({
            message: 'Reset link generated (dev mode - no email is sent).',
            resetUrl
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Request failed. Please try again.' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    const token = (req.body.token || '').trim();
    const password = (req.body.password || '').trim();

    if (!token || !password) {
        return res.status(400).json({ message: 'Reset token and new password are required.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT * FROM password_resets WHERE token = ?',
            [token]
        );

        const resetRequest = rows[0];

        if (!resetRequest || new Date(resetRequest.expires_at) < new Date()) {
            return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        await pool.query(
            'UPDATE users SET password = ? WHERE username = ?',
            [hashedPassword, resetRequest.username]
        );

        await pool.query('DELETE FROM password_resets WHERE username = ?', [resetRequest.username]);

        res.json({ message: 'Password updated. You can now log in.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Reset failed. Please try again.' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Logout failed. Please try again.' });
        }

        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out.' });
    });
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