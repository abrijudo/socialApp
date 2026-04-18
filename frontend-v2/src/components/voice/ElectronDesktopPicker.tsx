import { useCallback, useEffect, useState } from 'react'
import type { ElectronDesktopSourceInfo } from '@/types/electron-ambient'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type ElectronShareConfirmPayload = {
  sourceId: string
  kind: 'window' | 'screen'
  captureAudio: boolean
  /** PID para WASAPI (ventana); si falta y hay audio, solo vídeo */
  processId?: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (payload: ElectronShareConfirmPayload) => void
}

export function ElectronDesktopPicker({ open, onOpenChange, onConfirm }: Props) {
  const [sources, setSources] = useState<ElectronDesktopSourceInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'window' | 'screen'>('window')
  const [captureAudio, setCaptureAudio] = useState(true)

  const loadSources = useCallback(async () => {
    if (!window.electronAPI?.getDesktopSources) return
    setLoading(true)
    setError(null)
    try {
      const list = await window.electronAPI.getDesktopSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 360, height: 200 },
      })
      setSources(list)
      const firstOfTab = list.find((s) => s.sourceType === tab)
      setSelectedId(firstOfTab?.id ?? list[0]?.id ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron listar ventanas')
      setSources([])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    if (!open) return
    void loadSources()
  }, [open, loadSources])

  useEffect(() => {
    if (!open) return
    const first = sources.find((s) => s.sourceType === tab)
    if (first) setSelectedId(first.id)
    else setSelectedId(sources[0]?.id ?? null)
  }, [tab, sources, open])

  const filtered = sources.filter((s) => s.sourceType === tab)
  const selected = sources.find((s) => s.id === selectedId)

  const handleConfirm = () => {
    if (!selectedId || !selected) return
    onConfirm({
      sourceId: selectedId,
      kind: selected.sourceType,
      captureAudio: selected.sourceType === 'window' && captureAudio,
      processId: selected.sourceType === 'window' ? selected.processId : undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] max-w-[min(96vw,920px)] gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,920px)]">
        <DialogHeader className="border-border border-b px-4 py-3">
          <DialogTitle>Compartir pantalla</DialogTitle>
          <DialogDescription>
            Elige una ventana o pantalla. Esta ventana de la app no aparece en la lista. En Windows, el audio de
            «Ventana» usa captura WASAPI por PID cuando hay PID disponible; si no, solo vídeo para evitar el loopback
            del sistema (voces de la llamada).
          </DialogDescription>
        </DialogHeader>

        <div className="border-border flex gap-1 border-b px-2 pt-2">
          <Button
            type="button"
            variant={tab === 'window' ? 'secondary' : 'ghost'}
            size="sm"
            className="rounded-b-none"
            onClick={() => setTab('window')}
          >
            Ventanas
          </Button>
          <Button
            type="button"
            variant={tab === 'screen' ? 'secondary' : 'ghost'}
            size="sm"
            className="rounded-b-none"
            onClick={() => setTab('screen')}
          >
            Pantallas
          </Button>
        </div>

        <div className="max-h-[420px] min-h-[240px] overflow-y-auto p-3">
          {loading && <p className="text-muted-foreground text-sm">Cargando miniaturas…</p>}
          {error && <p className="text-destructive text-sm">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="text-muted-foreground text-sm">No hay fuentes en esta categoría.</p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {filtered.map((src) => (
              <button
                key={src.id}
                type="button"
                onClick={() => setSelectedId(src.id)}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border p-1.5 text-left text-xs transition-colors',
                  selectedId === src.id
                    ? 'border-primary ring-1 ring-primary'
                    : 'border-border hover:bg-muted/60',
                )}
              >
                <div className="bg-muted relative aspect-video w-full overflow-hidden rounded-md">
                  {src.thumbnailDataUrl ? (
                    <img
                      src={src.thumbnailDataUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="text-muted-foreground flex size-full items-center justify-center text-[10px]">
                      Sin vista previa
                    </div>
                  )}
                </div>
                <span className="line-clamp-2 leading-tight font-medium">{src.name}</span>
              </button>
            ))}
          </div>
        </div>

        {tab === 'window' && (
          <label className="text-muted-foreground flex cursor-pointer items-center gap-2 border-border border-t px-4 py-2 text-xs">
            <input
              type="checkbox"
              checked={captureAudio}
              onChange={(e) => setCaptureAudio(e.target.checked)}
              className="accent-primary"
            />
            Incluir audio de la aplicación (WASAPI por PID en Windows; requiere que aparezca el PID en la lista)
          </label>
        )}
        {tab === 'screen' && (
          <p className="text-muted-foreground border-border border-t px-4 py-2 text-xs">
            Pantalla completa: el audio puede incluir todo el sistema. Para menos eco, preferible ventana o
            auriculares.
          </p>
        )}

        <DialogFooter className="border-border border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!selectedId} onClick={handleConfirm}>
            Transmitir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
