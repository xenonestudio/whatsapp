const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const Bottleneck = require("bottleneck");
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./database');

// 1. Creamos la ruta
const configPath = path.join(__dirname, 'config.json');

// 2. LEEMOS el archivo físico y lo convertimos a objeto JS
const configRaw = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configRaw);




const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const functions = {
  obtenerCoordenadas: ({ direccion }) => {
    // Aquí integrarías con la API de Google Maps Geocoding
    console.log(`Buscando coordenadas para: ${direccion}`);
    return { lat: 7.767, lng: -72.224, nombre_formateado: "Barrio Obrero, San Cristóbal" };
  },
  calcularPrecioViaje: ({ tipoVehiculo, distanciaKm }) => {
    // Lógica opcional si quieres que el cálculo sea exacto por código
    const precios = { sedan: 7000, camioneta: 10000, carga: 12000 };
    return { total: precios[tipoVehiculo] || 7000, moneda: "COP" };
  }
};

// 2. Configuramos las herramientas (Tools)
const tools = [
  {
    functionDeclarations: [
      {
        name: "obtenerCoordenadas",
        description: "Obtiene la latitud y longitud de una dirección de texto o punto de referencia.",
        parameters: {
          type: "OBJECT",
          properties: {
            direccion: { type: "string", description: "La dirección o nombre del lugar" },
          },
          required: ["direccion"],
        },
      },
    ],
  },
];


// Configuramos el limitador: 
// 15 peticiones por cada 60000ms (1 minuto)
// Ponemos 14 para estar seguros.
const limiter = new Bottleneck({
  minTime: 4000, // Espera mínima de 4 segundos entre cada mensaje individual
  maxConcurrent: 1, // Solo procesa una petición de IA a la vez
  reservoir: 14, // Cantidad permitida por minuto
  reservoirRefreshAmount: 14,
  reservoirRefreshInterval: 60 * 1000 ,
  retryCount: 2, // Reintenta 2 veces antes de rendirse
  fallback: (error) => {
    if (error.status === 503) return "Lo siento, mis servidores están saturados en San Cristóbal. Por favor, reintenta en un minuto.";
  }
});



// Esta función ahora recibe el historial
async function getAIResponse(userMessage, rawHistory = [], audioData = null, mimeType = "audio/ogg" , contextoCliente = "", imageData = null, imageMime = "image/jpeg") {

   // 1. OBTENER CONFIGURACIÓN DINÁMICA DE LA DB
    const primaryModel = await getConfig("model_name") || "gemini-flash-lite-latest";
    let systemPrompt = await getConfig("system_prompt") || "Eres el asistente de Xenon Estudio.";
    const tasaBcv = await getConfig("tasa_bcv");
    const temperature = parseFloat(await getConfig("temperature") || "0.7");

    // 2. INYECTAR DATOS VARIABLES EN EL PROMPT DE SISTEMA
    // Esto asegura que la IA siempre sepa la tasa actual sin que tú la escribas a mano en el prompt.
    if (tasaBcv) {
        systemPrompt += `\n[INFORMACIÓN FINANCIERA]: La tasa oficial BCV de hoy es ${tasaBcv} Bs.`;
    }


        const modelName = primaryModel;
        const model = genAI.getGenerativeModel({ 
            model: modelName,
            tools: tools,
            systemInstruction: {
                parts: [{ text: systemPrompt }],
            },
            generationConfig: {
                temperature: temperature,
            }
        });
        
    return limiter.schedule(async () => {
        try {
            // 1. Limpieza de historial (Tu lógica actual que está perfecta)
            let cleanHistory = rawHistory
            .map(m => ({
                // Forzamos que cualquier cosa que no sea 'user' se mapee a 'model'
                role: m.role === "user" ? "user" : "model",
                parts: [{ text: m.parts[0].text || "..." }]
            }))
            .filter(m => m.parts[0].text.trim() !== "");

            const firstUserIndex = cleanHistory.findIndex(m => m.role === "user");
            if (firstUserIndex !== -1) {
                cleanHistory = cleanHistory.slice(firstUserIndex);
            } else {
                cleanHistory = [];
            }

            // 2. Preparación del Prompt
            const mensajeUsuarioLimpio = userMessage || "Analiza esta imagen.";
            let promptFinal = mensajeUsuarioLimpio;

            if (contextoCliente) {
                promptFinal = `[DATOS DEL SISTEMA - XENON ESTUDIO]:\n${contextoCliente}\n\n[SOLICITUD DEL USUARIO]:\n${mensajeUsuarioLimpio}`;
            }

            const chat = model.startChat({ history: cleanHistory });

            // 3. CONSTRUCCIÓN DE LAS PARTES (Aquí estaba el error)
            let msgContent = [];

            // A) Si hay IMAGEN, la agregamos
            if (imageData) {
                msgContent.push({
                    inlineData: {
                        mimeType: imageMime || "image/jpeg",
                        data: imageData
                    }
                });
            }

            // B) Si hay AUDIO, lo agregamos
            if (audioData) {
                msgContent.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: audioData
                    }
                });
            }

            // C) El TEXTO siempre debe ir al final de las partes
            msgContent.push({ text: promptFinal });

            // 4. Enviar a Gemini

            try {
                const result = await chat.sendMessage(msgContent);
                const response = await result.response;
                return response.text();
            } catch (error) {
                if (error.status === 503) {
                    console.log("⚠️ Modelo Lite saturado, intentando con gemini-2.5-flash-lite...");
                    
                    // Re-inicializamos con el modelo base de respaldo
                    const fallbackModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
                    const fallbackChat = fallbackModel.startChat({ history: cleanHistory });
                    const fallbackResult = await fallbackChat.sendMessage(msgContent);
                    return fallbackResult.response.text();
                }
                throw error; // Si es otro error, lo lanzamos al catch general
            }

        } catch (error) {
            console.error("--- ERROR REAL DE GEMINI ---");
            console.error(error); 
            return "Lo siento, tuve un problema técnico con la IA. ¿Podrías repetirme eso por texto?";
        }
    });
}


async function listAvailableModels() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return [];

        const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        
        // Filtramos para devolver solo los modelos que admiten generación de contenido
        return (response.data.models || [])
            .filter(m => m.supportedGenerationMethods.includes("generateContent"))
            .map(m => ({
                id: m.name.replace("models/", ""),
                label: m.displayName || m.name.replace("models/", ""),
                hint: m.description || "Sin descripción disponible"
            }));
    } catch (error) {
        console.error("❌ Error al listar modelos de Gemini (REST):", error.response?.data || error.message);
        return [];
    }
}

module.exports = { getAIResponse, listAvailableModels };



