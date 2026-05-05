import OBSOverlayPage from './OBSOverlayPage';
import ScoreOBSOverlayPage from './ScoreOBSOverlayPage';

export default function OBSOverlayRouterPage() {
  const params = new URLSearchParams(window.location.search);
  const hasMatchId = Boolean(params.get('matchId'));
  const mode = params.get('mode');
  const scoringMode = hasMatchId || mode === 'scoring';

  return scoringMode ? <ScoreOBSOverlayPage /> : <OBSOverlayPage />;
}
