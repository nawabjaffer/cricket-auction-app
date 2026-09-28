import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { IoClose, IoPencil, IoPlay, IoStop } from 'react-icons/io5';
import type { ImpactPlayer, MatchLineup, MatchSetup, PreMatchPhase, PreMatchState, ScoringOverlayConfig } from '../types/scoring';
import type { MatchSquadOverlayDesign } from '../types/matchSquadOverlay';
import { DEFAULT_MATCH_SQUAD_OVERLAY_DESIGN } from '../types/matchSquadOverlay';
import { buildPreMatchSequence } from '../utils/preMatchSequence';
import PreMatchOverlay from '../pages/PreMatchOverlay';
import './PreMatchPreviewModal.css';

const PREVIEW_CONFIG: ScoringOverlayConfig = {
  showLiveBadge: false,
  enableBoundaryAnimation: false,
  enableWicketAnimation: false,
  enableDuckOutAnimation: false,
  enableHatTrickAnimation: false,
  enableSixerAnimation: false,
  enableKeyboardShortcuts: false,
  autoOverlayEnabled: false,
  autoOverlayIntervalSeconds: 0,
  liveQuestions: [],
  tournamentName: 'Sample Tournament',
  tossConfig: { chromaKeyEnabled: false, chromaKeyColor: '#00ff00', tossDurationSeconds: 5 },
};

const PREMATCH_PREVIEW_PHASES: PreMatchPhase[] = [
  'squad_display', 'toss_animation', 'toss_result', 'squad_reveal_teamA',
  'squad_reveal_teamB', 'impact_players', 'match_ready',
];
const PREVIEW_IMPACT_PLAYERS_A: ImpactPlayer[] = [
  { playerId: 'preview-impact-a-1', playerName: 'Neel Verma', role: 'All-rounder' },
  { playerId: 'preview-impact-a-2', playerName: 'Aadi Kapoor', role: 'Bowler' },
];
const PREVIEW_IMPACT_PLAYERS_B: ImpactPlayer[] = [
  { playerId: 'preview-impact-b-1', playerName: 'Rehan Ali', role: 'Batter' },
  { playerId: 'preview-impact-b-2', playerName: 'Aman Gill', role: 'Wicket-keeper' },
];

