const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join('c:/www/whatsapp', 'xenon_estudio.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('bot_enabled', 'true')");
    console.log("✅ Config 'bot_enabled' asegurada en la base de datos.");
    db.close();
});
