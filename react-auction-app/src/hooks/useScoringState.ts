// ============================================================================
// useScoringState — State management hook for ball-by-ball scoring
// Wraps ManualScoringAdapter with React state and undo history.
// Handles: atomic batsman swap, bowler enforcement, end-of-innings detection,
// innings data tracking, impact sub management.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { ref, get as dbGet, set as dbSet, onValue, type Database } from 'firebase/database';
import { tenantPath } from '../services/tenantPath';
import { realtimeSync } from '../services/realtimeSync';
import { scoringService } from '../services/scoring';
import { statsEngine } from '../services/scoring/statsEngine';
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
  isInningsComplete: boolean;
  isMatchComplete: boolean;
  needsBowlerChange: boolean;
}

interface UndoEntry {
  live: LiveScore;
  innings: Innings | null;
  ballId: string;
}

/** Firebase RTDB drops empty arrays — restore defaults when reading LiveScore */
function normalizeLive(live: LiveScore): LiveScore {
  return {
    ...live,
    currentOverBalls: live.currentOverBalls ?? [],
    recentOvers: live.recentOvers ?? [],
    currentBatsmen: live.currentBatsmen ?? [],
    partnership: live.partnership ?? { runs: 0, balls: 0 },
    allBatsmen: live.allBatsmen ?? [],
    allBowlers: live.allBowlers ?? [],
  };
}

