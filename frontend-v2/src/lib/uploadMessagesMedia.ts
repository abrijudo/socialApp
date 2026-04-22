import { resolveApiUrl } from '@/lib/api'

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    r.onload = () => {
      if (typeof r.result === 'string') resolve(r.result)
      else reject(new Error('Lectura inválida.'))
    }
    r.readAsDataURL(file)
  })
}

export type UploadProgressHandler = (percent: number) => void

/**
 * Sube a `POST /api/upload` (base64 JSON) con progreso del cuerpo de la petición.
 */
export async function uploadFileToMessagesMedia(
  file: File,
  accessToken: string,
  onProgress: UploadProgressHandler,
): Promise<{ url: string }> {
  const dataUrl = await readFileAsDataUrl(file)
  const body = JSON.stringify({
    data: dataUrl,
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name,
  })
  const url = resolveApiUrl('/api/upload')

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8')
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)))
      } else {
        onProgress(0)
      }
    }

    xhr.onerror = () => reject(new Error('Error de red al subir.'))
    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText || '{}') as { url?: string; error?: string }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(payload.error || 'No se pudo subir el archivo.'))
          return
        }
        if (!payload.url) {
          reject(new Error('Respuesta de subida inválida.'))
          return
        }
        onProgress(100)
        resolve({ url: payload.url })
      } catch {
        reject(new Error('Respuesta de subida inválida.'))
      }
    }

    xhr.send(body)
  })
}
