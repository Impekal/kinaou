import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { AppErrorBoundary, LocalizedAppErrorBoundary } from './components/AppErrorBoundary'
import { UiLanguageProvider } from './components/UiLanguageProvider'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <UiLanguageProvider><LocalizedAppErrorBoundary><App /></LocalizedAppErrorBoundary></UiLanguageProvider>
    </AppErrorBoundary>
  </React.StrictMode>
)
