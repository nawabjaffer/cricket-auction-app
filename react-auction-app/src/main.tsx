import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import OBSOverlayRouterPage from './pages/OBSOverlayRouterPage'
import OBSDockPage from './pages/OBSDockPage'
import MirrorPage from './pages/MirrorPage'
import ConnectBiddingAdminPage from './pages/ConnectBiddingAdminPage'
import PlatformAdminPage from './pages/PlatformAdminPage'
import ScoringAdminPage from './pages/ScoringAdminPage'
import ScoreUpdatePage from './pages/ScoreUpdatePage'
import ScoreOBSOverlayPage from './pages/ScoreOBSOverlayPage'
import ScoreCameraPage from './pages/ScoreCameraPage'
import ScoreCameraAdminPage from './pages/ScoreCameraAdminPage'
import ScoreCameraHostPage from './pages/ScoreCameraHostPage'
import ScoreOBSControlDock from './pages/ScoreOBSControlDock'
import LiveQuestionPage from './pages/LiveQuestionPage'
import FootballAdminPage from './pages/FootballAdminPage'
import FootballUpdatePage from './pages/FootballUpdatePage'
import FootballOBSOverlayPage from './pages/FootballOBSOverlayPage'
import FootballOBSDockPage from './pages/FootballOBSDockPage'
import KabaddiAdminPage from './pages/KabaddiAdminPage'
import KabaddiUpdatePage from './pages/KabaddiUpdatePage'
import KabaddiOBSOverlayPage from './pages/KabaddiOBSOverlayPage'
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
            <Route path="/connect-bidding" element={<MobileBiddingLivePage />} />
            <Route path="/diagnostics" element={<FirebaseDiagnostics />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/camera" element={<CameraPage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/live-admin" element={<LiveAdminPage />} />
            <Route path="/obs-overlay" element={<OBSOverlayRouterPage />} />
            <Route path="/obs-dock" element={<OBSDockPage />} />
            <Route path="/mirror" element={<MirrorPage />} />
            <Route path="/connect-bidding-admin" element={<ConnectBiddingAdminPage />} />
            <Route path="/cricket/scorer/admin" element={<ScoringAdminPage />} />
            <Route path="/cricket/scorer/update" element={<ScoreUpdatePage />} />
            <Route path="/cricket/scorer/obs-overlay" element={<ScoreOBSOverlayPage />} />
            <Route path="/cricket/scorer/camera" element={<ScoreCameraPage />} />
            <Route path="/cricket/scorer/camera/admin" element={<ScoreCameraAdminPage />} />
            <Route path="/cricket/scorer/camera/host" element={<ScoreCameraHostPage />} />
            <Route path="/cricket/scorer/obs-dock" element={<ScoreOBSControlDock />} />
            <Route path="/cricket/scorer/live-question" element={<LiveQuestionPage />} />
            {/* Football scorer (legacy top-level — default tenant) */}
            <Route path="/football/scorer/admin" element={<FootballAdminPage />} />
            <Route path="/football/scorer/update" element={<FootballUpdatePage />} />
            <Route path="/football/scorer/obs-overlay" element={<FootballOBSOverlayPage />} />
            <Route path="/football/scorer/obs-dock" element={<FootballOBSDockPage />} />
            {/* Kabaddi scorer (legacy top-level — default tenant) */}
            <Route path="/kabaddi/scorer/admin" element={<KabaddiAdminPage />} />
            <Route path="/kabaddi/scorer/update" element={<KabaddiUpdatePage />} />
            <Route path="/kabaddi/scorer/obs-overlay" element={<KabaddiOBSOverlayPage />} />
            {/* Legacy scorer routes (redirects) */}
            <Route path="/scoring/admin" element={<ScoringAdminPage />} />
            <Route path="/match/score/update" element={<ScoreUpdatePage />} />
            <Route path="/score/obs-overlay" element={<ScoreOBSOverlayPage />} />
            <Route path="/score/obs-dock" element={<ScoreOBSControlDock />} />
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
            <Route path="/:tenantSlug/obs-overlay" element={<TenantGate><OBSOverlayRouterPage /></TenantGate>} />
            <Route path="/:tenantSlug/obs-dock" element={<TenantGate><OBSDockPage /></TenantGate>} />
            <Route path="/:tenantSlug/mirror" element={<TenantGate><MirrorPage /></TenantGate>} />
            <Route path="/:tenantSlug/connect-bidding-admin" element={<TenantGate><ConnectBiddingAdminPage /></TenantGate>} />
            <Route path="/:tenantSlug/cricket/scorer/admin" element={<TenantGate><ScoringAdminPage /></TenantGate>} />
            <Route path="/:tenantSlug/cricket/scorer/update" element={<TenantGate><ScoreUpdatePage /></TenantGate>} />
            <Route path="/:tenantSlug/cricket/scorer/obs-overlay" element={<TenantGate><ScoreOBSOverlayPage /></TenantGate>} />
            <Route path="/:tenantSlug/cricket/scorer/camera" element={<TenantGate><ScoreCameraPage /></TenantGate>} />
            <Route path="/:tenantSlug/cricket/scorer/camera/admin" element={<TenantGate><ScoreCameraAdminPage /></TenantGate>} />
            <Route path="/:tenantSlug/cricket/scorer/camera/host" element={<TenantGate><ScoreCameraHostPage /></TenantGate>} />
            <Route path="/:tenantSlug/cricket/scorer/obs-dock" element={<TenantGate><ScoreOBSControlDock /></TenantGate>} />
            <Route path="/:tenantSlug/cricket/scorer/live-question" element={<TenantGate><LiveQuestionPage /></TenantGate>} />
            {/* Football scorer (tenant-scoped) */}
            <Route path="/:tenantSlug/football/scorer/admin" element={<TenantGate><FootballAdminPage /></TenantGate>} />
            <Route path="/:tenantSlug/football/scorer/update" element={<TenantGate><FootballUpdatePage /></TenantGate>} />
            <Route path="/:tenantSlug/football/scorer/obs-overlay" element={<TenantGate><FootballOBSOverlayPage /></TenantGate>} />
            <Route path="/:tenantSlug/football/scorer/obs-dock" element={<TenantGate><FootballOBSDockPage /></TenantGate>} />
            {/* Kabaddi scorer (tenant-scoped) */}
            <Route path="/:tenantSlug/kabaddi/scorer/admin" element={<TenantGate><KabaddiAdminPage /></TenantGate>} />
            <Route path="/:tenantSlug/kabaddi/scorer/update" element={<TenantGate><KabaddiUpdatePage /></TenantGate>} />
            <Route path="/:tenantSlug/kabaddi/scorer/obs-overlay" element={<TenantGate><KabaddiOBSOverlayPage /></TenantGate>} />
            {/* Legacy scorer routes */}
            <Route path="/:tenantSlug/scoring/admin" element={<TenantGate><ScoringAdminPage /></TenantGate>} />
            <Route path="/:tenantSlug/match/score/update" element={<TenantGate><ScoreUpdatePage /></TenantGate>} />
            <Route path="/:tenantSlug/score/obs-overlay" element={<TenantGate><ScoreOBSOverlayPage /></TenantGate>} />
            <Route path="/:tenantSlug/score/obs-dock" element={<TenantGate><ScoreOBSControlDock /></TenantGate>} />
            {/* Unknown route → main admin login */}
            <Route path="*" element={<Navigate to="/admin/login" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
