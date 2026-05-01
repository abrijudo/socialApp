import { memo, useEffect, useState } from 'react'
import type { HTMLAttributeReferrerPolicy } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { resolveApiUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

export type LinkPreviewData = {
  ok: true
  url: string
  title: string
  description: string | null
  image: string | null
}

type LinkPreviewResponse = LinkPreviewData | { ok: false; error?: string }

function displaySiteName(urlStr: string): string {
  try {
    const h = new URL(urlStr).hostname
    if (h === 'www.youtube.com' || h === 'youtube.com' || h === 'm.youtube.com') return 'YouTube'
    if (h === 'youtu.be') return 'YouTube'
    return h.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * ID del vídeo desde URL pública o de embed (YouTube / youtu.be).
 * Expuesto para heurísticas de layout; el iframe usa `youtube-nocookie.com`.
 */
export function getYouTubeVideoIdFromPreviewUrl(pageUrl: string): string | null {
  try {
    const u = new URL(pageUrl)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id || null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname.startsWith('/watch')) {
        const v = u.searchParams.get('v')
        return v?.trim() || null
      }
      if (u.pathname.startsWith('/shorts/')) {
        const parts = u.pathname.split('/').filter(Boolean)
        return parts[1] || null
      }
      if (u.pathname.startsWith('/embed/')) {
        return u.pathname.split('/').filter(Boolean).pop() || null
      }
    }
  } catch {
    return null
  }
  return null
}

/**
 * YouTube error 153 (“configuración del reproductor”) suele aparecer si el iframe no envía un
 * referer/origen que YouTube acepte. En `http(s)://` conviene enviar el origen de la página;
 * en `file:` / `app:` el referer no es útil y en Electron empaquetado el main ya inyecta cabeceras.
 */
function youtubeEmbedQuerySuffix(): string {
  if (typeof window === 'undefined') return ''
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return ''
  try {
    const o = window.location.origin
    if (!o) return ''
    return `&origin=${encodeURIComponent(o)}`
  } catch {
    return ''
  }
}

function youtubeIframeReferrerPolicy(): HTMLAttributeReferrerPolicy | undefined {
  if (typeof window === 'undefined') return undefined
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return 'strict-origin-when-cross-origin'
  }
  return 'no-referrer'
}

const cardClass =
  'mt-2 w-full max-w-lg min-w-0 overflow-hidden rounded-md border border-l-4 border-l-primary border-border bg-muted/30 text-foreground'

/** Misma disposición que la tarjeta con iframe; evita el salto h-16 → aspect-video al virtualizar. */
function LinkPreviewYoutubeSkeleton() {
  return (
    <div className={cn(cardClass, 'border-border/60 bg-card/40')} aria-hidden>
      <div className="min-w-0 w-full px-3 pt-2.5 pb-2">
        <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-md bg-muted/45 animate-pulse" />
      </div>
      <div className="space-y-2 px-3 pb-2.5">
        <div className="h-3 w-20 rounded bg-muted/45 animate-pulse" />
        <div className="h-4 w-[90%] max-w-sm rounded bg-muted/50 animate-pulse" />
        <div className="h-3 w-[72%] rounded bg-muted/40 animate-pulse" />
      </div>
    </div>
  )
}

/** Altura cercana a tarjeta OG típica (texto); mejor que un único bloque bajo. */
function LinkPreviewGenericSkeleton() {
  return (
    <div className={cn(cardClass, 'border-border/60 bg-card/40')} aria-hidden>
      <div className="space-y-2 px-3 py-3">
        <div className="h-3 w-[7.5rem] rounded bg-muted/45 animate-pulse" />
        <div className="h-4 w-[92%] max-w-md rounded bg-muted/50 animate-pulse" />
        <div className="h-[0.8125rem] w-[88%] rounded bg-muted/40 animate-pulse" />
        <div className="min-h-[2.625rem] w-[74%] rounded bg-muted/35 animate-pulse" />
      </div>
    </div>
  )
}

