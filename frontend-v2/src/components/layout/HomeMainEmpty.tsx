import { Menu, MessageCircle } from 'lucide-react'
import { useMobileNav } from '@/components/layout/MobileNavContext'
import { Button } from '@/components/ui/button'

/** Contenido central cuando no hay servidor ni conversación DM concreta seleccionada. */
export function HomeMainEmpty() {
  const mobile = useMobileNav()

  return (
    <main
      className="bg-background flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Inicio"
    >
      <header className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-3 shadow-sm">
        {mobile ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0"
            aria-label="Abrir menú de navegación"
            onClick={() => mobile.openNavSheet()}
          >
            <Menu className="size-5" aria-hidden />
          </Button>
        ) : null}
        <span className="text-muted-foreground text-sm font-semibold">Inicio</span>
      </header>
      <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-3 text-center text-sm">
        <div className="bg-muted mb-4 flex size-16 shrink-0 items-center justify-center rounded-[20px]">
          <MessageCircle className="text-muted-foreground size-8" aria-hidden />
        </div>
        <p className="max-w-sm leading-relaxed">
          Elige una conversación en Mensajes directos o vuelve a un servidor.
        </p>
      </div>
    </main>
  )
}
