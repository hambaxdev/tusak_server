const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require('../config/db');
const { logToFile } = require('../utils/log');
const { sendVerificationEmail } = require('../utils/email');

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

        if (!user.is_verified) {
            logToFile(`User email not verified: ${email}`);
            return res.status(401).send({ auth: false, message: "Please verify your email first." });
        }

        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '1h' });
        res.status(200).send({ auth: true, token });
    });
};

exports.register = (req, res) => {
    const { email, password } = req.body;

    logToFile(`Registration request received: ${email}`);

    if (!email || !password) {
        logToFile(`Missing email or password: email=${email}, password=${password}`);
        return res.status(400).send("Email and password are required.");
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) {
            logToFile(`Database query error: ${err.message}`);
            return res.status(500).send("Error on the server.");
        }
        if (results.length > 0) {
            logToFile(`Email already in use: ${email}`);
            return res.status(409).send("Email already in use.");
        }

        const hashedPassword = bcrypt.hashSync(password, 8);

        db.query("INSERT INTO users (email, password_hash, is_verified) VALUES (?, ?, 0)", [email, hashedPassword], (err, result) => {
            if (err) {
                logToFile(`Database insertion error: ${err.message}`);
                return res.status(500).send("Error registering the user.");
            }

            const userId = result.insertId;

            db.query("SELECT role_id FROM roles WHERE role_name = 'regular_user'", (err, roleResults) => {
                if (err) {
                    logToFile(`Role selection error: ${err.message}`);
                    return res.status(500).send("Error registering the user.");
                }

                const roleId = roleResults[0].role_id;

                db.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, roleId], async (err) => {
                    if (err) {
                        logToFile(`Role assignment error: ${err.message}`);
                        return res.status(500).send("Error registering the user.");
                    }

                    try {
                        await sendVerificationEmail(email, userId);
                        res.status(200).send("Registration successful, please verify your email.");
                    } catch (error) {
                        logToFile(`Error during email verification process: ${error.message}`);
                        res.status(500).send("Error sending verification email.");
                    }
                });
            });
        });
    });
};

exports.verifyEmail = (req, res) => {
    const { token } = req.params;

    try {
        const { id } = jwt.verify(token, process.env.EMAIL_SECRET_KEY);
        db.query("UPDATE users SET is_verified = 1 WHERE user_id = ?", [id], (err, results) => {
            if (err) {
                logToFile(`Database update error: ${err.message}`);
                return res.status(500).send("Error verifying the user.");
            }
            res.status(200).send("Email verified successfully.");
        });
    } catch (error) {
        logToFile(`Email verification error: ${error.message}`);
        res.status(400).send("Invalid or expired token.");
    }
};
