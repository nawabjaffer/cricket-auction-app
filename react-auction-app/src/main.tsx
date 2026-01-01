import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

// V1 - Original App (with Google Sheets integration)
import App from './App.tsx'
import './index.css'
import AppV2 from './AppV2.tsx';

// V2 - New Major Version (work in progress - no data loading yet)
// import AppV2 from './AppV2.tsx'
// import './styles/v2.css'

// Set to false to use V1 (stable), true for V2 (WIP)
const USE_V2 = false;

const RootApp = USE_V2 ? AppV2 : App; // V2 not ready yet, using V1

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null } as { error: Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Surface errors both in UI and console for faster debugging.
    console.error('App crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>App crashed</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>Open DevTools Console for details.</p>
          <pre style={{ marginTop: 16, padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.06)', overflowX: 'auto' }}>
            {String(this.state.error.stack || this.state.error.message)}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RootApp />
    </ErrorBoundary>
  </StrictMode>,
)
