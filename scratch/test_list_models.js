const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    const models = await genAI.listModels();
    console.log("Modelos disponibles:", JSON.stringify(models, null, 2));
  } catch (error) {
    console.error("Error al listar modelos:", error);
  }
}

listModels();
