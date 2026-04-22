/** Cuerpo reservado por el backend cuando el mensaje es solo media (sin pie de usuario). */
export function isMediaPlaceholderBody(body: string): boolean {
  return /^\[(imagen|video|audio|archivo)\]\s*$/i.test(body.trim())
}
