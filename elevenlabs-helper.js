const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

// ESTO ES LO QUE FALTA: Configurar la ruta manual
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path); // <--- Forzamos la ruta del binario

async function textToAudio(text) {
    try {
        const response = await axios({
            method: 'post',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
            headers: {
                'accept': 'audio/mpeg',
                'xi-api-key': process.env.ELEVENLABS_API_KEY,
                'content-type': 'application/json',
            },
            data: {
                text: text,
                model_id: "eleven_multilingual_v2",
                voice_settings: { stability: 0.5, similarity_boost: 0.5 }
            },
            responseType: 'arraybuffer'
        });

        // Nombres de archivos únicos para evitar colisiones
        const id = Date.now();
        const tempMp3 = path.join(__dirname, `temp_${id}.mp3`);
        const finalOgg = path.join(__dirname, `voice_${id}.ogg`);
        
        fs.writeFileSync(tempMp3, response.data);

        return new Promise((resolve, reject) => {
            ffmpeg(tempMp3)
                .toFormat('ogg')
                .audioCodec('libopus')
                .on('end', () => {
                    const media = MessageMedia.fromFilePath(finalOgg);
                    
                    // Limpieza: Borramos después de un delay para asegurar carga
                    setTimeout(() => {
                        if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
                        if (fs.existsSync(finalOgg)) fs.unlinkSync(finalOgg);
                    }, 10000);

                    resolve(media);
                })
                .on('error', (err) => {
                    console.error('Error FFmpeg Interno:', err.message);
                    if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
                    resolve(null);
                })
                .save(finalOgg);
        });

    } catch (error) {
        console.error("Error API ElevenLabs:", error.message);
        return null;
    }
}

module.exports = { textToAudio };