import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// V1 - Original App
import App from './App.tsx'
import './index.css'

// V2 - New Major Version
import AppV2 from './AppV2.tsx'
import './styles/v2.css'

// Set to true to use V2
const USE_V2 = true;

const RootApp = USE_V2 ? AppV2 : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
