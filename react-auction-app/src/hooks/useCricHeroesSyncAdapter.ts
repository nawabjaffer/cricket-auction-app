import { useCallback, useEffect, useRef, useState } from 'react';
import type { BallOutcome } from '../types/scoring';
import { getActiveTenant } from '../services/tenantPath';

export interface CricHeroesSyncData {
  sourceMatchId?: string;
  inningsNumber?: number | null;
  scorecardSelection?: boolean;
  selectedTeam?: string;
  scorecards?: CricHeroesInningsSnapshot[];
  battingTeam: string;
  bowlingTeam: string;
  overs: number;
  runs: number;
  wickets: number;
  striker: string;
  ballsFaced: number;
  sixes: number;
  nonStriker: string;
  latestTextEvent: string;
  fullCommentary: string;
  batsmen: CricHeroesBatsmanSnapshot[];
  bowlers: CricHeroesBowlerSnapshot[];
  bowler?: string;
}

export interface CricHeroesInningsSnapshot {
  inningsNumber: number;
  battingTeam: string;
  runs: number | null;
  wickets: number | null;
  overs: number | null;
  extras: number | null;
  extrasBreakdown: { wides: number | null; noBalls: number | null; byes: number | null; legByes: number | null };
  yetToBat: string;
  fallOfWickets: string;
  statsComplete: boolean;
  batsmen: Array<{
    name: string;
    runs: number | null;
    balls: number | null;
    fours: number | null;
    sixes: number | null;
    strikeRate: number | null;
    dismissal: string;
    isStriker: boolean;
    isOut: boolean;
    statsComplete: boolean;
  }>;
  bowlers: Array<{
    name: string;
    overs: number | null;
    maidens: number | null;
    runs: number | null;
    wickets: number | null;
    dots: number | null;
    wides: number | null;
    noBalls: number | null;
    economy: number | null;
    statsComplete: boolean;
  }>;
}

export interface CricHeroesTeamRosterPlayer {
  sourcePlayerId: string;
  name: string;
  profileUrl: string;
  imageUrl: string;
  badges: string[];
}

export interface CricHeroesTeamRoster {
  sourceTeamId: string;
  teamName: string;
  profileUrl: string;
  logoUrl: string;
  capturedAt: number;
  players: CricHeroesTeamRosterPlayer[];
}

export interface CricHeroesCommentaryDelivery {
  key: string;
  over: number;
  ball: number;
  totalBalls: number;
  bowler: string;
  batter: string;
  text: string;
  outcome: BallOutcome | null;
}

export interface CricHeroesBatsmanSnapshot {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  dismissal: string;
  isStriker: boolean;
  isOut: boolean;
}

export interface CricHeroesBowlerSnapshot {
  name: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
}

export interface CricHeroesBallEvent {
  data: CricHeroesSyncData;
  outcome: BallOutcome;
}

export interface CricHeroesSyncLogEntry {
  timestamp: number;
  message: string;
}

function toCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function nullableCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

const teamRosterStorageKey = () => `cricheroes-team-rosters:${getActiveTenant()}`;

function parseTeamRosters(value: unknown): CricHeroesTeamRoster[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): CricHeroesTeamRoster[] => {
    if (!entry || typeof entry !== 'object') return [];
    const team = entry as Record<string, unknown>;
    const sourceTeamId = typeof team.sourceTeamId === 'string' ? team.sourceTeamId : team.teamId;
    if (typeof sourceTeamId !== 'string' || typeof team.teamName !== 'string' || !Array.isArray(team.players)) return [];
    const players = team.players.flatMap((player): CricHeroesTeamRosterPlayer[] => {
      if (!player || typeof player !== 'object') return [];
      const item = player as Record<string, unknown>;
      const sourcePlayerId = typeof item.sourcePlayerId === 'string' ? item.sourcePlayerId : item.playerId;
      if (typeof sourcePlayerId !== 'string' || typeof item.name !== 'string') return [];
      return [{
        sourcePlayerId,
        name: item.name,
        profileUrl: typeof item.profileUrl === 'string' ? item.profileUrl : '',
        imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : '',
        badges: Array.isArray(item.badges) ? item.badges.filter((badge): badge is string => typeof badge === 'string') : [],
      }];
    });
    return [{
      sourceTeamId,
      teamName: team.teamName,
      profileUrl: typeof team.profileUrl === 'string' ? team.profileUrl : '',
      logoUrl: typeof team.logoUrl === 'string' ? team.logoUrl : '',
      capturedAt: typeof team.capturedAt === 'number' ? team.capturedAt : 0,
      players,
    }];
  });
}

