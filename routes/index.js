const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const ticketsRoutes = require('./tickets');
const webhookRoutes = require('./webhook');
const paymentRoutes = require('./payment');

router.use('/auth', authRoutes);
router.use('/tickets', ticketsRoutes);
router.use('/webhook', webhookRoutes);
router.use('/payment', paymentRoutes);

module.exports = router;
