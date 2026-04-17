const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function checkModels() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        console.log("Modelos disponibles para tu cuenta:");
        data.models.forEach(m => console.log("- " + m.name.replace('models/', '')));
    } catch (e) {
        console.error("Error conectando con la API:", e);
    }
}

checkModels();