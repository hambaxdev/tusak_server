const stripe = require('../config/stripe');
const { logToFile } = require('../utils/log');

exports.createPaymentIntent = async (req, res) => {
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
};
