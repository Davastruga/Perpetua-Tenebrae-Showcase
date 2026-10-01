# Perpetua Tenebrae Showcase — PWA Offline

Versión 2.0 preparada para instalarse desde Safari/Chrome sin APK, IPA, App Store ni Google Play.

## Qué hace

- Menú 16:9 estilo showcase / streaming.
- Pitch PDF a pantalla completa con navegación izquierda/derecha.
- Vídeos Combat, Exploration y dos ranuras opcionales (Trailer y Cinematics).
- Reproductor de vídeo fullscreen con play/pause, timeline y controles que desaparecen tras 3 segundos.
- Panel de configuración protegido por `WhiteCrow26`.
- Fondo, miniaturas, música, sonido UI, fuente, título, subtítulo y textos editables.
- Presentation Lock: oculta Ajustes; mantener pulsado el nombre del estudio 3 segundos para desbloquear.
- Offline Check antes de una feria.
- Almacenamiento local OPFS (o IndexedDB como fallback). Los vídeos y el pitch NO se suben al servidor.
- Service Worker para que la aplicación siga arrancando sin Internet.

## Publicar

La carpeta no necesita compilación. Sube **todo su contenido** a cualquier hosting HTTPS estático.

Opciones sencillas:
- Netlify Drop: arrastra la carpeta completa.
- Cloudflare Pages / GitHub Pages / cualquier hosting HTTPS.
- Un subdominio propio como `showcase.whitecrowentertainment.com`.

La PWA necesita HTTPS (salvo `localhost`) para instalación y Service Worker.

## Instalar en iPhone / iPad

1. Abre la URL en Safari.
2. Pulsa Compartir.
3. `Añadir a pantalla de inicio`.
4. Abre el nuevo icono de **PT Showcase**.
5. Desde esa versión instalada entra en Ajustes e importa los vídeos/PDF.
6. Ejecuta **OFFLINE CHECK**.
7. Activa modo avión y comprueba una vez Combat, Exploration y Pitch.

## Instalar en Android

1. Abre la URL en Chrome.
2. Pulsa `Instalar aplicación` o `Añadir a pantalla de inicio`.
3. Abre el icono instalado.
4. Importa los archivos desde Ajustes.
5. Ejecuta **OFFLINE CHECK** y prueba en modo avión.

## Importante sobre el Pitch PDF

Esta versión no descarga librerías PDF externas: usa el visor PDF integrado del navegador/dispositivo y cambia de página mediante gestos. El número de páginas se obtiene localmente del propio PDF. Para máxima compatibilidad en feria, usa un PDF estándar sin contraseña y páginas 16:9 horizontales.

## Vídeo recomendado

Para compatibilidad máxima entre iOS y Android:
- MP4
- H.264 (AVC)
- AAC para audio

Para material 4K pesado, pruébalo previamente en el dispositivo concreto que llevarás al evento.

## Seguridad

`WhiteCrow26` es una barrera práctica de interfaz, no protección criptográfica. Los datos importados permanecen en el almacenamiento local de la PWA y se eliminan si el navegador/sistema borra los datos del sitio o si se desinstala y elimina su almacenamiento.
