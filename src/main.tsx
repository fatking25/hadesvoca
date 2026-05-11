import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/design-tokens.css'
import './styles/cards.css'
import './styles/buttons.css'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './registerServiceWorker.ts'

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
