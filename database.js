const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'xenon_estudio.db');
const db = new sqlite3.Database(dbPath);

// Inicializar tablas
db.serialize(() => {
    // Tabla de Clientes
    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        whatsapp_id TEXT PRIMARY KEY,
        nombre TEXT,
        plan TEXT,
        sector TEXT,
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabla de Historial actualizada con columna para archivos
    db.run(`CREATE TABLE IF NOT EXISTS historial (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        whatsapp_id TEXT,
        rol TEXT, 
        mensaje TEXT,
        archivo_url TEXT, -- <--- Nueva columna
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (whatsapp_id) REFERENCES clientes(whatsapp_id)
    )`);

        db.run(`CREATE TABLE IF NOT EXISTS pagos_validados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            whatsapp_id TEXT,
            referencia TEXT UNIQUE,
            monto TEXT,
            fecha_pago TEXT,
            fecha_verificacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            archivo_url TEXT
        )`);

        // 1. Tabla de Clientes (Expandida)
    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        whatsapp_id TEXT PRIMARY KEY,
        nombre TEXT,
        plan TEXT DEFAULT '$20',
        fecha_corte TEXT DEFAULT '05 de cada mes',
        estado TEXT DEFAULT 'activo',
        sector TEXT DEFAULT 'San Cristóbal',
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS blacklist (
        whatsapp_id TEXT PRIMARY KEY,
        nombre TEXT,
        motivo TEXT,
        fecha_bloqueo DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Nueva Tabla de Contactos (Dashboard)
    db.run(`CREATE TABLE IF NOT EXISTS contactos (
        id TEXT PRIMARY KEY,
        name TEXT,
        phone TEXT,
        email TEXT,
        avatarColor TEXT,
        channel TEXT DEFAULT 'whatsapp',
        tags TEXT DEFAULT '[]', -- Guardado como JSON string
        blocked INTEGER DEFAULT 0,
        saved INTEGER DEFAULT 0,
        createdAt INTEGER
    )`);
        
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT
    )`);

    // Insertamos los valores iniciales solo si no existen
    const stmt = db.prepare("INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)");
    stmt.run("system_prompt", "Eres el asistente oficial de Xenon Estudio en San Cristóbal. Tu objetivo es ayudar con planes de Internet ($20, $40) e Inversores. Reglas: 1. Usa siempre la tasa BCV del día. 2. Calcula el 16% de IVA si piden factura. 3. Sé amable y profesional. 4. Tienes permiso para enviar audios vía ElevenLabs. 5. Si el usuario envía una imagen que parece un comprobante de pago: Extrae Fecha, Referencia y Monto. Verifica contra estos datos: CI Beneficiario: 24783437, Banco: Mercantil (0105), Teléfono: 04247731176. Si los datos coinciden, responde ÚNICAMENTE en este formato JSON: {'pago_valido': true, 'referencia': 'xxx', 'monto': 'xxx', 'fecha': 'xxx'}. Si los datos NO coinciden (ej. otro banco o CI), indica qué dato está mal."); // Tu prompt largo aquí
    stmt.run("model_name", "gemini-flash-lite-latest");
    stmt.run("temperature", "0.7");
    stmt.run("bot_enabled", "true");
    stmt.run("response_delay", "1.2");
    stmt.run("pause_after_agent", "30");
    stmt.run("max_tokens", "512");
    stmt.finalize();
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        rol TEXT DEFAULT 'admin'
    )`);
});

// Función saveMessage modificada para aceptar la ruta
const saveMessage = (whatsappId, rol, mensaje, archivoUrl = null) => {
    const query = `INSERT INTO historial (whatsapp_id, rol, mensaje, archivo_url) VALUES (?, ?, ?, ?)`;
    db.run(query, [whatsappId, rol, mensaje, archivoUrl]);
};

const upsertCliente = (whatsappId, nombre, plan = 'Nuevo', sector = 'Desconocido') => {
    const query = `INSERT INTO clientes (whatsapp_id, nombre, plan, sector) 
                   VALUES (?, ?, ?, ?) 
                   ON CONFLICT(whatsapp_id) DO UPDATE SET nombre=excluded.nombre`;
    db.run(query, [whatsappId, nombre, plan, sector]);
};

