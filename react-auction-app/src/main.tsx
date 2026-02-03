import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupDebugConsole } from './utils/logger'

// V1 - Original App (with Google Sheets integration)
import App from './App.tsx'
import { MobileBiddingPage } from './components/MobileBidding/MobileBidding.tsx'
import MobileBiddingLivePage from './pages/MobileBiddingLivePage.tsx'
import FirebaseDiagnostics from './pages/Diagnostics.tsx'
import AdminLogin from './components/AdminLogin/AdminLogin'
import AdminPage from './pages/AdminPage'
import CameraPage from './pages/CameraPage'
import LivePage from './pages/LivePage'
import './index.css'

setupDebugConsole();

const queryClient = new QueryClient();

// V2 features archived for future development in separate feature branches

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
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/mobile-bidding" element={<MobileBiddingPage />} />
            <Route path="/mobile-bidding-live" element={<MobileBiddingLivePage />} />
            <Route path="/diagnostics" element={<FirebaseDiagnostics />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/camera" element={<CameraPage />} />
            <Route path="/live" element={<LivePage />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
