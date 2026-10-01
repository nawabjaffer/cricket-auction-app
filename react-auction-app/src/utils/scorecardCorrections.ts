import type { Innings, LiveBatsman, LiveBowler, LiveScore } from '../types/scoring';

const asNumber = (value: number | undefined): number => Number.isFinite(value) ? Number(value) : 0;

function oversToBalls(overs: number): number {
  const normalized = Math.max(0, overs);
  const wholeOvers = Math.floor(normalized);
  const balls = Math.round((normalized - wholeOvers) * 10);
  return wholeOvers * 6 + Math.min(5, Math.max(0, balls));
}

function toLiveBatsman(batsman: Innings['batsmen'][number], isOnStrike: boolean): LiveBatsman {
  const runs = asNumber(batsman.runs);
  const balls = asNumber(batsman.balls);
  return {
    playerId: batsman.playerId,
    playerName: batsman.playerName,
    runs,
    balls,
    fours: asNumber(batsman.fours),
    sixes: asNumber(batsman.sixes),
    strikeRate: balls > 0 ? Math.round((runs / balls) * 10000) / 100 : 0,
    isOnStrike,
  };
}

function toLiveBowler(bowler: Innings['bowlers'][number]): LiveBowler {
  return {
    playerId: bowler.playerId,
    playerName: bowler.playerName,
    overs: asNumber(bowler.overs),
    maidens: asNumber(bowler.maidens),
    runs: asNumber(bowler.runs),
    wickets: asNumber(bowler.wickets),
    economy: asNumber(bowler.economy),
    dots: asNumber(bowler.dots),
  };
}

export function reconcileEditedLiveScore(
  liveScore: LiveScore,
  currentInnings: Innings,
  firstInnings?: Innings | null,
): LiveScore {
  const totalRuns = asNumber(currentInnings.totalRuns);
  const totalWickets = asNumber(currentInnings.totalWickets);
  const totalOvers = asNumber(currentInnings.totalOvers);
  const ballsBowled = oversToBalls(totalOvers);
  const runRate = ballsBowled > 0 ? Math.round((totalRuns / ballsBowled) * 600) / 100 : 0;
  const battingOrder = [...currentInnings.batsmen].sort((left, right) => left.order - right.order);
  const availableBatsmen = battingOrder.filter(batsman => !batsman.isOut);
  const preservedIds = new Set(
    liveScore.currentBatsmen
      .map(currentBatsman => currentBatsman.playerId)
      .filter(playerId => availableBatsmen.some(batsman => batsman.playerId === playerId)),
  );
  const incomingBatsmen = availableBatsmen.filter(batsman => !preservedIds.has(batsman.playerId));
  const currentBatsmen = liveScore.currentBatsmen.map((existing, index) => {
    const activeBatsman = availableBatsmen.find(batsman => batsman.playerId === existing.playerId)
      || incomingBatsmen.shift();
    if (!activeBatsman) return existing;
    return toLiveBatsman(activeBatsman, existing.playerId === activeBatsman.playerId ? existing.isOnStrike : existing.isOnStrike || index === 0);
  }) as LiveScore['currentBatsmen'];
  const primaryBowler = [...currentInnings.bowlers].sort((left, right) => asNumber(right.overs) - asNumber(left.overs))[0];
  const target = currentInnings.number === 2 && firstInnings ? asNumber(firstInnings.totalRuns) + 1 : undefined;
  const ballsRemaining = Math.max(0, asNumber(currentInnings.maxOvers) * 6 - ballsBowled);
  const runsRequired = target == null ? 0 : Math.max(0, target - totalRuns);

  return {
    ...liveScore,
    currentInnings: currentInnings.number,
    battingTeamId: currentInnings.battingTeamId,
    bowlingTeamId: currentInnings.bowlingTeamId,
    runs: totalRuns,
    wickets: totalWickets,
    overs: totalOvers,
    runRate,
    target,
    requiredRate: target == null || ballsRemaining === 0 ? undefined : Math.round((runsRequired / ballsRemaining) * 600) / 100,
    currentBatsmen,
    currentBowler: primaryBowler ? toLiveBowler(primaryBowler) : liveScore.currentBowler,
    allBatsmen: currentInnings.batsmen,
    allBowlers: currentInnings.bowlers,
    lastUpdated: Date.now(),
  };
}
