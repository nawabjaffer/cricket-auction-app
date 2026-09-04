// ============================================================================
// PLAYER STAT FIELDS CONFIGURATION
// Multi-sport player statistics definitions, categories, and defaults
// ============================================================================

export interface PlayerStatFieldDef {
  readonly key: string;
  readonly label: string;
  readonly sport?: 'cricket' | 'kabaddi' | 'football' | 'volleyball' | 'basketball' | 'badminton' | 'common';
  readonly category?: 'batting' | 'bowling' | 'raiding' | 'defense' | 'attack' | 'midfield' | 'general';
}

/** Sport-specific stat definitions */
export const SPORT_STAT_FIELDS: Record<string, readonly PlayerStatFieldDef[]> = {
  cricket: [
    { key: 'age', label: 'Age', sport: 'cricket', category: 'general' },
    { key: 'matches', label: 'Matches', sport: 'cricket', category: 'general' },
    { key: 'runs', label: 'Runs', sport: 'cricket', category: 'batting' },
    { key: 'wickets', label: 'Wickets', sport: 'cricket', category: 'bowling' },
    { key: 'battingBestFigures', label: 'Highest Score', sport: 'cricket', category: 'batting' },
    { key: 'bowlingBestFigures', label: 'Best Bowling', sport: 'cricket', category: 'bowling' },
    { key: 'battingStats.innings', label: 'Batting Innings', sport: 'cricket', category: 'batting' },
    { key: 'battingStats.notOut', label: 'Not Outs', sport: 'cricket', category: 'batting' },
    { key: 'battingStats.average', label: 'Batting Average', sport: 'cricket', category: 'batting' },
    { key: 'battingStats.strikeRate', label: 'Batting Strike Rate', sport: 'cricket', category: 'batting' },
    { key: 'battingStats.thirties', label: '30s', sport: 'cricket', category: 'batting' },
    { key: 'battingStats.fifties', label: '50s', sport: 'cricket', category: 'batting' },
    { key: 'battingStats.hundreds', label: '100s', sport: 'cricket', category: 'batting' },
    { key: 'battingStats.fours', label: 'Fours', sport: 'cricket', category: 'batting' },
    { key: 'battingStats.sixes', label: 'Sixes', sport: 'cricket', category: 'batting' },
    { key: 'bowlingStats.innings', label: 'Bowling Innings', sport: 'cricket', category: 'bowling' },
    { key: 'bowlingStats.overs', label: 'Overs Bowled', sport: 'cricket', category: 'bowling' },
    { key: 'bowlingStats.maidens', label: 'Maidens', sport: 'cricket', category: 'bowling' },
    { key: 'bowlingStats.wickets', label: 'Bowling Wickets', sport: 'cricket', category: 'bowling' },
    { key: 'bowlingStats.bestBowling', label: 'Best Bowling Figures', sport: 'cricket', category: 'bowling' },
    { key: 'bowlingStats.threeWickets', label: '3 Wickets', sport: 'cricket', category: 'bowling' },
    { key: 'bowlingStats.fiveWickets', label: '5 Wickets', sport: 'cricket', category: 'bowling' },
    { key: 'bowlingStats.economy', label: 'Economy Rate', sport: 'cricket', category: 'bowling' },
    { key: 'bowlingStats.strikeRate', label: 'Bowling Strike Rate', sport: 'cricket', category: 'bowling' },
    { key: 'bowlingStats.average', label: 'Bowling Average', sport: 'cricket', category: 'bowling' },
  ],

  kabaddi: [
    { key: 'age', label: 'Age', sport: 'kabaddi', category: 'general' },
    { key: 'matches', label: 'Matches Played', sport: 'kabaddi', category: 'general' },
    { key: 'totalPoints', label: 'Total Points', sport: 'kabaddi', category: 'general' },
    { key: 'raidPoints', label: 'Raid Points', sport: 'kabaddi', category: 'raiding' },
    { key: 'tacklePoints', label: 'Tackle Points', sport: 'kabaddi', category: 'defense' },
    { key: 'superRaids', label: 'Super Raids', sport: 'kabaddi', category: 'raiding' },
    { key: 'superTackles', label: 'Super Tackles', sport: 'kabaddi', category: 'defense' },
    { key: 'high5s', label: 'High 5s', sport: 'kabaddi', category: 'defense' },
    { key: 'super10s', label: 'Super 10s', sport: 'kabaddi', category: 'raiding' },
    { key: 'successfulRaids', label: 'Successful Raids', sport: 'kabaddi', category: 'raiding' },
    { key: 'successfulTackles', label: 'Successful Tackles', sport: 'kabaddi', category: 'defense' },
    { key: 'raidSuccessRate', label: 'Raid Strike Rate %', sport: 'kabaddi', category: 'raiding' },
    { key: 'tackleSuccessRate', label: 'Tackle Success Rate %', sport: 'kabaddi', category: 'defense' },
    { key: 'bonusPoints', label: 'Bonus Points', sport: 'kabaddi', category: 'raiding' },
    { key: 'allOutsInflicted', label: 'All-Outs Inflicted', sport: 'kabaddi', category: 'general' },
  ],

  football: [
    { key: 'age', label: 'Age', sport: 'football', category: 'general' },
    { key: 'matches', label: 'Matches Played', sport: 'football', category: 'general' },
    { key: 'goals', label: 'Goals', sport: 'football', category: 'attack' },
    { key: 'assists', label: 'Assists', sport: 'football', category: 'attack' },
    { key: 'cleanSheets', label: 'Clean Sheets', sport: 'football', category: 'defense' },
    { key: 'shotsOnTarget', label: 'Shots on Target', sport: 'football', category: 'attack' },
    { key: 'passAccuracy', label: 'Pass Accuracy %', sport: 'football', category: 'midfield' },
    { key: 'tackles', label: 'Tackles', sport: 'football', category: 'defense' },
    { key: 'interceptions', label: 'Interceptions', sport: 'football', category: 'defense' },
    { key: 'saves', label: 'Saves (GK)', sport: 'football', category: 'defense' },
    { key: 'savePercentage', label: 'Save %', sport: 'football', category: 'defense' },
    { key: 'yellowCards', label: 'Yellow Cards', sport: 'football', category: 'general' },
    { key: 'redCards', label: 'Red Cards', sport: 'football', category: 'general' },
    { key: 'minutesPlayed', label: 'Minutes Played', sport: 'football', category: 'general' },
  ],

  volleyball: [
    { key: 'age', label: 'Age', sport: 'volleyball', category: 'general' },
    { key: 'matches', label: 'Matches Played', sport: 'volleyball', category: 'general' },
    { key: 'totalPoints', label: 'Total Points', sport: 'volleyball', category: 'general' },
    { key: 'spikeKills', label: 'Spike Kills', sport: 'volleyball', category: 'attack' },
    { key: 'killPercentage', label: 'Kill %', sport: 'volleyball', category: 'attack' },
    { key: 'blocks', label: 'Blocks', sport: 'volleyball', category: 'defense' },
    { key: 'serviceAces', label: 'Service Aces', sport: 'volleyball', category: 'attack' },
    { key: 'digs', label: 'Digs', sport: 'volleyball', category: 'defense' },
    { key: 'assists', label: 'Assists / Sets', sport: 'volleyball', category: 'midfield' },
    { key: 'receiveEfficiency', label: 'Receive %', sport: 'volleyball', category: 'defense' },
  ],

  basketball: [
    { key: 'age', label: 'Age', sport: 'basketball', category: 'general' },
    { key: 'matches', label: 'Games Played', sport: 'basketball', category: 'general' },
    { key: 'pointsPerGame', label: 'Points / Game (PPG)', sport: 'basketball', category: 'attack' },
    { key: 'reboundsPerGame', label: 'Rebounds / Game (RPG)', sport: 'basketball', category: 'defense' },
    { key: 'assistsPerGame', label: 'Assists / Game (APG)', sport: 'basketball', category: 'attack' },
    { key: 'steals', label: 'Steals / Game', sport: 'basketball', category: 'defense' },
    { key: 'blocks', label: 'Blocks / Game', sport: 'basketball', category: 'defense' },
    { key: 'threePointers', label: '3-Pointers Made', sport: 'basketball', category: 'attack' },
    { key: 'fieldGoalPct', label: 'Field Goal %', sport: 'basketball', category: 'attack' },
    { key: 'freeThrowPct', label: 'Free Throw %', sport: 'basketball', category: 'attack' },
    { key: 'threePointPct', label: '3-Point %', sport: 'basketball', category: 'attack' },
  ],

  badminton: [
    { key: 'age', label: 'Age', sport: 'badminton', category: 'general' },
    { key: 'matches', label: 'Matches Played', sport: 'badminton', category: 'general' },
    { key: 'winRate', label: 'Win Rate %', sport: 'badminton', category: 'general' },
    { key: 'singlesWins', label: 'Singles Wins', sport: 'badminton', category: 'attack' },
    { key: 'doublesWins', label: 'Doubles Wins', sport: 'badminton', category: 'defense' },
    { key: 'smashSpeed', label: 'Top Smash Speed (km/h)', sport: 'badminton', category: 'attack' },
    { key: 'worldRanking', label: 'World Ranking', sport: 'badminton', category: 'general' },
    { key: 'careerTitles', label: 'Career Titles', sport: 'badminton', category: 'general' },
    { key: 'tournamentsPlayed', label: 'Tournaments Played', sport: 'badminton', category: 'general' },
  ],
};

