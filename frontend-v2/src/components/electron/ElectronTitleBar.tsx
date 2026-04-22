import { useEffect, useState } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Cromo de ventana solo para el **shell de Electron** (no se monta en el navegador:
 * ver `App.tsx` + `isElectronAppShell`).
 *
 * - **Windows / Linux** (`frame: false`): minimizar, maximizar y cerrar vía preload.
 * - **macOS** (`frame: true`, tráfico nativo): solo título y zona de arrastre; sin botones duplicados.
 */
export function ElectronTitleBar() {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  const isMac = api?.platform === 'darwin'
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!api?.onWindowState) return
    return api.onWindowState((state) => {
      setMaximized(Boolean(state?.maximized))
    })
  }, [api])

  useEffect(() => {
    if (!api?.windowIsMaximized) return
    void api.windowIsMaximized().then(setMaximized)
  }, [api])

  if (!api) return null

  return (
    <header
      className={cn(
        'lux-electron-titlebar',
        isMac ? 'pl-[4.75rem] pr-3' : 'pl-2',
      )}
      data-electron-titlebar=""
    >
      <div className="flex min-h-0 min-w-0 flex-1 items-center [-webkit-app-region:drag]">
        <span className="text-foreground/85 truncate pl-2 text-xs font-medium tracking-wide">
          Social Club
        </span>
      </div>

      {!isMac ? (
        <div className="flex shrink-0 items-center gap-0.5 pr-1 [-webkit-app-region:no-drag]">
          <button
            type="button"
            onClick={() => api.windowMin?.()}
            className="text-muted-foreground hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md border-none bg-transparent outline-none transition-[background-color,color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted/60 focus:outline-none active:scale-[0.97]"
            aria-label="Minimizar"
          >
            <Minus size={14} strokeWidth={1.5} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => api.windowMax?.()}
            className="text-muted-foreground hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md border-none bg-transparent outline-none transition-[background-color,color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted/60 focus:outline-none active:scale-[0.97]"
            aria-label={maximized ? 'Restaurar' : 'Maximizar'}
          >
            <Square size={12} strokeWidth={1.5} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => api.windowClose?.()}
            className="text-muted-foreground flex h-8 w-8 items-center justify-center rounded-md border-none bg-transparent outline-none transition-[background-color,color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-destructive/85 hover:text-white focus:outline-none active:scale-[0.97]"
            aria-label="Cerrar"
          >
            <X size={14} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      ) : null}
    </header>
  )
}
