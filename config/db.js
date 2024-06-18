const mysql = require('mysql');
const { logToFile } = require('../utils/log');

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
});

db.connect(err => {
    if (err) {
        logToFile(`MySQL connection error: ${err.message}`);
        throw err;
    }
    logToFile('MySQL connected...');

    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS processed_events (
      event_id VARCHAR(255) PRIMARY KEY,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
    db.query(createTableQuery, (createErr) => {
        if (createErr) {
            logToFile(`Error creating processed_events table: ${createErr.message}`);
            throw createErr;
        }
        logToFile('Processed events table ensured.');
    });
});

module.exports = db;
