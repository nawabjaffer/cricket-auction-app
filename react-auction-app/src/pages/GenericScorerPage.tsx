import { useParams } from 'react-router-dom';
import type { SportKey } from '../services/tenantService';
import ScoringAdminPage from './ScoringAdminPage';
import ScoreUpdatePage from './ScoreUpdatePage';
import ScoreOBSOverlayPage from './ScoreOBSOverlayPage';
import FootballAdminPage from './FootballAdminPage';
import FootballUpdatePage from './FootballUpdatePage';
import FootballOBSOverlayPage from './FootballOBSOverlayPage';
import KabaddiAdminPage from './KabaddiAdminPage';
import KabaddiUpdatePage from './KabaddiUpdatePage';
import KabaddiOBSOverlayPage from './KabaddiOBSOverlayPage';

type ScorerMode = 'admin' | 'update' | 'obs-overlay';

const SUPPORTED_SPORTS: SportKey[] = ['cricket', 'football', 'kabaddi'];

export default function GenericScorerPage({ mode }: Readonly<{ mode: ScorerMode }>) {
  const { gameType } = useParams<{ gameType: string }>();
  const sport = gameType as SportKey;

  if (sport === 'cricket') {
    if (mode === 'admin') return <ScoringAdminPage />;
    if (mode === 'update') return <ScoreUpdatePage />;
    return <ScoreOBSOverlayPage />;
  }
  if (sport === 'football') {
    if (mode === 'admin') return <FootballAdminPage />;
    if (mode === 'update') return <FootballUpdatePage />;
    return <FootballOBSOverlayPage />;
  }
  if (sport === 'kabaddi') {
    if (mode === 'admin') return <KabaddiAdminPage />;
    if (mode === 'update') return <KabaddiUpdatePage />;
    return <KabaddiOBSOverlayPage />;
  }

  const sportLabel = sport ? sport[0].toUpperCase() + sport.slice(1) : 'Sport';
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#07111f', color: '#e5eefc', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: 520, padding: 32, border: '1px solid rgba(148, 163, 184, .28)', borderRadius: 18, background: 'rgba(15, 23, 42, .86)' }}>
        <p style={{ margin: 0, color: '#67e8f9', fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase' }}>Scorer module</p>
        <h1 style={{ margin: '10px 0 8px', fontSize: 30 }}>{sportLabel}</h1>
        <p style={{ margin: 0, color: '#a7b5c9', lineHeight: 1.6 }}>
          This sport is enabled for the tournament, but its live scorer service is not configured yet.
        </p>
      </section>
    </main>
  );
}

export { SUPPORTED_SPORTS };