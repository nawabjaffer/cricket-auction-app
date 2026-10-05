import { useEffect, useMemo, useState } from 'react';
import { onValue, ref, type Database } from 'firebase/database';
import { useSearchParams } from 'react-router-dom';
import { IoCalendarOutline, IoFootballOutline, IoShieldCheckmarkOutline, IoStatsChartOutline, IoTrophyOutline, IoPencilOutline, IoSaveOutline, IoLockClosedOutline } from 'react-icons/io5';
import { SortableColumnHeader, useSortableRows } from '../components/SortableTable';
import { getTenantSlugFromPath } from '../hooks/useTenantNavigate';
import { realtimeSync } from '../services/realtimeSync';
import { scoringService } from '../services/scoring';
import { tenantPath } from '../services/tenantPath';
import { MATCH_STAGE_LABELS } from '../types/scoring';
import type { BallEvent, BatsmanInnings, BowlerInnings, Innings, LiveScore, MatchScore, MatchSetup, MatchStatsSnapshot, ScoringOverlayConfig } from '../types/scoring';
import { buildPointsTableStandings, buildPoolAssignments, type PointsTableMatch } from '../utils/pointsTable';
import { buildCorrectedFinalScore, buildPublicTournamentPlayers, publicMatchResult, filterPublicMatches, type PublicMatchFilter, validatePublicInningsCorrection, verifySuperAdminMobileCredentials } from '../utils/publicScoreboard';
import { PlayerImage } from '../components/PlayerImage/PlayerImage';
import { reconcileEditedLiveScore } from '../utils/scorecardCorrections';
import './PublicCricketScoreboardPage.css';

type PublicScoreboardTab = 'summary' | 'scorecards' | 'commentary' | 'standings';
type BattingSortColumn = 'name' | 'runs' | 'balls' | 'fours' | 'sixes' | 'strikeRate' | 'dismissal';
type BowlingSortColumn = 'name' | 'overs' | 'maidens' | 'runs' | 'wickets' | 'economy';
type StandingsSortColumn = 'teamName' | 'played' | 'won' | 'lost' | 'nrr' | 'points';

function formatOvers(overs: number): string {
  const value = Number.isFinite(overs) ? Math.max(0, overs) : 0;
  return `${Math.floor(value)}.${Math.round((value % 1) * 10)}`;
}

function summarizeBall(event: BallEvent, batterName: string, bowlerName: string): string {
  const matchup = `${bowlerName} to ${batterName}`;
  if (event.isWicket) {
    const dismissal = event.wicket?.dismissalType?.replace(/_/g, ' ') || 'wicket';
    const fielder = event.wicket?.fielderName ? `, ${event.wicket.fielderName}` : '';
    return `${matchup} · WICKET — ${batterName} ${dismissal}${fielder}`;
  }
  if (event.extraType) {
    const extraName = event.extraType === 'noball' ? 'No ball' : event.extraType === 'wide' ? 'Wide' : event.extraType === 'legbye' ? 'Leg bye' : event.extraType === 'bye' ? 'Bye' : 'Penalty';
    return `${matchup} · ${extraName}${event.runs > 0 ? `, ${event.runs} run${event.runs === 1 ? '' : 's'}` : ''}`;
  }
  if (event.batsmanRuns === 4) return `${matchup} · FOUR`;
  if (event.batsmanRuns === 6) return `${matchup} · SIX`;
  return `${matchup} · ${event.batsmanRuns === 0 ? 'Dot ball' : `${event.batsmanRuns} run${event.batsmanRuns === 1 ? '' : 's'}`}`;
}