export function useScoringState(matchId: string | undefined) {
  const [state, setState] = useState<ScoringState>({
    match: null, liveScore: null, currentInnings: null,
    lineups: { teamA: null, teamB: null },
    overlayControl: null, loading: true, error: null,
    isInningsComplete: false, isMatchComplete: false, needsBowlerChange: false,
  });
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [recording, setRecording] = useState(false);
  const adapterRef = useRef<ManualScoringAdapter | null>(null);
  const recordingRef = useRef(false); // Debounce guard
  const dbRef = useRef<Database | null>(null); // Store db reference for callbacks
  const liveScoreRef = useRef<LiveScore | null>(null);
  const inningsRef = useRef<Innings | null>(null);

  // Initialize
  useEffect(() => {
    if (!matchId) return;
    const db = realtimeSync.getDatabase();
    if (!db) { setState(s => ({ ...s, loading: false, error: 'Database not ready' })); return; }
    dbRef.current = db;
    const basePath = tenantPath('scoring');

    try {
      scoringService.initialize(db, basePath);
      statsEngine.initialize(db, basePath);
    } catch { /* already initialized */ }
    adapterRef.current = scoringService.manual;

    const load = async () => {
      try {
        const match = await scoringService.getMatch(matchId);
        if (!match) { setState(s => ({ ...s, loading: false, error: 'Match not found' })); return; }

        let [lineupA, lineupB] = await Promise.all([
          scoringService.getLineup(matchId, match.teamA.id),
          scoringService.getLineup(matchId, match.teamB.id),
        ]);

        // Auto-populate lineups from auction sold players if none saved
        if (!lineupA || !lineupB || lineupA.players.length === 0 || lineupB.players.length === 0) {
          try {
            const soldPath = tenantPath('auction/soldPlayers');
            const snap = await dbGet(ref(db, soldPath));
            if (snap.exists()) {
              const allSold = Object.values(snap.val()) as Array<{
                id: string; playerName: string; role: string;
                teamId?: string; teamName: string; soldAmount: number; imageUrl?: string;
              }>;
              const toSquadPlayer = (p: typeof allSold[number], idx: number): MatchSquadPlayer => ({
                playerId: p.id,
                playerName: p.playerName,
                role: p.role || 'Uncategorized',
                battingOrder: idx + 1,
                imageUrl: p.imageUrl || undefined,
                auctionPrice: p.soldAmount,
              });

              if (!lineupA || lineupA.players.length === 0) {
                const teamAPlayers = allSold.filter(
                  p => p.teamId === match.teamA.id || p.teamName === match.teamA.name,
                );
                if (teamAPlayers.length > 0) {
                  lineupA = {
                    matchId, teamId: match.teamA.id,
                    players: teamAPlayers.map(toSquadPlayer),
                  };
                }
              }
              if (!lineupB || lineupB.players.length === 0) {
                const teamBPlayers = allSold.filter(
                  p => p.teamId === match.teamB.id || p.teamName === match.teamB.name,
                );
                if (teamBPlayers.length > 0) {
                  lineupB = {
                    matchId, teamId: match.teamB.id,
                    players: teamBPlayers.map(toSquadPlayer),
                  };
                }
              }
            }
          } catch { /* auction data not available, lineups stay empty */ }
        }

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
      const normalized = normalizeLive(live);
      liveScoreRef.current = normalized;
      setState(s => ({ ...s, liveScore: normalized }));
    });

    const unsubOverlay = scoringService.subscribeOverlayControl(matchId, (ctrl) => {
      setState(s => ({ ...s, overlayControl: ctrl }));
    });

    // Subscribe to innings data
    const unsubInn = onValue(ref(db, `${basePath}/matches/${matchId}/innings`), (snap) => {
      if (snap.exists()) {
        const data = snap.val() as Record<string, Innings>;
        // Get current innings (latest)
        const keys = Object.keys(data).sort();
        const latestKey = keys[keys.length - 1];
        if (latestKey) {
          inningsRef.current = data[latestKey];
          setState(s => ({ ...s, currentInnings: data[latestKey] }));
        }
      }
    });

    return () => { unsubLive(); unsubOverlay(); unsubInn(); };
  }, [matchId]);

  // Record ball — with debounce protection
  const recordBall = useCallback(async (outcome: BallOutcome, wicket?: WicketDetail) => {
    const liveSnapshot = liveScoreRef.current;
    const inningsSnapshot = inningsRef.current;
    if (!matchId || !liveSnapshot || !adapterRef.current || recording || recordingRef.current) return;
    
    // Validate: can't take wicket when 10 are already down
    if (wicket && liveSnapshot.wickets >= 10) {
      setState(s => ({ ...s, error: 'All wickets already fallen' }));
      return;
    }

    setRecording(true);
    recordingRef.current = true;
    try {
      // Save current state for undo
      const prevLive = JSON.parse(JSON.stringify(liveSnapshot)) as LiveScore;
      const prevInnings = inningsSnapshot ? JSON.parse(JSON.stringify(inningsSnapshot)) as Innings : null;
      
      const innings: Innings = inningsSnapshot || {
        number: liveSnapshot.currentInnings,
        battingTeamId: liveSnapshot.battingTeamId,
        bowlingTeamId: liveSnapshot.bowlingTeamId,
        totalRuns: liveSnapshot.runs,
        totalWickets: liveSnapshot.wickets,
        totalOvers: liveSnapshot.overs,
        maxOvers: state.match?.maxOvers || 20,
        extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
        batsmen: liveSnapshot.allBatsmen || [],
        bowlers: liveSnapshot.allBowlers || [],
        fallOfWickets: [],
        overs: [],
        isCompleted: false,
      };

      const { ballEvent, updatedLive, updatedInnings, isInningsComplete } = await adapterRef.current.recordBall(
        matchId, liveSnapshot, innings, { outcome, wicket },
      );

      liveScoreRef.current = updatedLive;
      inningsRef.current = updatedInnings;

      setUndoStack(prev => [...prev.slice(-19), { live: prevLive, innings: prevInnings, ballId: ballEvent.id }]);

      // Note: overlay auto-trigger is handled by ManualScoringAdapter.recordBall() directly

      // Check if bowler change is needed (over completed)
      const overCompleted = updatedLive.currentOverBalls.length === 0 && updatedLive.overs > 0;
      
      // Update match stats in real-time
      if (state.match) {
        const allInnings: Innings[] = [];
        // Get both innings if available
        if (updatedLive.currentInnings === 1) {
          allInnings.push(updatedInnings);
        } else {
          // Try to get innings 1 from adapter
          const inn1 = await adapterRef.current.getInnings(matchId, 1);
          if (inn1) allInnings.push(inn1);
          allInnings.push(updatedInnings);
        }
        const lineups = state.lineups ? {
          teamA: state.lineups.teamA || undefined,
          teamB: state.lineups.teamB || undefined,
        } : undefined;
        const matchStats = statsEngine.computeMatchStats(matchId, allInnings, state.match, lineups);
        await statsEngine.saveMatchStats(matchId, matchStats);
      }

      setState(s => ({
        ...s,
        currentInnings: updatedInnings,
        isInningsComplete,
        needsBowlerChange: overCompleted && !isInningsComplete,
        isMatchComplete: isInningsComplete && updatedLive.currentInnings === 2,
      }));

      // Auto-complete match if 2nd innings is complete
      if (isInningsComplete && updatedLive.currentInnings === 2 && state.match && adapterRef.current) {
        await adapterRef.current.completeMatch(matchId, state.match);
        // Save player stats and update career stats
        const allInnings: Innings[] = [];
        const inn1 = await adapterRef.current.getInnings(matchId, 1);
        if (inn1) allInnings.push(inn1);
        allInnings.push(updatedInnings);
        
        const playerStats = statsEngine.extractPlayerMatchStats(matchId, allInnings, state.match);
        await statsEngine.saveAllPlayerMatchStats(matchId, playerStats);
        const playerIds = playerStats.map(s => s.playerId);
        await statsEngine.updateCareerStatsForMatch(playerIds);
        
        // Update tournament stats
        const tournamentStats = await statsEngine.aggregateTournamentStats();
        await statsEngine.saveTournamentStats(tournamentStats);

        // Auto-trigger match summary overlay after completion
        try {
          await setOverlay('match_summary');
        } catch { /* ignore overlay trigger failure */ }
      }
    } catch (err) {
      setState(s => ({ ...s, error: `Record failed: ${err}` }));
    } finally {
      setRecording(false);
      recordingRef.current = false;
    }
  }, [matchId, state.match, state.lineups, recording]);

  // Undo
  const undoLastBall = useCallback(async () => {
    if (!matchId || !adapterRef.current || undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    try {
      await adapterRef.current.undoLastBall(matchId, last.live, last.ballId);
      // Restore innings data if we have it
      if (last.innings && dbRef.current) {
        await dbSet(ref(dbRef.current, `${tenantPath('scoring')}/matches/${matchId}/innings/${last.live.currentInnings}`), last.innings);
      }
      liveScoreRef.current = normalizeLive(last.live);
      inningsRef.current = last.innings;
      setUndoStack(prev => prev.slice(0, -1));
      setState(s => ({
        ...s,
        liveScore: normalizeLive(last.live),
        currentInnings: last.innings,
        isInningsComplete: false,
        needsBowlerChange: false,
        isMatchComplete: false,
      }));
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
        state.match?.maxOvers,
      );
      setUndoStack([]);
      setState(s => ({ ...s, isInningsComplete: false, needsBowlerChange: false, isMatchComplete: false }));
    } catch (err) {
      setState(s => ({ ...s, error: `Init innings failed: ${err}` }));
    }
  }, [matchId, state.match]);

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

  // Change batsman — atomic single write
  const changeBatsman = useCallback(async (
    newBatsman: MatchSquadPlayer,
    position: 'striker' | 'non-striker',
  ) => {
    if (!matchId || !state.liveScore) return;
    const live = JSON.parse(JSON.stringify(state.liveScore)) as LiveScore;
    const idx = position === 'striker' ? 0 : 1;
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
    // Ensure other batsman's strike status is correct
    const otherIdx = idx === 0 ? 1 : 0;
    live.currentBatsmen[otherIdx] = {
      ...live.currentBatsmen[otherIdx],
      isOnStrike: position !== 'striker',
    };
    live.partnership = { runs: 0, balls: 0 };
    live.lastUpdated = Date.now();
    
    // Add new batsman to allBatsmen array
    if (live.allBatsmen) {
      const exists = live.allBatsmen.find(b => b.playerId === newBatsman.playerId);
      if (!exists) {
        live.allBatsmen.push({
          playerId: newBatsman.playerId,
          playerName: newBatsman.playerName,
          runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: 0,
          dismissal: 'not out', isOut: false, order: live.allBatsmen.length + 1,
        });
      }
    }
    
    if (!dbRef.current) return;
    await dbSet(ref(dbRef.current, `${tenantPath('scoring')}/matches/${matchId}/live`), live);
  }, [matchId, state.liveScore]);

  // Change bowler — with consecutive-over prevention
  const changeBowler = useCallback(async (newBowler: MatchSquadPlayer) => {
    if (!matchId || !state.liveScore) return;

    // Prevent same bowler bowling consecutive overs
    if (state.liveScore.previousBowlerId === newBowler.playerId) {
      setState(s => ({ ...s, error: 'Same bowler cannot bowl consecutive overs' }));
      return;
    }

    const live = JSON.parse(JSON.stringify(state.liveScore)) as LiveScore;
    
    // Check if this bowler already bowled (restore their figures)
    const existingBowler = live.allBowlers?.find(b => b.playerId === newBowler.playerId);
    
    live.currentBowler = {
      playerId: newBowler.playerId,
      playerName: newBowler.playerName,
      overs: existingBowler?.overs || 0,
      maidens: existingBowler?.maidens || 0,
      runs: existingBowler?.runs || 0,
      wickets: existingBowler?.wickets || 0,
      economy: existingBowler?.economy || 0,
      dots: existingBowler?.dots || 0,
    };
    live.lastUpdated = Date.now();
    // Clear last completed over balls — new over starting
    live.lastCompletedOverBalls = [];
    
    // Add/update in allBowlers
    if (live.allBowlers && !existingBowler) {
      live.allBowlers.push({
        playerId: newBowler.playerId,
        playerName: newBowler.playerName,
        overs: 0, maidens: 0, runs: 0, wickets: 0,
        economy: 0, wides: 0, noBalls: 0, dots: 0,
      });
    }
    
    if (!dbRef.current) return;
    await dbSet(ref(dbRef.current, `${tenantPath('scoring')}/matches/${matchId}/live`), live);
    setState(s => ({ ...s, needsBowlerChange: false }));
  }, [matchId, state.liveScore]);

  // Swap strike (manual swap without recording a ball)
  const swapStrike = useCallback(async () => {
    if (!matchId || !state.liveScore) return;
    const live = JSON.parse(JSON.stringify(state.liveScore)) as LiveScore;
    const [a, b] = live.currentBatsmen;
    live.currentBatsmen = [
      { ...b, isOnStrike: true },
      { ...a, isOnStrike: false },
    ];
    live.lastUpdated = Date.now();
    if (!dbRef.current) return;
    await dbSet(ref(dbRef.current, `${tenantPath('scoring')}/matches/${matchId}/live`), live);
  }, [matchId, state.liveScore]);

  // Add player to lineup mid-match (injury replacement)
  const addPlayerToLineup = useCallback(async (teamId: string, player: MatchSquadPlayer) => {
    if (!matchId || !dbRef.current) return;
    const teamKey = state.lineups.teamA?.teamId === teamId ? 'teamA' : 'teamB';
    const currentLineup = state.lineups[teamKey];
    if (!currentLineup) return;

    // Don't add duplicates
    if (currentLineup.players.some(p => p.playerId === player.playerId)) return;

    const updatedLineup = {
      ...currentLineup,
      players: [...currentLineup.players, player],
    };

    // Save to Firebase
    await dbSet(
      ref(dbRef.current, `${tenantPath('scoring')}/matches/${matchId}/lineups/${teamId}`),
      updatedLineup,
    );

    // Update local state
    setState(s => ({
      ...s,
      lineups: { ...s.lineups, [teamKey]: updatedLineup },
    }));
  }, [matchId, state.lineups]);

  // Complete match manually
  const completeMatch = useCallback(async () => {
    if (!matchId || !state.match || !adapterRef.current) return;
    try {
      await adapterRef.current.completeMatch(matchId, state.match);
      
      // Save player stats
      const allInnings: Innings[] = [];
      const inn1 = await adapterRef.current.getInnings(matchId, 1);
      const inn2 = await adapterRef.current.getInnings(matchId, 2);
      if (inn1) allInnings.push(inn1);
      if (inn2) allInnings.push(inn2);
      
      const playerStats = statsEngine.extractPlayerMatchStats(matchId, allInnings, state.match);
      await statsEngine.saveAllPlayerMatchStats(matchId, playerStats);
      const playerIds = playerStats.map(s => s.playerId);
      await statsEngine.updateCareerStatsForMatch(playerIds);
      
      // Update tournament stats
      const tournamentStats = await statsEngine.aggregateTournamentStats();
      await statsEngine.saveTournamentStats(tournamentStats);
      
      setState(s => ({ ...s, isMatchComplete: true }));
    } catch (err) {
      setState(s => ({ ...s, error: `Complete match failed: ${err}` }));
    }
  }, [matchId, state.match]);

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
    swapStrike,
    completeMatch,
    addPlayerToLineup,
  };
}
