# MendoRPG – sitio con panel de administración

## Qué hay en esta carpeta
- `public/index.html` → la página (con el botón **Admin** en el menú de arriba).
- `public/admin.js` y `public/admin.css` → el modo edición (lápices), el panel y las Crónicas.
- `netlify/functions/` → el "servidor": login, sesión y registro de cambios.
- `netlify.toml` y `package.json` → configuración de Netlify.

## Paso 1: subirlo a Netlify
Arrastrar y soltar NO sirve para esto (no instala las dependencias de las funciones). Elegí una de estas dos:

**A) Con GitHub (lo más cómodo para actualizar después)**
1. Creá un repositorio en GitHub y subí el contenido de esta carpeta.
2. En Netlify: *Add new site → Import an existing project* y elegí el repositorio.
3. No hace falta cambiar nada: Netlify lee `netlify.toml` solo.

**B) Con la consola (Netlify CLI)**
```
npm install -g netlify-cli
netlify login
netlify link        # (o netlify init) y elegí tu sitio existente
npm install
netlify deploy --prod
```

## Paso 2: crear las 3 variables privadas (OBLIGATORIO)
En Netlify: *Site configuration → Environment variables → Add a variable*.

| Variable | Qué poner |
|---|---|
| `ADMIN_USER` | el usuario que quieras (mejor que no sea "admin") |
| `ADMIN_PASS` | una contraseña LARGA y única (12+ caracteres, que no uses en otro lado) |
| `SESSION_SECRET` | un texto largo al azar (40+ caracteres). Sirve para firmar las sesiones; no lo vas a escribir nunca más |

Después de crearlas, hacé un nuevo deploy (*Deploys → Trigger deploy*) para que las funciones las lean.
Estos valores NO están en el HTML ni en el código: solo existen en Netlify.

## Cómo se usa
1. Entrá a tu página y tocá **Admin** (arriba a la derecha) e ingresá usuario y contraseña.
2. Aparece una barra abajo y un **lápiz** al lado de cada texto de la página.

**Editar textos y enlaces (lápiz)**
- Tocá el lápiz, cambiá el texto (y el enlace, si es un botón de enlace como Discord) y **Aplicar**.
- Los lápices azules son textos que ya cambiaste. Nada se ve en la página pública hasta que toques **PUBLICAR** en la barra.
- **Descartar** deshace lo que no publicaste. **Restaurar original** vuelve un texto a como venía.
- Si un mismo texto aparece en dos lugares, se cambia en los dos.
- La IP de “Copiar IP” se cambia con su lápiz: lo que escribas ahí es lo que se copia.
- Con **✎ Edición: Sí/No** mostrás u ocultás los lápices.

**Crónicas (blog de sucesos)**
- **+ Crónica**: título, fecha del suceso, imagen (opcional) y texto. La barra de arriba del texto da formato:
  N = **negrita**, K = *cursiva*, S = ~~tachado~~, T = título, • = lista, 1. = lista numerada, ❝ = cita, 🔗 = enlace, </> = código, — = línea.
  También podés escribir el formato a mano (`**negrita**`, `*cursiva*`, `- lista`).
- **Vista previa** te muestra cómo va a quedar. Para separar párrafos dejá una línea en blanco.
- Las imágenes se achican solas a 1600 px antes de subirse. Cada crónica tiene botones **Editar** y **Eliminar** (solo los ves como admin).

**Registro de cambios del servidor**
- Botón **Registro de cambios** de la barra: **+ Nueva entrada**, escribí versión, fecha, título y los cambios (uno por línea) y **Guardar y publicar**.
**Video del trailer**
- Como admin, en el recuadro del trailer aparece **SUBIR VIDEO**. Elegí un archivo **MP4 (H.264) o WebM** de hasta **100 MB**; se sube en pedazos y muestra el avance.
- El video llena todo el recuadro (si no es 16:9 se recortan un poco los bordes) y se publica al instante para todos. Con **CAMBIAR VIDEO** lo reemplazás y con **QUITAR** volvés al recuadro de “PLAY”.
- El botón “VER TEASER” reproduce el video cuando hay uno cargado; su texto se cambia con el lápiz.

4. Para cambiar la contraseña: modificá `ADMIN_PASS` en Netlify y hacé deploy. Para cerrar TODAS las sesiones abiertas: cambiá `SESSION_SECRET`.

## Seguridad (lo que ya está resuelto)
- Usuario y contraseña solo en el servidor; el navegador nunca los recibe.
- Sesión en cookie firmada, HttpOnly (el JavaScript de la página no puede leerla), dura 8 horas.
- Máximo 5 intentos fallidos por IP cada 15 minutos.
- El servidor valida y limpia todo lo que se guarda; sin sesión de admin rechaza cualquier cambio (aunque alguien toque el código en su navegador).
- Los textos se muestran como texto plano, así que nadie puede inyectar código desde el panel.

## Qué NO se edita con el lápiz
- Imágenes (escudo, fondo) y la música: son archivos de la página.
- La estructura (agregar o quitar secciones o tarjetas): eso se pide como cambio de la página.
- Para el registro de cambios y las crónicas hay un editor propio (arriba).

## Límites
- Hay una sola cuenta de administrador. Si más adelante querés varios admins o rangos, se puede ampliar.
- Mientras no guardes nada desde el panel, la página muestra la entrada de ejemplo que viene dentro del HTML.