function loadTeamRosters(): CricHeroesTeamRoster[] {
  try {
    return parseTeamRosters(JSON.parse(localStorage.getItem(teamRosterStorageKey()) || '[]'));
  } catch {
    return [];
  }
}

const commentaryQueueStorageKey = `cricheroes-commentary-queue:${getActiveTenant()}`;

function loadCommentaryQueues(): Map<string, Map<string, CricHeroesCommentaryDelivery>> {
  try {
    const stored = JSON.parse(localStorage.getItem(commentaryQueueStorageKey) || '[]') as Array<{ key?: unknown; deliveries?: unknown }>;
    return new Map(stored.flatMap(group => {
      if (typeof group.key !== 'string' || !Array.isArray(group.deliveries)) return [];
      const deliveries = group.deliveries.filter((entry): entry is CricHeroesCommentaryDelivery =>
        Boolean(entry && typeof entry === 'object' && typeof (entry as CricHeroesCommentaryDelivery).key === 'string'),
      ).slice(-2000);
      return [[group.key, new Map(deliveries.map(delivery => [delivery.key, delivery]))]];
    }));
  } catch {
    return new Map();
  }
}

export function interpretCricHeroesTextEvent(text: string): BallOutcome | null {
  const event = text.trim().toUpperCase();
  if (!event) return null;
  if (/\bNO RUNS?\b|\bDOT BALL\b/.test(event)) return '0';
  if (/\bNO[ -]?BALLS?\b|\bNOB\b/.test(event)) return 'NB';
  if (/\bWIDES?\b|\bWD\b/.test(event)) return 'WD';
  if (/\bOUT\b|\bWICKET\b/.test(event)) return 'W';
  if (/\bSIX(?:ES)?\b|\b6\s*RUNS?\b/.test(event)) return '6';
  if (/\bFOUR(?:S)?\b|\b4\s*RUNS?\b/.test(event)) return '4';
  const runs = event.match(/\b([0-6])\s*RUNS?\b/);
  return runs ? runs[1] as BallOutcome : null;
}

export function parseCricHeroesCommentary(text: string): CricHeroesCommentaryDelivery[] {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  if (!normalizedText) return [];

  const markerPattern = /(^|\s)(\d{1,2})\.(\d)\s*(?=[^,.]{1,100}\s+to\s+[^,]{1,100},)/g;
  const markers: Array<{ start: number; over: number; ball: number; end: number }> = [];
  let marker: RegExpExecArray | null;
  while ((marker = markerPattern.exec(normalizedText)) !== null) {
    const start = marker.index + marker[1].length;
    markers.push({
      start,
      over: Number(marker[2]),
      ball: Number(marker[3]),
      end: markerPattern.lastIndex,
    });
  }

  return markers.flatMap((entry, index): CricHeroesCommentaryDelivery[] => {
    const end = markers[index + 1]?.start ?? normalizedText.length;
    const text = normalizedText.slice(entry.end, end).trim();
    const playerMatch = text.match(/^(.{1,100}?)\s+to\s+(.{1,100}?),/);
    if (!playerMatch) return [];
    const outcomeText = text.slice(playerMatch[0].length).split(/[,.]/, 1)[0];
    return [{
      key: `${entry.over}.${entry.ball}|${playerMatch[1].trim().toLocaleLowerCase()}|${playerMatch[2].trim().toLocaleLowerCase()}`,
      over: entry.over,
      ball: entry.ball,
      totalBalls: entry.over * 6 + entry.ball,
      bowler: playerMatch[1].trim(),
      batter: playerMatch[2].trim(),
      text,
      outcome: interpretCricHeroesTextEvent(outcomeText),
    }];
  }).sort((left, right) => left.totalBalls - right.totalBalls);
}

