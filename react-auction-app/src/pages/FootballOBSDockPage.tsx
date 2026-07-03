// ============================================================================
// FOOTBALL OBS DOCK — /:tenantSlug/football/scorer/obs-dock?matchId=xxx
// Broadcast stats panel for OBS: top scorers with player photos, top assists,
// and disciplinary leaders. Auto-rotates between stat boards. Transparent bg.
//
// DATA: dedicated named Firebase app "football-obs".
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import { tenantPath } from '../services/tenantPath';
import { DEFAULT_FOOTBALL_OVERLAY_CONFIG } from '../types/football';
import type {
  FootballPlayer, FootballTeam, FootballOverlayConfig, FootballTopScorer,
} from '../types/football';
import './FootballOBSDockPage.css';

const FB_CONFIG = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
};
const FB_APP = 'football-obs';
const fbApp = getApps().find((a) => a.name === FB_APP) ?? initializeApp(FB_CONFIG, FB_APP);
const fbDb = getDatabase(fbApp);

type Board = { key: string; title: string; stat: (p: FootballTopScorer) => number; suffix: string };

const BOARDS: Board[] = [
  { key: 'goals', title: 'Top Scorers', stat: (p) => p.goals, suffix: 'Goals' },
  { key: 'assists', title: 'Top Assists', stat: (p) => p.assists, suffix: 'Assists' },
];

export default function FootballOBSDockPage() {
  const [players, setPlayers] = useState<FootballPlayer[]>([]);
  const [teams, setTeams] = useState<FootballTeam[]>([]);
  const [config, setConfig] = useState<FootballOverlayConfig>(DEFAULT_FOOTBALL_OVERLAY_CONFIG);
  const [boardIdx, setBoardIdx] = useState(0);

  useEffect(() => {
    const base = tenantPath('football');
    const unsubs = [
      onValue(ref(fbDb, `${base}/players`), (s) => setPlayers(s.exists() ? Object.values(s.val() as Record<string, FootballPlayer>).filter((p) => !!p?.id) : [])),
      onValue(ref(fbDb, `${base}/teams`), (s) => setTeams(s.exists() ? Object.values(s.val() as Record<string, FootballTeam>).filter((t) => !!t?.id) : [])),
      onValue(ref(fbDb, `${base}/overlayConfig`), (s) => setConfig(s.exists() ? { ...DEFAULT_FOOTBALL_OVERLAY_CONFIG, ...s.val() } : DEFAULT_FOOTBALL_OVERLAY_CONFIG)),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // Rotate boards every 12s
  useEffect(() => {
    const id = setInterval(() => setBoardIdx((i) => (i + 1) % BOARDS.length), 12000);
    return () => clearInterval(id);
  }, []);

  const scorers = useMemo<FootballTopScorer[]>(() => {
    const teamMap = new Map(teams.map((t) => [t.id, t]));
    return players.map((p) => {
      const team = teamMap.get(p.teamId);
      return {
        playerId: p.id, playerName: p.name, photoUrl: p.photoUrl, teamId: p.teamId,
        teamName: team?.name ?? '', teamLogoUrl: team?.logoUrl,
        goals: p.goals ?? 0, assists: p.assists ?? 0, appearances: p.appearances ?? 0, rating: p.rating,
      };
    });
  }, [players, teams]);

  const board = BOARDS[boardIdx];
  const ranked = useMemo(() => {
    return [...scorers]
      .filter((s) => board.stat(s) > 0)
      .sort((a, b) => board.stat(b) - board.stat(a))
      .slice(0, 5);
  }, [scorers, board]);

  const theme = {
    '--fb-primary': config.primaryColor,
    '--fb-secondary': config.secondaryColor,
    '--fb-accent': config.accentColor,
    '--fb-text': config.textColor,
  } as React.CSSProperties;

  return (
    <div className="fbd" style={theme}>
      <div className="fbd__panel">
        <div className="fbd__header">
          {config.tournamentLogo && <img className="fbd__tourn" src={config.tournamentLogo} alt="" crossOrigin="anonymous" />}
          <div className="fbd__title-wrap">
            <AnimatePresence mode="wait">
              <motion.h1 key={board.key} className="fbd__title"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                {board.title}
              </motion.h1>
            </AnimatePresence>
            {config.tournamentName && <div className="fbd__subtitle">{config.tournamentName}</div>}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={board.key} className="fbd__list"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            {ranked.length === 0 && <div className="fbd__empty">No stats yet</div>}
            {ranked.map((s, i) => (
              <motion.div key={s.playerId} className={`fbd__row ${i === 0 ? 'fbd__row--lead' : ''}`}
                initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                <span className="fbd__rank">{i + 1}</span>
                <div className="fbd__photo">
                  {s.photoUrl ? <img src={s.photoUrl} alt={s.playerName} crossOrigin="anonymous" /> : <span>{s.playerName.charAt(0)}</span>}
                </div>
                <div className="fbd__info">
                  <div className="fbd__name">{s.playerName}</div>
                  <div className="fbd__team">
                    {s.teamLogoUrl && <img src={s.teamLogoUrl} alt="" crossOrigin="anonymous" />}
                    {s.teamName}
                  </div>
                </div>
                <div className="fbd__stat">
                  <span className="fbd__stat-num">{board.stat(s)}</span>
                  <span className="fbd__stat-label">{board.suffix}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>

        <div className="fbd__dots">
          {BOARDS.map((b, i) => <span key={b.key} className={`fbd__dot ${i === boardIdx ? 'fbd__dot--active' : ''}`} />)}
        </div>
      </div>
    </div>
  );
}
