const express = require("express");
const router = express.Router();
const mysql = require("mysql");

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

router.post("/check_qr", (req, res) => {
    const { qr_hash } = req.body;

    if (!qr_hash) {
        return res.status(400).send("QR hash is required");
    }

    db.query("SELECT * FROM tickets WHERE qr_hash = ?", [qr_hash], (err, results) => {
        if (err) {
            console.error("Database query error:", err);
            return res.status(500).send("Error on the server.");
        }

        if (results.length === 0) {
            return res.status(404).send("QR code not found.");
        }

        const ticket = results[0];

        if (ticket.is_active) {
            db.query("UPDATE tickets SET is_active = 0 WHERE id = ?", [ticket.id], (err, result) => {
                if (err) {
                    console.error("Database update error:", err);
                    return res.status(500).send("Error on the server.");
                }

                return res.status(200).send({ message: "QR code is valid and has been deactivated.", active: 1 });
            });
        } else {
            return res.status(200).send({ message: "QR code is already used.", active: 0 });
        }
    });
});

module.exports = router;
