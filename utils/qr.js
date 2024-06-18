const QRCode = require('qrcode');
const fs = require('fs');

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

module.exports = { generateQRCode };