/** Default selected stat fields for each sport */
export const DEFAULT_SPORT_STAT_FIELDS: Record<string, string[]> = {
  cricket: ['age', 'matches', 'runs', 'wickets', 'battingBestFigures', 'bowlingBestFigures'],
  kabaddi: ['age', 'matches', 'totalPoints', 'raidPoints', 'tacklePoints', 'superRaids', 'superTackles', 'high5s', 'super10s'],
  football: ['age', 'matches', 'goals', 'assists', 'cleanSheets', 'saves', 'shotsOnTarget', 'passAccuracy'],
  volleyball: ['age', 'matches', 'totalPoints', 'spikeKills', 'blocks', 'serviceAces', 'digs'],
  basketball: ['age', 'matches', 'pointsPerGame', 'reboundsPerGame', 'assistsPerGame', 'steals', 'blocks', 'fieldGoalPct'],
  badminton: ['age', 'matches', 'winRate', 'smashSpeed', 'worldRanking', 'careerTitles'],
};

/** Default auction role order for each sport */
export const SPORT_ROLE_ORDERS: Record<string, string[]> = {
  cricket: ['Wicket Keeper Batsman', 'Batsman', 'All-Rounder', 'Bowler'],
  kabaddi: ['Raider', 'Defender', 'All-Rounder'],
  football: ['Forward', 'Midfielder', 'Defender', 'Goalkeeper'],
  volleyball: ['Attacker', 'Setter', 'Blocker', 'Libero', 'All-Rounder'],
  basketball: ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center'],
  badminton: ['Singles Player', 'Doubles Player', 'Mixed Doubles Player'],
};

