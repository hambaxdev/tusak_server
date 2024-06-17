const fs = require('fs');

const logFilePath = './server.log';

function logToFile(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFilePath, `[${timestamp}] ${message}\n`);
}

module.exports = { logToFile };
