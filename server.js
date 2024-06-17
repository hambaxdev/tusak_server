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
const PDFDocument = require('pdfkit');
const cors = require('cors'); // Импортируем CORS

let fetch;

(async () => {
  fetch = (await import('node-fetch')).default;
})();

const app = express();

// Логирование в файл
const logFilePath = './server.log';
function logToFile(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFilePath, `[${timestamp}] ${message}\n`);
}

// Включаем CORS для всех маршрутов
app.use(cors());

app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next();
  } else {
    bodyParser.json()(req, res, next);
  }
});
// qr scanner app backend start ----
const authRoutes = require("./routes/auth");
const ticketsRoutes = require("./routes/tickets");

app.use("/api/auth", authRoutes);
app.use("/api/tickets", ticketsRoutes);

// qr scanner app backend end ----

app.post('/api/ticket-info', (req, res) => {
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
});

app.post('/api/ticket-status', (req, res) => {
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
});


app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (request, response) => {
  const sig = request.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_ENDPOINT_SECRET;
  logToFile(`Headers: ${JSON.stringify(request.headers)}`);
  logToFile(`Body: ${request.body.toString()}`);

  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    logToFile(`Event received: ${JSON.stringify(event)}`);

    const eventId = event.id;

    // Check if the event was already processed
    const query = 'SELECT COUNT(*) AS count FROM processed_events WHERE event_id = ?';
    db.query(query, [eventId], (err, result) => {
      if (err) {
        logToFile(`Database Error: ${err.message}`);
        return response.status(500).send(`Database Error: ${err.message}`);
      }

      if (result[0].count > 0) {
        logToFile(`Event ${eventId} already processed.`);
        return response.json({ received: true });
      }

      // Process the event
      handleStripeEvent(event).then(() => {
        // Mark the event as processed
        const insertQuery = 'INSERT INTO processed_events (event_id) VALUES (?)';
        db.query(insertQuery, [eventId], (insertErr) => {
          if (insertErr) {
            logToFile(`Database Error: ${insertErr.message}`);
            return response.status(500).send(`Database Error: ${insertErr.message}`);
          }
          logToFile(`Event ${eventId} marked as processed.`);
          response.json({ received: true });
        });
      }).catch((handleErr) => {
        logToFile(`Error processing event: ${handleErr.message}`);
        response.status(500).send(`Error processing event: ${handleErr.message}`);
      });
    });
  } catch (err) {
    logToFile(`Webhook Error: ${err.message}`);
    response.status(400).send(`Webhook Error: ${err.message}`);
  }
});

async function handleStripeEvent(event) {
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      const email = paymentIntent.receipt_email;
      const amount = paymentIntent.amount;
      const purchaseDate = new Date(paymentIntent.created * 1000).toLocaleDateString('ru-RU');
      logToFile(`PaymentIntent succeeded: ${JSON.stringify(paymentIntent)}`);

      const ticket = await createTicket(email, paymentIntent.id, amount, purchaseDate);
      logToFile(`Ticket created: ${JSON.stringify(ticket)}`);

      await sendEmailWithTicket(email, ticket.qrCode, purchaseDate, paymentIntent.id);
      logToFile(`Email sent to: ${email}`);
      break;
    default:
      logToFile(`Unhandled event type ${event.type}`);
  }
}

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

db.connect(err => {
  if (err) {
    logToFile(`MySQL connection error: ${err.message}`);
    throw err;
  }
  logToFile('MySQL connected...');
  // Create table for processed events if not exists
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

app.post('/api/tickets/check_qr', (req, res) => {
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
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      currency: "EUR",
      amount: 1200,
      automatic_payment_methods: { enabled: true },
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
    logToFile(`Payment intent created: ${JSON.stringify(paymentIntent)}`);
  } catch (e) {
    logToFile(`Error creating payment intent: ${e.message}`);
    res.status(400).send({ error: { message: e.message } });
  }
});

// Статические файлы и отправка React-приложения
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

const PORT = process.env.PORT || 5252;
app.listen(PORT, () => logToFile(`Node server listening at http://localhost:${PORT}`));

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

async function generateQRCode(qrHash) {
  const qrCodePath = `./qrcodes/${qrHash}.png`;

  if (!fs.existsSync('./qrcodes')) {
    fs.mkdirSync('./qrcodes');
  }

  await QRCode.toFile(qrCodePath, qrHash, {
    color: {
      dark: '#000',
      light: '#FFF'
    }
  });

  return qrCodePath;
}

async function generatePDF(email, qrCodePath, purchaseDate, paymentIntentId) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync('./tickets')) {
      fs.mkdirSync('./tickets');
    }

    const pdfPath = `./tickets/${email}_${paymentIntentId}_ticket.pdf`;
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const writeStream = fs.createWriteStream(pdfPath);

    writeStream.on('finish', () => {
      console.log(`PDF generated: ${pdfPath}`);
      resolve(pdfPath);
    });

    writeStream.on('error', (err) => {
      console.error(`Error generating PDF: ${err.message}`);
      reject(err);
    });

    doc.pipe(writeStream);

    doc.registerFont('FreeSerif', 'fonts/FreeSerif.ttf');
    doc.font('FreeSerif');

    doc.image(qrCodePath, doc.page.width - 200, 50, { width: 150, height: 150 });

    doc.fontSize(12).text(`Дата покупки: ${purchaseDate}`, 50, 50);
    doc.text(`E-Mail: ${email}`);

    doc.moveDown(5);

    doc.fontSize(20).text('Ваш билет', { align: 'center' });
    doc.moveDown();
    doc.text('Дата: 28 июня 2024');
    doc.fontSize(16).text('Место проведения: Scala Club, Offenbach am Main');
    doc.text('Адрес: Bahnhofstraße 16, 63067 Offenbach am Main');
    doc.moveDown();

    doc.fontSize(12).text('Спасибо за покупку!');
    doc.moveDown();
    doc.fontSize(12).text('Полученный QR-код действителен один раз и только на указанную дату.');
    doc.text('Пожалуйста, предъявите его при входе, чтобы получить ленточку.');
    doc.moveDown();
    doc.text('Билет возврату и обмену не подлежит.');

    doc.moveDown();
    doc.moveDown();
    doc.moveDown();
    doc.fontSize(9).text('По всем вопросам пожалуйста обращайтесь в instagram: @tusa_koeln .');

    doc.moveDown();
    doc.image('./assets/map.png', doc.page.width / 2 - 300, 550, { width: 600, height: 300 });

    doc.end();
  });
}

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