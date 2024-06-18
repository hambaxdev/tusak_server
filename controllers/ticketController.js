const db = require('../config/db');
const { logToFile } = require('../utils/log');
const { createTicket, generateQRCode, generatePDF } = require('../utils/ticketUtils');
const { sendEmailWithTicket } = require('../utils/email');

exports.getTicketInfo = (req, res) => {
    const { paymentIntentId } = req.body;

    logToFile('create ticket info');
    logToFile(paymentIntentId);

    if (!paymentIntentId) {
        return res.status(400).json({ error: 'paymentIntentId is required' });
    }

    db.query('SELECT * FROM tickets WHERE payment_intent_id = ?', [paymentIntentId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send(err);
        }

        if (result.length > 0) {
            const ticket = result[0];
            const pdfPath = `./tickets/${ticket.email}_${paymentIntentId}_ticket.pdf`;
            logToFile(pdfPath);
            res.json({
                qrCodePath: ticket.qr_code,
                pdfPath,
            });
        } else {
            res.status(404).json({ error: 'Ticket not found' });
        }
    });
};

exports.getTicketStatus = (req, res) => {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
        return res.status(400).json({ error: 'paymentIntentId is required' });
    }

    db.query('SELECT is_active FROM tickets WHERE payment_intent_id = ?', [paymentIntentId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send(err);
        }

        if (result.length > 0) {
            const ticket = result[0];
            res.json({
                isActive: ticket.is_active,
            });
        } else {
            res.status(404).json({ error: 'Ticket not found' });
        }
    });
};

exports.checkQRCode = (req, res) => {
    const { qr_hash } = req.body;
    logToFile('check qr');

    db.query('SELECT * FROM tickets WHERE qr_hash = ?', [qr_hash], (err, result) => {
        if (err) {
            logToFile(`Error checking QR code: ${err.message}`);
            throw err;
        }

        if (result.length > 0) {
            const ticket = result[0];
            if (ticket.is_active) {
                db.query('UPDATE tickets SET is_active = 0 WHERE qr_hash = ?', [qr_hash], (updateErr) => {
                    if (updateErr) {
                        logToFile(`Error deactivating QR code: ${updateErr.message}`);
                        throw updateErr;
                    }
                    res.json({ status: 'success', message: 'QR code is valid and now deactivated.' });
                    logToFile(`QR code ${qr_hash} deactivated.`);
                });
            } else {
                res.json({ status: 'fail', message: 'QR code is already deactivated.' });
                logToFile(`QR code ${qr_hash} already deactivated.`);
            }
        } else {
            res.json({ status: 'fail', message: 'QR code not found.' });
            logToFile(`QR code ${qr_hash} not found.`);
        }
    });
};

exports.checkQR = (req, res) => {
    const { qr_hash } = req.body;

    if (!qr_hash) {
        return res.status(400).send("QR hash is required");
    }

    db.query("SELECT * FROM tickets WHERE qr_hash = ?", [qr_hash], (err, results) => {
        if (err) {
            logToFile(`Database query error: ${err.message}`);
            return res.status(500).send("Error on the server.");
        }

        if (results.length === 0) {
            return res.status(404).send("QR code not found.");
        }

        const ticket = results[0];

        if (ticket.is_active) {
            db.query("UPDATE tickets SET is_active = 0 WHERE id = ?", [ticket.id], (err, result) => {
                if (err) {
                    logToFile(`Database update error: ${err.message}`);
                    return res.status(500).send("Error on the server.");
                }

                return res.status(200).send({ message: "QR code is valid and has been deactivated.", active: 1 });
            });
        } else {
            return res.status(200).send({ message: "QR code is already used.", active: 0 });
        }
    });
};