export const LinkPreview = memo(function LinkPreview({ url }: { url: string }) {
  const accessToken = useAppStore((s) => s.accessToken)
  const [data, setData] = useState<LinkPreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  useEffect(() => {
    setData(null)
    setImgError(false)
    setImgLoaded(false)
    setLoading(true)
    let cancel = false
    const ac = new AbortController()
    const q = resolveApiUrl(`/api/preview?url=${encodeURIComponent(url)}`)
    const headers: HeadersInit = { Accept: 'application/json' }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    fetch(q, { signal: ac.signal, headers })
      .then(async (res) => {
        if (!res.ok) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console -- depurar preview fallida (401, 5xx, etc.)
            console.debug('[LinkPreview] HTTP', res.status, await res.text().catch(() => ''))
          }
          return null
        }
        return res.json() as Promise<LinkPreviewResponse>
      })
      .then((json) => {
        if (cancel) return
        if (json == null) {
          setData(null)
          return
        }
        if (json && 'ok' in json && json.ok) {
          setData({
            ...json,
            description: json.description ? json.description : null,
            image: json.image && json.image.length > 0 ? json.image : null,
          })
        } else {
          setData(null)
        }
      })
      .catch(() => {
        if (!cancel) setData(null)
      })
      .finally(() => {
        if (!cancel) setLoading(false)
      })
    return () => {
      cancel = true
      ac.abort()
    }
  }, [url, accessToken])

  if (loading) {
    const youtubeGuess = getYouTubeVideoIdFromPreviewUrl(url)
    if (youtubeGuess) return <LinkPreviewYoutubeSkeleton />
    return <LinkPreviewGenericSkeleton />
  }
  if (!data) return null

  const videoId = getYouTubeVideoIdFromPreviewUrl(data.url)
  const showYoutube = Boolean(videoId)
  const hasImage = Boolean(data.image) && !imgError && !showYoutube
  const hasDescription = Boolean(data.description?.trim())

  if (showYoutube && videoId) {
    return (
      <div className={cardClass}>
        <div className="min-w-0 w-full px-3 pb-2 pt-2.5">
          <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-md bg-muted/20">
            <iframe
              title={data.title || 'YouTube'}
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1&playsinline=1${youtubeEmbedQuerySuffix()}`}
              className="absolute top-0 left-0 h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy={youtubeIframeReferrerPolicy()}
            />
          </div>
        </div>
        <div className="px-3 pb-2.5">
          <p className="text-muted-foreground mb-1 break-all text-xs font-medium leading-none">
            {displaySiteName(data.url)}
          </p>
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:text-primary line-clamp-2 text-sm font-semibold leading-snug underline-offset-2 transition-colors hover:underline"
          >
            {data.title}
          </a>
          {hasDescription ? (
            <p className="text-muted-foreground mt-1.5 line-clamp-2 text-[0.8125rem] leading-relaxed">
              {data.description}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className={cardClass}>
      <div className="px-3 pt-2.5 pb-2">
        <p className="text-muted-foreground mb-1 break-all text-xs font-medium leading-none">
          {displaySiteName(data.url)}
        </p>
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground hover:text-primary line-clamp-2 text-sm font-semibold leading-snug underline-offset-2 transition-colors hover:underline"
        >
          {data.title}
        </a>
        {hasDescription ? (
          <p className="text-muted-foreground mt-1.5 line-clamp-2 text-[0.8125rem] leading-relaxed">
            {data.description}
          </p>
        ) : null}
      </div>

      {hasImage ? (
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="border-border/50 block min-w-0 w-full overflow-hidden border-t px-3 pb-3"
        >
          <div className="relative mt-2 min-h-64 w-full overflow-hidden rounded-md bg-muted/25">
            {!imgLoaded ? (
              <div className="absolute inset-0 animate-pulse bg-muted/45" aria-hidden />
            ) : null}
            <img
              src={data.image!}
              alt=""
              className={cn(
                'relative z-[1] max-h-64 w-full rounded-md object-cover object-center transition-opacity duration-200',
                imgLoaded ? 'opacity-100' : 'opacity-0',
              )}
              onLoad={() => setImgLoaded(true)}
              onError={() => {
                setImgError(true)
                setImgLoaded(false)
              }}
              loading="lazy"
            />
          </div>
        </a>
      ) : null}
    </div>
  )
})
