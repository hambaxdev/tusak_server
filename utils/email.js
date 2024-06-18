const nodemailer = require('nodemailer');
const { generatePDF } = require('./pdf');
const { logToFile } = require('./log');
const db = require('../config/db');

async function sendEmailWithTicket(toEmail, qrCodePath, purchaseDate, paymentIntentId) {
    const pdfPath = await generatePDF(toEmail, qrCodePath, purchaseDate, paymentIntentId);

    let transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

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

module.exports = { sendEmailWithTicket };
