require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { db } = require('./database');
const { Server } = require("socket.io");
const http = require("http");
const { client, clientesEnPausa } = require('./instancia');
const { listAvailableModels } = require('./gemini-helper');


const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || "XENON_ESTUDIO_VALOR_SECRETO_2026";



// Creamos el servidor HTTP para que Express y Sockets compartan puerto
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Puerto de Angular
        methods: ["GET", "POST"]
    }
});

// Evento de conexión
io.on("connection", (socket) => {
    console.log("💻 Dashboard Angular conectado");
});

// Función global para emitir eventos desde cualquier parte
const notificarNuevoMensaje = (datos) => {
    io.emit("nuevo_mensaje", datos);
};

const notificarQR = (qr) => {
    io.emit("qr", qr);
};

const notificarEstadoConexion = (estado) => {
    io.emit("whatsapp_status", estado);
};

// IMPORTANTE: Cambia app.listen por server.listen
server.listen(PORT, () => {
    console.log(`🚀 API y Sockets corriendo en http://localhost:${PORT}`);
});

// Exportamos la función de notificación para usarla en whatsapp.js
module.exports = { notificarNuevoMensaje, notificarQR, notificarEstadoConexion };

// --- CONFIGURACIÓN DE CORS Y SEGURIDAD ---
app.use((req, res, next) => {
    const origin = req.headers.origin || "*";
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Private-Network', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

app.use(cors({
    origin: (origin, callback) => callback(null, true), // Permitir cualquier origen dinámicamente
    credentials: true
}));
app.use(express.json());

// --- MIDDLEWARE DE SEGURIDAD ---
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ error: "Acceso denegado. No hay token." });

    const token = authHeader.replace('Bearer ', '');
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Token inválido o expirado." });
        req.user = decoded;
        next();
    });
};

// --- RUTA PÚBLICA: LOGIN ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    db.get("SELECT * FROM usuarios WHERE username = ?", [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: "Usuario no encontrado" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: "Contraseña incorrecta" });

        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '8h' });
        res.json({ mensaje: "Bienvenido", token });
    });
});

// --- RUTAS PROTEGIDAS (Requieren Token) ---

