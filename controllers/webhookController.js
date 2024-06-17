const stripe = require('../config/stripe');
const db = require('../config/db');
const { logToFile } = require('../utils/log');
const { handleStripeEvent } = require('../utils/stripeUtils');

exports.handleWebhook = (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_ENDPOINT_SECRET;
    logToFile(`Headers: ${JSON.stringify(req.headers)}`);
    logToFile(`Body: ${req.body.toString()}`);

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        logToFile(`Event received: ${JSON.stringify(event)}`);

        const eventId = event.id;

        const query = 'SELECT COUNT(*) AS count FROM processed_events WHERE event_id = ?';
        db.query(query, [eventId], (err, result) => {
            if (err) {
                logToFile(`Database Error: ${err.message}`);
                return res.status(500).send(`Database Error: ${err.message}`);
            }

            if (result[0].count > 0) {
                logToFile(`Event ${eventId} already processed.`);
                return res.json({ received: true });
            }

            handleStripeEvent(event).then(() => {
                const insertQuery = 'INSERT INTO processed_events (event_id) VALUES (?)';
                db.query(insertQuery, [eventId], (insertErr) => {
                    if (insertErr) {
                        logToFile(`Database Error: ${insertErr.message}`);
                        return res.status(500).send(`Database Error: ${insertErr.message}`);
                    }
                    logToFile(`Event ${eventId} marked as processed.`);
                    res.json({ received: true });
                });
            }).catch((handleErr) => {
                logToFile(`Error processing event: ${handleErr.message}`);
                res.status(500).send(`Error processing event: ${handleErr.message}`);
            });
        });
    } catch (err) {
        logToFile(`Webhook Error: ${err.message}`);
        res.status(400).send(`Webhook Error: ${err.message}`);
    }
};
