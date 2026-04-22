/** Clave de persist en localStorage; debe coincidir con `persist.name` de useAppStore. */
export const UI_THEME_STORAGE_KEY = 'sc-app-persist' as const

export type UiTheme = 'dark' | 'blue' | 'purple'

const THEMES: readonly UiTheme[] = ['dark', 'blue', 'purple'] as const

export function isUiTheme(value: unknown): value is UiTheme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

/** Lectura sincrónica (mismo formato que el script de index.html) para el boot en main. */
export function getStoredUiTheme(): UiTheme {
  if (typeof localStorage === 'undefined') return 'dark'
  try {
    const raw = localStorage.getItem(UI_THEME_STORAGE_KEY)
    if (!raw) return 'dark'
    const p = JSON.parse(raw) as { state?: { uiTheme?: unknown } }
    const t = p.state?.uiTheme
    return isUiTheme(t) ? t : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyUiThemeToDocument(theme: UiTheme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.add('dark')
  root.setAttribute('data-theme', theme)
}
