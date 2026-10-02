import { useEffect, useMemo, useState } from 'react';
import { onValue, ref, type Database } from 'firebase/database';
import { useSearchParams } from 'react-router-dom';
import { IoCalendarOutline, IoChevronDown, IoFootballOutline, IoShieldCheckmarkOutline, IoStatsChartOutline, IoTrophyOutline } from 'react-icons/io5';
import { SortableColumnHeader, useSortableRows } from '../components/SortableTable';
import { useTenantNavigate as useNavigate, getTenantSlugFromPath } from '../hooks/useTenantNavigate';
import { realtimeSync } from '../services/realtimeSync';
import { scoringService } from '../services/scoring';
import { tenantPath } from '../services/tenantPath';
import type { BallEvent, Innings, LiveScore, MatchScore, MatchSetup, MatchStatsSnapshot, ScoringOverlayConfig } from '../types/scoring';
import { buildPointsTableStandings, buildPoolAssignments, type PointsTableMatch } from '../utils/pointsTable';
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

export default function PublicCricketScoreboardPage() {
  const navigate = useNavigate();
  const tenantSlug = getTenantSlugFromPath(window.location.pathname);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryMatchId = searchParams.get('matchId') || '';
  const [database, setDatabase] = useState<Database | null>(null);
  const [matches, setMatches] = useState<MatchSetup[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState(queryMatchId);
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [live, setLive] = useState<LiveScore | null>(null);
  const [innings, setInnings] = useState<Innings[]>([]);
  const [balls, setBalls] = useState<BallEvent[]>([]);
  const [finalScore, setFinalScore] = useState<MatchScore | null>(null);
  const [matchStats, setMatchStats] = useState<MatchStatsSnapshot | null>(null);
  const [standingsMatches, setStandingsMatches] = useState<PointsTableMatch[]>([]);
  const [allTeams, setAllTeams] = useState<{ id: string; name: string; logoUrl?: string }[]>([]);
  const [poolSettings, setPoolSettings] = useState<ScoringOverlayConfig['pointsTablePools']>();
  const [activeTab, setActiveTab] = useState<PublicScoreboardTab>('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (queryMatchId && queryMatchId !== selectedMatchId) setSelectedMatchId(queryMatchId);
  }, [queryMatchId, selectedMatchId]);

  useEffect(() => {
    let active = true;
    let stopMatches = () => {};
    const initialize = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) throw new Error('Scoreboard is unavailable.');
        scoringService.initialize(db, tenantPath('scoring'));
        if (!active) return;
        setDatabase(db);
        setMatches(await scoringService.getAllMatches());
        stopMatches = scoringService.subscribeMatches(setMatches);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (active) setLoading(false);
      }
    };
    void initialize();
    return () => { active = false; stopMatches(); };
  }, []);

  useEffect(() => {
    if (!matches.length || selectedMatchId) return;
    const next = matches.find(item => item.status === 'live')
      || [...matches].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())[0];
    if (next) setSelectedMatchId(next.id);
  }, [matches, selectedMatchId]);

  useEffect(() => {
    if (!database) return;
    const stopStandings = onValue(ref(database, tenantPath('scoring/matches')), snapshot => {
      if (!snapshot.exists()) {
        setStandingsMatches([]);
        return;
      }
      const records = snapshot.val() as Record<string, { setup?: MatchSetup; final?: MatchScore; innings?: Record<string, Innings> }>;
      const allScores: PointsTableMatch[] = [];
      for (const record of Object.values(records)) {
        if (record?.setup) allScores.push({ setup: record.setup, final: record.final, innings: record.innings });
      }
      setStandingsMatches(allScores);
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
    return () => { stopStandings(); stopTeams(); stopOverlayConfig(); };
  }, [database]);

  useEffect(() => {
    if (!database || !selectedMatchId) return;
    setLoading(true);
    setError('');
    setMatchStats(null);
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
      onValue(ref(database, tenantPath(`${base}/final`)), snapshot => setFinalScore(snapshot.exists() ? snapshot.val() as MatchScore : null)),
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

  const openAdminEdit = () => {
    if (!selectedMatchId) return;
    const returnTo = `/cricket/scorer/update?matchId=${encodeURIComponent(selectedMatchId)}&superAdmin=1`;
    navigate(`/admin/login?superAdmin=1&returnTo=${encodeURIComponent(returnTo)}`);
  };

  return (
    <main className="public-scoreboard">
      <header className="public-scoreboard__topbar">
        <div className="public-scoreboard__brand"><IoFootballOutline /><span>LIVE SCOREBOARD</span></div>
        <div className="public-scoreboard__top-actions">
          <label className="public-scoreboard__match-picker">
            <span>Match</span>
            <select value={selectedMatchId} onChange={event => {
              const matchId = event.target.value;
              setSelectedMatchId(matchId);
              setSearchParams(matchId ? { matchId } : {}, { replace: true });
            }}>
              {matches.map(item => <option key={item.id} value={item.id}>{item.teamA.name} vs {item.teamB.name} · {new Date(item.date).toLocaleDateString()}</option>)}
            </select>
            <IoChevronDown />
          </label>
          <button className="public-scoreboard__admin-link" onClick={openAdminEdit} disabled={!selectedMatchId}>Super Admin edit</button>
        </div>
      </header>

      {error ? <div className="public-scoreboard__empty">{error}</div> : loading ? <div className="public-scoreboard__empty">Loading live score…</div> : !match ? <div className="public-scoreboard__empty">No match found. Ask the tournament admin to schedule a fixture.</div> : (
        <>
          <section className="public-scoreboard__hero">
            <div className="public-scoreboard__eyebrow"><span className={`public-scoreboard__live-indicator ${match.status === 'live' ? 'is-live' : ''}`} />{match.status === 'live' ? 'LIVE MATCH' : match.status.toUpperCase()}</div>
            <h1>{match.teamA.name}<span>vs</span>{match.teamB.name}</h1>
            <p>{match.venue || 'Venue TBC'} · {new Date(match.date).toLocaleString()}</p>
            <strong className="public-scoreboard__result">{resultText}</strong>
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
            {(['summary', 'scorecards', 'commentary', 'standings'] as PublicScoreboardTab[]).map(tab => <button key={tab} className={activeTab === tab ? 'is-active' : ''} onClick={() => setActiveTab(tab)}>
              {tab === 'summary' ? <IoStatsChartOutline /> : tab === 'scorecards' ? <IoShieldCheckmarkOutline /> : tab === 'standings' ? <IoTrophyOutline /> : <IoCalendarOutline />}{tab === 'summary' ? 'Match Summary' : tab === 'scorecards' ? 'Scorecards' : tab === 'standings' ? 'Points Table' : 'Ball-by-ball'}
            </button>)}
          </nav>

          <section className="public-scoreboard__content">
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
                <div className="public-scoreboard__section-heading"><div><span>FULL SCORECARD</span><h2>Batting &amp; Bowling</h2></div></div>
                {innings.length === 0 ? <div className="public-scoreboard__empty">No scorecard is available yet.</div> : <div className="public-scoreboard__innings-grid">{innings.map(inningsScore => <BattingScorecard key={inningsScore.number} innings={inningsScore} teamName={inningsTeamName(inningsScore)} />)}</div>}
              </>
            )}
            {activeTab === 'commentary' && (
              <>
                <div className="public-scoreboard__section-heading"><div><span>LIVE FEED</span><h2>Ball-by-ball Commentary</h2></div><span>{balls.length} deliveries</span></div>
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
              <>
                <div className="public-scoreboard__section-heading"><div><span>TOURNAMENT</span><h2>Points Table</h2></div><span>{allTeams.length} teams</span></div>
                <PublicPointsTable matches={standingsMatches} teams={allTeams} poolSettings={poolSettings} />
              </>
            )}
          </section>
        </>
      )}
      {tenantSlug && <footer className="public-scoreboard__footer">{tenantSlug.toUpperCase()} · Live scoring updates automatically</footer>}
    </main>
  );
}