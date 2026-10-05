export type ScoringAdminTabKey = 'matches' | 'provider' | 'ads' | 'overlay' | 'animations' | 'prematch' | 'ticker' | 'stats' | 'obs';

const CONFIGURATION_TAB_KEYS: ScoringAdminTabKey[] = ['matches', 'provider', 'animations', 'prematch', 'obs'];

export function isScoringAdminTabVisible(tab: ScoringAdminTabKey, configurationOnly: boolean): boolean {
  return !configurationOnly || CONFIGURATION_TAB_KEYS.includes(tab);
}
