// ============================================================================
// KABADDI OBS DOCK — /:tenantSlug/kabaddi/scorer/obs-dock?matchId=xxx
// Broadcast stats panel for OBS: top raiders and top tacklers with player
// photos. Auto-rotates between boards. Transparent background.
//
// DATA: dedicated named Firebase app "kabaddi-obs" (same as the overlay).
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import { tenantPath } from '../services/tenantPath';
import { ResolvedImage } from '../components/ResolvedImage';
import { DEFAULT_KABADDI_OVERLAY_CONFIG } from '../types/kabaddi';
import type { KabaddiPlayer, KabaddiTeam, KabaddiOverlayConfig, KabaddiTopPerformer } from '../types/kabaddi';
import './KabaddiOBSDockPage.css';

const FB_CONFIG = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
};
const FB_APP = 'kabaddi-obs';
const fbApp = getApps().find(a => a.name === FB_APP) ?? initializeApp(FB_CONFIG, FB_APP);
const fbDb = getDatabase(fbApp);

type Board = { key: string; title: string; stat: (p: KabaddiTopPerformer) => number; suffix: string };

const BOARDS: Board[] = [
  { key: 'raid', title: 'Top Raiders', stat: p => p.raidPoints, suffix: 'Raid Pts' },
  { key: 'tackle', title: 'Top Defenders', stat: p => p.tacklePoints, suffix: 'Tackle Pts' },
];

export default function KabaddiOBSDockPage() {
  const [players, setPlayers] = useState<KabaddiPlayer[]>([]);
  const [teams, setTeams] = useState<KabaddiTeam[]>([]);
  const [config, setConfig] = useState<KabaddiOverlayConfig>(DEFAULT_KABADDI_OVERLAY_CONFIG);
  const [boardIdx, setBoardIdx] = useState(0);

  useEffect(() => {
    const base = tenantPath('kabaddi');
    const unsubs = [
      onValue(ref(fbDb, `${base}/players`), s => setPlayers(s.exists() ? Object.values(s.val() as Record<string, KabaddiPlayer>).filter(p => !!p?.id) : [])),
      onValue(ref(fbDb, `${base}/teams`), s => setTeams(s.exists() ? Object.values(s.val() as Record<string, KabaddiTeam>).filter(t => !!t?.id) : [])),
      onValue(ref(fbDb, `${base}/overlayConfig`), s => setConfig(s.exists() ? { ...DEFAULT_KABADDI_OVERLAY_CONFIG, ...s.val() } : DEFAULT_KABADDI_OVERLAY_CONFIG)),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
    const id = setInterval(() => setBoardIdx(i => (i + 1) % BOARDS.length), 12000);
    return () => clearInterval(id);
  }, []);

  const performers = useMemo<KabaddiTopPerformer[]>(() => {
    const teamMap = new Map(teams.map(t => [t.id, t]));
    return players.map(p => {
      const team = teamMap.get(p.teamId);
      const raid = p.raidPoints ?? 0;
      const tackle = p.tacklePoints ?? 0;
      return {
        playerId: p.id, playerName: p.name, photoUrl: p.photoUrl, teamId: p.teamId,
        teamName: team?.name ?? '', teamLogoUrl: team?.logoUrl,
        raidPoints: raid, tacklePoints: tackle, totalPoints: p.totalPoints ?? raid + tackle,
        appearances: p.appearances ?? 0, rating: p.rating,
      };
    });
  }, [players, teams]);

  const board = BOARDS[boardIdx];
  const ranked = useMemo(() => {
    return [...performers]
      .filter(p => board.stat(p) > 0)
      .sort((a, b) => board.stat(b) - board.stat(a))
      .slice(0, 5);
  }, [performers, board]);

  const theme = {
    '--kbd-primary': config.primaryColor,
    '--kbd-secondary': config.secondaryColor,
    '--kbd-accent': config.accentColor,
    '--kbd-text': config.textColor,
  } as React.CSSProperties;

  return (
    <div className="kbd" style={theme}>
      <div className="kbd__panel">
        <div className="kbd__header">
          {config.tournamentLogo && <ResolvedImage className="kbd__tourn" src={config.tournamentLogo} size={192} />}
          <div className="kbd__title-wrap">
            <AnimatePresence mode="wait">
              <motion.h1 key={board.key} className="kbd__title"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                {board.title}
              </motion.h1>
            </AnimatePresence>
            {config.tournamentName && <div className="kbd__subtitle">{config.tournamentName}</div>}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={board.key} className="kbd__list"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            {ranked.length === 0 && <div className="kbd__empty">No stats yet</div>}
            {ranked.map((p, i) => (
              <motion.div key={p.playerId} className={`kbd__row ${i === 0 ? 'kbd__row--lead' : ''}`}
                initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                <span className="kbd__rank">{i + 1}</span>
                <div className="kbd__photo">
                  <ResolvedImage src={p.photoUrl} alt={p.playerName} size={128} fallback={<span>{p.playerName.charAt(0)}</span>} />
                </div>
                <div className="kbd__info">
                  <div className="kbd__name">{p.playerName}</div>
                  <div className="kbd__team">
                    {p.teamLogoUrl && <ResolvedImage src={p.teamLogoUrl} size={48} />}
                    {p.teamName}
                  </div>
                </div>
                <div className="kbd__stat">
                  <span className="kbd__stat-num">{board.stat(p)}</span>
                  <span className="kbd__stat-label">{board.suffix}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