/** All available player stat fields combined (for backward compatibility & lookup) */
export const ALL_PLAYER_STAT_FIELDS: readonly PlayerStatFieldDef[] = [
  ...SPORT_STAT_FIELDS.cricket,
  ...SPORT_STAT_FIELDS.kabaddi.filter(f => !SPORT_STAT_FIELDS.cricket.some(c => c.key === f.key)),
  ...SPORT_STAT_FIELDS.football.filter(f => !SPORT_STAT_FIELDS.cricket.some(c => c.key === f.key) && !SPORT_STAT_FIELDS.kabaddi.some(k => k.key === f.key)),
  ...SPORT_STAT_FIELDS.volleyball.filter(f => !SPORT_STAT_FIELDS.cricket.some(c => c.key === f.key) && !SPORT_STAT_FIELDS.kabaddi.some(k => k.key === f.key) && !SPORT_STAT_FIELDS.football.some(fb => fb.key === f.key)),
  ...SPORT_STAT_FIELDS.basketball.filter(f => !SPORT_STAT_FIELDS.cricket.some(c => c.key === f.key) && !SPORT_STAT_FIELDS.kabaddi.some(k => k.key === f.key) && !SPORT_STAT_FIELDS.football.some(fb => fb.key === f.key) && !SPORT_STAT_FIELDS.volleyball.some(v => v.key === f.key)),
  ...SPORT_STAT_FIELDS.badminton.filter(f => !SPORT_STAT_FIELDS.cricket.some(c => c.key === f.key) && !SPORT_STAT_FIELDS.kabaddi.some(k => k.key === f.key) && !SPORT_STAT_FIELDS.football.some(fb => fb.key === f.key) && !SPORT_STAT_FIELDS.volleyball.some(v => v.key === f.key) && !SPORT_STAT_FIELDS.basketball.some(b => b.key === f.key)),
];

/** Get stat fields list for a specific sport */
export function getStatFieldsForSport(sport?: string): readonly PlayerStatFieldDef[] {
  const key = (sport || 'cricket').toLowerCase().trim();
  return SPORT_STAT_FIELDS[key] || SPORT_STAT_FIELDS.cricket;
}

/** Look up a stat field definition by key and optional sport context */
export function getStatFieldDef(key: string, sport?: string): PlayerStatFieldDef | undefined {
  if (sport && SPORT_STAT_FIELDS[sport]) {
    const foundInSport = SPORT_STAT_FIELDS[sport].find(f => f.key === key);
    if (foundInSport) return foundInSport;
  }
  return ALL_PLAYER_STAT_FIELDS.find(f => f.key === key);
}
