import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyUiThemeToDocument, getStoredUiTheme } from './lib/uiTheme'
import { useAppStore } from './store/useAppStore'
import App from './App.tsx'

const bootTheme = getStoredUiTheme()
applyUiThemeToDocument(bootTheme)
useAppStore.setState({ uiTheme: bootTheme })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
