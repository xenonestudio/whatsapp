const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const crearReciboPDF = (datos) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A6', margin: 30 }); // Tamaño pequeño tipo recibo
        const fileName = `recibo_${datos.referencia}.pdf`;
        const filePath = path.join(__dirname, 'descargas', fileName);
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Encabezado
        doc.fontSize(16).text('XENON ESTUDIO', { align: 'center' }).moveDown(0.5);
        doc.fontSize(10).text('San Cristóbal, Táchira', { align: 'center' });
        doc.text('RIF: V-24783437-0', { align: 'center' }).moveDown(1);

        doc.moveTo(30, doc.y).lineTo(250, doc.y).stroke().moveDown(1);

        // Datos del Pago
        doc.fontSize(12).text(`RECIBO DE PAGO`, { underline: true }).moveDown(0.5);
        doc.fontSize(10).text(`Fecha: ${datos.fecha}`);
        doc.text(`Cliente ID: ${datos.whatsapp_id.split('@')[0]}`);
        doc.text(`Referencia: ${datos.referencia}`);
        doc.moveDown(0.5);
        
        doc.fontSize(14).text(`Monto: ${datos.monto} Bs.`, { bold: true });
        
        doc.moveDown(1);
        doc.fontSize(8).text('Gracias por su confianza.', { align: 'center', oblique: true });

        doc.end();

        stream.on('finish', () => resolve(filePath));
        stream.on('error', (err) => reject(err));
    });
};

module.exports = { crearReciboPDF };