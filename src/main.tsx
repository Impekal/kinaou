import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { UiLanguageProvider } from './components/UiLanguageProvider'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <UiLanguageProvider><App /></UiLanguageProvider>
    </AppErrorBoundary>
  </React.StrictMode>
)
