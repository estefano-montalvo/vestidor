# Vestidor

Armario digital para el móvil. Fotografías cada prenda, la app recorta el fondo y la convierte en una ficha tipo tienda online, y después te propone outfits con tu propia ropa.

## Publicarla en GitHub Pages

1. Crea un repositorio nuevo en GitHub, por ejemplo `vestidor`.
2. Sube todo el contenido de esta carpeta respetando la estructura (`index.html` en la raíz, carpetas `js/` e `icons/`). Desde la web: *Add file → Upload files* y arrastra los archivos y carpetas.
3. Ve a *Settings → Pages*, en *Build and deployment* elige *Deploy from a branch*, rama `main` y carpeta `/ (root)`. Guarda.
4. En uno o dos minutos estará en `https://TU-USUARIO.github.io/vestidor/`.
5. Ábrela en el móvil e instálala: en iPhone, Safari → Compartir → *Añadir a pantalla de inicio*; en Android, Chrome → menú → *Instalar aplicación*.

No hay que compilar nada: son archivos estáticos (HTML, CSS y JavaScript sin dependencias de build).

## Cómo funciona

**Recorte de fondo.** Usa `@imgly/background-removal`, un modelo de segmentación que se ejecuta en el navegador. La primera vez descarga el modelo desde el CDN de IMG.LY (unas decenas de megas, mejor con wifi) y después queda en caché, también para usarla sin conexión. Las fotos nunca salen del dispositivo. Si subes una imagen que ya tiene fondo transparente (por ejemplo, recortada con el iPhone manteniendo pulsada la prenda en Fotos), se respeta tal cual.

**Ficha de producto.** Tras el recorte, la prenda se encuadra en formato 4:5, se centra con margen uniforme y se le añade una sombra suave. Se guarda en WebP (o PNG si el navegador no permite WebP).

**Color.** Se detecta el color dominante y se asigna al más cercano de una paleta de 27 colores de moda (en espacio Lab). Siempre puedes corregirlo.

**Combinaciones.** Cada par de prendas recibe una puntuación según:
- Armonía de color: neutros, acento sobre base neutra, monocromático, análogos, complementarios y combinaciones que chocan.
- Afinidad de estilo (casual, smart casual, formal, deportivo, noche).
- Temporada.
- Estampados: penaliza llevar dos a la vez.
- Lo que tú haces: los outfits que guardas y te pones suben la puntuación de esos pares; «No me convence» la baja.

El generador prueba todas las combinaciones posibles (o una muestra amplia si el armario es grande), se queda con las mejores y elige una con algo de variedad. Puedes fijar prendas y pedir otra propuesta alrededor de ellas.

## Dónde se guardan los datos

En IndexedDB, dentro del navegador del dispositivo. El repositorio de GitHub solo contiene el código: tus fotos no se suben a ningún sitio.

Por eso conviene:
- **Instalarla en la pantalla de inicio.** Safari puede borrar los datos de las webs que no se usan durante 7 días; las apps instaladas están exentas.
- **Exportar una copia de vez en cuando** desde Ajustes. Genera un archivo `.json` con todas las prendas y outfits, que puedes importar en otro dispositivo o tras reinstalar.

## Estructura

```
index.html            página principal
styles.css            estilos (modo claro y oscuro)
manifest.webmanifest  datos para instalarla como app
sw.js                 service worker: uso sin conexión y caché del modelo
icons/                iconos de la app
js/app.js             interfaz y flujos
js/imaging.js         recorte, encuadre y color dominante
js/match.js           motor de combinaciones
js/color.js           paleta y conversiones de color
js/data.js            categorías, tipos, estilos y temporadas
js/db.js              almacenamiento local (IndexedDB)
```

## Personalizar

- **Categorías y tipos de prenda:** `js/data.js`.
- **Colores de la paleta:** `js/color.js` (marca con `neutral: true` los que actúan como base).
- **Reglas de combinación:** `colorHarmony` y `STYLE_AFFINITY` en `js/match.js`.
- **Actualizaciones:** los cambios que subas llegan solos la próxima vez que abras la app con conexión. Si modificas `sw.js`, sube también su versión (`vestidor-v1` → `vestidor-v2`) para limpiar la caché antigua.

## Licencias

`@imgly/background-removal` se distribuye con licencia AGPL-3.0. Para uso personal no hay problema; si algún día la ofrecieras como servicio a terceros, revisa las condiciones de esa licencia o sustituye el motor de recorte.
