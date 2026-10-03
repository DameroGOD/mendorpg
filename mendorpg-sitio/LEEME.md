# MendoRPG – sitio con panel de administración

## Qué hay en esta carpeta
- `public/index.html` → la página (con el botón **Admin** en el menú de arriba).
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
1. Entrá a tu página y tocá **Admin** (arriba a la derecha).
2. Ingresá usuario y contraseña.
3. En el panel: **+ Nueva entrada**, escribí versión, fecha, título y los cambios (uno por línea) y **Guardar y publicar**.
   Los jugadores lo ven al instante, sin volver a subir nada.
4. Para cambiar la contraseña: modificá `ADMIN_PASS` en Netlify y hacé deploy. Para cerrar TODAS las sesiones abiertas: cambiá `SESSION_SECRET`.

## Seguridad (lo que ya está resuelto)
- Usuario y contraseña solo en el servidor; el navegador nunca los recibe.
- Sesión en cookie firmada, HttpOnly (el JavaScript de la página no puede leerla), dura 8 horas.
- Máximo 5 intentos fallidos por IP cada 15 minutos.
- El servidor valida y limpia todo lo que se guarda; sin sesión de admin rechaza cualquier cambio (aunque alguien toque el código en su navegador).
- Los textos se muestran como texto plano, así que nadie puede inyectar código desde el panel.

## Límites
- Hay una sola cuenta de administrador. Si más adelante querés varios admins o rangos, se puede ampliar.
- Mientras no guardes nada desde el panel, la página muestra la entrada de ejemplo que viene dentro del HTML.
