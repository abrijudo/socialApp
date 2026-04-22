import { memo, useEffect, useState } from 'react'
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

/** Devuelve URL de embed si el enlace es un vídeo de YouTube, si no `null`. */
function getYouTubeEmbedUrl(pageUrl: string): string | null {
  try {
    const u = new URL(pageUrl)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname.startsWith('/watch')) {
        const v = u.searchParams.get('v')
        return v ? `https://www.youtube.com/embed/${v}` : null
      }
      if (u.pathname.startsWith('/shorts/')) {
        const parts = u.pathname.split('/').filter(Boolean)
        const id = parts[1]
        return id ? `https://www.youtube.com/embed/${id}` : null
      }
      if (u.pathname.startsWith('/embed/')) {
        return pageUrl.split('?')[0] ?? null
      }
    }
  } catch {
    return null
  }
  return null
}

export const LinkPreview = memo(function LinkPreview({ url }: { url: string }) {
  const accessToken = useAppStore((s) => s.accessToken)
  const [data, setData] = useState<LinkPreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setData(null)
    setImgError(false)
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
    return (
      <div
        className="bg-card/80 border-border/60 mt-2 h-16 max-w-lg w-full animate-pulse rounded-md border border-l-4 border-l-primary"
        aria-hidden
      />
    )
  }
  if (!data) return null

  const embedUrl = getYouTubeEmbedUrl(data.url)
  const showYoutube = Boolean(embedUrl)
  const hasImage = Boolean(data.image) && !imgError && !showYoutube
  const hasDescription = Boolean(data.description?.trim())

  return (
    <div
      className={cn(
        'border-border bg-card/90 text-foreground mt-2 w-full max-w-lg min-w-0 overflow-hidden rounded-md border',
        'border-l-4 border-l-primary shadow-sm',
        'ring-1 ring-border/40',
      )}
    >
      <div className="px-3 pt-2.5 pb-2">
        <p className="text-muted-foreground mb-1 break-all text-[0.7rem] font-medium leading-none">
          {displaySiteName(data.url)}
        </p>
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground hover:text-primary line-clamp-2 text-[0.9375rem] font-semibold leading-snug underline-offset-2 transition-colors hover:underline"
        >
          {data.title}
        </a>
        {hasDescription ? (
          <p className="text-muted-foreground mt-1.5 line-clamp-2 text-[0.8125rem] leading-relaxed">
            {data.description}
          </p>
        ) : null}
      </div>

      {showYoutube && embedUrl ? (
        <div className="border-border/50 border-t px-3 pb-3 pt-0">
          <div className="relative w-full overflow-hidden rounded-md bg-black/20">
            <iframe
              src={embedUrl}
              title={data.title || 'YouTube'}
              className="aspect-video w-full rounded-md border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      ) : hasImage ? (
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="border-border/50 bg-muted/20 border-t block max-h-48 w-full overflow-hidden"
        >
          <img
            src={data.image!}
            alt=""
            className="max-h-48 w-full object-cover object-center"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        </a>
      ) : null}
    </div>
  )
})
