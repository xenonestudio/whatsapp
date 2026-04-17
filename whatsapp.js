const { Client, LocalAuth } = require('whatsapp-web.js');
const { getAIResponse } = require('./gemini-helper');
const { textToAudio } = require('./elevenlabs-helper');
const fs = require('fs');
const path = require('path');
const { log } = require('console');
const { saveMessage, upsertCliente, savePago, isBlocked, getCliente, blockUser } = require('./database');
const { MessageMedia } = require('whatsapp-web.js');
const { crearReciboPDF } = require('./pdf-generator');
const { notificarNuevoMensaje } = require('./api.js');
const { client, clientesEnPausa } = require('./instancia');



const botEstaEnPausa = (whatsapp_id) => {
    if (!clientesEnPausa.has(whatsapp_id)) return false;
    
    const tiempoFin = clientesEnPausa.get(whatsapp_id);
    if (Date.now() > tiempoFin) {
        clientesEnPausa.delete(whatsapp_id); // La pausa ya expiró
        return false;
    }
    return true;
};


client.on('qr', (qr) => {
    // Generate and scan this code with your phone
    console.log('QR RECEIVED', qr);
});

client.on('ready', () => {
    console.log('Client is ready!');

});

client.on('error', err => {
    pageLogger.info('crash', err);
    page.removeAllListeners();
});




// Función para obtener datos del cliente
function obtenerDatosCliente(whatsappId) {
    try {
        const data = fs.readFileSync('./clientes.json', 'utf8');
        const { clientes } = JSON.parse(data);
        return clientes.find(c => c.id === whatsappId) || null;
    } catch (error) {
        console.error("Error al leer clientes.json:", error);
        return null;
    }
}




