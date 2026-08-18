// ============================================================================
// CRICHEROES READER — Reads a public CricHeroes scorecard URL and converts it
// into our scoring model so a scorer can mirror an external match.
//
// CricHeroes does not expose a public CORS-enabled API, so the page is fetched
// through a proxy chain. Parsing is layered so it survives markup changes:
//   1. direct JSON payload (when a custom proxy already returns JSON)
//   2. embedded __NEXT_DATA__ / __INITIAL_STATE__ JSON inside the HTML
//   3. plain-text fallback (works with text-extraction proxies)
// ============================================================================

import type {
  LiveScore, LiveBatsman, LiveBowler, BatsmanInnings, BowlerInnings,
} from '../../types/scoring';

export interface CricHeroesBatsman {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  dismissal: string;
  isOut: boolean;
}

export interface CricHeroesBowler {
  name: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
}

export interface CricHeroesInnings {
  teamName: string;
  runs: number;
  wickets: number;
  overs: number;
  batsmen: CricHeroesBatsman[];
  bowlers: CricHeroesBowler[];
}

export interface CricHeroesSnapshot {
  sourceMatchId: string;
  sourceUrl: string;
  title: string;
  venue?: string;
  status?: string;
  result?: string;
  innings: CricHeroesInnings[];
  fetchedAt: number;
  parseMode: 'json' | 'embedded' | 'text';
  warnings: string[];
}

/** Proxies tried in order. `{url}` is replaced with the encoded target URL. */
const DEFAULT_PROXIES = [
  'https://api.allorigins.win/raw?url={url}',
  'https://corsproxy.io/?{url}',
  'https://r.jina.ai/{rawUrl}',
];

