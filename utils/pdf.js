const fs = require('fs');
const PDFDocument = require('pdfkit');
const { logToFile } = require('./log');

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

module.exports = { generatePDF };