function parseSyncData(value: unknown): CricHeroesSyncData | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (typeof data.latestTextEvent !== 'string') return null;
  const batsmen = Array.isArray(data.batsmen) ? data.batsmen : [];
  const bowlers = Array.isArray(data.bowlers) ? data.bowlers : [];
  return {
    sourceMatchId: typeof data.sourceMatchId === 'string' ? data.sourceMatchId : undefined,
    inningsNumber: data.inningsNumber === 1 || data.inningsNumber === 2 ? data.inningsNumber : null,
    scorecardSelection: data.scorecardSelection === true,
    selectedTeam: typeof data.selectedTeam === 'string' ? data.selectedTeam : '',
    scorecards: Array.isArray(data.scorecards) ? data.scorecards.flatMap((entry): CricHeroesInningsSnapshot[] => {
      if (!entry || typeof entry !== 'object') return [];
      const innings = entry as Record<string, unknown>;
      if (typeof innings.battingTeam !== 'string' || !Number.isInteger(innings.inningsNumber)) return [];
      const batsmen = Array.isArray(innings.batsmen) ? innings.batsmen.flatMap((player): CricHeroesInningsSnapshot['batsmen'] => {
        if (!player || typeof player !== 'object' || typeof (player as Record<string, unknown>).name !== 'string') return [];
        const batter = player as Record<string, unknown>;
        return [{
          name: batter.name as string,
          runs: nullableCount(batter.runs),
          balls: nullableCount(batter.balls),
          fours: nullableCount(batter.fours),
          sixes: nullableCount(batter.sixes),
          strikeRate: nullableCount(batter.strikeRate),
          dismissal: typeof batter.dismissal === 'string' ? batter.dismissal : '',
          isStriker: batter.isStriker === true,
          isOut: batter.isOut === true,
          statsComplete: batter.statsComplete === true,
        }];
      }) : [];
      const bowlers = Array.isArray(innings.bowlers) ? innings.bowlers.flatMap((player): CricHeroesInningsSnapshot['bowlers'] => {
        if (!player || typeof player !== 'object' || typeof (player as Record<string, unknown>).name !== 'string') return [];
        const bowler = player as Record<string, unknown>;
        return [{
          name: bowler.name as string,
          overs: nullableCount(bowler.overs),
          maidens: nullableCount(bowler.maidens),
          runs: nullableCount(bowler.runs),
          wickets: nullableCount(bowler.wickets),
          dots: nullableCount(bowler.dots),
          wides: nullableCount(bowler.wides),
          noBalls: nullableCount(bowler.noBalls),
          economy: nullableCount(bowler.economy),
          statsComplete: bowler.statsComplete === true,
        }];
      }) : [];
      return [{
        inningsNumber: Number(innings.inningsNumber),
        battingTeam: innings.battingTeam,
        runs: nullableCount(innings.runs),
        wickets: nullableCount(innings.wickets),
        overs: nullableCount(innings.overs),
        extras: nullableCount(innings.extras),
        extrasBreakdown: innings.extrasBreakdown && typeof innings.extrasBreakdown === 'object'
          ? {
            wides: nullableCount((innings.extrasBreakdown as Record<string, unknown>).wides),
            noBalls: nullableCount((innings.extrasBreakdown as Record<string, unknown>).noBalls),
            byes: nullableCount((innings.extrasBreakdown as Record<string, unknown>).byes),
            legByes: nullableCount((innings.extrasBreakdown as Record<string, unknown>).legByes),
          }
          : { wides: null, noBalls: null, byes: null, legByes: null },
        yetToBat: typeof innings.yetToBat === 'string' ? innings.yetToBat : '',
        fallOfWickets: typeof innings.fallOfWickets === 'string' ? innings.fallOfWickets : '',
        statsComplete: innings.statsComplete === true,
        batsmen,
        bowlers,
      }];
    }) : [],
    battingTeam: typeof data.battingTeam === 'string' ? data.battingTeam : '',
    bowlingTeam: typeof data.bowlingTeam === 'string' ? data.bowlingTeam : '',
    overs: toCount(data.overs),
    runs: toCount(data.runs),
    wickets: toCount(data.wickets),
    striker: typeof data.striker === 'string' ? data.striker : '',
    ballsFaced: toCount(data.ballsFaced),
    sixes: toCount(data.sixes),
    nonStriker: typeof data.nonStriker === 'string' ? data.nonStriker : '',
    latestTextEvent: data.latestTextEvent,
    fullCommentary: typeof data.fullCommentary === 'string' ? data.fullCommentary : data.latestTextEvent,
    batsmen: batsmen.flatMap((entry): CricHeroesBatsmanSnapshot[] => {
      if (!entry || typeof entry !== 'object' || typeof (entry as Record<string, unknown>).name !== 'string') return [];
      const batter = entry as Record<string, unknown>;
      return [{
        name: batter.name as string,
        runs: toCount(batter.runs),
        balls: toCount(batter.balls),
        fours: toCount(batter.fours),
        sixes: toCount(batter.sixes),
        strikeRate: toCount(batter.strikeRate),
        dismissal: typeof batter.dismissal === 'string' ? batter.dismissal : '',
        isStriker: batter.isStriker === true,
        isOut: batter.isOut === true,
      }];
    }),
    bowlers: bowlers.flatMap((entry): CricHeroesBowlerSnapshot[] => {
      if (!entry || typeof entry !== 'object' || typeof (entry as Record<string, unknown>).name !== 'string') return [];
      const bowler = entry as Record<string, unknown>;
      return [{
        name: bowler.name as string,
        overs: toCount(bowler.overs),
        maidens: toCount(bowler.maidens),
        runs: toCount(bowler.runs),
        wickets: toCount(bowler.wickets),
        economy: toCount(bowler.economy),
      }];
    }),
    bowler: typeof data.bowler === 'string' ? data.bowler : undefined,
  };
}

