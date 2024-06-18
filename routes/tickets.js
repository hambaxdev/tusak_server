const express = require("express");
const router = express.Router();
const ticketController = require("../controllers/ticketController");

router.post("/check_qr", ticketController.checkQRCode);
router.post("/info", ticketController.getTicketInfo);
router.post("/status", ticketController.getTicketStatus);

module.exports = router;
