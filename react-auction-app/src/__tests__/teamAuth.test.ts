// ============================================================================
// TEAM AUTH REGRESSION TESTS
// Covers the "invalid username" bug for the connect-bidding login flow:
//   - admin saves authUsername / authPassword in the Teams tab
//   - team rep types those exact values on /connect-bidding
//   - login must succeed under whitespace / NBSP / case-fold / zero-width edge
//     cases that came from spreadsheet copy-paste.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { authService, type TeamCredentials } from '../services/auth';

const BASE_CRED: TeamCredentials = {
  teamId: 'team_z',
  teamName: 'Z Squad',
  username: 'zsquad',
  password: 'zsquad@2026',
  primaryColor: '#000',
  secondaryColor: '#fff',
};

describe('authService.login — credential normalization', () => {
  beforeEach(() => {
    authService.logout();
  });

  it('accepts exact credentials', () => {
    authService.setTeamCredentials([BASE_CRED]);
    const r = authService.login('zsquad', 'zsquad@2026');
    expect(r.success).toBe(true);
    expect(r.session?.teamId).toBe('team_z');
  });

  it('accepts mixed-case username', () => {
    authService.setTeamCredentials([BASE_CRED]);
    const r = authService.login('ZSquad', 'zsquad@2026');
    expect(r.success).toBe(true);
  });

  it('tolerates leading/trailing whitespace in inputs', () => {
    authService.setTeamCredentials([BASE_CRED]);
    const r = authService.login('  zsquad  ', '  zsquad@2026  ');
    expect(r.success).toBe(true);
  });

  it('tolerates NBSP and zero-width characters from spreadsheet paste', () => {
    authService.setTeamCredentials([BASE_CRED]);
    // U+00A0 NBSP, U+200B zero-width space pasted into the password input
    const pastedPassword = '\u200Bzsquad@2026\u00A0';
    const r = authService.login('zsquad', pastedPassword);
    expect(r.success).toBe(true);
  });

  it('tolerates whitespace and zero-width chars stored in the credential record', () => {
    // Simulates admin saving with stray invisible characters (e.g. CSV import).
    authService.setTeamCredentials([{
      ...BASE_CRED,
      username: ' zsquad ',
      password: '\u200Bzsquad@2026\u00A0',
    }]);
    const r = authService.login('zsquad', 'zsquad@2026');
    expect(r.success).toBe(true);
  });

  it('rejects wrong password and returns Invalid credentials', () => {
    authService.setTeamCredentials([BASE_CRED]);
    const r = authService.login('zsquad', 'wrong');
    expect(r.success).toBe(false);
    expect(r.error).toBe('Invalid credentials');
  });

  it('rejects unknown username', () => {
    authService.setTeamCredentials([BASE_CRED]);
    const r = authService.login('nope', 'zsquad@2026');
    expect(r.success).toBe(false);
  });

  it('does not trim characters inside the password (e.g. "ab cd" stays "ab cd")', () => {
    authService.setTeamCredentials([{ ...BASE_CRED, password: 'ab cd' }]);
    expect(authService.login('zsquad', 'ab cd').success).toBe(true);
    expect(authService.login('zsquad', 'abcd').success).toBe(false);
  });
});
