const { db } = require('./database');
const bcrypt = require('bcrypt');
const readline = require('readline');

// Configuración de la interfaz de la terminal
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const cuestionario = (pregunta) => {
    return new Promise((resolve) => rl.question(pregunta, resolve));
};

async function ejecutarAsistente() {
    console.log("\n--- 🛡️ ASISTENTE DE USUARIOS - XENON ESTUDIO ---");
    
    const confirmar = await cuestionario("¿Deseas agregar un nuevo usuario administrador? (s/n): ");
    
    if (confirmar.toLowerCase() !== 's') {
        console.log("❌ Operación cancelada.");
        rl.close();
        process.exit();
    }

    // Captura de datos
    const username = await cuestionario("👤 Ingresa el nombre de usuario: ");
    const password = await cuestionario("🔑 Ingresa la contraseña: ");
    const rol = await cuestionario("🎖️ Ingresa el rol (por defecto 'admin'): ") || 'admin';

    if (!username || !password) {
        console.log("⚠️ Error: El usuario y la contraseña son obligatorios.");
        rl.close();
        process.exit();
    }

    try {
        console.log("\n⏳ Encriptando seguridad...");
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const query = "INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)";
        
        db.run(query, [username, hashedPassword, rol], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    console.log(`\n❌ Error: El usuario "${username}" ya existe en la base de datos.`);
                } else {
                    console.error("\n❌ Error técnico:", err.message);
                }
            } else {
                // RESUMEN FINAL
                console.log("\n" + "=".repeat(35));
                console.log("✅ ¡USUARIO CREADO EXITOSAMENTE!");
                console.log("=".repeat(35));
                console.log(`📝 Resumen del registro:`);
                console.log(`- ID único: ${this.lastID}`);
                console.log(`- Usuario: ${username}`);
                console.log(`- Rol asignado: ${rol}`);
                console.log(`- Estado de clave: Encriptada (Hash BCrypt)`);
                console.log("=".repeat(35));
                console.log("Ya puedes usar estas credenciales en el Login de Angular.\n");
            }
            rl.close();
            process.exit();
        });
    } catch (error) {
        console.error("❌ Fallo crítico en el proceso:", error);
        rl.close();
        process.exit();
    }
}

ejecutarAsistente();