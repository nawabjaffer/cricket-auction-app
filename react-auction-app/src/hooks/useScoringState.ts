// ============================================================================
// useScoringState — State management hook for ball-by-ball scoring
// Wraps ManualScoringAdapter with React state and undo history
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { getDatabase } from 'firebase/database';
import { tenantPath } from '../services/tenantPath';
import { realtimeSync } from '../services/realtimeSync';
import { scoringService } from '../services/scoring';
import { ManualScoringAdapter } from '../services/scoring/ManualScoringAdapter';
import type {
  LiveScore, MatchSetup, MatchLineup, Innings, BallOutcome,
  WicketDetail, MatchSquadPlayer, OverlayControlState, OverlayType,
} from '../types/scoring';

interface ScoringState {
  match: MatchSetup | null;
  liveScore: LiveScore | null;
  currentInnings: Innings | null;
  lineups: { teamA: MatchLineup | null; teamB: MatchLineup | null };
  overlayControl: OverlayControlState | null;
  loading: boolean;
  error: string | null;
}

interface UndoEntry {
  live: LiveScore;
  ballId: string;
}

export function useScoringState(matchId: string | undefined) {
  const [state, setState] = useState<ScoringState>({
    match: null, liveScore: null, currentInnings: null,
    lineups: { teamA: null, teamB: null },
    overlayControl: null, loading: true, error: null,
  });
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [recording, setRecording] = useState(false);
  const adapterRef = useRef<ManualScoringAdapter | null>(null);

  // Initialize
  useEffect(() => {
    if (!matchId) return;
    const db = realtimeSync.getDatabase();
    if (!db) { setState(s => ({ ...s, loading: false, error: 'Database not ready' })); return; }
    const basePath = tenantPath('scoring');

    try {
      scoringService.initialize(db, basePath);
    } catch { /* already initialized */ }
    adapterRef.current = scoringService.manual;

    const load = async () => {
      try {
        const match = await scoringService.getMatch(matchId);
        if (!match) { setState(s => ({ ...s, loading: false, error: 'Match not found' })); return; }

        const [lineupA, lineupB] = await Promise.all([
          scoringService.getLineup(matchId, match.teamA.id),
          scoringService.getLineup(matchId, match.teamB.id),
        ]);

        setState(s => ({
          ...s,
          match,
          lineups: { teamA: lineupA, teamB: lineupB },
          loading: false,
        }));
      } catch (err) {
        setState(s => ({ ...s, loading: false, error: String(err) }));
      }
    };
    load();

    // Subscribe live
    const unsubLive = scoringService.subscribeLiveScore(matchId, (live) => {
      setState(s => ({ ...s, liveScore: live }));
    });

    const unsubOverlay = scoringService.subscribeOverlayControl(matchId, (ctrl) => {
      setState(s => ({ ...s, overlayControl: ctrl }));
    });

    return () => { unsubLive(); unsubOverlay(); };
  }, [matchId]);

  // Record ball
  const recordBall = useCallback(async (outcome: BallOutcome, wicket?: WicketDetail) => {
    if (!matchId || !state.liveScore || !adapterRef.current || recording) return;
    setRecording(true);
    try {
      // Save current state for undo
      const prevLive = { ...state.liveScore };
      const innings: Innings = state.currentInnings || {
        number: state.liveScore.currentInnings,
        battingTeamId: state.liveScore.battingTeamId,
        bowlingTeamId: state.liveScore.bowlingTeamId,
        totalRuns: state.liveScore.runs,
        totalWickets: state.liveScore.wickets,
        totalOvers: state.liveScore.overs,
        maxOvers: state.match?.maxOvers || 20,
        extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
        batsmen: [],
        bowlers: [],
        fallOfWickets: [],
        overs: [],
        isCompleted: false,
      };

      const { ballEvent } = await adapterRef.current.recordBall(
        matchId, state.liveScore, innings, { outcome, wicket },
      );

      setUndoStack(prev => [...prev.slice(-19), { live: prevLive, ballId: ballEvent.id }]);
    } catch (err) {
      setState(s => ({ ...s, error: `Record failed: ${err}` }));
    } finally {
      setRecording(false);
    }
  }, [matchId, state.liveScore, state.currentInnings, state.match, recording]);

  // Undo
  const undoLastBall = useCallback(async () => {
    if (!matchId || !adapterRef.current || undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    try {
      await adapterRef.current.undoLastBall(matchId, last.live, last.ballId);
      setUndoStack(prev => prev.slice(0, -1));
    } catch (err) {
      setState(s => ({ ...s, error: `Undo failed: ${err}` }));
    }
  }, [matchId, undoStack]);

  // Init innings
  const initInnings = useCallback(async (
    inningsNumber: 1 | 2,
    battingTeamId: string,
    bowlingTeamId: string,
    openers: [MatchSquadPlayer, MatchSquadPlayer],
    openingBowler: MatchSquadPlayer,
    target?: number,
  ) => {
    if (!matchId || !adapterRef.current) return;
    try {
      await adapterRef.current.initInnings(
        matchId, inningsNumber, battingTeamId, bowlingTeamId,
        [
          { id: openers[0].playerId, name: openers[0].playerName },
          { id: openers[1].playerId, name: openers[1].playerName },
        ],
        { id: openingBowler.playerId, name: openingBowler.playerName },
        target,
      );
      setUndoStack([]);
    } catch (err) {
      setState(s => ({ ...s, error: `Init innings failed: ${err}` }));
    }
  }, [matchId]);

  // Set overlay
  const setOverlay = useCallback(async (overlayType: OverlayType, data?: Record<string, unknown>) => {
    if (!matchId) return;
    try {
      await scoringService.setOverlayControl(matchId, {
        activeOverlay: overlayType,
        ...(data ? { activeOverlayData: data } : {}),
        lastUpdated: Date.now(),
      });
    } catch (err) {
      setState(s => ({ ...s, error: `Overlay failed: ${err}` }));
    }
  }, [matchId]);

  // Change batsman (new batsman after wicket, or striker swap)
  const changeBatsman = useCallback(async (
    newBatsman: MatchSquadPlayer,
    position: 'striker' | 'non-striker',
  ) => {
    if (!matchId || !state.liveScore) return;
    const live = { ...state.liveScore };
    const idx = position === 'striker' ? 0 : 1;
    live.currentBatsmen = [...live.currentBatsmen] as [typeof live.currentBatsmen[0], typeof live.currentBatsmen[1]];
    live.currentBatsmen[idx] = {
      playerId: newBatsman.playerId,
      playerName: newBatsman.playerName,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strikeRate: 0,
      isOnStrike: position === 'striker',
    };
    live.partnership = { runs: 0, balls: 0 };
    live.lastUpdated = Date.now();
    const db = getDatabase();
    const { ref: dbRef, set: dbSet } = await import('firebase/database');
    await dbSet(dbRef(db, `${tenantPath('scoring')}/matches/${matchId}/live`), live);
  }, [matchId, state.liveScore]);

  // Change bowler
  const changeBowler = useCallback(async (newBowler: MatchSquadPlayer) => {
    if (!matchId || !state.liveScore) return;
    const live = { ...state.liveScore };
    live.currentBowler = {
      playerId: newBowler.playerId,
      playerName: newBowler.playerName,
      overs: 0,
      maidens: 0,
      runs: 0,
      wickets: 0,
      economy: 0,
      dots: 0,
    };
    live.lastUpdated = Date.now();
    const db = getDatabase();
    const { ref: dbRef, set: dbSet } = await import('firebase/database');
    await dbSet(dbRef(db, `${tenantPath('scoring')}/matches/${matchId}/live`), live);
  }, [matchId, state.liveScore]);

  return {
    ...state,
    undoStack,
    recording,
    recordBall,
    undoLastBall,
    initInnings,
    setOverlay,
    changeBatsman,
    changeBowler,
  };
}
