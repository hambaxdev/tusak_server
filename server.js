const express = require("express");
const { resolve } = require("path");
const env = require("dotenv").config({ path: "./.env" });
const bodyParser = require('body-parser');
const cors = require('cors');
const { logToFile } = require('./utils/log');
const routes = require('./routes');

let fetch;

(async () => {
  fetch = (await import('node-fetch')).default;
})();

const app = express();

// Включаем CORS для всех маршрутов
app.use(cors());

app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next();
  } else {
    bodyParser.json()(req, res, next);
  }
});

// Подключаем маршруты
app.use('/api', routes);

// Обработка webhook
const webhookRoutes = require('./routes/webhook');
app.use('/webhook', webhookRoutes);


// Статические файлы и отправка React-приложения
const staticDir = process.env.STATIC_DIR || 'public'; // Используем значение по умолчанию 'public' если STATIC_DIR не установлено
app.use(express.static(staticDir));

app.get("/", (req, res) => {
  const path = resolve(staticDir + "/index.html");
  res.sendFile(path);
});

app.get("/config", (req, res) => {
  res.send({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});

const PORT = process.env.PORT || 5252;
app.listen(PORT, () => logToFile(`Node server listening at http://localhost:${PORT}`));
