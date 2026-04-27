# Documentación Técnica y Funcional: Xenon Estudio

## 🚀 Resumen del Proyecto
Xenon Estudio es una plataforma avanzada de automatización de WhatsApp diseñada para la gestión de servicios de Internet y tecnología en San Cristóbal. Combina Inteligencia Artificial (Gemini), síntesis de voz (ElevenLabs) y un panel administrativo en tiempo real (Angular).

---

## 🏗️ Arquitectura del Sistema

### Backend (Node.js)
El motor de la aplicación, encargado de la lógica de negocio y la integración con WhatsApp.
- **WhatsApp-Web.js:** Control del cliente de WhatsApp.
- **Express:** API REST para el panel administrativo.
- **Socket.io:** Comunicación bidireccional en tiempo real para el chat en vivo.
- **SQLite:** Persistencia de datos (Mensajes, Pagos, Configuración).

### Frontend (Angular 19)
Interfaz administrativa moderna y reactiva.
- **Signals:** Manejo de estado eficiente y reactivo.
- **Componentes Standalone:** Arquitectura modular sin módulos pesados.
- **Tailwind CSS:** Diseño "Premium Dark" optimizado para escritorio.

---

## 🧠 Funcionalidades Inteligentes

### 1. IA con Contexto (Gemini 2.5 Flash)
El bot no solo responde preguntas, sino que mantiene un historial de conversación para dar respuestas coherentes y personalizadas según las directivas del "System Prompt".

### 2. Visión Artificial para Pagos
Capacidad de procesar imágenes de comprobantes de pago. Gemini extrae automáticamente:
- Número de Referencia.
- Monto del pago.
- Fecha de la transacción.
El sistema valida estos datos contra las cuentas oficiales de la empresa.

### 3. Notas de Voz (ElevenLabs)
Conversión de texto a audio en milisegundos. El bot envía notas de voz con una calidad humana, mejorando la experiencia del cliente.

### 4. Generación de Recibos
Creación automática de archivos PDF con los datos del pago validado, enviados directamente al chat del cliente.

---

## 📂 Estructura del Código

### Backend (`/whatsapp`)
- `whatsapp.js`: Lógica del bot y eventos de mensajes.
- `api.js`: Endpoints del panel y servidor de sockets.
- `database.js`: Consultas SQL y gestión de tablas.
- `gemini-helper.js`: Integración con la API de IA.
- `elevenlabs-helper.js`: Procesamiento de audio y conversión a OGG.

### Frontend (`/xenon-admin-ui`)
- `src/app/app.ts`: Orquestador principal de la aplicación.
- `src/app/components/`:
    - `chat/`: Gestión de sesiones y mensajería manual.
    - `dashboard/`: Visualización de métricas y calculadora de planes.
    - `config/`: Editor de prompts y tasa BCV en caliente.
- `src/app/services/`: Capas de abstracción para la API y Sockets.
- `src/app/models/`: Interfaces de TypeScript para seguridad de tipos.

---

## 🔒 Seguridad y Configuración
El sistema utiliza un archivo `.env` para centralizar la configuración sensible:
- `GEMINI_API_KEY`: Acceso a la IA.
- `ELEVENLABS_API_KEY`: Acceso a la voz.
- `JWT_SECRET`: Firma de tokens para el acceso administrativo.
- `PORT`: Puerto de ejecución del servidor (default: 3000).

---

## 🛠️ Comandos de Mantenimiento
- **Iniciar Backend:** `node whatsapp.js`
- **Iniciar Frontend:** `ng serve`
- **Limpieza de Temporales:** El sistema borra automáticamente los archivos de audio tras enviarlos.

---
**Estado del Sistema:** 🟢 Operativo y Optimizado
**Última Actualización:** 18 de Abril de 2026
