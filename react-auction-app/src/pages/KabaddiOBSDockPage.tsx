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
import { getDatabase, ref, onValue, set } from 'firebase/database';
import { tenantPath } from '../services/tenantPath';
import { ResolvedImage } from '../components/ResolvedImage';
import { DEFAULT_KABADDI_OVERLAY_CONFIG, DEFAULT_KABADDI_RULES } from '../types/kabaddi';
import { kabaddiService } from '../services/kabaddi';
import type {
  KabaddiPlayer, KabaddiTeam, KabaddiOverlayConfig, KabaddiTopPerformer,
  KabaddiMatchSetup, KabaddiLiveState, KabaddiOverlayType,
  KabaddiMatchEvent, KabaddiRulesConfig,
} from '../types/kabaddi';
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
  const [urlMatchId, setUrlMatchId] = useState<string | null>(null);
  const [urlPinned, setUrlPinned] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [liveFallbackMatchId, setLiveFallbackMatchId] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);

  const [match, setMatch] = useState<KabaddiMatchSetup | null>(null);
  const [live, setLive] = useState<KabaddiLiveState | null>(null);
  const [players, setPlayers] = useState<KabaddiPlayer[]>([]);
  const [teams, setTeams] = useState<KabaddiTeam[]>([]);
  const [config, setConfig] = useState<KabaddiOverlayConfig>(DEFAULT_KABADDI_OVERLAY_CONFIG);
  const [rules, setRules] = useState<KabaddiRulesConfig>(DEFAULT_KABADDI_RULES);
  const [boardIdx, setBoardIdx] = useState(0);
  const [awardPlayerId, setAwardPlayerId] = useState('');
  const [awardPoints, setAwardPoints] = useState('1');

  // Parse URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('matchId');
    const pinned = params.get('pin') === '1';
    setUrlPinned(pinned);
    if (id) setUrlMatchId(id);
  }, []);

  // Shared tenant subscriptions: players, teams, overlayConfig, activeMatchId, and all matches
  useEffect(() => {
    const base = tenantPath('kabaddi');
    kabaddiService.initialize(fbDb, base);
    const unsubs = [
      onValue(ref(fbDb, `${base}/players`), s => setPlayers(s.exists() ? Object.values(s.val() as Record<string, KabaddiPlayer>).filter(p => !!p?.id) : [])),
      onValue(ref(fbDb, `${base}/teams`), s => setTeams(s.exists() ? Object.values(s.val() as Record<string, KabaddiTeam>).filter(t => !!t?.id) : [])),
      onValue(ref(fbDb, `${base}/overlayConfig`), s => setConfig(s.exists() ? { ...DEFAULT_KABADDI_OVERLAY_CONFIG, ...s.val() } : DEFAULT_KABADDI_OVERLAY_CONFIG)),
      onValue(ref(fbDb, `${base}/rules`), s => setRules(s.exists() ? { ...DEFAULT_KABADDI_RULES, ...s.val() } : DEFAULT_KABADDI_RULES)),
      onValue(ref(fbDb, `${base}/activeMatch/matchId`), s => setActiveMatchId(s.exists() ? (s.val() as string) : null)),
      onValue(ref(fbDb, `${base}/matches`), s => {
        if (!s.exists()) { setLiveFallbackMatchId(null); return; }
        const val = s.val() as Record<string, { setup?: KabaddiMatchSetup }>;
        const setups = Object.values(val).map(m => m.setup).filter((m): m is KabaddiMatchSetup => !!m);
        const liveMatch = setups.find(m => m.status === 'live');
        if (liveMatch) {
          setLiveFallbackMatchId(liveMatch.id);
        } else if (setups.length > 0) {
          const sorted = [...setups].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setLiveFallbackMatchId(sorted[0].id);
        } else {
          setLiveFallbackMatchId(null);
        }
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  // Resolve effective match:
  // When singleOverlayMode is enabled or no matchId is in URL, follow active match
  useEffect(() => {
    if (config.singleOverlayMode || !urlMatchId) {
      setMatchId(urlPinned ? (urlMatchId || activeMatchId || liveFallbackMatchId || null) : (activeMatchId || liveFallbackMatchId || urlMatchId || null));
      return;
    }
    setMatchId(urlMatchId || null);
  }, [urlMatchId, urlPinned, activeMatchId, liveFallbackMatchId, config.singleOverlayMode]);

  // Match-specific subscriptions
  useEffect(() => {
    if (!matchId) {
      setMatch(null);
      setLive(null);
      return;
    }
    const base = tenantPath('kabaddi');
    const unsubs = [
      onValue(ref(fbDb, `${base}/matches/${matchId}/setup`), s => {
        if (s.exists()) setMatch(s.val() as KabaddiMatchSetup);
      }),
      onValue(ref(fbDb, `${base}/matches/${matchId}/live`), s => {
        if (s.exists()) setLive(s.val() as KabaddiLiveState);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [matchId]);

  const triggerOverlay = async (type: KabaddiOverlayType, activeEvent?: KabaddiMatchEvent) => {
    if (!matchId) return;
    const base = tenantPath('kabaddi');
    await set(ref(fbDb, `${base}/matches/${matchId}/overlay`), {
      activeOverlay: type,
      ...(activeEvent ? { activeEvent } : {}),
      lastUpdated: Date.now(),
    });
  };

  const callDockBreak = async (teamId: string) => {
    if (!matchId || !live || !match) return;
    try {
      const result = kabaddiService.recordTeamBreak(live, teamId, rules.teamBreaksPerSide);
      await kabaddiService.saveLive(result.live);
      const teamName = teamId === match.teamA.id ? match.teamA.name : match.teamB.name;
      await triggerOverlay('team_break', { ...result.event, teamName });
    } catch (error) {
      console.warn('[Kabaddi OBS Dock] Could not call team break:', error);
    }
  };

  const awardDockPlayer = async () => {
    if (!matchId || !live || !match) return;
    const player = players.find(candidate => candidate.id === awardPlayerId);
    if (!player) return;
    try {
      const result = kabaddiService.awardPlayerPoints(live, player.teamId, player.id, player.name, Number(awardPoints));
      await kabaddiService.saveLive(result.live);
      await kabaddiService.incrementPlayerStat(player.id, 'raidPoints', result.event.points);
      const teamName = player.teamId === match.teamA.id ? match.teamA.name : match.teamB.name;
      await triggerOverlay('player_award', { ...result.event, teamName });
      setAwardPlayerId('');
    } catch (error) {
      console.warn('[Kabaddi OBS Dock] Could not award player points:', error);
    }
  };

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

        {match && live && (
          <div className="kbd__live-bar">
            <div className="kbd__live-teams">
              {match.teamA.shortName || match.teamA.name.slice(0, 3).toUpperCase()} <span className="kbd__live-score">{live.teamA.score}</span> : <span className="kbd__live-score">{live.teamB.score}</span> {match.teamB.shortName || match.teamB.name.slice(0, 3).toUpperCase()}
            </div>
            <span className="kbd__live-badge">
              {live.half === 'full_time' ? 'FT' : (live.half === 'not_started' ? 'TOSS' : 'LIVE')}
              {config.singleOverlayMode && ' · SINGLE OVERLAY'}
            </span>
          </div>
        )}

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

        {matchId && (
          <div className="kbd__broadcast-tools">
            <div className="kbd__award-controls">
              <select value={awardPlayerId} onChange={event => setAwardPlayerId(event.target.value)} aria-label="Select player for point award">
                <option value="">Select player</option>
                {players.map(player => {
                  const teamName = teams.find(team => team.id === player.teamId)?.name || '';
                  return <option key={player.id} value={player.id}>{player.name} · {teamName}</option>;
                })}
              </select>
              <input type="number" min={1} max={99} value={awardPoints} onChange={event => setAwardPoints(event.target.value)} aria-label="Points to award" />
              <button type="button" disabled={!awardPlayerId || Number(awardPoints) < 1} onClick={() => void awardDockPlayer()}>Award + announce</button>
            </div>
            {match && live && <div className="kbd__break-controls">
              {[match.teamA, match.teamB].map((team, index) => {
                const used = (index === 0 ? live.teamA : live.teamB).teamBreaksUsed ?? 0;
                return <button key={team.id} type="button" disabled={used >= rules.teamBreaksPerSide} onClick={() => void callDockBreak(team.id)}>
                  {team.shortName} break {used}/{rules.teamBreaksPerSide}
                </button>;
              })}
            </div>}
          </div>
        )}

        {matchId && (
          <div className="kbd__controls">
            <button className="kbd__ctrl-btn kbd__ctrl-btn--raid" onClick={() => triggerOverlay('super_raid')} title="Trigger Super Raid celebration">
              ⚡ Super Raid
            </button>
            <button className="kbd__ctrl-btn kbd__ctrl-btn--tackle" onClick={() => triggerOverlay('super_tackle')} title="Trigger Super Tackle celebration">
              🛡️ Super Tackle
            </button>
            <button className="kbd__ctrl-btn kbd__ctrl-btn--allout" onClick={() => triggerOverlay('all_out')} title="Trigger All Out celebration">
              💥 All Out
            </button>
            <button className="kbd__ctrl-btn kbd__ctrl-btn--bonus" onClick={() => triggerOverlay('bonus_point')} title="Trigger Bonus celebration">
              ⭐ Bonus
            </button>
            <button className="kbd__ctrl-btn kbd__ctrl-btn--dod" onClick={() => triggerOverlay('do_or_die')} title="Trigger Do or Die banner">
              ⚠️ Do or Die
            </button>
            <button className="kbd__ctrl-btn kbd__ctrl-btn--squad" onClick={() => triggerOverlay('lineup')} title="Show custom Team Squad overlay">
              📋 Squad
            </button>
            <button className="kbd__ctrl-btn kbd__ctrl-btn--stats" onClick={() => triggerOverlay('match_stats')} title="Show custom Match Stats overlay">
              📊 Match Stats
            </button>
            <button className="kbd__ctrl-btn kbd__ctrl-btn--clear" onClick={() => triggerOverlay('none')} title="Clear overlay celebration">
              ✕ Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
