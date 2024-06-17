const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

router.post('/', bodyParser.raw({ type: 'application/json' }), webhookController.handleWebhook);

module.exports = router;
