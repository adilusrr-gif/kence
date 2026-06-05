import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './shared/lib/i18n/i18n.js'
import App from './App'
import './app/styles/tokens.css'
import './app/styles/themes.css'
import './app/styles/base.css'
import './app/styles/legacy-bridge.css'
import './app/styles/motion.css'
import './app/styles/shell.css'
import './app/styles/utilities.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
