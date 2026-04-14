import { useEffect, useState } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import { apiPostJson } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'

export type InviteModalProps = {
  isOpen: boolean
  onClose: () => void
  serverId: string
}

type InvitationResponse = {
  code?: string
  url?: string
}

function buildJoinUrl(code: string): string {
  if (typeof window === 'undefined') return `/join/${code}`
  return `${window.location.origin}/join/${code}`
}

export function InviteModal({ isOpen, onClose, serverId }: InviteModalProps) {
  const accessToken = useAppStore((s) => s.accessToken)
  const [inviteUrl, setInviteUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isOpen || !serverId || !accessToken) {
      setInviteUrl('')
      setError(null)
      setLoading(false)
      setCopied(false)
      return
    }

    let cancelled = false
    setInviteUrl('')
    setError(null)
    setCopied(false)
    setLoading(true)

    void (async () => {
      try {
        const res = await apiPostJson<InvitationResponse>(
          `/api/servers/${serverId}/invitations`,
          accessToken,
          { expiresInHours: 24 },
        )
        if (cancelled) return
        const url =
          typeof res.url === 'string' && res.url
            ? res.url
            : res.code
              ? buildJoinUrl(res.code)
              : ''
        setInviteUrl(url)
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'No se pudo crear la invitación')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, serverId, accessToken])

  async function handleCopy() {
    if (!inviteUrl || !navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      toast.success('Enlace copiado al portapapeles')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
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
        <DialogHeader>
          <DialogTitle>Invitar al servidor</DialogTitle>
          <DialogDescription>
            Comparte este enlace para que otras personas se unan. Caduca en 24 horas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {loading ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              Generando invitación…
            </div>
          ) : error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : (
            <>
              <Label htmlFor="invite-link" className="sr-only">
                Enlace de invitación
              </Label>
              <div className="flex gap-2">
                <Input
                  id="invite-link"
                  readOnly
                  value={inviteUrl}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="shrink-0"
                  onClick={() => void handleCopy()}
                  disabled={!inviteUrl}
                  title="Copiar enlace"
                  aria-label={copied ? 'Copiado' : 'Copiar enlace'}
                >
                  {copied ? (
                    <Check className="size-4 text-emerald-600" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
