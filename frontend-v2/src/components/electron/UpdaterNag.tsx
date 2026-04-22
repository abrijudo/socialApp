import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, RefreshCw } from 'lucide-react'

type UpdaterStatus = 'idle' | 'available' | 'downloading' | 'ready'

/**
 * Solo Electron (empaquetado): aviso de actualización vía IPC desde main + electron-updater.
 */
export function UpdaterNag() {
  const [status, setStatus] = useState<UpdaterStatus>('idle')
  const [version, setVersion] = useState('')
  const [progressPct, setProgressPct] = useState<number | null>(null)

  useEffect(() => {
    const api = window.electronAPI
    const offAvailable = api?.onUpdateAvailable?.((v) => {
      setVersion(v)
      setStatus('available')
      setProgressPct(null)
    })
    const offReady = api?.onUpdateReady?.(() => {
      setStatus('ready')
      setProgressPct(null)
    })
    const offProgress = api?.onUpdateDownloadProgress?.((p) => {
      setProgressPct(typeof p.percent === 'number' ? p.percent : null)
    })

    return () => {
      offAvailable?.()
      offReady?.()
      offProgress?.()
    }
  }, [])

  if (status === 'idle') return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-border bg-card animate-in slide-in-from-bottom-2 fixed right-4 bottom-4 z-50 max-w-sm rounded-lg border p-4 shadow-2xl duration-200"
    >
      <p className="mb-3 text-sm font-medium">
        {status === 'available' && `Nueva versión ${version || ''} disponible`}
        {status === 'downloading' && (
          <>
            Descargando actualización
            {progressPct != null ? ` (${Math.round(progressPct)}%)` : '…'}
          </>
        )}
        {status === 'ready' && 'Actualización lista para instalar'}
      </p>

      {status === 'available' && (
        <Button
          size="sm"
          type="button"
          className="w-full sm:w-auto"
          onClick={() => {
            window.electronAPI?.startUpdateDownload?.()
            setStatus('downloading')
          }}
        >
          <Download className="mr-2 size-4" aria-hidden />
          Descargar ahora
        </Button>
      )}

      {status === 'downloading' && (
        <p className="text-muted-foreground text-xs">No cierres la aplicación hasta que termine la descarga.</p>
      )}

      {status === 'ready' && (
        <Button
          size="sm"
          type="button"
          className="w-full sm:w-auto"
          onClick={() => window.electronAPI?.installUpdate?.()}
        >
          <RefreshCw className="mr-2 size-4" aria-hidden />
          Reiniciar y actualizar
        </Button>
      )}
    </div>
  )
}
