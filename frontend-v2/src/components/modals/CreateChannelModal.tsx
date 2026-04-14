import { useEffect, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { apiPostJson } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'

export type CreateChannelModalProps = {
  isOpen: boolean
  onClose: () => void
  serverId: string
  defaultType: 'text' | 'voice'
}

export function CreateChannelModal({
  isOpen,
  onClose,
  serverId,
  defaultType,
}: CreateChannelModalProps) {
  const accessToken = useAppStore((s) => s.accessToken)
  const [name, setName] = useState('')
  const [type, setType] = useState<'text' | 'voice'>(defaultType)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setName('')
      setType(defaultType)
      setError(null)
    }
  }, [isOpen, defaultType])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 2 || !accessToken || !serverId || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await apiPostJson<unknown>('/api/channels', accessToken, {
        serverId,
        name: trimmed,
        type,
      })
      toast.success('Canal creado correctamente')
      onClose()
    } catch (err) {
      setError((err as Error).message || 'No se pudo crear el canal')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Crear canal</DialogTitle>
            <DialogDescription>
              El canal aparecerá para todos los miembros del servidor (sincronización en tiempo real).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="channel-name">Nombre</Label>
              <Input
                id="channel-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="nuevo-canal"
                maxLength={40}
                autoComplete="off"
                disabled={submitting}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="channel-type">Tipo</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as 'text' | 'voice')}
                disabled={submitting}
              >
                <SelectTrigger id="channel-type" className="w-full">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="voice">Voz</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error ? (
              <p className="text-destructive text-xs" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || name.trim().length < 2}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Creando…
                </>
              ) : (
                'Crear canal'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
