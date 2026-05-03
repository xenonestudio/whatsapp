const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join('c:/www/whatsapp', 'xenon_estudio.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT username FROM usuarios", [], (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log("Usuarios en la DB:", rows);
    }
    db.close();
});