client.on('message', async (msg) => {

    // 1. Prioridad: Verificar Pausa Manual
    const pausaHasta = clientesEnPausa.get(msg.from);
    if (pausaHasta && Date.now() < pausaHasta) {
        console.log(`🤫 Silencio manual activo para ${msg.from}`);
        return;
    }

    try {
        const chat = await msg.getChat();

        // ESPERA DE SEGURIDAD: 
        // No pidas mensajes inmediatamente. 
        // Deja que el chat se sincronice un segundo.
        
        let messages = [];
    
    if (msg.fromMe || msg.isGroup) return;

    if (msg.from === 'status@broadcast') {
        return; 
    }

        try {
            // Solo intentamos fetchMessages si el chat existe
            if (chat) {
                messages = await chat.fetchMessages({ limit: 10 });
            }
        } catch (fetchError) {
            console.warn("⚠️ No se pudo obtener el historial inmediato, continuando sin contexto previo.");
        }

    // 2. (Opcional) Ignorar grupos si solo quieres atender clientes por privado
    if (chat.isGroup) {
        return;
    }


    const dataSocket = {
        whatsapp_id: msg.from,
        rol: 'user',
        mensaje: msg.body,
        timestamp: new Date().toISOString(),
        nombre: msg._data.notifyName || "Desconocido"
    };

    notificarNuevoMensaje(dataSocket); // ¡Notifica a Angular!


    // Obtenemos el contacto completo del remitente
    const contact = await msg.getContact();
    const nombreContacto = contact.pushname || contact.name || "Desconocido";
    
    // El 'number' suele ser el formato 58412... sin el @c.us
    // Construimos el ID tradicional que ya usas en tus JSON
    const idTradicional = `${contact.number}@c.us`;

    let imageBase64 = null;
    let mimeType = null;
    let rutaLocalParaDB = null; // Variable para la base de datos


    if (msg.hasMedia && msg.type === 'image') {
        try {
            const media = await msg.downloadMedia();
            if (media && media.data) {
                imageBase64 = media.data; // El buffer en base64
                mimeType = media.mimetype; // ej: "image/jpeg"
                console.log("Imagen descargada con éxito:", mimeType);

                    // 1. Definir nombre y ruta del archivo
                    // Usamos el ID del mensaje o el timestamp para que sea único
                    const extension = mimeType.split('/')[1]; // extrae 'jpeg' o 'png'
                    const nombreArchivo = `img_${msg.from.split('@')[0]}_${Date.now()}.${extension}`;
                    const rutaCarpeta = path.join(__dirname, 'descargas');
                    const rutaCompleta = path.join(rutaCarpeta, nombreArchivo);

                    // 2. Crear la carpeta si no existe
                    if (!fs.existsSync(rutaCarpeta)) {
                        fs.mkdirSync(rutaCarpeta, { recursive: true });
                    }

                    // 3. Guardar el archivo físicamente
                    // El media.data viene en base64, lo convertimos a Buffer para escribirlo
                    fs.writeFileSync(rutaCompleta, Buffer.from(media.data, 'base64'));

                    console.log("✅ Imagen guardada localmente en:", rutaCompleta);
                    // Guardamos la ruta relativa para la DB
                    rutaLocalParaDB = path.join('descargas', nombreArchivo);
                    console.log("✅ Imagen guardada y ruta preparada para SQLite");

            }
        } catch (err) {
            console.error("Error al descargar la imagen:", err);
        }
    }

    if (msg.body.startsWith('!bloquear ') && msg.fromMe) {
            const motivo = msg.body.replace('!bloquear ', '');
            const whatsappId = msg.to; // Si lo envías tú al chat de la persona

            await blockUser(whatsappId, nombreContacto, motivo);
            await msg.reply(`✅ El usuario *${nombreContacto}* ha sido enviado a la Blacklist.`);
            return;
        }

    // 1. Verificar Blacklist en SQLite
    const bloqueado = await isBlocked(idTradicional);
    if (bloqueado) {
        console.log(`🚫 Número bloqueado intentó escribir: ${idTradicional}`);
        return; 
    }


    const cliente = await getCliente(idTradicional);

    // 3. Preparamos el contexto para Gemini
    let contextoAdicional = "";
    if (cliente) {
        contextoAdicional = `CONTEXTO DEL CLIENTE ACTUAL:
        - Nombre: ${cliente.nombre}
        - Plan contratado: ${cliente.plan}
        - Fecha de corte: ${cliente.fecha_corte}
        - Estatus: ${cliente.estado}
        - Sector: ${cliente.sector}
        Responde saludándolo por su nombre y dándole la información de su mensualidad si la pide.`;
    } else {
        contextoAdicional  =null
    }

    const whatsappId = msg.from;
    const nombreCliente = contact.pushname || contact.name || "Cliente Nuevo";

    // 1. Guardamos o actualizamos al cliente
    upsertCliente(whatsappId, nombreCliente);

    // 2. Guardamos el mensaje del cliente
    saveMessage(whatsappId, 'user', msg.body);


    try {
        const chat = await msg.getChat();
        
        // Filtro de archivados
        // --- TRUCO PARA ACTUALIZAR EL ESTADO ---
        // A veces el objeto está en caché. Forzamos a que verifique el estado real.
        if (chat.archived === true || chat.isArchived === true) {
            console.log(`[IGNORADO] Mensaje de chat archivado: ${msg.from}`);
            return; 
        }

        // --- CARGAR MEMORIA DEL CHAT ---
        // Pedimos los últimos 10-15 mensajes para que Gemini tenga contexto
        const lastMessages = await chat.fetchMessages({ limit: 8 });
        
        // Formateamos los mensajes para que Gemini los entienda (role: user/model)
        const history = lastMessages.map(m => {
            return {
                role: m.fromMe ? "model" : "user",
                parts: [{ text: m.body }],
            };
        });


        let audioBase64 = null;
        let messageText = msg.body;

        // --- DETECTAR AUDIO ---
        if (msg.hasMedia && (msg.type === 'audio' || msg.type === 'ptt')) {
            const media = await msg.downloadMedia();
            // Forzamos el mimetype que Gemini acepta para audios de WhatsApp
            const aiReply = await getAIResponse(msg.body, history, media.data, "audio/ogg" , contextoAdicional, imageBase64, mimeType); 
        }

        await chat.sendStateTyping();

        // Enviamos a la IA (Pasamos el texto si hay, y el audio si existe)
        const aiReply = await getAIResponse(messageText, history, audioBase64, "audio/ogg" , contextoAdicional, imageBase64, mimeType);

        // Dentro de tu lógica donde envías la respuesta:
        const dataSocketIA = {
            whatsapp_id: msg.from,
            rol: 'model',
            mensaje: aiReply,
            timestamp: new Date().toISOString(),
            nombre: "IA"
        };
        notificarNuevoMensaje(dataSocketIA); // ¡Notifica a Angular!

        // 2. DETECCIÓN: ¿El cliente pidió audio o envió un audio?
        // Una buena regla para tu negocio es: si me envían audio, respondo con audio.
        const clientePidioAudio = msg.body.toLowerCase().includes("audio") || 
                                 msg.body.toLowerCase().includes("nota de voz") ||
                                 msg.type === 'ptt' || msg.type === 'audio';

        if (aiReply.includes('pago_valido')) {
            try {
                // 1. Extraer solo lo que está entre llaves { }
                const match = aiReply.match(/\{[\s\S]*\}/);
                if (match) {
                    let jsonString = match[0];

                    // 2. LIMPIEZA AGRESIVA: Convertir comillas simples a dobles si existen
                    // Esto corrige el error 'Expected property name'
                    jsonString = jsonString
                        .replace(/'/g, '"') 
                        .replace(/(\w+):/g, '"$1":'); // Asegura que las llaves tengan comillas

                    const datosPago = JSON.parse(jsonString);

                    if (datosPago.pago_valido) {
                        // Guardar en la tabla de pagos_validados
                        savePago(
                            msg.from, 
                            datosPago.referencia.toString().replace(/\D/g, ''), // Solo números
                            datosPago.monto, 
                            datosPago.fecha, 
                            rutaLocalParaDB 
                        );

                        try {
                        const rutaPDF = await crearReciboPDF({
                            whatsapp_id: msg.from,
                            referencia: datosPago.referencia,
                            monto: datosPago.monto,
                            fecha: datosPago.fecha
                        });

                        // 3. Enviar el PDF al cliente
                        const mediaPDF = MessageMedia.fromFilePath(rutaPDF);
                        await client.sendMessage(msg.from, mediaPDF, { caption: '📄 Aquí tiene su recibo de pago oficial de Xenon Estudio.' });
                        
                        console.log(`✅ Recibo enviado a ${msg.from}`);
                    } catch (pdfErr) {
                        console.error("Error generando PDF:", pdfErr);
                        await msg.reply("✅ Pago por validar, pero hubo un error generando tu PDF.");
                    }

                        await msg.reply(`✅ *PAGO RECIBIDO - XENON ESTUDIO*\n\n*Ref:* ${datosPago.referencia}\n*Monto:* ${datosPago.monto}\n*Fecha:* ${datosPago.fecha}\n\nSu reporte ha sido guardado en el sistema. ¡Gracias!`);
                        return; 
                    }
                }
            } catch (e) {
                console.error("❌ Fallo crítico en el parseo:", e.message);
                console.log("Contenido que falló:", aiReply); // Para que veas qué envió Gemini
            }
        }

        // Guardamos el mensaje del usuario con la URL de la imagen si existe
        saveMessage(msg.from, 'user', msg.body || "[Imagen]", rutaLocalParaDB);
        
        // Guardamos la respuesta de la IA (normalmente sin archivo)
        saveMessage(msg.from, 'model', aiReply, null);

            if (clientePidioAudio) {
            try {
                await chat.sendStateRecording();
                const audioMedia = await textToAudio(aiReply);
                
                if (audioMedia) {
                    await client.sendMessage(msg.from, audioMedia, { 
                        sendAudioAsVoice: true 
                    });
                } else {
                     setTimeout(async () => {
                        await msg.reply(aiReply); // Fallback a texto si falla ElevenLabs
                    }, 2000);
                    throw new Error("No se pudo generar el audio");
                   
                }
            } catch (audioError) {
                console.error("Fallo ElevenLabs, enviando texto:", audioError.message);
                 // Respuesta normal por texto
                setTimeout(async () => {
                    await msg.reply(aiReply);
                }, 2000); // Si falla el audio, enviamos el texto de Gemini
            }
        }else {
            // Respuesta normal por texto
            setTimeout(async () => {
                    await msg.reply(aiReply);
                }, 2000);
                
        }


    } catch (error) {
        console.error(error);
    }

    } catch (err) {
        console.error("❌ Error procesando mensaje:", err);
    }
});

require('./api.js');


let inicializado = false;

const startBot = () => {
    if (!inicializado) {
        console.log("⏳ Iniciando conexión con WhatsApp...");
        client.initialize().catch(err => {
            console.error("❌ Error crítico al inicializar:", err.message);
        });
        inicializado = true;
    }
};

// Esperamos a que la API esté lista primero
setTimeout(startBot, 5000);



process.on('SIGINT', async () => {
    console.log("👋 Cerrando Xenon Estudio de forma segura...");
    await client.destroy();
    process.exit();
});

