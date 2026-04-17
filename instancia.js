// instancia.js
const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
        headless: true, 
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu' // Ahorra recursos si no procesas gráficos pesados
        ],
        // Aumentamos el tiempo de espera para el handshake inicial
        handleSIGINT: false, 
        handleSIGTERM: false,
        handleSIGHUP: false
    }
});

const clientesEnPausa = new Map();

module.exports = { client, clientesEnPausa };