const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql");

const router = express.Router();
const SECRET_KEY = process.env.SECRET_KEY;

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

db.connect((err) => {
    if (err) throw err;
    console.log("MySQL connected...");
});

// Авторизация
router.post("/login", (req, res) => {
    const { email, password } = req.body;

    console.log("Login request received:", email);

    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) {
            console.error("Database query error:", err);
            return res.status(500).send("Error on the server.");
        }
        if (results.length === 0) {
            console.log("No user found with email:", email);
            return res.status(404).send("No user found.");
        }

        const user = results[0];
        const passwordIsValid = bcrypt.compareSync(password, user.password);

        if (!passwordIsValid) {
            console.log("Invalid password for user:", email);
            return res.status(401).send({ auth: false, token: null });
        }

        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '1h' });
        res.status(200).send({ auth: true, token });
    });
});

module.exports = router;