// 1. Clientes
app.get('/api/clientes', verificarToken, (req, res) => {
    db.all("SELECT * FROM clientes", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 2. Pagos Validados
app.get('/api/pagos', verificarToken, (req, res) => {
    db.all("SELECT * FROM pagos_validados ORDER BY fecha_verificacion DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 3. Configuración (Tasa BCV, Prompt, Modelo)
app.get('/api/config', verificarToken, (req, res) => {
    db.all("SELECT * FROM configuracion", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/gemini/models', verificarToken, async (req, res) => {
    try {
        const models = await listAvailableModels();
        res.json(models);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/config', verificarToken, (req, res) => {
    const { clave, valor } = req.body;
    db.run("UPDATE configuracion SET valor = ? WHERE clave = ?", [valor, clave], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ updated: this.changes });
    });
});

// 4. Blacklist
app.get('/api/blacklist', verificarToken, (req, res) => {
    db.all("SELECT * FROM blacklist ORDER BY fecha_bloqueo DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/blacklist', verificarToken, (req, res) => {
    const { whatsapp_id, nombre, motivo } = req.body;
    db.run("INSERT OR REPLACE INTO blacklist (whatsapp_id, nombre, motivo) VALUES (?, ?, ?)",
        [whatsapp_id, nombre, motivo], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: whatsapp_id });
        });
});

// Busca la ruta /api/mensajes/:whatsapp_id y reemplázala por esta:
app.get('/api/mensajes/:whatsapp_id', verificarToken, (req, res) => {
    const { whatsapp_id } = req.params;

    // Cambiamos "mensajes" por "historial" y "fecha" por "timestamp"
    const query = `
        SELECT 
            h.id,
            h.whatsapp_id,
            h.rol,
            h.mensaje,
            h.archivo_url,
            h.timestamp
        FROM historial h
        WHERE h.whatsapp_id = ?
        ORDER BY h.timestamp ASC
    `;

    db.all(query, [whatsapp_id], (err, rows) => {
        if (err) {
            console.error("❌ Error en la consulta:", err.message);
            return res.status(500).json({ error: err.message });
        }

        // Si no hay mensajes, devolvemos un array vacío en lugar de error
        res.json(rows);
    });
});

// --- OBTENER LISTA DE TODAS LAS CONVERSACIONES (Corregido) ---
app.get('/api/conversaciones', verificarToken, (req, res) => {
    const query = `
        SELECT 
            h.whatsapp_id, 
            h.mensaje AS ultimo_mensaje, 
            MAX(h.timestamp) AS fecha_ultimo_mensaje,
            h.rol AS enviado_por,
            c.nombre AS cliente_nombre,
            c.plan AS cliente_plan
        FROM historial h
        LEFT JOIN clientes c ON h.whatsapp_id = c.whatsapp_id
        GROUP BY h.whatsapp_id
        ORDER BY fecha_ultimo_mensaje DESC
    `;

    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/enviar-manual', verificarToken, async (req, res) => {
    const { whatsapp_id, mensaje, replyToId, tiempoPausa = 1800000 } = req.body; // 30 min por defecto

    if (!client || !client.pupPage) {
        return res.status(503).json({ error: "WhatsApp no está vinculado" });
    }

    try {
        const options = {};
        if (replyToId) {
            options.quotedMessageId = replyToId;
        }
        
        await client.sendMessage(whatsapp_id, mensaje, options);

        // Activamos la pausa de Gemini
        clientesEnPausa.set(whatsapp_id, Date.now() + tiempoPausa);

        // Guardamos en historial
        db.run("INSERT INTO historial (whatsapp_id, rol, mensaje) VALUES (?, ?, ?)",
            [whatsapp_id, 'admin', mensaje]);

        // Notificamos vía Sockets
        notificarNuevoMensaje({
            whatsapp_id,
            rol: 'admin',
            mensaje,
            timestamp: new Date().toISOString(),
            replyToId: replyToId // Pasamos la referencia si existe
        });

        res.json({ success: true, mensaje: "Enviado con éxito" });
    } catch (error) {
        console.error("❌ Error en envío manual:", error);
        res.status(500).json({ error: error.message });
    }
});


app.post('/api/config/update', verificarToken, (req, res) => {
    const { clave, valor } = req.body;

    if (!clave || valor === undefined) {
        return res.status(400).json({ error: "Clave y valor son requeridos" });
    }

    const query = "UPDATE configuracion SET valor = ? WHERE clave = ?";

    db.run(query, [valor, clave], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: "La configuración no existe" });
        }

        // OPCIONAL: Notificar al Dashboard vía Sockets que algo cambió
        io.emit('config_actualizada', { clave, valor });

        console.log(`⚙️ Configuración actualizada: ${clave} = ${valor}`);
        res.json({ success: true, mensaje: `Configuración '${clave}' actualizada con éxito` });
    });
});

// --- GESTIÓN DE SESIÓN WHATSAPP ---
app.post('/api/whatsapp/logout', verificarToken, async (req, res) => {
    try {
        if (client && client.pupPage) {
            await client.logout();
            console.log("🚪 Sesión de WhatsApp cerrada por petición del admin");
            res.json({ success: true, mensaje: "Sesión cerrada correctamente" });
        } else {
            res.status(400).json({ error: "No hay una sesión activa para cerrar" });
        }
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/whatsapp/session-info', verificarToken, (req, res) => {
    if (client && client.info) {
        res.json({
            connected: true,
            pushname: client.info.pushname,
            wid: client.info.wid,
            platform: client.info.platform
        });
    } else {
        res.json({ connected: false });
    }
});

// --- GESTIÓN DE CONTACTOS ---
app.get('/api/contactos', verificarToken, async (req, res) => {
    try {
        const { getContactos } = require('./database');
        const contactos = await getContactos();
        res.json(contactos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/contactos', verificarToken, (req, res) => {
    try {
        const { upsertContacto } = require('./database');
        upsertContacto(req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.patch('/api/contactos/:id', verificarToken, (req, res) => {
    try {
        const { updateContacto } = require('./database');
        updateContacto(req.params.id, req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/contactos/:id', verificarToken, (req, res) => {
    try {
        const { deleteContacto } = require('./database');
        deleteContacto(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// --- INICIO DEL SERVIDOR ---
