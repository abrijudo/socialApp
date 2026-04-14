import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, Plus } from 'lucide-react'
import { apiGetJson, apiPostJson } from '@/lib/api'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useMobileNav } from '@/components/layout/MobileNavContext'
import { useAppStore } from '@/store/useAppStore'
import type { DmChannelSummary } from '@/types/models'

function normalizeUsernameInput(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase()
    .slice(0, 20)
}

function otherInitials(dm: DmChannelSummary): string {
  const p = dm.otherUser
  const label = p?.display_name || p?.username || '?'
  const t = label.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2)
  }
  return t.slice(0, 2).toUpperCase()
}

function otherName(dm: DmChannelSummary): string {
  const p = dm.otherUser
  return p?.display_name?.trim() || p?.username || 'Usuario'
}

/** Columna de conversaciones DM (vista Inicio). */
export function DmSidebar() {
  const mobile = useMobileNav()
  const accessToken = useAppStore((s) => s.accessToken)
  const profile = useAppStore((s) => s.profile)
  const dmChannels = useAppStore((s) => s.dmChannels)
  const activeDmChannelId = useAppStore((s) => s.activeDmChannelId)
  const setDmChannels = useAppStore((s) => s.setDmChannels)
  const setActiveDmChannelId = useAppStore((s) => s.setActiveDmChannelId)
  const [listLoading, setListLoading] = useState(false)

  const refreshDmList = useCallback(async () => {
    if (!accessToken) return
    setListLoading(true)
    try {
      const list = await apiGetJson<DmChannelSummary[]>('/api/dm', accessToken)
      setDmChannels(Array.isArray(list) ? list : [])
    } catch {
      setDmChannels([])
    } finally {
      setListLoading(false)
    }
  }, [accessToken, setDmChannels])

  useEffect(() => {
    void refreshDmList()
  }, [refreshDmList])

  async function handleNewDm() {
    const raw = window.prompt('Nombre de usuario del destinatario (sin @):', '')
    if (raw == null) return
    const key = normalizeUsernameInput(raw)
    if (key.length < 2) {
      window.alert('El nombre debe tener al menos 2 caracteres válidos.')
      return
    }
    if (!accessToken) return

    const sb = getSupabaseBrowserClient()
    const { data: row, error } = await sb.from('profiles').select('user_id').eq('username', key).maybeSingle()

    if (error || !row?.user_id) {
      window.alert('No se encontró un usuario con ese nombre.')
      return
    }

    try {
      const res = await apiPostJson<{ id: string }>('/api/dm', accessToken, {
        otherUserId: row.user_id,
      })
      await refreshDmList()
      if (res?.id) {
        setActiveDmChannelId(res.id)
        mobile?.setNavSheetOpen(false)
        toast.success('Conversación iniciada')
      }
    } catch (e) {
      window.alert((e as Error).message || 'No se pudo crear el DM.')
    }
  }

  return (
    <nav
      className="bg-muted flex h-full min-h-0 w-full min-w-0 flex-col"
      aria-label="Mensajes directos"
    >
      <header className="border-border flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3 shadow-sm">
        <div className="text-foreground flex min-w-0 items-center gap-2">
          <MessageCircle className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <h1 className="truncate text-sm font-semibold">Mensajes directos</h1>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          title="Nuevo mensaje directo"
          aria-label="Nuevo mensaje directo"
          onClick={() => void handleNewDm()}
        >
          <Plus className="size-4" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
        {listLoading && dmChannels.length === 0 ? (
          <div className="px-2 py-1" aria-busy="true" aria-label="Cargando conversaciones">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="mb-1 h-8 w-full rounded-md" />
            ))}
          </div>
        ) : dmChannels.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-center text-xs leading-relaxed">
            No tienes conversaciones. Pulsa + para buscar por nombre de usuario.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {dmChannels.map((dm) => {
              const active = dm.id === activeDmChannelId
              return (
                <li key={dm.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDmChannelId(dm.id)
                      mobile?.setNavSheetOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors duration-200 ease-in-out',
                      active
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <div
                      className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                      aria-hidden
                    >
                      {otherInitials(dm)}
                    </div>
                    <span className="truncate">{otherName(dm)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <footer className="border-border mt-auto flex items-center gap-2 border-t p-2">
        <div
          className="bg-primary/15 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
          aria-hidden
        >
          {(profile?.display_name || profile?.username || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">
            {profile?.display_name || profile?.username || 'Usuario'}
          </div>
          <div className="text-muted-foreground truncate text-[11px]">
            @{profile?.username ?? '…'}
          </div>
        </div>
      </footer>
    </nav>
  )
}
