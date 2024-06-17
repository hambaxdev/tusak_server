const stripe = require('../config/stripe');
const { createTicket } = require('./ticketUtils');
const { sendEmailWithTicket } = require('./email');
const { logToFile } = require('./log');

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

module.exports = { handleStripeEvent };
