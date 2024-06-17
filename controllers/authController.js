const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require('../config/db');
const { logToFile } = require('../utils/log');

const SECRET_KEY = process.env.SECRET_KEY;

exports.login = (req, res) => {
    const { email, password } = req.body;

    logToFile(`Login request received: ${email}`);

    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) {
            logToFile(`Database query error: ${err.message}`);
            return res.status(500).send("Error on the server.");
        }
        if (results.length === 0) {
            logToFile(`No user found with email: ${email}`);
            return res.status(404).send("No user found.");
        }

        const user = results[0];
        const passwordIsValid = bcrypt.compareSync(password, user.password);

        if (!passwordIsValid) {
            logToFile(`Invalid password for user: ${email}`);
            return res.status(401).send({ auth: false, token: null });
        }

        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '1h' });
        res.status(200).send({ auth: true, token });
    });
};
