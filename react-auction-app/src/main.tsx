import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupDebugConsole } from './utils/logger'

// V1 - Original App (with Google Sheets integration)
import App from './App.tsx'
import MobileBiddingLivePage from './pages/MobileBiddingLivePage.tsx'
import FirebaseDiagnostics from './pages/Diagnostics.tsx'
import AdminLogin from './components/AdminLogin/AdminLogin'
import AdminPage from './pages/AdminPage'
import CameraPage from './pages/CameraPage'
import LivePage from './pages/LivePage'
import LiveAdminPage from './pages/LiveAdminPage'
import OBSOverlayPage from './pages/OBSOverlayPage'
import OBSDockPage from './pages/OBSDockPage'
import PlatformAdminPage from './pages/PlatformAdminPage'
import { TenantGate } from './components/TenantGate/TenantGate'
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
            {/* Legacy top-level routes — all fall back to the default tenant (epl_2026) */}
            <Route path="/" element={<App />} />
            <Route path="/connect-bididng" element={<MobileBiddingLivePage />} />
            <Route path="/diagnostics" element={<FirebaseDiagnostics />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/camera" element={<CameraPage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/live-admin" element={<LiveAdminPage />} />
            <Route path="/obs-overlay" element={<OBSOverlayPage />} />
            <Route path="/obs-dock" element={<OBSDockPage />} />
            <Route path="/mirror" element={<OBSOverlayPage browserMode />} />

            {/* Super-admin portal — manage tournaments (tenants) */}
            <Route path="/platform-admin" element={<PlatformAdminPage />} />

            {/* Tenant-scoped routes — /:tenantSlug/... */}
            <Route path="/:tenantSlug" element={<TenantGate><App /></TenantGate>} />
            <Route path="/:tenantSlug/connect-bididng" element={<TenantGate><MobileBiddingLivePage /></TenantGate>} />
            <Route path="/:tenantSlug/connect-bidding" element={<TenantGate><MobileBiddingLivePage /></TenantGate>} />
            <Route path="/:tenantSlug/diagnostics" element={<TenantGate><FirebaseDiagnostics /></TenantGate>} />
            <Route path="/:tenantSlug/admin/login" element={<TenantGate><AdminLogin /></TenantGate>} />
            <Route path="/:tenantSlug/admin" element={<TenantGate><AdminPage /></TenantGate>} />
            <Route path="/:tenantSlug/camera" element={<TenantGate><CameraPage /></TenantGate>} />
            <Route path="/:tenantSlug/live" element={<TenantGate><LivePage /></TenantGate>} />
            <Route path="/:tenantSlug/live-admin" element={<TenantGate><LiveAdminPage /></TenantGate>} />
            <Route path="/:tenantSlug/obs-overlay" element={<TenantGate><OBSOverlayPage /></TenantGate>} />
            <Route path="/:tenantSlug/obs-dock" element={<TenantGate><OBSDockPage /></TenantGate>} />
            <Route path="/:tenantSlug/mirror" element={<TenantGate><OBSOverlayPage browserMode /></TenantGate>} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
