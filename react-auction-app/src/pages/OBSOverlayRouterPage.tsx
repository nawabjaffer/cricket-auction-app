import OBSOverlayPage from './OBSOverlayPage';
import TenantScoringRouterPage from './TenantScoringRouterPage';

export default function OBSOverlayRouterPage() {
  const params = new URLSearchParams(window.location.search);
  const hasMatchId = Boolean(params.get('matchId'));
  const mode = params.get('mode');
  const scoringMode = hasMatchId || mode === 'scoring';

  return scoringMode ? <TenantScoringRouterPage route="overlay" /> : <OBSOverlayPage />;
}