export default function PreMatchPreviewModal({ match: savedMatch, lineups, state, config = PREVIEW_CONFIG, squadDesign = DEFAULT_MATCH_SQUAD_OVERLAY_DESIGN, autoReveal = true, delayAfterToss = squadDesign.delayAfterTossMs / 1000, playerRevealInterval = squadDesign.playerRevealIntervalMs, impactPlayersA = PREVIEW_IMPACT_PLAYERS_A, impactPlayersB = PREVIEW_IMPACT_PLAYERS_B, inline = false, showEditButton = true, onClose, onEdit }: {
  match: MatchSetup | null;
  lineups: { teamA: MatchLineup | null; teamB: MatchLineup | null };
  state: PreMatchState | null;
  config?: ScoringOverlayConfig;
  squadDesign?: MatchSquadOverlayDesign;
  autoReveal?: boolean;
  delayAfterToss?: number;
  playerRevealInterval?: number;
  impactPlayersA?: ImpactPlayer[];
  impactPlayersB?: ImpactPlayer[];
  inline?: boolean;
  showEditButton?: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [phase, setPhase] = useState<PreMatchPhase>('squad_display');
  const [playing, setPlaying] = useState(false);
  const match: MatchSetup = savedMatch || {
    id: 'preview-match',
    teamA: { id: 'preview-team-a', name: 'Harbor Strikers', primaryColor: '#0ea5e9' },
    teamB: { id: 'preview-team-b', name: 'Valley Royals', primaryColor: '#f97316' },
    venue: 'Sample Ground', date: '2026-09-28T19:00:00.000Z', maxOvers: 20,
    status: 'scheduled', createdAt: 0, updatedAt: 0,
  };
  const mockLineup = (teamId: string, teamName: string): MatchLineup => ({
    matchId: match.id,
    teamId,
    players: Array.from({ length: 11 }, (_, index) => ({
      playerId: `preview-${teamId}-${index + 1}`,
      playerName: `${['Aarav', 'Ishan', 'Dev', 'Rohan', 'Kunal', 'Vikram', 'Arjun', 'Kabir', 'Nikhil', 'Sameer', 'Yash'][index]} ${teamName === 'Harbor Strikers' ? 'Sharma' : 'Patel'}`,
      role: ['Batter', 'All-rounder', 'Bowler', 'Wicket-keeper'][index % 4],
      battingOrder: index + 1,
      isCaptain: index === 0,
      isWicketKeeper: index === 3,
    })),
  });
  const previewLineups = {
    teamA: lineups.teamA?.players.length ? lineups.teamA : mockLineup(match.teamA.id, match.teamA.name),
    teamB: lineups.teamB?.players.length ? lineups.teamB : mockLineup(match.teamB.id, match.teamB.name),
  };
  const previewState: PreMatchState = {
    matchId: match.id,
    phase,
    tossResult: state?.tossResult || { wonBy: match.teamA.id, elected: 'bat', coinSide: 'heads' },
    squadRevealConfig: { autoReveal, delayAfterTossSeconds: delayAfterToss, playerRevealIntervalMs: playerRevealInterval },
    impactPlayers: { teamA: impactPlayersA, teamB: impactPlayersB },
    revealedPlayersTeamA: [],
    revealedPlayersTeamB: [],
    lastUpdated: 0,
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const resize = () => setScale(stage.clientWidth / 1920);
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const sequence = buildPreMatchSequence(squadDesign, {
      hasToss: true,
      hasImpactPlayers: impactPlayersA.length > 0 || impactPlayersB.length > 0,
      playerCount: Math.max(previewLineups.teamA?.players.length || 0, previewLineups.teamB?.players.length || 0),
      playerRevealIntervalMs: autoReveal ? playerRevealInterval : 0,
    });
    const currentIndex = sequence.findIndex(step => step.phase === phase);
    const currentStep = sequence[currentIndex];
    const nextPhase = sequence[currentIndex + 1]?.phase;
    const duration = currentStep && sequence[currentIndex + 1]
      ? sequence[currentIndex + 1].atMs - currentStep.atMs
      : squadDesign.matchReadyDurationMs;
    const timer = setTimeout(() => {
      if (nextPhase) setPhase(nextPhase);
      else setPlaying(false);
    }, duration);
    return () => clearTimeout(timer);
  }, [autoReveal, impactPlayersA.length, impactPlayersB.length, phase, playerRevealInterval, playing, previewLineups.teamA?.players.length, previewLineups.teamB?.players.length, squadDesign]);

  return (
    <AnimatePresence>
      <motion.div className={`prematch-preview-modal ${inline ? 'prematch-preview-modal--inline' : ''}`} role="dialog" aria-modal="true" aria-label="Pre-match overlay preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (!inline && event.target === event.currentTarget) onClose(); }}>
        <div className="prematch-preview-modal__panel">
          <header className="prematch-preview-modal__header">
            <div><strong>Pre-Match Overlay Preview</strong><span>1920 × 1080 · {match.teamA.name} vs {match.teamB.name}</span></div>
            {showEditButton && <button type="button" className="prematch-preview-modal__button" onClick={onEdit}><IoPencil size={15} /> Edit Design</button>}
            {!inline && <button type="button" className="prematch-preview-modal__close" onClick={onClose} aria-label="Close preview"><IoClose size={20} /></button>}
          </header>
          <div ref={stageRef} className="prematch-preview-modal__stage">
            <div className="prematch-preview-modal__canvas" style={{ transform: `scale(${scale})` }}>
              <PreMatchOverlay match={match} preMatch={previewState} config={config} lineups={previewLineups} squadDesign={squadDesign} preview />
            </div>
          </div>
          <footer className="prematch-preview-modal__controls">
            <label className="prematch-preview-modal__phase-select"><span>Phase</span>
              <select value={phase} onChange={event => { setPlaying(false); setPhase(event.target.value as PreMatchPhase); }}>
                {PREMATCH_PREVIEW_PHASES.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
            <button type="button" className="prematch-preview-modal__button prematch-preview-modal__button--primary" onClick={() => {
              if (playing) { setPlaying(false); return; }
              const firstPhase = buildPreMatchSequence(squadDesign, {
                hasToss: true,
                hasImpactPlayers: impactPlayersA.length > 0 || impactPlayersB.length > 0,
                playerCount: 11,
                playerRevealIntervalMs: autoReveal ? playerRevealInterval : 0,
              })[0]?.phase || 'match_ready';
              setPhase(firstPhase);
              setPlaying(true);
            }}>
              {playing ? <><IoStop size={15} /> Stop sequence</> : <><IoPlay size={15} /> Play sequence</>}
            </button>
            <span className="prematch-preview-modal__resolution">Preview scaled to {Math.round(scale * 100)}%</span>
          </footer>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}