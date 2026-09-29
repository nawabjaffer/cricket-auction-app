export interface TeamMembershipRecord {
  teamId?: string | null;
  teamName?: string | null;
}

export interface TeamMembershipTarget {
  id: string;
  name: string;
}

export function belongsToTeam(record: TeamMembershipRecord, team: TeamMembershipTarget): boolean {
  const recordTeamId = record.teamId?.trim();
  if (recordTeamId) return recordTeamId === team.id;

  const recordTeamName = record.teamName?.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const targetTeamName = team.name.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  return Boolean(recordTeamName && targetTeamName && recordTeamName === targetTeamName);
}
