// ============================================================================
// PRE-MATCH OBS OVERLAY — Transparent overlay for pre-match broadcast sequence
// Squad display, toss animation (chroma key), squad reveal, impact players
// ============================================================================

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  MatchSetup, MatchLineup, PreMatchState, ScoringOverlayConfig,
  TossConfig, ImpactPlayer, MatchSquadPlayer,
} from '../types/scoring';
import './PreMatchOverlay.css';

interface PreMatchOverlayProps {
  match: MatchSetup;
  preMatch: PreMatchState;
  config: ScoringOverlayConfig;
  lineups: { teamA: MatchLineup | null; teamB: MatchLineup | null };
}

export default function PreMatchOverlay({ match, preMatch, config, lineups }: PreMatchOverlayProps) {
  const { phase } = preMatch;

  if (phase === 'idle' || phase === 'match_ready') return null;

  return (
    <div className="prematch-overlay">
      <AnimatePresence mode="wait">
        {phase === 'squad_display' && (
          <SquadDisplayOverlay key="squad" match={match} lineups={lineups} config={config} />
        )}
        {phase === 'toss_animation' && (
          <TossAnimationOverlay key="toss" match={match} preMatch={preMatch} config={config} />
        )}
        {phase === 'toss_result' && (
          <TossResultOverlay key="toss-result" match={match} preMatch={preMatch} config={config} />
        )}
        {phase === 'squad_reveal_teamA' && lineups.teamA && (
          <SquadRevealOverlay
            key="reveal-a"
            team={{ name: match.teamA.name, logoUrl: match.teamA.logoUrl, primaryColor: match.teamA.primaryColor }}
            lineup={lineups.teamA}
            revealedIds={preMatch.revealedPlayersTeamA || []}
            revealConfig={preMatch.squadRevealConfig}
          />
        )}
        {phase === 'squad_reveal_teamB' && lineups.teamB && (
          <SquadRevealOverlay
            key="reveal-b"
            team={{ name: match.teamB.name, logoUrl: match.teamB.logoUrl, primaryColor: match.teamB.primaryColor }}
            lineup={lineups.teamB}
            revealedIds={preMatch.revealedPlayersTeamB || []}
            revealConfig={preMatch.squadRevealConfig}
          />
        )}
        {phase === 'impact_players' && (
          <ImpactPlayersOverlay key="impact" match={match} impactPlayers={preMatch.impactPlayers} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SQUAD DISPLAY — Both teams' full squads side by side
// ═══════════════════════════════════════════════════════════════════════════════

function SquadDisplayOverlay({ match, lineups, config }: {
  match: MatchSetup;
  lineups: { teamA: MatchLineup | null; teamB: MatchLineup | null };
  config: ScoringOverlayConfig;
}) {
  return (
    <motion.div
      className="prematch-squad-display"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.6 }}
    >
      {/* Header */}
      <div className="prematch-squad-display__header">
        {config.tournamentLogo && <img src={config.tournamentLogo} alt="" className="prematch-squad-display__logo" />}
        <h1 className="prematch-squad-display__title">
          {match.teamA.name} <span className="prematch-squad-display__vs">vs</span> {match.teamB.name}
        </h1>
        <p className="prematch-squad-display__venue">{match.venue}</p>
      </div>

      {/* Two columns */}
      <div className="prematch-squad-display__teams">
        <TeamSquadColumn
          team={match.teamA}
          lineup={lineups.teamA}
        />
        <div className="prematch-squad-display__divider" />
        <TeamSquadColumn
          team={match.teamB}
          lineup={lineups.teamB}
        />
      </div>
    </motion.div>
  );
}

function TeamSquadColumn({ team, lineup }: {
  team: { name: string; logoUrl?: string; primaryColor?: string };
  lineup: MatchLineup | null;
}) {
  return (
    <div className="prematch-squad-col" style={{ '--team-color': team.primaryColor || '#3b82f6' } as React.CSSProperties}>
      <div className="prematch-squad-col__header">
        {team.logoUrl && <img src={team.logoUrl} alt="" className="prematch-squad-col__logo" />}
        <h2 className="prematch-squad-col__name">{team.name}</h2>
      </div>
      <div className="prematch-squad-col__players">
        {lineup?.players.map((p, i) => (
          <motion.div
            key={p.playerId}
            className="prematch-squad-col__player"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, duration: 0.3 }}
          >
            <span className="prematch-squad-col__num">{i + 1}</span>
            <span className="prematch-squad-col__pname">
              {p.playerName}
              {p.isCaptain && <span className="prematch-squad-col__badge">C</span>}
              {p.isWicketKeeper && <span className="prematch-squad-col__badge">WK</span>}
            </span>
            <span className="prematch-squad-col__role">{p.role}</span>
          </motion.div>
        )) || (
          <p className="prematch-squad-col__empty">Lineup not set</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOSS ANIMATION — Coin flip video with chroma key
// ═══════════════════════════════════════════════════════════════════════════════

function TossAnimationOverlay({ match, preMatch, config }: {
  match: MatchSetup;
  preMatch: PreMatchState;
  config: ScoringOverlayConfig;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tossConfig = config.tossConfig;
  const coinSide = preMatch.tossResult?.coinSide || 'heads';
  const videoUrl = coinSide === 'heads' ? tossConfig?.headsVideoUrl : tossConfig?.tailsVideoUrl;

  useEffect(() => {
    if (videoRef.current && videoUrl) {
      videoRef.current.play().catch(() => {});
    }
  }, [videoUrl]);

  const chromaStyle = tossConfig?.chromaKeyEnabled ? {
    filter: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg'><filter id='ck'><feColorMatrix type='matrix' values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 -1 2 -1 0 1'/></filter></svg>`)}#ck")`,
    mixBlendMode: 'screen' as const,
  } : {};

  return (
    <motion.div
      className="prematch-toss"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="prematch-toss__title">TOSS</div>
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          className="prematch-toss__video"
          style={chromaStyle}
          muted
          playsInline
          autoPlay
        />
      ) : (
        /* Fallback CSS coin flip */
        <div className="prematch-toss__coin-fallback">
          <motion.div
            className="prematch-toss__coin"
            animate={{ rotateY: [0, 1800] }}
            transition={{ duration: 2, ease: 'easeInOut' }}
          >
            <div className="prematch-toss__coin-face prematch-toss__coin-heads">H</div>
            <div className="prematch-toss__coin-face prematch-toss__coin-tails">T</div>
          </motion.div>
        </div>
      )}
      <div className="prematch-toss__teams">
        <span style={{ color: match.teamA.primaryColor || '#3b82f6' }}>{match.teamA.name}</span>
        <span className="prematch-toss__vs">vs</span>
        <span style={{ color: match.teamB.primaryColor || '#ef4444' }}>{match.teamB.name}</span>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOSS RESULT
// ═══════════════════════════════════════════════════════════════════════════════

function TossResultOverlay({ match, preMatch, config }: {
  match: MatchSetup;
  preMatch: PreMatchState;
  config: ScoringOverlayConfig;
}) {
  if (!preMatch.tossResult) return null;

  const winner = preMatch.tossResult.wonBy === match.teamA.id ? match.teamA : match.teamB;
  const loser = preMatch.tossResult.wonBy === match.teamA.id ? match.teamB : match.teamA;

  return (
    <motion.div
      className="prematch-toss-result"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.5 }}
    >
      {config.tournamentLogo && <img src={config.tournamentLogo} alt="" className="prematch-toss-result__logo" />}
      <div className="prematch-toss-result__winner">
        {winner.logoUrl && <img src={winner.logoUrl} alt="" className="prematch-toss-result__team-logo" />}
        <h2 className="prematch-toss-result__team-name" style={{ color: winner.primaryColor || '#fbbf24' }}>
          {winner.name}
        </h2>
        <p className="prematch-toss-result__choice">
          won the toss and elected to <strong>{preMatch.tossResult.elected === 'bat' ? 'BAT' : 'BOWL'}</strong>
        </p>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SQUAD REVEAL — Animated player-by-player reveal
// ═══════════════════════════════════════════════════════════════════════════════

function SquadRevealOverlay({ team, lineup, revealedIds, revealConfig }: {
  team: { name: string; logoUrl?: string; primaryColor?: string };
  lineup: MatchLineup;
  revealedIds: string[];
  revealConfig: PreMatchState['squadRevealConfig'];
}) {
  const [localRevealed, setLocalRevealed] = useState<string[]>(revealedIds);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Auto-reveal animation
  useEffect(() => {
    if (!revealConfig.autoReveal) {
      setLocalRevealed(revealedIds);
      return;
    }

    const allIds = lineup.players.map(p => p.playerId);
    let idx = revealedIds.length;

    timerRef.current = setInterval(() => {
      if (idx >= allIds.length) {
        clearInterval(timerRef.current);
        return;
      }
      setLocalRevealed(prev => [...prev, allIds[idx]]);
      idx++;
    }, revealConfig.playerRevealIntervalMs || 2000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [revealConfig, revealedIds, lineup.players]);

  // Sync external reveals
  useEffect(() => {
    if (revealedIds.length > localRevealed.length) {
      setLocalRevealed(revealedIds);
    }
  }, [revealedIds, localRevealed.length]);

  return (
    <motion.div
      className="prematch-reveal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ '--team-color': team.primaryColor || '#3b82f6' } as React.CSSProperties}
    >
      <div className="prematch-reveal__header">
        {team.logoUrl && <img src={team.logoUrl} alt="" className="prematch-reveal__logo" />}
        <h2 className="prematch-reveal__title">{team.name}</h2>
        <p className="prematch-reveal__subtitle">Playing XI</p>
      </div>

      <div className="prematch-reveal__grid">
        {lineup.players.map((player, i) => {
          const isRevealed = localRevealed.includes(player.playerId);
          return (
            <AnimatePresence key={player.playerId}>
              {isRevealed && (
                <motion.div
                  className="prematch-reveal__player"
                  initial={{ opacity: 0, scale: 0.5, rotateY: 90 }}
                  animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                >
                  <div className="prematch-reveal__player-num">{i + 1}</div>
                  <div className="prematch-reveal__player-info">
                    <span className="prematch-reveal__player-name">
                      {player.playerName}
                      {player.isCaptain && <span className="prematch-reveal__badge">C</span>}
                      {player.isWicketKeeper && <span className="prematch-reveal__badge">WK</span>}
                    </span>
                    <span className="prematch-reveal__player-role">{player.role}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          );
        })}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPACT PLAYERS — 4 per team on right side
// ═══════════════════════════════════════════════════════════════════════════════

function ImpactPlayersOverlay({ match, impactPlayers }: {
  match: MatchSetup;
  impactPlayers: { teamA: ImpactPlayer[]; teamB: ImpactPlayer[] };
}) {
  return (
    <motion.div
      className="prematch-impact"
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 180, damping: 22 }}
    >
      <div className="prematch-impact__title">IMPACT PLAYERS</div>

      <div className="prematch-impact__team" style={{ '--team-color': match.teamA.primaryColor || '#3b82f6' } as React.CSSProperties}>
        <div className="prematch-impact__team-header">
          {match.teamA.logoUrl && <img src={match.teamA.logoUrl} alt="" className="prematch-impact__team-logo" />}
          <span className="prematch-impact__team-name">{match.teamA.name}</span>
        </div>
        {(impactPlayers.teamA || []).map((p, i) => (
          <motion.div
            key={p.playerId}
            className="prematch-impact__player"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.15 }}
          >
            <span className="prematch-impact__player-name">{p.playerName}</span>
            <span className="prematch-impact__player-role">{p.role}</span>
          </motion.div>
        ))}
      </div>

      <div className="prematch-impact__team" style={{ '--team-color': match.teamB.primaryColor || '#ef4444' } as React.CSSProperties}>
        <div className="prematch-impact__team-header">
          {match.teamB.logoUrl && <img src={match.teamB.logoUrl} alt="" className="prematch-impact__team-logo" />}
          <span className="prematch-impact__team-name">{match.teamB.name}</span>
        </div>
        {(impactPlayers.teamB || []).map((p, i) => (
          <motion.div
            key={p.playerId}
            className="prematch-impact__player"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + i * 0.15 }}
          >
            <span className="prematch-impact__player-name">{p.playerName}</span>
            <span className="prematch-impact__player-role">{p.role}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
