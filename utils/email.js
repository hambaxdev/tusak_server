const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const { generatePDF } = require('./pdf');
const { logToFile } = require('./log');
const db = require('../config/db');

const EMAIL_SECRET_KEY = process.env.EMAIL_SECRET_KEY;

let transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function sendEmailWithTicket(toEmail, qrCodePath, purchaseDate, paymentIntentId) {
    const pdfPath = await generatePDF(toEmail, qrCodePath, purchaseDate, paymentIntentId);

    let mailOptions = {
        from: process.env.EMAIL_FROM,
        to: toEmail,
        subject: 'Ваш билет',
        html: `
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
              <h2 style="color: #FF5722;">Спасибо за покупку!</h2>
              <p>Ваш билет на вечеринку:</p>
              <div style="margin: 20px 0;">
                <img src="cid:qrcode" alt="QR Code" style="max-width: 200px;"/>
              </div>
              <div style="background-color: #f4f4f4; padding: 15px; border-radius: 10px;">
                <p><strong>Место проведения:</strong></p>
                <p>Scala Club, Frankfurt am Main</p>
                <p><strong>Дата:</strong></p>
                <p>28 июня 2024</p>
              </div>
              <div style="margin-top: 20px; padding: 10px; background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 5px;">
                <p><strong>Важно:</strong></p>
                <p>Полученный QR-код действителен <strong>один раз</strong> и только на указанную дату. Пожалуйста, предъявите его при входе, чтобы получить ленточку.</p>
                <p><i>Еще раз обращаем ваше внимание на то, что билет возврату и обмену не подлежит<i></p>
              </div>
            </div>
        `,
        attachments: [
            {
                filename: 'qrcode.png',
                path: qrCodePath,
                cid: 'qrcode'
            },
            {
                filename: `${toEmail}_${paymentIntentId}_ticket.pdf`,
                path: pdfPath
            }
        ]
    };

    await transporter.sendMail(mailOptions);

    const updateQuery = 'UPDATE tickets SET email_sent = true WHERE payment_intent_id = ?';
    db.query(updateQuery, [paymentIntentId], (err, result) => {
        if (err) {
            logToFile(`Error updating email_sent status in database: ${err.message}`);
            throw err;
        }
        logToFile(`Email sent status updated for ticket: ${paymentIntentId}`);
    });
}

async function sendVerificationEmail(toEmail, userId) {
    const emailToken = jwt.sign({ id: userId }, EMAIL_SECRET_KEY, { expiresIn: '1d' });
    const url = `http://192.168.178.55:5252/api/auth/verify/${emailToken}`;

    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: toEmail,
        subject: 'Verify your email',
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; color: #333;">
            <div style="background-color: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                <h1 style="font-size: 24px; color: #333;">Welcome to HAMBAX!</h1>
                <p style="font-size: 16px; color: #555;">Thank you for registering. Please verify your email address by clicking the button below:</p>
                <a href="${url}" style="display: inline-block; margin: 20px 0; padding: 10px 20px; background-color: #e28743; color: #fff; text-decoration: none; border-radius: 5px; font-size: 16px;">Verify Email</a>
                <p style="font-size: 14px; color: #999;">If the button above doesn't work, copy and paste the following link into your browser:</p>
                <p style="font-size: 14px; color: #999;"><a href="${url}" style="color: #e28743;">${url}</a></p>
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <p style="font-size: 12px; color: #999;">If you did not create an account, no further action is required.</p>
                <p style="font-size: 12px; color: #999;">&copy; ${new Date().getFullYear()} HAMBAX. All rights reserved.</p>
            </div>
        </div>`
    };

    await transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
            logToFile(`Error sending verification email: ${err.message}`);
            throw err;
        }
        logToFile(`Verification email sent: ${info.response}`);
    });
}

module.exports = { sendEmailWithTicket, sendVerificationEmail };
