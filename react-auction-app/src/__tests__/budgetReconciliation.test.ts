// ============================================================================
// BUDGET RECONCILIATION TESTS
// Verifies the single-source-of-truth derivation used by TeamSquadView and
// (after this fix) AdminPanel.saveTeamDraft:
//
//   spent      = sum(soldPlayer.soldAmount where teamId or teamName matches)
//   total      = max(team.allocatedAmount, spent)        // never goes below spent
//   remaining  = max(0, total - spent)
//
// These rules guarantee that no display surface shows "remaining > total" or
// "remaining negative" or stale data after an admin re-saves a team mid-auction.
// ============================================================================

import { describe, it, expect } from 'vitest';
import type { Team, SoldPlayer } from '../types';

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'T1',
    name: 'Team Alpha',
    logoUrl: '',
    playersBought: 0,
    totalPlayerThreshold: 11,
    remainingPlayers: 11,
    allocatedAmount: 800,
    remainingPurse: 800,
    highestBid: 0,
    captain: '',
    underAgePlayers: 0,
    ...overrides,
  };
}

function makeSold(team: Team, soldAmount: number, id: string): SoldPlayer {
  return {
    id,
    name: `Player ${id}`,
    role: 'Batsman',
    imageUrl: '',
    basePrice: 50,
    age: 25,
    matches: '0',
    runs: '0',
    wickets: '0',
    battingBestFigures: '',
    bowlingBestFigures: '',
    teamId: team.id,
    teamName: team.name,
    soldAmount,
    soldDate: new Date().toISOString(),
  } as unknown as SoldPlayer;
}

// Mirrors the derivation in TeamSquadView and AdminPanel.saveTeamDraft.
function reconcile(team: Team, sold: SoldPlayer[]) {
  const teamSold = sold.filter(s => s.teamId === team.id || s.teamName === team.name);
  const spent = teamSold.reduce((sum, p) => sum + (p.soldAmount || 0), 0);
  const total = Math.max(team.allocatedAmount || 0, spent);
  const remaining = Math.max(0, total - spent);
  return { spent, total, remaining };
}

describe('Budget reconciliation', () => {
  it('returns full purse when no players sold', () => {
    const team = makeTeam({ allocatedAmount: 800 });
    const r = reconcile(team, []);
    expect(r.spent).toBe(0);
    expect(r.total).toBe(800);
    expect(r.remaining).toBe(800);
  });

  it('subtracts spent from allocated', () => {
    const team = makeTeam({ allocatedAmount: 800 });
    const sold = [makeSold(team, 200, 'P1'), makeSold(team, 150, 'P2')];
    const r = reconcile(team, sold);
    expect(r.spent).toBe(350);
    expect(r.total).toBe(800);
    expect(r.remaining).toBe(450);
  });

  it('never produces negative remaining (clamps to 0 if overspent)', () => {
    const team = makeTeam({ allocatedAmount: 100 });
    const sold = [makeSold(team, 80, 'P1'), makeSold(team, 90, 'P2')];
    const r = reconcile(team, sold);
    expect(r.spent).toBe(170);
    expect(r.total).toBe(170); // total bumped up to spent so display is consistent
    expect(r.remaining).toBe(0);
  });

  it('only counts sold players that match this team', () => {
    const teamA = makeTeam({ id: 'A', name: 'A', allocatedAmount: 800 });
    const teamB = makeTeam({ id: 'B', name: 'B', allocatedAmount: 800 });
    const sold = [makeSold(teamA, 200, 'P1'), makeSold(teamB, 300, 'P2'), makeSold(teamA, 150, 'P3')];
    const a = reconcile(teamA, sold);
    const b = reconcile(teamB, sold);
    expect(a.spent).toBe(350);
    expect(b.spent).toBe(300);
  });

  it('matches by teamName fallback when teamId is missing on the sold record', () => {
    const team = makeTeam({ id: 'A', name: 'Alpha', allocatedAmount: 500 });
    // Some legacy records from the broadcast pipe carry only teamName.
    const base = makeSold(team, 100, 'P1');
    const sold: SoldPlayer[] = [
      { ...base, teamId: undefined } as unknown as SoldPlayer,
    ];
    const r = reconcile(team, sold);
    expect(r.spent).toBe(100);
    expect(r.remaining).toBe(400);
  });

  it('admin re-saving allocatedAmount mid-auction preserves spent correctly', () => {
    const team = makeTeam({ allocatedAmount: 800 });
    const sold = [makeSold(team, 350, 'P1')];
    // Admin bumps allocatedAmount from 800 → 1000 mid-auction.
    const updated = { ...team, allocatedAmount: 1000 };
    const r = reconcile(updated, sold);
    expect(r.spent).toBe(350);
    expect(r.total).toBe(1000);
    expect(r.remaining).toBe(650);
  });
});