const num = (value: unknown): number => {
  const n = Number(asText(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Stringify only primitives — objects become '' rather than '[object Object]'. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return '';
}

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();

const SEPARATOR_CHARS = new Set(['•', '|', ',', '-', ':']);

function trimSeparators(value: string): string {
  let end = value.length;
  while (end > 0 && SEPARATOR_CHARS.has(value[end - 1])) end--;
  return value.slice(0, end).trim();
}

const NUMERIC_TOKEN = /^\d{1,3}(?:\.\d{1,2})?$/;

/** Split "Player Name 42 30 5 1 140.00" into its name and numeric cells. */
function splitNameAndNumbers(line: string): { name: string; cells: number[] } | null {
  if (line.length > 80) return null;
  const tokens = line.split(' ').filter(Boolean);
  if (tokens.length < 3) return null;

  let firstNumericIndex = tokens.length;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (NUMERIC_TOKEN.test(tokens[i])) firstNumericIndex = i;
    else break;
  }

  const nameTokens = tokens.slice(0, firstNumericIndex);
  const cells = tokens.slice(firstNumericIndex).map(num);
  if (nameTokens.length === 0 || cells.length === 0) return null;

  const name = clean(nameTokens.join(' '));
  if (name.length < 2 || name.length > 39) return null;
  return { name, cells };
}

/** Extract the numeric match id from any CricHeroes scorecard/match URL. */
export function extractCricHeroesMatchId(urlOrId: string): string {
  const raw = urlOrId.trim();
  if (/^\d+$/.test(raw)) return raw;
  const patterns = [
    /cricheroes\.com\/scorecard\/(\d+)/i,
    /cricheroes\.in\/scorecard\/(\d+)/i,
    /cricheroes\.com\/match\/(\d+)/i,
    /\/scorecard\/(\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(raw);
    if (match) return match[1];
  }
  return '';
}

export function isValidCricHeroesUrl(url: string): boolean {
  return extractCricHeroesMatchId(url).length > 0;
}

class CricHeroesReader {
  private proxies: string[] = [...DEFAULT_PROXIES];

  /** Allow an admin-configured proxy to take priority over the public ones. */
  setPreferredProxy(proxyTemplate?: string): void {
    const trimmed = (proxyTemplate || '').trim();
    this.proxies = trimmed
      ? [trimmed.includes('{url}') || trimmed.includes('{rawUrl}') ? trimmed : `${trimmed}{url}`, ...DEFAULT_PROXIES]
      : [...DEFAULT_PROXIES];
  }

  private buildProxyUrl(template: string, target: string): string {
    return template
      .replace('{url}', encodeURIComponent(target))
      .replace('{rawUrl}', target.replace(/^https?:\/\//, ''));
  }

  private async fetchRaw(sourceUrl: string): Promise<string> {
    const failures: string[] = [];
    for (const template of this.proxies) {
      try {
        const proxied = this.buildProxyUrl(template, sourceUrl);
        const response = await fetch(proxied, { headers: { accept: 'text/html,application/json,text/plain' } });
        if (!response.ok) {
          failures.push(`${new URL(proxied).host} -> HTTP ${response.status}`);
          continue;
        }
        const body = await response.text();
        if (body && body.length > 200) return body;
        failures.push(`${new URL(proxied).host} -> empty body`);
      } catch (err) {
        failures.push(String(err));
      }
    }
    throw new Error(`Could not read CricHeroes page. Tried ${this.proxies.length} proxies. ${failures.join(' | ')}`);
  }

  /** Fetch + parse a CricHeroes scorecard URL into a normalized snapshot. */
  async readScorecard(sourceUrl: string): Promise<CricHeroesSnapshot> {
    const sourceMatchId = extractCricHeroesMatchId(sourceUrl);
    if (!sourceMatchId) throw new Error('Invalid CricHeroes URL — expected .../scorecard/<matchId>/...');

    const raw = await this.fetchRaw(sourceUrl);
    const snapshot = this.parse(raw, sourceUrl, sourceMatchId);
    if (snapshot.innings.length === 0) {
      throw new Error('Scorecard was reachable but no innings could be parsed. Open the match summary page and retry.');
    }
    return snapshot;
  }

  private parse(raw: string, sourceUrl: string, sourceMatchId: string): CricHeroesSnapshot {
    const embedded = this.extractEmbeddedJson(raw);
    if (embedded) {
      const fromJson = this.parseFromJson(embedded, sourceUrl, sourceMatchId);
      if (fromJson && fromJson.innings.length > 0) return fromJson;
    }
    return this.parseFromText(raw, sourceUrl, sourceMatchId);
  }

  private extractEmbeddedJson(raw: string): Record<string, unknown> | null {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed) as Record<string, unknown>;
      } catch { /* not raw JSON, continue */ }
    }

    const scriptPatterns = [
      /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
      /__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/i,
      /window\.__DATA__\s*=\s*({[\s\S]*?});?\s*<\/script>/i,
    ];
    for (const pattern of scriptPatterns) {
      const match = pattern.exec(raw);
      if (!match) continue;
      try {
        return JSON.parse(match[1]) as Record<string, unknown>;
      } catch { /* try next */ }
    }
    return null;
  }

  /** Walk an arbitrary JSON tree and pick the first node that looks like innings data. */
  private parseFromJson(root: Record<string, unknown>, sourceUrl: string, sourceMatchId: string): CricHeroesSnapshot | null {
    const inningsNodes: Record<string, unknown>[] = [];
    const seen = new Set<unknown>();

    const visit = (node: unknown, depth: number) => {
      if (!node || typeof node !== 'object' || depth > 8 || seen.has(node)) return;
      seen.add(node);

      if (Array.isArray(node)) {
        node.forEach(item => visit(item, depth + 1));
        return;
      }

      const obj = node as Record<string, unknown>;
      const hasScore = 'total_run' in obj || 'total_runs' in obj || 'runs' in obj;
      const hasWickets = 'total_wicket' in obj || 'total_wickets' in obj || 'wickets' in obj;
      const hasOvers = 'overs' in obj || 'total_overs' in obj || 'over' in obj;
      if (hasScore && hasWickets && hasOvers) inningsNodes.push(obj);

      Object.values(obj).forEach(value => visit(value, depth + 1));
    };
    visit(root, 0);

    if (inningsNodes.length === 0) return null;

    const innings: CricHeroesInnings[] = inningsNodes.slice(0, 2).map(node => ({
      teamName: clean(firstText(node.team_name, node.batting_team_name, node.name) || 'Team'),
      runs: num(node.total_run ?? node.total_runs ?? node.runs),
      wickets: num(node.total_wicket ?? node.total_wickets ?? node.wickets),
      overs: num(node.overs ?? node.total_overs ?? node.over),
      batsmen: this.readBatsmenFromJson(node),
      bowlers: this.readBowlersFromJson(node),
    }));

    return {
      sourceMatchId,
      sourceUrl,
      title: clean(firstText((root as { title?: string }).title) || 'CricHeroes match'),
      innings,
      fetchedAt: Date.now(),
      parseMode: 'embedded',
      warnings: [],
    };
  }

  private readBatsmenFromJson(node: Record<string, unknown>): CricHeroesBatsman[] {
    const list = (node.batsman ?? node.batsmen ?? node.batting ?? []) as Record<string, unknown>[];
    if (!Array.isArray(list)) return [];
    return list.map(b => {
      const dismissal = clean(firstText(b.out_string, b.how_out, b.dismissal) || 'not out');
      return {
        name: clean(firstText(b.player_name, b.name) || 'Unknown'),
        runs: num(b.runs ?? b.run),
        balls: num(b.balls ?? b.ball),
        fours: num(b.fours ?? b['4s']),
        sixes: num(b.sixes ?? b['6s']),
        strikeRate: num(b.strike_rate ?? b.sr),
        dismissal,
        isOut: typeof b.is_out === 'boolean' ? b.is_out : dismissal.toLowerCase() !== 'not out',
      };
    });
  }

  private readBowlersFromJson(node: Record<string, unknown>): CricHeroesBowler[] {
    const list = (node.bowler ?? node.bowlers ?? node.bowling ?? []) as Record<string, unknown>[];
    if (!Array.isArray(list)) return [];
    return list.map(b => ({
      name: clean(firstText(b.player_name, b.name) || 'Unknown'),
      overs: num(b.overs ?? b.over),
      maidens: num(b.maidens ?? b.maiden),
      runs: num(b.runs ?? b.run ?? b.runs_conceded),
      wickets: num(b.wickets ?? b.wicket),
      economy: num(b.economy ?? b.eco),
    }));
  }

  /**
   * Text fallback. Works on the readable text produced by text-extraction
   * proxies and on tag-stripped HTML.
   */
  private parseFromText(raw: string, sourceUrl: string, sourceMatchId: string): CricHeroesSnapshot {
    const warnings: string[] = [];
    const lines = this.toLines(raw);

    const innings = this.readTotalsFromLines(lines);
    const { batsmen, bowlers } = this.readPlayerRowsFromLines(lines);

    if (innings.length > 0) {
      innings[0].batsmen = batsmen.slice(0, 11);
      innings[0].bowlers = bowlers.slice(0, 8);
      if (innings.length > 1) {
        innings[1].batsmen = batsmen.slice(11, 22);
        innings[1].bowlers = bowlers.slice(8, 16);
      }
    }

    if (batsmen.length === 0) warnings.push('Batting rows could not be parsed — totals only.');
    if (bowlers.length === 0) warnings.push('Bowling rows could not be parsed — totals only.');

    const titleLine = lines.find(l => /\bvs\b/i.test(l)) || 'CricHeroes match';
    const venueLine = lines.find(l => /ground|stadium|turf|academy/i.test(l));

    return {
      sourceMatchId,
      sourceUrl,
      title: clean(titleLine).slice(0, 120),
      venue: venueLine ? clean(venueLine).slice(0, 80) : undefined,
      innings,
      fetchedAt: Date.now(),
      parseMode: 'text',
      warnings,
    };
  }

  private toLines(raw: string): string[] {
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^<>]*>/g, '\n')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&');
    return text.split('\n').map(clean).filter(Boolean);
  }

  /** Team totals look like "Muthulapuram MCC 154/6 (20)" or "MCC 154-6 (20.0 ov)". */
  private readTotalsFromLines(lines: string[]): CricHeroesInnings[] {
    const scorePattern = /(\d{1,3})\s*[/-]\s*(\d{1,2})\s*\(\s*(\d{1,2}(?:\.\d)?)/;
    const innings: CricHeroesInnings[] = [];

    for (const line of lines) {
      if (innings.length === 2 || line.length > 90) continue;
      const match = scorePattern.exec(line);
      if (!match?.index) continue;

      const teamName = trimSeparators(clean(line.slice(0, match.index)));
      if (teamName.length < 2 || teamName.length > 44 || /^\d/.test(teamName)) continue;
      if (innings.some(i => i.teamName.toLowerCase() === teamName.toLowerCase())) continue;

      innings.push({
        teamName,
        runs: num(match[1]),
        wickets: num(match[2]),
        overs: num(match[3]),
        batsmen: [],
        bowlers: [],
      });
    }
    return innings;
  }

  /** Stat rows are "Name n n n n n" — batting has 5 numbers, bowling has 5 with overs first. */
  private readPlayerRowsFromLines(lines: string[]): { batsmen: CricHeroesBatsman[]; bowlers: CricHeroesBowler[] } {
    const batsmen: CricHeroesBatsman[] = [];
    const bowlers: CricHeroesBowler[] = [];

    for (const line of lines) {
      const row = splitNameAndNumbers(line);
      if (row?.cells.length !== 5) continue;

      const { name, cells } = row;
      const [a, b, c, d, e] = cells;
      const isBowlingShape = a <= 50 && b <= 10 && d <= 10 && e <= 36 && c >= d;

      if (isBowlingShape && bowlers.length < 16) {
        bowlers.push({ name, overs: a, maidens: b, runs: c, wickets: d, economy: e });
        continue;
      }
      if (e <= 900 && batsmen.length < 22) {
        batsmen.push({
          name,
          runs: a,
          balls: b,
          fours: c,
          sixes: d,
          strikeRate: e,
          dismissal: 'not out',
          isOut: false,
        });
      }
    }
    return { batsmen, bowlers };
  }

  /** Map a parsed snapshot onto our LiveScore shape for a local match. */
  toLiveScore(
    snapshot: CricHeroesSnapshot,
    target: { matchId: string; teamAId: string; teamAName: string; teamBId: string; teamBName: string; maxOvers: number },
    inningsIndex = 0,
  ): LiveScore | null {
    const innings = snapshot.innings[inningsIndex];
    if (!innings) return null;

    const matchesTeamA = this.namesMatch(innings.teamName, target.teamAName);
    const battingTeamId = matchesTeamA ? target.teamAId : target.teamBId;
    const bowlingTeamId = matchesTeamA ? target.teamBId : target.teamAId;

    const toId = (name: string) => `ch_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

    const allBatsmen: BatsmanInnings[] = innings.batsmen.map((b, i) => ({
      playerId: toId(b.name),
      playerName: b.name,
      runs: b.runs,
      balls: b.balls,
      fours: b.fours,
      sixes: b.sixes,
      strikeRate: b.strikeRate,
      dismissal: b.dismissal,
      isOut: b.isOut,
      order: i + 1,
    }));

    const allBowlers: BowlerInnings[] = innings.bowlers.map(b => ({
      playerId: toId(b.name),
      playerName: b.name,
      overs: b.overs,
      maidens: b.maidens,
      runs: b.runs,
      wickets: b.wickets,
      economy: b.economy,
      wides: 0,
      noBalls: 0,
      dots: 0,
    }));

    const notOut = allBatsmen.filter(b => !b.isOut);
    const makeLiveBatsman = (source: BatsmanInnings | undefined, onStrike: boolean): LiveBatsman => ({
      playerId: source?.playerId || (onStrike ? 'ch_striker' : 'ch_nonstriker'),
      playerName: source?.playerName || '—',
      runs: source?.runs || 0,
      balls: source?.balls || 0,
      fours: source?.fours || 0,
      sixes: source?.sixes || 0,
      strikeRate: source?.strikeRate || 0,
      isOnStrike: onStrike,
    });

    const topBowler = [...allBowlers].sort((a, b) => b.overs - a.overs)[0];
    const currentBowler: LiveBowler = {
      playerId: topBowler?.playerId || 'ch_bowler',
      playerName: topBowler?.playerName || '—',
      overs: topBowler?.overs || 0,
      maidens: topBowler?.maidens || 0,
      runs: topBowler?.runs || 0,
      wickets: topBowler?.wickets || 0,
      economy: topBowler?.economy || 0,
      dots: 0,
    };

    const ballsBowled = Math.floor(innings.overs) * 6 + Math.round((innings.overs % 1) * 10);
    const runRate = ballsBowled > 0 ? Math.round((innings.runs / ballsBowled) * 6 * 100) / 100 : 0;
    const firstInningsRuns = inningsIndex === 1 ? snapshot.innings[0]?.runs : undefined;
    const chaseTarget = firstInningsRuns !== undefined ? firstInningsRuns + 1 : undefined;

    return {
      matchId: target.matchId,
      currentInnings: (inningsIndex + 1) as 1 | 2,
      battingTeamId,
      bowlingTeamId,
      runs: innings.runs,
      wickets: innings.wickets,
      overs: innings.overs,
      runRate,
      requiredRate: chaseTarget
        ? this.requiredRate(chaseTarget, innings.runs, ballsBowled, target.maxOvers)
        : undefined,
      target: chaseTarget,
      currentBatsmen: [makeLiveBatsman(notOut[0], true), makeLiveBatsman(notOut[1], false)],
      currentBowler,
      lastBall: '0',
      lastBallRuns: 0,
      currentOverBalls: [],
      recentOvers: [],
      partnership: { runs: 0, balls: 0 },
      lastUpdated: Date.now(),
      isPowerplay: innings.overs < 6,
      powerplayOvers: 6,
      isFreehit: false,
      allBatsmen,
      allBowlers,
    };
  }

  private requiredRate(target: number, runs: number, ballsBowled: number, maxOvers: number): number {
    const ballsLeft = maxOvers * 6 - ballsBowled;
    if (ballsLeft <= 0) return 0;
    return Math.round(((target - runs) / ballsLeft) * 6 * 100) / 100;
  }

  private namesMatch(a: string, b: string): boolean {
    const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
  }
}

export const cricHeroesReader = new CricHeroesReader();
