import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppStateProvider } from './hooks/useAppState'
import { ToastProvider } from './components/ui/Toast'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </ToastProvider>
  </React.StrictMode>,
)
