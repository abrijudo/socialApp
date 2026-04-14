/**
 * Clave de `localStorage` para el borrador de usuario (antes/después de `signInAnonymously`).
 * Lo consume `bootstrapSession` y el store Zustand al cerrar sesión o detectar conflicto de nombre.
 */
export const SOCIALAPP_USER_KEY = 'socialapp_user'
