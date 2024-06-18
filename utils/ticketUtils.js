const crypto = require('crypto');
const { generateQRCode } = require('./qr');
const { generatePDF } = require('./pdf');
const db = require('../config/db');
const { logToFile } = require('./log');

async function createTicket(email, paymentIntentId, amount, purchaseDate) {
    const ticketData = `${email}-${paymentIntentId}-${amount}`;
    const qrHash = crypto.createHash('sha256').update(ticketData).digest('hex');
    const createdAt = new Date();
    const expiresAt = null;
    const isActive = 1;
    const emailSent = false;

    const qrCodePath = await generateQRCode(qrHash);
    const pdfPath = await generatePDF(email, qrCodePath, purchaseDate, paymentIntentId);

    const ticket = {
        email,
        paymentIntentId,
        amount,
        qrCode: qrCodePath,
        qrHash,
        isActive,
        createdAt,
        expiresAt,
        purchaseDate,
        emailSent,
        pdfPath
    };

    const query = 'INSERT INTO tickets (qr_hash, email, is_active, created_at, expires_at, email_sent, pdf_path, payment_intent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    const values = [qrHash, email, isActive, createdAt, expiresAt, emailSent, pdfPath, paymentIntentId];

    db.query(query, values, (err, result) => {
        if (err) {
            logToFile(`Error inserting ticket into database: ${err.message}`);
            throw err;
        }
        logToFile(`Ticket inserted into database: ${JSON.stringify(result)}`);
    });

    return ticket;
}

module.exports = { createTicket };