const savePago = (whatsappId, ref, monto, fecha, url) => {
    const query = `INSERT INTO pagos_validados (whatsapp_id, referencia, monto, fecha_pago, archivo_url) VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [whatsappId, ref, monto, fecha, url], (err) => {
        if (err) {
            console.error("❌ Error al guardar pago en SQLite:", err.message);
        } else {
            console.log("✅ Pago guardado exitosamente en SQLite");
        }
    });
};


const isBlocked = (whatsappId) => {
    return new Promise((resolve) => {
        db.get("SELECT 1 FROM blacklist WHERE whatsapp_id = ?", [whatsappId], (err, row) => {
            resolve(!!row);
        });
    });
};

// Función para bloquear a alguien con nombre
const blockUser = (whatsappId, nombre, motivo) => {
    const query = `INSERT OR REPLACE INTO blacklist (whatsapp_id, nombre, motivo) VALUES (?, ?, ?)`;
    db.run(query, [whatsappId, nombre, motivo], (err) => {
        if (err) console.error("❌ Error al bloquear usuario:", err.message);
        else console.log(`🚫 ${nombre} (${whatsappId}) ha sido bloqueado.`);
    });
};

function getConfig(clave) {
    return new Promise((resolve, reject) => {
        db.get("SELECT valor FROM configuracion WHERE clave = ?", [clave], (err, row) => {
            if (err) {
                console.error("Error al obtener config:", err);
                resolve(null);
            }
            resolve(row ? row.valor : null);
        });
    });
}

const getCliente = (whatsappId) => {
    return new Promise((resolve) => {
        db.get("SELECT * FROM clientes WHERE whatsapp_id = ?", [whatsappId], (err, row) => {
            resolve(row || null);
        });
    });
};

// --- GESTIÓN DE CONTACTOS ---

const upsertContacto = (contacto) => {
    const { id, name, phone, email = '', avatarColor = 'oklch(0.65 0.2 280)', channel = 'whatsapp', tags = '[]', blocked = 0, saved = 0, createdAt = Date.now() } = contacto;
    const query = `
        INSERT INTO contactos (id, name, phone, email, avatarColor, channel, tags, blocked, saved, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = COALESCE(excluded.name, name),
            phone = COALESCE(excluded.phone, phone),
            email = COALESCE(excluded.email, email),
            tags = COALESCE(excluded.tags, tags),
            blocked = COALESCE(excluded.blocked, blocked),
            saved = COALESCE(excluded.saved, saved)
    `;
    db.run(query, [id, name, phone, email, avatarColor, channel, typeof tags === 'string' ? tags : JSON.stringify(tags), blocked ? 1 : 0, saved ? 1 : 0, createdAt]);
};

const getContactos = () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM contactos ORDER BY createdAt DESC", [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(r => ({
                ...r,
                tags: JSON.parse(r.tags || '[]'),
                blocked: !!r.blocked,
                saved: !!r.saved
            })));
        });
    });
};

const updateContacto = (id, patch) => {
    const fields = Object.keys(patch);
    if (fields.length === 0) return;

    const sets = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
        if (f === 'tags') return JSON.stringify(patch[f]);
        if (f === 'blocked' || f === 'saved') return patch[f] ? 1 : 0;
        return patch[f];
    });

    const query = `UPDATE contactos SET ${sets} WHERE id = ?`;
    db.run(query, [...values, id]);
};

const deleteContacto = (id) => {
    db.run("DELETE FROM contactos WHERE id = ?", [id]);
};

const bcrypt = require('bcrypt');
const crearUsuario = async (user, pass) => {
    const hash = await bcrypt.hash(pass, 10);
    db.run("INSERT OR IGNORE INTO usuarios (username, password) VALUES (?, ?)", [user, hash]);
};

module.exports = { 
    saveMessage, 
    upsertCliente, 
    savePago, 
    getConfig, 
    getCliente, 
    isBlocked, 
    blockUser,
    upsertContacto,
    getContactos,
    updateContacto,
    deleteContacto,
    db 
};