function loadScorecardSnapshots(): CricHeroesInningsSnapshot[] {
  try {
    const stored = JSON.parse(localStorage.getItem(`cricheroes-scorecards:${getActiveTenant()}`) || '[]');
    return parseSyncData({ latestTextEvent: '', scorecards: stored })?.scorecards || [];
  } catch {
    return [];
  }
}

export function useCricHeroesSyncAdapter(onBall?: (event: CricHeroesBallEvent) => boolean | void) {
  const [latest, setLatest] = useState<CricHeroesSyncData | null>(null);
  const [scorecards, setScorecards] = useState<CricHeroesInningsSnapshot[]>(loadScorecardSnapshots);
  const [teamRosters, setTeamRosters] = useState<CricHeroesTeamRoster[]>(loadTeamRosters);
  const [logs, setLogs] = useState<CricHeroesSyncLogEntry[]>([]);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [commentaryHistory, setCommentaryHistory] = useState<CricHeroesCommentaryDelivery[]>([]);
  const lastBallKey = useRef('');
  const lastFeedSummary = useRef('');
  const commentaryQueues = useRef(loadCommentaryQueues());
  const teamRostersRef = useRef(teamRosters);
  const onBallRef = useRef(onBall);
  const appendLog = useCallback((message: string) => {
    setLogs(previous => {
      if (previous[previous.length - 1]?.message === message) return previous;
      return [...previous.slice(-19), { timestamp: Date.now(), message }];
    });
  }, []);

  useEffect(() => {
    onBallRef.current = onBall;
  }, [onBall]);

  useEffect(() => {
    const addLog = appendLog;
    addLog(`App listener ready at ${window.location.origin}`);
    let hasLoggedBridgeReady = false;
    let bridgeTimeout: number | undefined;
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.source === 'CRICHEROES_SYNC_BRIDGE_READY') {
        setBridgeReady(true);
        if (bridgeTimeout !== undefined) window.clearTimeout(bridgeTimeout);
        bridgeTimeout = window.setTimeout(() => setBridgeReady(false), 7500);
        if (!hasLoggedBridgeReady) {
          const data = event.data.data as { version?: unknown } | undefined;
          addLog(`Extension bridge connected${typeof data?.version === 'string' ? ` v${data.version}` : ''}.`);
          hasLoggedBridgeReady = true;
        }
        return;
      }
      if (event.data?.source === 'CRICHEROES_SYNC_DIAGNOSTIC') {
        const diagnostic = event.data.data as { message?: unknown; sourceUrl?: unknown; version?: unknown } | undefined;
        if (typeof diagnostic?.message === 'string') {
          const version = typeof diagnostic.version === 'string' ? ` v${diagnostic.version}` : '';
          addLog(`${diagnostic.message}${version}${typeof diagnostic.sourceUrl === 'string' ? ` (${diagnostic.sourceUrl})` : ''}`);
        }
        return;
      }
      if (event.data?.source === 'CRICHEROES_SYNC_CONFIG_RESULT') {
        const result = event.data.data as { saved?: unknown; error?: unknown } | undefined;
        addLog(result?.saved === true
          ? 'Extension scraper selectors saved to Chrome sync storage.'
          : `Selector save failed: ${typeof result?.error === 'string' ? result.error : 'extension receiver unavailable'}`);
        return;
      }
      if (event.data?.source === 'CRICHEROES_TEAM_ROSTER') {
        const payload = event.data.data as { teams?: unknown; capturedAt?: unknown } | undefined;
        const incomingRosters = parseTeamRosters(payload?.teams).map(roster => ({
          ...roster,
          capturedAt: typeof payload?.capturedAt === 'number' ? payload.capturedAt : roster.capturedAt,
        }));
        if (incomingRosters.length === 0) {
          addLog('Rejected team roster: no team profile IDs or player profiles were found.');
          return;
        }
        let nextRosters = [...teamRostersRef.current];
        for (const roster of incomingRosters) {
          nextRosters = nextRosters.filter(existing => existing.sourceTeamId !== roster.sourceTeamId);
          nextRosters.push(roster);
          addLog(`Team roster captured: ${roster.teamName} (${roster.players.length} players).`);
        }
        nextRosters = nextRosters.slice(-30);
        teamRostersRef.current = nextRosters;
        setTeamRosters(nextRosters);
        try {
          localStorage.setItem(teamRosterStorageKey(), JSON.stringify(nextRosters));
        } catch { /* keep captured rosters in memory if browser storage is unavailable */ }
        return;
      }
      if (!event.data || event.data.source !== 'CRICHEROES_SYNC_ADAPTER') return;
      const data = parseSyncData(event.data.data);
      if (!data) {
        addLog('Rejected extension message: payload is missing latestTextEvent.');
        return;
      }
      setLatest(data);
      if (data.scorecards?.length) {
        setScorecards(data.scorecards);
        try {
          localStorage.setItem(`cricheroes-scorecards:${getActiveTenant()}`, JSON.stringify(data.scorecards));
        } catch { /* retain snapshots in memory when browser storage is unavailable */ }
      }
      const queueKey = `${data.sourceMatchId || 'unknown-match'}|${data.inningsNumber ?? 'unknown-innings'}|${data.battingTeam.trim().toLocaleLowerCase()}`;
      const queue = commentaryQueues.current.get(queueKey) || new Map<string, CricHeroesCommentaryDelivery>();
      let queueChanged = false;
      for (const delivery of parseCricHeroesCommentary(data.fullCommentary)) {
        if (queue.get(delivery.key)?.text !== delivery.text) queueChanged = true;
        queue.set(delivery.key, delivery);
      }
      while (queue.size > 2000) queue.delete(queue.keys().next().value as string);
      commentaryQueues.current.set(queueKey, queue);
      if (commentaryQueues.current.size > 8) commentaryQueues.current.delete(commentaryQueues.current.keys().next().value as string);
      if (queueChanged) {
        try {
          localStorage.setItem(commentaryQueueStorageKey, JSON.stringify([...commentaryQueues.current].map(([key, deliveries]) => ({ key, deliveries: [...deliveries.values()] }))));
        } catch { /* keep the in-memory queue if local storage is unavailable */ }
      }
      setCommentaryHistory([...queue.values()].sort((left, right) => left.totalBalls - right.totalBalls));
      const summary = `${data.inningsNumber ?? ''}|${data.battingTeam}|${data.bowlingTeam}|${data.overs}|${data.striker}|${data.latestTextEvent}`;
      if (summary !== lastFeedSummary.current) {
        addLog(`Score feed received: ${data.battingTeam || 'unknown batting team'} ${data.runs}/${data.wickets} vs ${data.bowlingTeam || 'unknown bowling team'}, ${data.overs} overs${data.latestTextEvent ? `, ${data.latestTextEvent}` : ''}`);
        lastFeedSummary.current = summary;
      }

      const outcome = interpretCricHeroesTextEvent(data.latestTextEvent);
      if (!outcome || !onBallRef.current || data.scorecardSelection) return;
      const ballKey = `${data.battingTeam}|${data.overs}|${data.striker}|${data.ballsFaced}|${data.sixes}|${data.latestTextEvent}`;
      if (ballKey === lastBallKey.current) return;
      if (onBallRef.current({ data, outcome }) !== false) lastBallKey.current = ballKey;
    };

    window.addEventListener('message', handleMessage);
    const pingExtension = () => window.postMessage({ source: 'CRICHEROES_SYNC_BRIDGE_PING' }, window.location.origin);
    pingExtension();
    const pingInterval = window.setInterval(pingExtension, 3000);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.clearInterval(pingInterval);
      if (bridgeTimeout !== undefined) window.clearTimeout(bridgeTimeout);
    };
  }, [appendLog]);

  const clearLogs = () => setLogs([]);

  return { latest, scorecards, teamRosters, logs, bridgeReady, clearLogs, appendLog, commentaryHistory };
}