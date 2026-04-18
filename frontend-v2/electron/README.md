# Shell de escritorio (Electron)

## Desarrollo

Desde `frontend-v2`:

```bash
npm install
npm run electron:dev
```

Esto arranca **Vite en el puerto 5174** (para no pisar `npm run dev`, que suele usar 5173) y, cuando 5174 responde, abre Electron en `http://127.0.0.1:5174`. Para otro puerto: `cross-env ELECTRON_VITE_PORT=5180` en la primera parte del `concurrently` y el mismo valor en `wait-on` / `ELECTRON_START_URL`.

## Producción

```bash
npm run build
npm run electron:start
```

`electron:start` sirve el `dist/` generado por Vite.

## Seguridad

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- `desktopCapturer.getSources` solo se ejecuta en el **proceso principal**; el preload expone `window.electronAPI.getDesktopSources()` vía IPC.

## Audio: aislamiento real vs. limitaciones

En Windows/macOS, capturar una **ventana** con `chromeMediaSourceId` suele limitar el **vídeo** a esa ventana; el **audio** depende del motor de captura del SO y del tipo de aplicación (algunas mezclarán salida con el resto del sistema).

Para **separar por completo** las voces de LiveKit (reproducción local) de lo que entra en el loopback de captura, a menudo hace falta:

- Enrutar la **reproducción remota** a un dispositivo de salida distinto (p. ej. auriculares USB) y la **captura** solo al bus de la app compartida, o
- Usar un **driver / cable de audio virtual** (VB-Audio, BlackHole, etc.) y políticas de enrutamiento del SO.

Eso queda fuera del alcance de este repositorio; aquí solo se documenta la necesidad si el producto exige garantías de estudio.
