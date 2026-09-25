import { useEffect, useRef, useState } from 'react';
import type { BallOutcome } from '../types/scoring';

export interface CricHeroesSyncData {
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

export function interpretCricHeroesTextEvent(text: string): BallOutcome | null {
  const event = text.trim().toUpperCase();
  if (!event) return null;
  if (/\bNO[ -]?BALLS?\b|\bNOB\b/.test(event)) return 'NB';
  if (/\bWIDES?\b|\bWD\b/.test(event)) return 'WD';
  if (/\bOUT\b|\bWICKET\b/.test(event)) return 'W';
  if (/\bSIX(?:ES)?\b|\b6\s*RUNS?\b/.test(event)) return '6';
  if (/\bFOUR(?:S)?\b|\b4\s*RUNS?\b/.test(event)) return '4';
  const runs = event.match(/\b([0-6])\s*RUNS?\b/);
  return runs ? runs[1] as BallOutcome : null;
}

function parseSyncData(value: unknown): CricHeroesSyncData | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (typeof data.latestTextEvent !== 'string') return null;
  const batsmen = Array.isArray(data.batsmen) ? data.batsmen : [];
  const bowlers = Array.isArray(data.bowlers) ? data.bowlers : [];
  return {
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

export function useCricHeroesSyncAdapter(onBall?: (event: CricHeroesBallEvent) => boolean | void) {
  const [latest, setLatest] = useState<CricHeroesSyncData | null>(null);
  const [logs, setLogs] = useState<CricHeroesSyncLogEntry[]>([]);
  const lastBallKey = useRef('');
  const lastFeedSummary = useRef('');
  const onBallRef = useRef(onBall);

  useEffect(() => {
    onBallRef.current = onBall;
  }, [onBall]);

  useEffect(() => {
    const addLog = (message: string) => {
      setLogs(previous => [...previous.slice(-19), { timestamp: Date.now(), message }]);
    };

    addLog(`App listener ready at ${window.location.origin}`);
    const handleMessage = (event: MessageEvent) => {
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
      if (!event.data || event.data.source !== 'CRICHEROES_SYNC_ADAPTER') return;
      const data = parseSyncData(event.data.data);
      if (!data) {
        addLog('Rejected extension message: payload is missing latestTextEvent.');
        return;
      }
      setLatest(data);
      const summary = `${data.battingTeam}|${data.bowlingTeam}|${data.overs}|${data.striker}|${data.latestTextEvent}`;
      if (summary !== lastFeedSummary.current) {
        addLog(`Score feed received: ${data.battingTeam || 'unknown batting team'} ${data.runs}/${data.wickets} vs ${data.bowlingTeam || 'unknown bowling team'}, ${data.overs} overs${data.latestTextEvent ? `, ${data.latestTextEvent}` : ''}`);
        lastFeedSummary.current = summary;
      }

      const outcome = interpretCricHeroesTextEvent(data.latestTextEvent);
      if (!outcome || !onBallRef.current) return;
      const ballKey = `${data.battingTeam}|${data.overs}|${data.striker}|${data.ballsFaced}|${data.sixes}|${data.latestTextEvent}`;
      if (ballKey === lastBallKey.current) return;
      if (onBallRef.current({ data, outcome }) !== false) lastBallKey.current = ballKey;
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return { latest, logs };
}