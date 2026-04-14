import { useState } from 'react'
import { Hash, Menu, Users } from 'lucide-react'
import { ChatArea } from '@/components/chat/ChatArea'
import { useMobileNav } from '@/components/layout/MobileNavContext'
import { UserProfilePopup } from '@/components/modals/UserProfilePopup'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'
import type { Channel } from '@/types/models'

export function ChannelHeader({ activeChannel }: { activeChannel: Channel | undefined }) {
  const mobile = useMobileNav()

  return (
    <header className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-3 shadow-sm sm:px-4">
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
      <span className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
        {activeChannel ? (
          <>
            <Hash className="text-muted-foreground mr-1 inline size-4 align-text-bottom" aria-hidden />
            {activeChannel.name}
          </>
        ) : (
          <span className="text-muted-foreground font-medium">Sin canal seleccionado</span>
        )}
      </span>
      {mobile?.showMembersButton ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden shrink-0"
          aria-label="Abrir lista de miembros"
          onClick={() => mobile.openMembersSheet()}
        >
          <Users className="size-5" aria-hidden />
        </Button>
      ) : null}
    </header>
  )
}

/** Main + chat cuando no hay sesión LiveKit activa en el árbol. */
export function MainChatColumnPlain() {
  const activeTextChannelId = useAppStore((s) => s.activeTextChannelId)
  const channels = useAppStore((s) => s.channels)
  const activeChannel = channels.find((c) => c.id === activeTextChannelId)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)

  return (
    <main
      className="bg-background flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Contenido principal"
    >
      <ChannelHeader activeChannel={activeChannel} />
      <ChatArea channelId={activeTextChannelId} onAuthorClick={setProfileUserId} />
      {profileUserId ? (
        <UserProfilePopup
          open
          onOpenChange={(open) => { if (!open) setProfileUserId(null) }}
          userId={profileUserId}
        />
      ) : null}
    </main>
  )
}
