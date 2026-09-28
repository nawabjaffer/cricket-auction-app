export interface CricHeroesNameMappings {
  teamAliases: Record<string, string>;
  playerAliases: Record<string, string>;
}

export const EMPTY_CRICHEROES_MAPPINGS: CricHeroesNameMappings = {
  teamAliases: {},
  playerAliases: {},
};

export function normalizeCricHeroesAliasName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function cricHeroesPlayerAliasKey(name: string, teamId?: string): string {
  const normalizedName = normalizeCricHeroesAliasName(name);
  return teamId ? `${teamId}::${normalizedName}` : normalizedName;
}

export function resolveCricHeroesPlayerAlias(
  mappings: CricHeroesNameMappings,
  name: string,
  teamId?: string,
): string | undefined {
  const normalizedName = normalizeCricHeroesAliasName(name);
  return (teamId ? mappings.playerAliases[cricHeroesPlayerAliasKey(name, teamId)] : undefined)
    || mappings.playerAliases[normalizedName];
}

export function normalizeCricHeroesMappings(value: Partial<CricHeroesNameMappings> | null | undefined): CricHeroesNameMappings {
  return {
    teamAliases: value?.teamAliases && typeof value.teamAliases === 'object' ? value.teamAliases : {},
    playerAliases: value?.playerAliases && typeof value.playerAliases === 'object' ? value.playerAliases : {},
  };
}
