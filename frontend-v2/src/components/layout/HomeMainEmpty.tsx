import { Menu, MessageCircle } from 'lucide-react'
import { LUX_ICON_STROKE, luxIconHeader } from '@/lib/luxIcon'
import { cn } from '@/lib/utils'
import { useMobileNav } from '@/components/layout/MobileNavContext'
import { Button } from '@/components/ui/button'

/** Contenido central cuando no hay servidor ni conversación DM concreta seleccionada. */
export function HomeMainEmpty() {
  const mobile = useMobileNav()

  return (
    <main
      className="bg-background/80 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Inicio"
    >
      <header className="lux-glass-header gap-2">
        {mobile ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lux-icon-button md:hidden shrink-0"
            aria-label="Abrir menú de navegación"
            onClick={() => mobile.openNavSheet()}
          >
            <Menu className={cn(luxIconHeader)} strokeWidth={LUX_ICON_STROKE} aria-hidden />
          </Button>
        ) : null}
        <span className="text-muted-foreground text-[0.8125rem] font-semibold tracking-tight">Inicio</span>
      </header>
      <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center text-sm">
        <div className="mb-5 flex size-[4.25rem] shrink-0 items-center justify-center rounded-[1.15rem] border border-border/50 bg-gradient-to-b from-muted/60 to-muted/30 p-[1px] shadow-[inset_0_1px_0_0_oklch(1_0_0/0.08)]">
          <div className="bg-card/40 flex h-full w-full items-center justify-center rounded-[1.05rem]">
            <MessageCircle
              className="lux-icon size-8 text-primary/80"
              strokeWidth={LUX_ICON_STROKE}
              aria-hidden
            />
          </div>
        </div>
        <p className="text-foreground/85 max-w-sm text-[0.9375rem] leading-relaxed tracking-tight text-balance">
          Elige una conversación en mensajes directos o vuelve a un servidor.
        </p>
      </div>
    </main>
  )
}
