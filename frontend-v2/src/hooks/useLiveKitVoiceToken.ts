import { useEffect, useMemo, useState } from 'react'
import { apiGetJson } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import type { LiveKitTokenResponse } from '@/types/models'

export function useLiveKitVoiceToken(channelId: string | null) {
  const accessToken = useAppStore((s) => s.accessToken)
  const channels = useAppStore((s) => s.channels)
  const username = useAppStore((s) => s.username)
  const profile = useAppStore((s) => s.profile)

  /** ID del servidor del canal de voz: no usar `activeServerId` (es null en DMs) o la sala LiveKit se invalida. */
  const voiceServerId = useMemo(
    () => (channelId ? channels.find((c) => c.id === channelId)?.server_id : undefined),
    [channelId, channels],
  )

  const [token, setToken] = useState<string | undefined>(undefined)
  const [serverUrl, setServerUrl] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const participantName = (
    profile?.display_name ||
    profile?.username ||
    username ||
    'Usuario'
  )
    .trim()
    .slice(0, 20)

  useEffect(() => {
    if (!channelId || !accessToken || !voiceServerId) {
      setToken(undefined)
      setServerUrl(undefined)
      setError(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setError(null)
    setToken(undefined)
    setServerUrl(undefined)
    setIsLoading(true)

    const room = `${voiceServerId}:${channelId}`
    const qUser = encodeURIComponent(participantName)
    const qRoom = encodeURIComponent(room)

    void (async () => {
      try {
        const data = await apiGetJson<LiveKitTokenResponse>(
          `/api/token?username=${qUser}&room=${qRoom}`,
          accessToken,
        )
        const envUrl = import.meta.env.VITE_LIVEKIT_URL as string | undefined
        const url = (data.url || envUrl || '').trim() || undefined
        if (!cancelled) {
          setToken(data.token)
          setServerUrl(url)
          if (!data.token || !url) {
            setError('Token o URL de LiveKit incompletos.')
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || 'No se pudo obtener el token de voz.')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [accessToken, channelId, participantName, voiceServerId])

  return { token, serverUrl, error, isLoading }
}