function BattingScorecard({ innings, teamName }: { innings: Innings; teamName: string }) {
  const batting = useSortableRows(innings.batsmen || [], (batter, column: BattingSortColumn) => {
    switch (column) {
      case 'name': return batter.playerName;
      case 'runs': return batter.runs;
      case 'balls': return batter.balls;
      case 'fours': return batter.fours;
      case 'sixes': return batter.sixes;
      case 'strikeRate': return batter.strikeRate;
      case 'dismissal': return batter.dismissal;
    }
  });
  const bowling = useSortableRows(innings.bowlers || [], (bowler, column: BowlingSortColumn) => {
    switch (column) {
      case 'name': return bowler.playerName;
      case 'overs': return bowler.overs;
      case 'maidens': return bowler.maidens;
      case 'runs': return bowler.runs;
      case 'wickets': return bowler.wickets;
      case 'economy': return bowler.economy;
    }
  });

  return (
    <article className="public-scoreboard__innings-card">
      <header className="public-scoreboard__innings-header">
        <div>
          <span>INNINGS {innings.number}</span>
          <h3>{teamName}</h3>
        </div>
        <strong>{innings.totalRuns}/{innings.totalWickets}<small> ({formatOvers(innings.totalOvers)} ov)</small></strong>
      </header>
      <div className="public-scoreboard__score-table-wrap">
        <table className="public-scoreboard__table">
          <thead><tr>
            <SortableColumnHeader column="name" label="Batter" sortState={batting.sortState} onSort={batting.requestSort} />
            <SortableColumnHeader column="runs" label="R" sortState={batting.sortState} onSort={batting.requestSort} />
            <SortableColumnHeader column="balls" label="B" sortState={batting.sortState} onSort={batting.requestSort} />
            <SortableColumnHeader column="fours" label="4s" sortState={batting.sortState} onSort={batting.requestSort} />
            <SortableColumnHeader column="sixes" label="6s" sortState={batting.sortState} onSort={batting.requestSort} />
            <SortableColumnHeader column="strikeRate" label="SR" sortState={batting.sortState} onSort={batting.requestSort} />
            <SortableColumnHeader column="dismissal" label="Dismissal" sortState={batting.sortState} onSort={batting.requestSort} />
          </tr></thead>
          <tbody>
            {batting.sortedRows.map(batter => <tr key={batter.playerId}>
              <td><strong>{batter.playerName}</strong></td><td>{batter.runs}</td><td>{batter.balls}</td><td>{batter.fours}</td><td>{batter.sixes}</td><td>{Number(batter.strikeRate || 0).toFixed(1)}</td><td>{batter.dismissal || (batter.isOut ? 'Out' : 'not out')}</td>
            </tr>)}
            {!innings.batsmen?.length && <tr><td colSpan={7}>No batting figures recorded.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="public-scoreboard__innings-extras">
        Extras {innings.extras.total} <span>(WD {innings.extras.wides}, NB {innings.extras.noBalls}, B {innings.extras.byes}, LB {innings.extras.legByes})</span>
      </div>
      <h4 className="public-scoreboard__subheading">Bowling</h4>
      <div className="public-scoreboard__score-table-wrap">
        <table className="public-scoreboard__table public-scoreboard__table--bowling">
          <thead><tr>
            <SortableColumnHeader column="name" label="Bowler" sortState={bowling.sortState} onSort={bowling.requestSort} />
            <SortableColumnHeader column="overs" label="O" sortState={bowling.sortState} onSort={bowling.requestSort} />
            <SortableColumnHeader column="maidens" label="M" sortState={bowling.sortState} onSort={bowling.requestSort} />
            <SortableColumnHeader column="runs" label="R" sortState={bowling.sortState} onSort={bowling.requestSort} />
            <SortableColumnHeader column="wickets" label="W" sortState={bowling.sortState} onSort={bowling.requestSort} />
            <SortableColumnHeader column="economy" label="Econ" sortState={bowling.sortState} onSort={bowling.requestSort} />
          </tr></thead>
          <tbody>
            {bowling.sortedRows.map(bowler => <tr key={bowler.playerId}>
              <td><strong>{bowler.playerName}</strong></td><td>{formatOvers(bowler.overs)}</td><td>{bowler.maidens}</td><td>{bowler.runs}</td><td>{bowler.wickets}</td><td>{Number(bowler.economy || 0).toFixed(2)}</td>
            </tr>)}
            {!innings.bowlers?.length && <tr><td colSpan={6}>No bowling figures recorded.</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function PublicPointsTable({ matches, teams, poolSettings }: {
  matches: PointsTableMatch[];
  teams: { id: string; name: string; logoUrl?: string }[];
  poolSettings?: ScoringOverlayConfig['pointsTablePools'];
}) {
  const standings = buildPointsTableStandings(matches, teams);
  const table = useSortableRows(standings, (team, column: StandingsSortColumn) => team[column], {
    column: 'points',
    direction: 'descending',
  });
  const poolPreview = poolSettings
    ? buildPoolAssignments(
      standings.map(team => ({ id: team.teamId, name: team.teamName })),
      poolSettings.poolCount,
      poolSettings.teamsPerPool,
      poolSettings.teamAssignments,
    )
    : null;
  const sections = poolPreview
    ? [
      ...poolPreview.poolIds.map((poolId, index) => ({
        id: poolId,
        title: `Pool ${String.fromCharCode(65 + index)}`,
        teams: standings.filter(team => poolPreview.assignments[team.teamId] === poolId),
      })),
      ...(poolPreview.unassignedTeamIds.length > 0 ? [{
        id: 'unassigned',
        title: 'Unassigned',
        teams: standings.filter(team => poolPreview.unassignedTeamIds.includes(team.teamId)),
      }] : []),
    ]
    : [{ id: 'overall', title: 'Overall standings', teams: standings }];

  if (standings.length === 0) return <div className="public-scoreboard__empty">No tournament teams are available yet.</div>;

  return (
    <div className="public-scoreboard__standings-grid">
      {sections.map(section => {
        const teamIds = new Set(section.teams.map(team => team.teamId));
        const sectionRows = table.sortedRows.filter(team => teamIds.has(team.teamId));
        const qualifiers = new Set(section.teams.slice(0, 2).map(team => team.teamId));
        return (
          <section className="public-scoreboard__pool-section" key={section.id}>
            <h3>{section.title}</h3>
            <div className="public-scoreboard__score-table-wrap">
              <table className="public-scoreboard__table public-scoreboard__standings-table">
                <thead><tr>
                  <th>#</th>
                  <SortableColumnHeader column="teamName" label="Team" sortState={table.sortState} onSort={table.requestSort} />
                  <SortableColumnHeader column="played" label="P" sortState={table.sortState} onSort={table.requestSort} />
                  <SortableColumnHeader column="won" label="W" sortState={table.sortState} onSort={table.requestSort} />
                  <SortableColumnHeader column="lost" label="L" sortState={table.sortState} onSort={table.requestSort} />
                  <SortableColumnHeader column="nrr" label="NRR" sortState={table.sortState} onSort={table.requestSort} />
                  <SortableColumnHeader column="points" label="Pts" sortState={table.sortState} onSort={table.requestSort} />
                </tr></thead>
                <tbody>
                  {sectionRows.map((team, index) => <tr key={team.teamId} className={qualifiers.has(team.teamId) ? 'public-scoreboard__standing-qualifier' : ''}>
                    <td>{index + 1}</td><td><strong>{team.teamName}</strong></td><td>{team.played}</td><td>{team.won}</td><td>{team.lost}</td>
                    <td>{team.nrr > 0 ? '+' : ''}{team.nrr.toFixed(3)}</td><td><strong>{team.points}</strong></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MatchAwards({ innings, stats }: { innings: Innings[]; stats: MatchStatsSnapshot | null }) {
  const batters = innings.flatMap(score => (score.batsmen || []).map(player => ({ ...player, teamId: score.battingTeamId })));
  const bowlers = innings.flatMap(score => (score.bowlers || []).map(player => ({ ...player, teamId: score.bowlingTeamId })));
  const mvp = stats?.mvpLeaderboard?.find(player => player.total > 0)
    || stats?.mvpPoints?.find(player => player.totalPoints > 0);
  const bestBatter = stats?.topRunScorers?.[0] || [...batters].sort((left, right) => right.runs - left.runs || left.balls - right.balls)[0];
  const bestBowler = stats?.topWicketTakers?.[0] || [...bowlers].sort((left, right) => right.wickets - left.wickets || left.runs - right.runs)[0];
  const mostSixes = stats?.topSixes?.[0] || [...batters].sort((left, right) => right.sixes - left.sixes)[0];
  const mostFours = stats?.topFours?.[0] || [...batters].sort((left, right) => right.fours - left.fours)[0];
  const awards = [
    { title: 'Player of the Match', name: mvp?.playerName, detail: mvp ? `${'total' in mvp ? mvp.total : mvp.totalPoints} MVP points` : '' },
    { title: 'Best Batter', name: bestBatter?.playerName, detail: bestBatter ? `${bestBatter.runs} runs · ${bestBatter.balls} balls` : '' },
    { title: 'Best Bowler', name: bestBowler?.playerName, detail: bestBowler ? `${bestBowler.wickets}/${bestBowler.runs}` : '' },
    { title: 'Most Sixes', name: mostSixes?.sixes ? mostSixes.playerName : undefined, detail: mostSixes?.sixes ? `${mostSixes.sixes} sixes` : '' },
    { title: 'Most Fours', name: mostFours?.fours ? mostFours.playerName : undefined, detail: mostFours?.fours ? `${mostFours.fours} fours` : '' },
  ];
  const hasAwards = awards.some(award => Boolean(award.name));

  return (
    <section className="public-scoreboard__awards-section">
      <div className="public-scoreboard__section-heading"><div><span>MATCH AWARDS</span><h2>Players of the Match</h2></div></div>
      {hasAwards ? (
        <div className="public-scoreboard__award-grid">
          {awards.filter(award => award.name).map(award => <article className="public-scoreboard__award" key={award.title}>
            <span>{award.title}</span><strong>{award.name}</strong><small>{award.detail}</small>
          </article>)}
        </div>
      ) : <div className="public-scoreboard__empty">Match awards will appear as scorecard data is recorded.</div>}
    </section>
  );
}

function cloneInnings(innings: Innings[]): Innings[] {
  return innings.map(entry => ({
    ...entry,
    extras: { ...entry.extras },
    batsmen: entry.batsmen.map(batter => ({ ...batter })),
    bowlers: entry.bowlers.map(bowler => ({ ...bowler })),
    fallOfWickets: entry.fallOfWickets.map(wicket => ({ ...wicket })),
    overs: entry.overs.map(over => ({ ...over, balls: [...over.balls] })),
  }));
}

function correctedEconomy(overs: number, runs: number): number {
  const legalBalls = Math.floor(overs) * 6 + Math.min(5, Math.max(0, Math.round((overs % 1) * 10)));
  return legalBalls ? Math.round((runs / legalBalls) * 600) / 100 : 0;
}

function PublicScorecardEditor({ match, innings, live, finalScore, onClose, onSave }: {
  match: MatchSetup;
  innings: Innings[];
  live: LiveScore | null;
  finalScore: MatchScore | null;
  onClose: () => void;
  onSave: (draft: Innings[], liveScore?: LiveScore, final?: MatchScore) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => cloneInnings(innings));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const setInnings = (number: 1 | 2, update: (entry: Innings) => Innings) => {
    setDraft(current => current.map(entry => entry.number === number ? update(entry) : entry));
  };
  const updateBatter = (number: 1 | 2, index: number, update: Partial<BatsmanInnings>) => {
    setInnings(number, entry => {
      const batsmen = entry.batsmen.map((batter, row) => row === index ? { ...batter, ...update } : batter);
      const batsmanRuns = batsmen.reduce((total, batter) => total + batter.runs, 0);
      return {
        ...entry,
        batsmen,
        totalRuns: batsmanRuns + entry.extras.total,
        totalWickets: batsmen.filter(batter => batter.isOut).length,
      };
    });
  };
  const updateBowler = (number: 1 | 2, index: number, update: Partial<BowlerInnings>) => {
    setInnings(number, entry => ({
      ...entry,
      bowlers: entry.bowlers.map((bowler, row) => {
        if (row !== index) return bowler;
        const next = { ...bowler, ...update };
        if ('overs' in update || 'runs' in update) next.economy = correctedEconomy(next.overs, next.runs);
        return next;
      }),
    }));
  };
  const updateExtras = (number: 1 | 2, field: keyof Innings['extras'], value: number) => {
    setInnings(number, entry => {
      const extras = { ...entry.extras, [field]: value };
      const batsmanRuns = entry.batsmen.reduce((total, batter) => total + batter.runs, 0);
      return { ...entry, extras, totalRuns: batsmanRuns + extras.total };
    });
  };
  const save = async () => {
    const validationErrors = draft.flatMap(validatePublicInningsCorrection);
    setErrors(validationErrors);
    if (validationErrors.length) return;
    setSaving(true);
    try {
      let correctedLive: LiveScore | undefined;
      if (match.status === 'live' && live) {
        const currentInnings = draft.find(entry => entry.number === live.currentInnings);
        if (currentInnings) correctedLive = reconcileEditedLiveScore(live, currentInnings, draft.find(entry => entry.number === 1));
      }
      const correctedFinal = match.status === 'completed' && finalScore
        ? buildCorrectedFinalScore(finalScore, draft)
        : undefined;
      await onSave(draft, correctedLive, correctedFinal);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="public-scoreboard__editor-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="public-scoreboard__editor" role="dialog" aria-modal="true" aria-labelledby="scorecard-editor-title">
        <header className="public-scoreboard__editor-header">
          <div><span>SUPER ADMIN</span><h2 id="scorecard-editor-title">Edit scorecard · {match.teamA.name} vs {match.teamB.name}</h2></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close scorecard editor">×</button>
        </header>
        <p className="public-scoreboard__editor-note">Batter changes recalculate innings runs, wickets, and strike rate. Check the validation messages before saving.</p>
        <div className="public-scoreboard__editor-innings">
          {draft.map(entry => (
            <fieldset className="public-scoreboard__editor-innings-card" key={entry.number}>
              <legend>Innings {entry.number} · {entry.battingTeamId === match.teamA.id ? match.teamA.name : match.teamB.name}</legend>
              <div className="public-scoreboard__editor-totals">
                <label>Total runs<input aria-label={`Innings ${entry.number} total runs`} type="number" min={0} value={entry.totalRuns} onChange={event => setInnings(entry.number, current => ({ ...current, totalRuns: Number(event.target.value) || 0 }))} /></label>
                <label>Wickets<input aria-label={`Innings ${entry.number} wickets`} type="number" min={0} max={10} value={entry.totalWickets} onChange={event => setInnings(entry.number, current => ({ ...current, totalWickets: Number(event.target.value) || 0 }))} /></label>
                <label>Overs<input aria-label={`Innings ${entry.number} overs`} type="number" min={0} step="0.1" value={entry.totalOvers} onChange={event => setInnings(entry.number, current => ({ ...current, totalOvers: Number(event.target.value) || 0 }))} /></label>
                <label>Max overs<input aria-label={`Innings ${entry.number} max overs`} type="number" min={1} value={entry.maxOvers} onChange={event => setInnings(entry.number, current => ({ ...current, maxOvers: Number(event.target.value) || 1 }))} /></label>
              </div>
              <h3>Extras</h3>
              <div className="public-scoreboard__editor-totals">
                {(['total', 'wides', 'noBalls', 'byes', 'legByes', 'penalty'] as const).map(field => <label key={field}>{field === 'noBalls' ? 'No balls' : field === 'legByes' ? 'Leg byes' : field[0].toUpperCase() + field.slice(1)}<input type="number" min={0} value={entry.extras[field]} onChange={event => updateExtras(entry.number, field, Number(event.target.value) || 0)} /></label>)}
              </div>
              <h3>Batters</h3>
              <div className="public-scoreboard__editor-player-list">
                {entry.batsmen.map((batter, index) => <div className="public-scoreboard__editor-player" key={batter.playerId}>
                  <label>Player<input aria-label={`Innings ${entry.number} batter ${index + 1} name`} value={batter.playerName} onChange={event => updateBatter(entry.number, index, { playerName: event.target.value })} /></label>
                  <label>Runs<input type="number" min={0} value={batter.runs} onChange={event => {
                    const runs = Number(event.target.value) || 0;
                    const strikeRate = batter.balls > 0 ? Math.round(runs / batter.balls * 10000) / 100 : 0;
                    updateBatter(entry.number, index, { runs, strikeRate });
                  }} /></label>
                  <label>Balls<input type="number" min={0} value={batter.balls} onChange={event => {
                    const balls = Number(event.target.value) || 0;
                    updateBatter(entry.number, index, { balls, strikeRate: balls ? Math.round(batter.runs / balls * 10000) / 100 : 0 });
                  }} /></label>
                  <label>4s<input type="number" min={0} value={batter.fours} onChange={event => updateBatter(entry.number, index, { fours: Number(event.target.value) || 0 })} /></label>
                  <label>6s<input type="number" min={0} value={batter.sixes} onChange={event => updateBatter(entry.number, index, { sixes: Number(event.target.value) || 0 })} /></label>
                  <label>Dismissal<input value={batter.dismissal} onChange={event => updateBatter(entry.number, index, { dismissal: event.target.value, isOut: Boolean(event.target.value && event.target.value.toLowerCase() !== 'not out') })} /></label>
                  <label className="public-scoreboard__editor-checkbox"><input type="checkbox" checked={batter.isOut} onChange={event => updateBatter(entry.number, index, { isOut: event.target.checked, dismissal: event.target.checked ? batter.dismissal : 'not out' })} />Out</label>
                </div>)}
              </div>
              <h3>Bowlers</h3>
              <div className="public-scoreboard__editor-player-list">
                {entry.bowlers.map((bowler, index) => <div className="public-scoreboard__editor-player" key={bowler.playerId}>
                  <label>Player<input value={bowler.playerName} onChange={event => updateBowler(entry.number, index, { playerName: event.target.value })} /></label>
                  <label>Overs<input type="number" min={0} step="0.1" value={bowler.overs} onChange={event => updateBowler(entry.number, index, { overs: Number(event.target.value) || 0 })} /></label>
                  <label>Maidens<input type="number" min={0} value={bowler.maidens} onChange={event => updateBowler(entry.number, index, { maidens: Number(event.target.value) || 0 })} /></label>
                  <label>Runs<input type="number" min={0} value={bowler.runs} onChange={event => updateBowler(entry.number, index, { runs: Number(event.target.value) || 0 })} /></label>
                  <label>Wickets<input type="number" min={0} value={bowler.wickets} onChange={event => updateBowler(entry.number, index, { wickets: Number(event.target.value) || 0 })} /></label>
                  <label>Economy<input type="number" min={0} step="0.01" value={bowler.economy} onChange={event => updateBowler(entry.number, index, { economy: Number(event.target.value) || 0 })} /></label>
                </div>)}
              </div>
            </fieldset>
          ))}
        </div>
        {errors.length > 0 && <div className="public-scoreboard__editor-errors" role="alert">{errors.map((error, index) => <p key={`${index}-${error}`}>{error}</p>)}</div>}
        <footer className="public-scoreboard__editor-actions">
          <button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : <><IoSaveOutline />Save scorecard</>}</button>
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
        </footer>
      </section>
    </div>
  );
}

export default function PublicCricketScoreboardPage() {
  const tenantSlug = getTenantSlugFromPath(window.location.pathname);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryMatchId = searchParams.get('matchId') || '';
  const [database, setDatabase] = useState<Database | null>(null);
  const [matches, setMatches] = useState<MatchSetup[]>([]);
  const [matchFilter, setMatchFilter] = useState<PublicMatchFilter>('all');
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [live, setLive] = useState<LiveScore | null>(null);
  const [innings, setInnings] = useState<Innings[]>([]);
  const [balls, setBalls] = useState<BallEvent[]>([]);
  const [finalScore, setFinalScore] = useState<MatchScore | null>(null);
  const [matchStats, setMatchStats] = useState<MatchStatsSnapshot | null>(null);
  const [standingsMatches, setStandingsMatches] = useState<(PointsTableMatch & { live?: LiveScore })[]>([]);
  const [playerImages, setPlayerImages] = useState<Record<string, string>>({});
  const [allTeams, setAllTeams] = useState<{ id: string; name: string; logoUrl?: string }[]>([]);
  const [poolSettings, setPoolSettings] = useState<ScoringOverlayConfig['pointsTablePools']>();
  const [mobileAdminCredentials, setMobileAdminCredentials] = useState<{ superAdminUsername?: string; superAdminPassword?: string } | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSuperAdminAuthenticated, setIsSuperAdminAuthenticated] = useState(false);
  const [scorecardEditorOpen, setScorecardEditorOpen] = useState(false);
  const [editMessage, setEditMessage] = useState('');
  const [activeTab, setActiveTab] = useState<PublicScoreboardTab>('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let stopAdminSettings = () => {};
    const initialize = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) throw new Error('Scoreboard is unavailable.');
        scoringService.initialize(db, tenantPath('scoring'));
        if (!active) return;
        setDatabase(db);
        stopAdminSettings = onValue(ref(db, tenantPath('auction/adminSettings')), snapshot => {
          const settings = snapshot.exists() ? snapshot.val() as { superAdminUsername?: string; superAdminPassword?: string } : null;
          setMobileAdminCredentials(settings);
        });
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (active) setLoading(false);
      }
    };
    void initialize();
    return () => { active = false; stopAdminSettings(); };
  }, []);

  const filteredMatches = useMemo(() => filterPublicMatches(matches, matchFilter), [matches, matchFilter]);
  const selectedMatchId = matches.some(item => item.id === queryMatchId) ? queryMatchId : '';
  const tournamentPlayers = buildPublicTournamentPlayers(standingsMatches);

  useEffect(() => {
    if (!match) return;
    setActiveTab(match.status === 'completed' ? 'scorecards' : 'summary');
  }, [match?.id, match?.status]);

  useEffect(() => {
    if (!database) return;
    const stopStandings = onValue(ref(database, tenantPath('scoring/matches')), snapshot => {
      if (!snapshot.exists()) {
        setStandingsMatches([]);
        return;
      }
      const records = snapshot.val() as Record<string, { setup?: MatchSetup; final?: MatchScore; innings?: Record<string, Innings>; live?: LiveScore }>;
      const allScores: (PointsTableMatch & { live?: LiveScore })[] = [];
      for (const [matchId, record] of Object.entries(records)) {
        if (record?.setup) {
          const setup = record.setup.id ? record.setup : { ...record.setup, id: matchId };
          allScores.push({ setup, final: record.final, innings: record.innings, live: record.live });
        }
      }
      setStandingsMatches(allScores);
      setMatches(allScores.map(record => record.setup));
    });
    const stopTeams = onValue(ref(database, tenantPath('auction/teams')), snapshot => {
      if (!snapshot.exists()) {
        setAllTeams([]);
        return;
      }
      const records = snapshot.val() as Record<string, { id?: string; name?: string; logoUrl?: string }>;
      setAllTeams(Object.values(records).flatMap(team => team?.id && team.name
        ? [{ id: team.id, name: team.name, logoUrl: team.logoUrl }]
        : []));
    });
    const stopOverlayConfig = onValue(ref(database, tenantPath('scoring/overlayConfig')), snapshot => {
      const config = snapshot.exists() ? snapshot.val() as ScoringOverlayConfig : undefined;
      setPoolSettings(config?.pointsTablePools);
    });
    const stopImages = onValue(ref(database, tenantPath('auction/soldPlayers')), snapshot => {
      const players = snapshot.val() as Record<string, { id?: string; imageUrl?: string; processedImageUrl?: string }> | null;
      setPlayerImages(Object.fromEntries(Object.values(players || {}).flatMap(player => player?.id && (player.processedImageUrl || player.imageUrl)
        ? [[player.id, player.processedImageUrl || player.imageUrl!]] : [])));
    });
    return () => { stopStandings(); stopTeams(); stopOverlayConfig(); stopImages(); };
  }, [database]);

  useEffect(() => {
    setMatch(null);
    setLive(null);
    setInnings([]);
    setBalls([]);
    setFinalScore(null);
    setMatchStats(null);
    if (!database || !selectedMatchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const base = `scoring/matches/${selectedMatchId}`;
    const unsubs = [
      onValue(ref(database, tenantPath(`${base}/setup`)), snapshot => setMatch(snapshot.exists() ? snapshot.val() as MatchSetup : null)),
      onValue(ref(database, tenantPath(`${base}/live`)), snapshot => setLive(snapshot.exists() ? snapshot.val() as LiveScore : null)),
      onValue(ref(database, tenantPath(`${base}/innings`)), snapshot => {
        const value = snapshot.exists() ? snapshot.val() as Record<string, Innings> : {};
        setInnings(Object.values(value).filter(item => item && (item.number === 1 || item.number === 2)).sort((left, right) => left.number - right.number));
      }),
      onValue(ref(database, tenantPath(`${base}/balls`)), snapshot => {
        const value = snapshot.exists() ? snapshot.val() as Record<string, BallEvent> : {};
        setBalls(Object.values(value).filter(Boolean).sort((left, right) => left.inningsNumber - right.inningsNumber || left.overNumber - right.overNumber || left.ballInOver - right.ballInOver || left.timestamp - right.timestamp));
      }),
      onValue(ref(database, tenantPath(`${base}/final`)), snapshot => {
        const value = snapshot.exists() ? snapshot.val() as MatchScore : null;
        setFinalScore(value);
        if (value?.innings?.length) setInnings(current => current.length ? current : value.innings);
      }),
      onValue(ref(database, tenantPath(`${base}/stats`)), snapshot => setMatchStats(snapshot.exists() ? snapshot.val() as MatchStatsSnapshot : null)),
    ];
    setLoading(false);
    return () => unsubs.forEach(unsubscribe => unsubscribe());
  }, [database, selectedMatchId]);

  const playerNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const inningsScore of innings) {
      for (const batter of inningsScore.batsmen || []) names.set(batter.playerId, batter.playerName);
      for (const bowler of inningsScore.bowlers || []) names.set(bowler.playerId, bowler.playerName);
    }
    return names;
  }, [innings]);

  const inningsTeamName = (inningsScore: Innings) => inningsScore.battingTeamId === match?.teamA.id ? match.teamA.name : match?.teamB.name || inningsScore.battingTeamId;
  const inningsTeam = (inningsScore: Innings) => inningsScore.battingTeamId === match?.teamA.id ? match.teamA : match?.teamB;
  const winnerName = !match ? finalScore?.result?.winner
    : finalScore?.result?.winner === match.teamA.id ? match.teamA.name
      : finalScore?.result?.winner === match.teamB.id ? match.teamB.name
        : finalScore?.result?.winner;
  const resultText = finalScore?.result?.margin
    ? `${winnerName} won by ${finalScore.result.margin}`
    : match?.status === 'live' && live?.target
      ? `Target ${live.target} · ${live.target - live.runs} to win`
      : match?.status === 'live' ? 'Match in progress' : match?.status === 'completed' ? 'Match completed' : 'Match scheduled';

  const handleMatchFilterChange = (filter: PublicMatchFilter) => {
    setMatchFilter(filter);
    setSearchParams({}, { replace: true });
    setActiveTab('summary');
    setScorecardEditorOpen(false);
    setEditMessage('');
  };

  const handleMatchSelection = (matchId: string) => {
    const next = matches.find(item => item.id === matchId);
    setSearchParams(matchId ? { matchId } : {}, { replace: true });
    setActiveTab(next?.status === 'completed' ? 'scorecards' : 'summary');
    setEditMessage('');
  };

  const handleMobileAdminLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mobileAdminCredentials?.superAdminUsername || !mobileAdminCredentials.superAdminPassword) {
      setLoginError('Super Admin Mobile Access credentials are not configured in Auction Admin.');
      return;
    }
    if (!verifySuperAdminMobileCredentials(mobileAdminCredentials, loginUsername, loginPassword)) {
      setLoginError('Username or password is incorrect.');
      return;
    }
    setIsSuperAdminAuthenticated(true);
    setLoginOpen(false);
    setLoginError('');
    setLoginUsername('');
    setLoginPassword('');
  };

  const handleScorecardEditClick = () => {
    if (!isSuperAdminAuthenticated) {
      setLoginError('');
      setLoginOpen(true);
      return;
    }
    setScorecardEditorOpen(true);
  };

  const savePublicScorecard = async (correctedInnings: Innings[], correctedLive?: LiveScore, correctedFinal?: MatchScore) => {
    if (!isSuperAdminAuthenticated || !selectedMatchId) throw new Error('Sign in with Super Admin Mobile Access to edit this scorecard.');
    const validationErrors = correctedInnings.flatMap(validatePublicInningsCorrection);
    if (validationErrors.length) throw new Error(validationErrors.join(' '));
    if (match?.status === 'completed' && !correctedFinal) throw new Error('The completed match final score is not available yet. Reload the scoreboard and try again.');
    await scoringService.saveScorecardCorrection(selectedMatchId, correctedInnings, correctedLive, correctedFinal);
    setScorecardEditorOpen(false);
    setEditMessage('Scorecard saved successfully.');
  };

  const standingsSection = <>
    <div className="public-scoreboard__section-heading"><div><span>TOURNAMENT</span><h2>Points Table</h2></div><span>{allTeams.length} teams</span></div>
    <PublicPointsTable matches={standingsMatches} teams={allTeams} poolSettings={poolSettings} />
  </>;

  return (
    <main className="public-scoreboard">
      <header className="public-scoreboard__topbar">
        <div className="public-scoreboard__brand"><IoFootballOutline /><span>LIVE SCOREBOARD</span></div>
        <div className="public-scoreboard__top-actions">
          <div className="public-scoreboard__match-filters" role="group" aria-label="Filter matches">
            {(['all', 'live', 'upcoming', 'completed'] as PublicMatchFilter[]).map(filter => <button
              type="button"
              key={filter}
              className={matchFilter === filter ? 'is-active' : ''}
              onClick={() => handleMatchFilterChange(filter)}
            >{filter === 'all' ? 'All' : filter[0].toUpperCase() + filter.slice(1)}</button>)}
          </div>
          <button className={`public-scoreboard__top-action ${activeTab === 'standings' ? 'is-active' : ''}`} onClick={() => setActiveTab(current => current === 'standings' ? 'summary' : 'standings')}>
            <IoTrophyOutline />Points Table
          </button>
          {isSuperAdminAuthenticated ? (
            <button className="public-scoreboard__admin-link" onClick={() => { setIsSuperAdminAuthenticated(false); setScorecardEditorOpen(false); setEditMessage(''); }}> <IoLockClosedOutline />Lock Edit</button>
          ) : (
            <button className="public-scoreboard__admin-link" onClick={() => { setLoginError(''); setLoginOpen(true); }} disabled={!selectedMatchId}>Super Admin Edit</button>
          )}
        </div>
      </header>

      {error ? <div className="public-scoreboard__empty">{error}</div> : loading ? <div className="public-scoreboard__empty">Loading live score…</div> : !selectedMatchId
        ? activeTab === 'standings'
          ? <section className="public-scoreboard__content">{standingsSection}</section>
          : <section className="public-scoreboard__content">
            <div className="public-scoreboard__section-heading"><h2>{matchFilter === 'all' ? 'All Matches' : `${matchFilter[0].toUpperCase()}${matchFilter.slice(1)} Matches`}</h2><span>{filteredMatches.length} matches</span></div>
            <div className="public-scoreboard__match-list">
              {filteredMatches.map(item => <button type="button" className="public-scoreboard__match-row" key={item.id} onClick={() => handleMatchSelection(item.id)} aria-label={`View ${item.teamA.name} vs ${item.teamB.name}`}>
                <span><small>{item.stage ? MATCH_STAGE_LABELS[item.stage] : MATCH_STAGE_LABELS.league}{item.matchNumber ? ` · Match ${item.matchNumber}` : ''} · {new Date(item.date).toLocaleString()}</small><strong>{item.teamA.name} vs {item.teamB.name}</strong><small>{item.venue}</small></span>
                <span className={item.status === 'live' ? 'is-live' : ''}>{publicMatchResult(item, standingsMatches.find(record => record.setup.id === item.id)?.final)}</span>
              </button>)}
              {!filteredMatches.length && <div className="public-scoreboard__empty">No matches in this section.</div>}
            </div>
            {matchFilter === 'all' && <section className="public-scoreboard__tournament-stats">
              <div className="public-scoreboard__section-heading"><h2>Tournament Stats</h2></div>
              <div className="public-scoreboard__leaderboards">
                {([
                  { key: 'runs', title: 'Most Runs' }, { key: 'fours', title: 'Most Fours' },
                  { key: 'sixes', title: 'Most Sixes' }, { key: 'wickets', title: 'Most Wickets' },
                  { key: 'maidens', title: 'Most Maidens' }, { key: 'dots', title: 'Most Dot Balls' },
                  { key: 'strikeRate', title: 'Best Strike Rate' }, { key: 'economy', title: 'Best Economy' },
                ] as const).map(category => {
                  const leaders = tournamentPlayers.filter(player => category.key === 'economy' ? player.bowlingBalls >= 6 : category.key === 'strikeRate' ? player.balls >= 10 : player[category.key] > 0)
                    .sort((left, right) => (right[category.key] - left[category.key]) * (category.key === 'economy' ? -1 : 1) || left.playerName.localeCompare(right.playerName)).slice(0, 5);
                  return <section className="public-scoreboard__leaderboard" key={category.key}>
                    <h3>{category.title}</h3>
                    {leaders.map(player => <div className="public-scoreboard__leader" key={`${player.teamId}:${player.playerId}`}>
                      <PlayerImage imageUrl={playerImages[player.playerId]} playerName={player.playerName} size="sm" />
                      <span><strong>{player.playerName}</strong><small>{player.teamName} · {player.matches} matches</small></span>
                      <b>{category.key === 'economy' || category.key === 'strikeRate' ? player[category.key].toFixed(2) : player[category.key]}</b>
                    </div>)}
                    {!leaders.length && <p>No figures recorded yet.</p>}
                  </section>;
                })}
              </div>
            </section>}
          </section>
        : !match ? <div className="public-scoreboard__empty">Loading match…</div>
        : (
        <>
          <div className="public-scoreboard__back"><button type="button" onClick={() => handleMatchFilterChange(matchFilter)}>Back to matches</button></div>
          <section className="public-scoreboard__hero">
            <div className="public-scoreboard__eyebrow"><span className={`public-scoreboard__live-indicator ${match.status === 'live' ? 'is-live' : ''}`} />{match.status === 'live' ? 'LIVE MATCH' : match.status.toUpperCase()}</div>
            <h1>{match.teamA.name}<span>vs</span>{match.teamB.name}</h1>
            <p>{match.venue || 'Venue TBC'} · {new Date(match.date).toLocaleString()}</p>
            <strong className="public-scoreboard__result">{resultText}</strong>
            {match.interruption && <p role="status">{publicMatchResult(match, finalScore || undefined)}</p>}
            <div className="public-scoreboard__match-totals">
              <span>Total fours <strong>{innings.reduce((total, entry) => total + (entry.batsmen || []).reduce((sum, player) => sum + (player.fours || 0), 0), 0)}</strong></span>
              <span>Total sixes <strong>{innings.reduce((total, entry) => total + (entry.batsmen || []).reduce((sum, player) => sum + (player.sixes || 0), 0), 0)}</strong></span>
              <span>Total maidens <strong>{innings.reduce((total, entry) => total + (entry.bowlers || []).reduce((sum, player) => sum + (player.maidens || 0), 0), 0)}</strong></span>
              <span>Total wickets <strong>{innings.reduce((total, entry) => total + entry.totalWickets, 0)}</strong></span>
            </div>
            <div className="public-scoreboard__scoreline">
              {innings.map(inningsScore => {
                const team = inningsTeam(inningsScore);
                return <div key={inningsScore.number} className="public-scoreboard__scoreline-team">
                  <span>{team?.name || inningsTeamName(inningsScore)}</span>
                  <strong>{inningsScore.totalRuns}/{inningsScore.totalWickets}</strong>
                  <small>{formatOvers(inningsScore.totalOvers)} ov</small>
                </div>;
              })}
              {live && match.status === 'live' && !innings.some(item => item.number === live.currentInnings) && (
                <div className="public-scoreboard__scoreline-team"><span>{live.battingTeamId === match.teamA.id ? match.teamA.name : match.teamB.name}</span><strong>{live.runs}/{live.wickets}</strong><small>{formatOvers(live.overs)} ov</small></div>
              )}
            </div>
          </section>

          <nav className="public-scoreboard__tabs" aria-label="Scoreboard sections">
            {(['summary', ...(match.status !== 'scheduled' ? ['scorecards', 'commentary'] : [])] as PublicScoreboardTab[]).map(tab => <button key={tab} className={activeTab === tab ? 'is-active' : ''} onClick={() => setActiveTab(tab)}>
              {tab === 'summary' ? <IoStatsChartOutline /> : tab === 'scorecards' ? <IoShieldCheckmarkOutline /> : <IoCalendarOutline />}{tab === 'summary' ? 'Match Summary' : tab === 'scorecards' ? 'Scorecards' : 'Ball-by-ball'}
            </button>)}
          </nav>

          <section className="public-scoreboard__content">
            {editMessage && <p className="public-scoreboard__edit-message" role="status">{editMessage}</p>}
            {activeTab === 'summary' && (
              <>
                <div className="public-scoreboard__section-heading"><div><span>MATCH CENTRE</span><h2>Batting &amp; Bowling Summary</h2></div><span>{innings.length} innings</span></div>
                <MatchAwards innings={innings} stats={matchStats} />
                {innings.length === 0 ? <div className="public-scoreboard__empty">Scorecard will appear once the innings starts.</div> : (
                  <div className="public-scoreboard__innings-grid">
                    {innings.map(inningsScore => <article key={inningsScore.number} className="public-scoreboard__summary-card">
                      <div className="public-scoreboard__summary-card-head"><div><span>INNINGS {inningsScore.number}</span><h3>{inningsTeamName(inningsScore)}</h3></div><strong>{inningsScore.totalRuns}/{inningsScore.totalWickets}<small> ({formatOvers(inningsScore.totalOvers)} ov)</small></strong></div>
                      <div className="public-scoreboard__summary-columns">
                        <div><h4>Top batting</h4>{[...(inningsScore.batsmen || [])].sort((a, b) => b.runs - a.runs).slice(0, 3).map(player => <p key={player.playerId}>{player.playerName}<strong>{player.runs} ({player.balls})</strong></p>)}</div>
                        <div><h4>Top bowling</h4>{[...(inningsScore.bowlers || [])].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs).slice(0, 3).map(player => <p key={player.playerId}>{player.playerName}<strong>{player.wickets}/{player.runs}</strong></p>)}</div>
                      </div>
                    </article>)}
                  </div>
                )}
              </>
            )}
            {activeTab === 'scorecards' && (
              <>
                <div className="public-scoreboard__section-heading"><div><span>{match.status === 'completed' ? 'COMPLETED MATCH' : 'LIVE MATCH'}</span><h2>Batting &amp; Bowling</h2></div>{innings.length > 0 && <button className="public-scoreboard__edit-scorecard" onClick={handleScorecardEditClick}><IoPencilOutline />Edit scorecard</button>}</div>
                {innings.length === 0 ? <div className="public-scoreboard__empty">No scorecard is available yet.</div> : <div className="public-scoreboard__innings-grid">{innings.map(inningsScore => <BattingScorecard key={inningsScore.number} innings={inningsScore} teamName={inningsTeamName(inningsScore)} />)}</div>}
              </>
            )}
            {activeTab === 'commentary' && (
              <>
                <div className="public-scoreboard__section-heading"><div><span>LIVE FEED</span><h2>Ball-by-ball Commentary</h2></div><span>{balls.length} deliveries</span>{innings.length > 0 && <button className="public-scoreboard__edit-scorecard" onClick={handleScorecardEditClick}><IoPencilOutline />Edit scorecard</button>}</div>
                {balls.length === 0 ? <div className="public-scoreboard__empty">Commentary will appear as balls are recorded.</div> : (
                  <ol className="public-scoreboard__commentary">
                    {balls.map(ball => {
                      const batterName = playerNames.get(ball.strikerId) || ball.strikerId;
                      const bowlerName = playerNames.get(ball.bowlerId) || ball.bowlerId;
                      const overLabel = `${ball.overNumber + 1}.${ball.ballInOver < 0 ? 'E' : ball.ballInOver + 1}`;
                      return <li key={ball.id} className={ball.isWicket ? 'is-wicket' : ''}>
                        <span className="public-scoreboard__commentary-over">{ball.inningsNumber} · {overLabel}</span>
                        <span>{summarizeBall(ball, batterName, bowlerName)}</span>
                        <strong>{ball.runs} run{ball.runs === 1 ? '' : 's'}</strong>
                      </li>;
                    })}
                  </ol>
                )}
              </>
            )}
            {activeTab === 'standings' && (
              standingsSection
            )}
          </section>
        </>
      )}
      {loginOpen && <div className="public-scoreboard__auth-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setLoginOpen(false); }}>
        <form className="public-scoreboard__auth-dialog" role="dialog" aria-modal="true" aria-labelledby="public-scoreboard-auth-title" onSubmit={handleMobileAdminLogin}>
          <span>RESTRICTED ACCESS</span>
          <h2 id="public-scoreboard-auth-title">Super Admin sign in</h2>
          <label>Username<input autoComplete="username" value={loginUsername} onChange={event => setLoginUsername(event.target.value)} /></label>
          <label>Password<input type="password" autoComplete="current-password" value={loginPassword} onChange={event => setLoginPassword(event.target.value)} /></label>
          {loginError && <p className="public-scoreboard__auth-error" role="alert">{loginError}</p>}
          <div className="public-scoreboard__auth-actions"><button type="submit">Sign in</button><button type="button" onClick={() => setLoginOpen(false)}>Cancel</button></div>
        </form>
      </div>}
      {scorecardEditorOpen && match && <PublicScorecardEditor
        match={match}
        innings={innings}
        live={live}
        finalScore={finalScore}
        onClose={() => setScorecardEditorOpen(false)}
        onSave={savePublicScorecard}
      />}
      {tenantSlug && <footer className="public-scoreboard__footer">{tenantSlug.toUpperCase()} · Live scoring updates automatically</footer>}
    </main>
  );
}