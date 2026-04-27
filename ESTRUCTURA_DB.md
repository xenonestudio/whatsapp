# Estructura de Base de Datos (SQLite) - Xenon Estudio

Este documento detalla el esquema de la base de datos `xenon_estudio.db`, la cual gestiona toda la persistencia del bot y el panel administrativo.

---

## 📋 Tablas y Columnas

### 1. `clientes`
Almacena la información de contacto y suscripción de los usuarios de WhatsApp.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `whatsapp_id` | TEXT (PK) | Identificador único de WhatsApp (ej: 58424xxx@c.us). |
| `nombre` | TEXT | Nombre del cliente. |
| `plan` | TEXT | Plan contratado (default: '$20'). |
| `fecha_corte` | TEXT | Día de facturación (default: '05 de cada mes'). |
| `estado` | TEXT | Estado del servicio (activo/suspendido). |
| `sector` | TEXT | Zona geográfica (ej: San Cristóbal). |
| `fecha_registro` | DATETIME | Timestamp de creación automática. |

### 2. `historial`
Registro de todos los mensajes enviados y recibidos.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | INTEGER (PK) | Autoincremental. |
| `whatsapp_id` | TEXT (FK) | Relación con la tabla clientes. |
| `rol` | TEXT | Quién envió el mensaje (`user`, `model`, `admin`). |
| `mensaje` | TEXT | Contenido de texto del mensaje. |
| `archivo_url` | TEXT | Ruta local a archivos adjuntos (audios, imágenes). |
| `timestamp` | DATETIME | Fecha y hora del mensaje. |

### 3. `pagos_validados`
Registro de los pagos procesados y aprobados por la IA.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | INTEGER (PK) | Autoincremental. |
| `whatsapp_id` | TEXT | ID del pagador. |
| `referencia` | TEXT (UNIQUE)| Número de referencia bancaria. |
| `monto` | TEXT | Cantidad pagada. |
| `fecha_pago` | TEXT | Fecha extraída del comprobante. |
| `fecha_verificacion`| DATETIME | Cuándo fue validado por el sistema. |
| `archivo_url` | TEXT | Link al capture del pago. |

### 4. `configuracion`
Almacena parámetros del sistema que se pueden cambiar en caliente.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `clave` | TEXT (PK) | Nombre del ajuste (`system_prompt`, `temperature`, etc). |
| `valor` | TEXT | Valor asignado al ajuste. |

### 5. `usuarios`
Cuentas de acceso para el Panel Administrativo (Angular).
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | INTEGER (PK) | Autoincremental. |
| `username` | TEXT (UNIQUE)| Nombre de usuario para login. |
| `password` | TEXT | Hash de la contraseña (bcrypt). |
| `rol` | TEXT | Nivel de acceso (default: 'admin'). |

### 6. `blacklist`
Usuarios bloqueados por el sistema o manualmente.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `whatsapp_id` | TEXT (PK) | ID bloqueado. |
| `nombre` | TEXT | Nombre registrado al momento del bloqueo. |
| `motivo` | TEXT | Razón del bloqueo. |
| `fecha_bloqueo` | DATETIME | Fecha de sanción. |

---

## 🛠️ Mantenimiento
Para realizar consultas manuales desde la terminal:
```bash
sqlite3 xenon_estudio.db
```
*(Se recomienda usar DB Browser for SQLite para una gestión visual).*
