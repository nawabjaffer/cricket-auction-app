import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureDefaultTenant: vi.fn(),
  listTenants: vi.fn(),
  clearActiveSessionState: vi.fn(),
}));

vi.mock('../services/tenantService', () => ({
  tenantService: {
    ensureDefaultTenant: mocks.ensureDefaultTenant,
    listTenants: mocks.listTenants,
    clearActiveSessionState: mocks.clearActiveSessionState,
  },
  ALL_SPORTS: [
    { key: 'cricket', label: 'Cricket' },
    { key: 'football', label: 'Football' },
    { key: 'kabaddi', label: 'Kabaddi' },
  ],
}));

import PlatformAdminPage from '../pages/PlatformAdminPage';

const tenant = {
  id: 'league_2026', slug: 'league-2026', name: 'League 2026', plan: 'pro' as const,
  isActive: true, createdAt: 1, sports: ['cricket' as const],
};

describe('Platform Admin active session cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureDefaultTenant.mockResolvedValue(tenant);
    mocks.listTenants.mockResolvedValue([tenant]);
    mocks.clearActiveSessionState.mockResolvedValue({ matchesScanned: 4, matchesClosed: 2 });
  });

  it('requires explicit confirmation and reports the cleanup result', async () => {
    render(<PlatformAdminPage />);
    expect(await screen.findByText('League 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear sessions' }));

    expect(screen.getByText('Preserve completed results and all score/event history.')).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Close Matches & Clear Sessions' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type CLEAR to confirm/), { target: { value: 'CLEAR' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(mocks.clearActiveSessionState).toHaveBeenCalledWith('league_2026'));
    expect(await screen.findByText(/Closed 2 live match\(es\).*Scanned 4 match\(es\)/)).toBeTruthy();
  });
});
