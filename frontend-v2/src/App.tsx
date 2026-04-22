import { useEffect, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toaster } from '@/components/ui/sonner'
import { SOCIALAPP_USER_KEY } from '@/lib/constants'
import { isElectronAppShell } from '@/lib/electron'
import { ElectronTitleBar } from './components/electron/ElectronTitleBar'
import { UpdaterNag } from '@/components/electron/UpdaterNag'
import { useAppStore } from '@/store/useAppStore'
import { scheduleVoiceModulePrefetch } from '@/lib/scheduleVoicePrefetch'

function readStoredUsernameHint(): string {
  try {
    const raw = localStorage.getItem(SOCIALAPP_USER_KEY)
    if (!raw) return ''
    const o = JSON.parse(raw) as { username?: string }
    return typeof o.username === 'string' ? o.username : ''
  } catch {
    return ''
  }
}

function App() {
  const initializeSession = useAppStore((s) => s.initializeSession)
  const sessionInitializing = useAppStore((s) => s.sessionInitializing)
  const sessionError = useAppStore((s) => s.sessionError)
  const needsUsername = useAppStore((s) => s.needsUsername)
  const initialBootDone = useAppStore((s) => s.initialBootDone)

  const [usernameInput, setUsernameInput] = useState('')

  useEffect(() => {
    document.documentElement.classList.add('dark')
    return () => document.documentElement.classList.remove('dark')
  }, [])

  useEffect(() => {
    void initializeSession()
  }, [initializeSession])

  useEffect(() => {
    if (!initialBootDone) return
    return scheduleVoiceModulePrefetch()
  }, [initialBootDone])

  useEffect(() => {
    if (needsUsername) {
      const hint = readStoredUsernameHint()
      setUsernameInput((prev) => prev || hint)
    }
  }, [needsUsername])

  const showSpinner =
    sessionInitializing && !needsUsername && !initialBootDone

  let body: ReactNode

  if (showSpinner) {
    body = (
      <div className="bg-background text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center gap-3 pt-safe pb-safe">
        <Loader2 className="text-primary size-10 animate-spin" aria-hidden />
        <p className="text-sm">Cargando sesión…</p>
      </div>
    )
  } else if (needsUsername) {
    body = (
      <div className="bg-background flex min-h-0 flex-1 items-center justify-center p-6 pt-safe pb-safe">
        <Card className="border-border w-full max-w-md shadow-md">
          <CardHeader>
            <CardTitle className="font-heading">Entrar</CardTitle>
            <CardDescription>
              Elige un nombre de usuario (2–20 caracteres, letras, números, . _ -). Se usará una
              sesión anónima de Supabase como en la app clásica.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void initializeSession({ interactiveUsername: usernameInput.trim() })
              }}
            >
              {sessionError ? (
                <p className="text-destructive text-sm" role="alert">
                  {sessionError}
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="username">Nombre de usuario</Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  placeholder="tu_nombre"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  minLength={2}
                  maxLength={20}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={sessionInitializing}>
                {sessionInitializing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    Conectando…
                  </>
                ) : (
                  'Continuar'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  } else if (sessionError && !initialBootDone) {
    body = (
      <div className="bg-background flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 pt-safe pb-safe">
        <p className="text-destructive max-w-md text-center text-sm" role="alert">
          {sessionError}
        </p>
        <Button type="button" onClick={() => void initializeSession()}>
          Reintentar
        </Button>
      </div>
    )
  } else if (initialBootDone) {
    body = <AppLayout />
  } else {
    body = (
      <div className="bg-background text-muted-foreground flex min-h-0 flex-1 items-center justify-center pt-safe pb-safe text-sm">
        Preparando aplicación…
      </div>
    )
  }

  return (
    <>
      <div className="text-foreground flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden">
        {/* Solo escritorio (preload expone `window.electronAPI`); en el navegador no hay barra personalizada. */}
        {isElectronAppShell() ? <ElectronTitleBar /> : null}
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">{body}</div>
      </div>
      <UpdaterNag />
      <Toaster theme="dark" />
    </>
  )
}

export default App
