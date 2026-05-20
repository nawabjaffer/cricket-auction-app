// ============================================================================
// PRE-MATCH OBS OVERLAY — Transparent overlay for pre-match broadcast sequence
// Squad display, toss animation (chroma key), squad reveal, impact players
// ============================================================================

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  MatchSetup, MatchLineup, PreMatchState, ScoringOverlayConfig,
  ImpactPlayer, MatchSquadPlayer,
} from '../types/scoring';
import './PreMatchOverlay.css';

interface PreMatchOverlayProps {
  match: MatchSetup;
  preMatch: PreMatchState;
  config: ScoringOverlayConfig;
  lineups: { teamA: MatchLineup | null; teamB: MatchLineup | null };
  playerImages?: Record<string, string>;
}

export default function PreMatchOverlay({ match, preMatch, config, lineups, playerImages }: PreMatchOverlayProps) {
  const { phase } = preMatch;

  if (phase === 'idle' || phase === 'match_ready') return null;

  return (
    <div className="prematch-overlay">
      <AnimatePresence mode="wait">
        {phase === 'squad_display' && (
          <SquadDisplayOverlay key="squad" match={match} lineups={lineups} config={config} playerImages={playerImages} />
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
            playerImages={playerImages}
          />
        )}
        {phase === 'squad_reveal_teamB' && lineups.teamB && (
          <SquadRevealOverlay
            key="reveal-b"
            team={{ name: match.teamB.name, logoUrl: match.teamB.logoUrl, primaryColor: match.teamB.primaryColor }}
            lineup={lineups.teamB}
            revealedIds={preMatch.revealedPlayersTeamB || []}
            revealConfig={preMatch.squadRevealConfig}
            playerImages={playerImages}
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

function SquadDisplayOverlay({ match, lineups, config, playerImages }: {
  match: MatchSetup;
  lineups: { teamA: MatchLineup | null; teamB: MatchLineup | null };
  config: ScoringOverlayConfig;
  playerImages?: Record<string, string>;
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
          playerImages={playerImages}
        />
        <div className="prematch-squad-display__divider" />
        <TeamSquadColumn
          team={match.teamB}
          lineup={lineups.teamB}
          playerImages={playerImages}
        />
      </div>
    </motion.div>
  );
}

function TeamSquadColumn({ team, lineup, playerImages }: {
  team: { name: string; logoUrl?: string; primaryColor?: string };
  lineup: MatchLineup | null;
  playerImages?: Record<string, string>;
}) {
  return (
    <div className="prematch-squad-col" style={{ '--team-color': team.primaryColor || '#3b82f6' } as React.CSSProperties}>
      <div className="prematch-squad-col__header">
        {team.logoUrl && <img src={team.logoUrl} alt="" className="prematch-squad-col__logo" />}
        <h2 className="prematch-squad-col__name">{team.name}</h2>
      </div>
      <div className="prematch-squad-col__players">
        {lineup?.players.map((p, i) => {
          const imgUrl = p.imageUrl || playerImages?.[p.playerId];
          return (
            <motion.div
              key={p.playerId}
              className="prematch-squad-col__player"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
            >
              <span className="prematch-squad-col__num">{i + 1}</span>
              <div className="prematch-squad-col__player-img-wrap">
                {imgUrl ? (
                  <img src={imgUrl} alt="" className="prematch-squad-col__player-img" />
                ) : (
                  <div className="prematch-squad-col__player-img-placeholder" />
                )}
              </div>
              <div className="prematch-squad-col__player-info">
                <span className="prematch-squad-col__pname">
                  {p.playerName}
                  {p.isCaptain && <span className="prematch-squad-col__badge prematch-squad-col__badge--captain">C</span>}
                  {p.isWicketKeeper && <span className="prematch-squad-col__badge prematch-squad-col__badge--keeper">WK</span>}
                </span>
                <span className="prematch-squad-col__role-badge" data-role={getRoleCategory(p.role)}>
                  {p.role}
                </span>
              </div>
              {p.auctionPrice !== undefined && (
                <span className="prematch-squad-col__price">₹{p.auctionPrice}L</span>
              )}
            </motion.div>
          );
        }) || (
          <p className="prematch-squad-col__empty">Lineup not set</p>
        )}
      </div>
    </div>
  );
}

function getRoleCategory(role: string): string {
  const lower = role.toLowerCase();
  if (lower.includes('bat')) return 'batsman';
  if (lower.includes('bowl') || lower.includes('fast') || lower.includes('pace') || lower.includes('spin')) return 'bowler';
  if (lower.includes('all') || lower.includes('round')) return 'allrounder';
  if (lower.includes('keep') || lower.includes('wk')) return 'keeper';
  return 'batsman';
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOSS ANIMATION — Coin flip video with canvas-based chroma key
// ═══════════════════════════════════════════════════════════════════════════════

function ChromaKeyTossVideo({ src, chromaColor, similarity }: {
  src: string;
  chromaColor: string;
  similarity: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animRef = useRef<number>(0);
  const drawingRef = useRef(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);

  // Fetch video as blob to bypass CORS for canvas pixel access
  useEffect(() => {
    let cancelled = false;
    const fetchBlob = async () => {
      try {
        const response = await fetch(src, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!cancelled) setBlobUrl(URL.createObjectURL(blob));
      } catch {
        if (!cancelled) setBlobUrl(null);
      }
    };
    fetchBlob();
    return () => {
      cancelled = true;
      setBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [src]);

  useEffect(() => {
    if (fallback) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const hex = chromaColor.replace('#', '');
    const keyR = parseInt(hex.substring(0, 2), 16);
    const keyG = parseInt(hex.substring(2, 4), 16);
    const keyB = parseInt(hex.substring(4, 6), 16);
    const threshold = similarity * 442;
    const thresholdSq = threshold * threshold;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const draw = () => {
      if (video.paused || video.ended) { drawingRef.current = false; return; }
      const w = video.videoWidth || 400;
      const h = video.videoHeight || 400;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      try {
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const dr = data[i] - keyR;
          const dg = data[i + 1] - keyG;
          const db = data[i + 2] - keyB;
          const distSq = dr * dr + dg * dg + db * db;
          if (distSq < thresholdSq) {
            data[i + 3] = 0;
          } else if (distSq < thresholdSq * 2.25) {
            const ratio = (Math.sqrt(distSq) - threshold) / (threshold * 0.5);
            data[i + 3] = Math.min(255, Math.round(ratio * 255));
          }
        }
        ctx.putImageData(imageData, 0, 0);
      } catch {
        drawingRef.current = false;
        setFallback(true);
        return;
      }
      animRef.current = requestAnimationFrame(draw);
    };

    const startDrawing = () => {
      if (!drawingRef.current) { drawingRef.current = true; animRef.current = requestAnimationFrame(draw); }
    };

    video.addEventListener('play', startDrawing);
    video.addEventListener('playing', startDrawing);
    video.addEventListener('error', () => setFallback(true));
    if (!video.paused && video.readyState >= 2) startDrawing();

    return () => {
      drawingRef.current = false;
      cancelAnimationFrame(animRef.current);
      video.removeEventListener('play', startDrawing);
      video.removeEventListener('playing', startDrawing);
    };
  }, [chromaColor, similarity, fallback, blobUrl]);

  if (fallback) {
    return <video src={src} className="prematch-toss__video" autoPlay muted playsInline />;
  }

  const videoSrc = blobUrl || src;

  return (
    <div className="prematch-toss__chroma-container">
      <video
        ref={videoRef}
        src={videoSrc}
        autoPlay
        muted
        playsInline
        crossOrigin={blobUrl ? undefined : 'anonymous'}
        onError={() => setFallback(true)}
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
      />
      <canvas ref={canvasRef} className="prematch-toss__chroma-canvas" />
    </div>
  );
}

function TossAnimationOverlay({ match, preMatch, config }: {
  match: MatchSetup;
  preMatch: PreMatchState;
  config: ScoringOverlayConfig;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tossConfig = config.tossConfig;
  const coinSide = preMatch.tossResult?.coinSide || 'heads';
  const videoUrl = coinSide === 'heads' ? tossConfig?.headsVideoUrl : tossConfig?.tailsVideoUrl;
  const tossDuration = tossConfig?.tossDurationSeconds || 5;

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState(tossDuration);
  useEffect(() => {
    setTimeLeft(tossDuration);
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [tossDuration]);

  useEffect(() => {
    if (videoRef.current && videoUrl) {
      videoRef.current.play().catch(() => {});
    }
  }, [videoUrl]);

  return (
    <motion.div
      className="prematch-toss"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header with TOSS title */}
      <div className="prematch-toss__title">TOSS</div>

      {/* Team logos + video center layout */}
      <div className="prematch-toss__center">
        {/* Team A Logo */}
        <div className="prematch-toss__team-logo-wrap">
          {match.teamA.logoUrl && <img src={match.teamA.logoUrl} alt={match.teamA.name} className="prematch-toss__team-logo" />}
          <span className="prematch-toss__team-name" style={{ color: match.teamA.primaryColor || '#3b82f6' }}>
            {match.teamA.name}
          </span>
        </div>

        {/* Coin flip animation (centered) */}
        <div className="prematch-toss__video-wrap">
          {videoUrl ? (
            tossConfig?.chromaKeyEnabled ? (
              <ChromaKeyTossVideo
                src={videoUrl}
                chromaColor={tossConfig.chromaKeyColor || '#00FF00'}
                similarity={tossConfig.chromaKeySimilarity || 0.4}
              />
            ) : (
              <video
                ref={videoRef}
                src={videoUrl}
                className="prematch-toss__video"
                muted
                playsInline
                autoPlay
              />
            )
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
        </div>

        {/* Team B Logo */}
        <div className="prematch-toss__team-logo-wrap">
          {match.teamB.logoUrl && <img src={match.teamB.logoUrl} alt={match.teamB.name} className="prematch-toss__team-logo" />}
          <span className="prematch-toss__team-name" style={{ color: match.teamB.primaryColor || '#ef4444' }}>
            {match.teamB.name}
          </span>
        </div>
      </div>

      {/* Timer */}
      {timeLeft > 0 && (
        <div className="prematch-toss__timer">
          <span className="prematch-toss__timer-value">{timeLeft}s</span>
        </div>
      )}
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
  // const loser = preMatch.tossResult.wonBy === match.teamA.id ? match.teamB : match.teamA;

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

function SquadRevealOverlay({ team, lineup, revealedIds, revealConfig, playerImages }: {
  team: { name: string; logoUrl?: string; primaryColor?: string };
  lineup: MatchLineup;
  revealedIds: string[];
  revealConfig: PreMatchState['squadRevealConfig'];
  playerImages?: Record<string, string>;
}) {
  const [localRevealed, setLocalRevealed] = useState<string[]>(revealedIds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        if (timerRef.current !== null) clearInterval(timerRef.current);
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
          const imgUrl = player.imageUrl || playerImages?.[player.playerId];
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
                  {imgUrl && (
                    <img src={imgUrl} alt="" className="prematch-reveal__player-img" />
                  )}
                  <div className="prematch-reveal__player-info">
                    <span className="prematch-reveal__player-name">
                      {player.playerName}
                      {player.isCaptain && <span className="prematch-reveal__badge prematch-reveal__badge--captain">C</span>}
                      {player.isWicketKeeper && <span className="prematch-reveal__badge prematch-reveal__badge--keeper">WK</span>}
                    </span>
                    <span className="prematch-reveal__player-role" data-role={getRoleCategory(player.role)}>
                      {player.role}
                    </span>
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
