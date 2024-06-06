// server.js

const express = require("express");
const { resolve } = require("path");
const env = require("dotenv").config({ path: "./.env" });
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2022-08-01",
});
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const fs = require('fs');
const nodemailer = require('nodemailer');
const mysql = require('mysql');
const crypto = require('crypto');

let fetch;

(async () => {
  fetch = (await import('node-fetch')).default;
})();

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.raw({ type: 'application/json' }));

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'ticketing_db'
});

db.connect(err => {
  if (err) throw err;
  console.log('MySQL connected...');
});

app.post('/webhook', async (request, response) => {
  const sig = request.headers['stripe-signature'];
  const endpointSecret = "whsec_xQ7WBup9kXauqPzcdzNw896Nf2KOzotz";

  console.log('Headers:', request.headers);
  console.log('Body:', request.body.toString());

  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    console.log('Event received:', event);

    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        const email = paymentIntent.receipt_email;
        console.log('PaymentIntent succeeded:', paymentIntent);

        const ticket = await createTicket(email, paymentIntent.id, paymentIntent.amount);
        console.log('Ticket created:', ticket);

        await sendEmailWithTicket(email, ticket.qrCode);
        console.log('Email sent to:', email);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
    response.json({ received: true });
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    response.status(400).send(`Webhook Error: ${err.message}`);
  }
});

app.post('/api/tickets/check_qr', (req, res) => {
  const { qr_hash } = req.body;

  db.query('SELECT * FROM tickets WHERE qr_hash = ?', [qr_hash], (err, result) => {
    if (err) throw err;

    if (result.length > 0) {
      const ticket = result[0];
      if (ticket.is_active) {
        db.query('UPDATE tickets SET is_active = 0 WHERE qr_hash = ?', [qr_hash], (updateErr) => {
          if (updateErr) throw updateErr;
          res.json({ status: 'success', message: 'QR code is valid and now deactivated.' });
        });
      } else {
        res.json({ status: 'fail', message: 'QR code is already deactivated.' });
      }
    } else {
      res.json({ status: 'fail', message: 'QR code not found.' });
    }
  });
});

app.use(express.static(process.env.STATIC_DIR));

app.get("/", (req, res) => {
  const path = resolve(process.env.STATIC_DIR + "/index.html");
  res.sendFile(path);
});

app.get("/config", (req, res) => {
  res.send({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      currency: "EUR",
      amount: 100,
      automatic_payment_methods: { enabled: true },
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (e) {
    console.error(e);
    res.status(400).send({ error: { message: e.message } });
  }
});

const PORT = process.env.PORT || 5252;
app.listen(PORT, () => console.log(`Node server listening at http://localhost:${PORT}`));

async function createTicket(email, paymentIntentId, amount) {
  const ticketData = `${email}-${paymentIntentId}-${amount}`;
  const qrHash = crypto.createHash('sha256').update(ticketData).digest('hex');
  const createdAt = new Date();
  const expiresAt = null;
  const isActive = 1;

  const ticket = {
    email,
    paymentIntentId,
    amount,
    qrCode: await generateQRCode(qrHash),
    qrHash,
    isActive,
    createdAt,
    expiresAt,
  };

  const query = 'INSERT INTO tickets (qr_hash, email, is_active, created_at, expires_at) VALUES (?, ?, ?, ?, ?)';
  const values = [qrHash, email, isActive, createdAt, expiresAt];

  db.query(query, values, (err, result) => {
    if (err) throw err;
    console.log('Ticket inserted into database:', result);
  });

  return ticket;
}

async function generateQRCode(qrHash) {
  const qrCodePath = `./qrcodes/${qrHash}.png`;

  await QRCode.toFile(qrCodePath, qrHash, {
    color: {
      dark: '#000',
      light: '#FFF'
    }
  });

  return qrCodePath;
}

async function sendEmailWithTicket(toEmail, qrCodePath) {
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
        <p>Frankfurt am Main</p>
        <p>SCALA CLUB</p>
        <p><strong>Дата:</strong></p>
        <p>24 июня 2024</p>
      </div>
      <div style="margin-top: 20px; padding: 10px; background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 5px;">
        <p><strong>Важно:</strong></p>
        <p>Полученный QR-код действителен <strong>один раз</strong> и только на указанную дату. Пожалуйста, предъявите его при входе, чтобы получить ленточку.</p>
      </div>
    </div>
  `,
    attachments: [{
      filename: 'qrcode.png',
      path: qrCodePath,
      cid: 'qrcode'
    }]
  };

  await transporter.sendMail(mailOptions);
}
