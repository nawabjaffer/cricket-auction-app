import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('../hooks/useTenantNavigate', () => ({
  useTenantNavigate: () => mocks.navigate,
  getTenantSlugFromPath: (pathname: string) => pathname.startsWith('/ppl-2026/') ? 'ppl-2026' : '',
}));
vi.mock('../pages/scorerPages', () => ({
  gameTypeIcon: () => '🏏',
  gameTypeLabel: () => 'Cricket',
  SUPPORTED_GAME_TYPES: ['cricket'],
}));

import { withScorerAdminChrome } from '../pages/withScorerAdminChrome';

const WrappedScorer = withScorerAdminChrome(() => <main>Scorer workspace</main>, {
  gameType: 'cricket',
  subtitle: 'Match setup',
});

describe('scorer admin chrome shortcuts', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the guide and current-sport tools without cross-sport scorer links', () => {
    const openWindow = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<MemoryRouter initialEntries={['/ppl-2026/cricket/scorer/admin']}><WrappedScorer /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Guides' }));
    expect(openWindow).toHaveBeenNthCalledWith(1, 'http://localhost:3000/ppl-2026/help?section=broadcast', '_blank', 'noopener,noreferrer');
    expect(screen.queryByRole('button', { name: /Football Scorer/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Kabaddi Scorer/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Update Scorecard' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Animations' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pre-Match' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'OBS Settings' })).toBeNull();
  });
});
