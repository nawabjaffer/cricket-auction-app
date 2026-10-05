import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantGate } from '../components/TenantGate/TenantGate';
import type { TenantRecord } from '../services/tenantService';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), watch: vi.fn(), activate: vi.fn() }));
vi.mock('../services/tenantService', () => ({ tenantService: { resolveBySlug: mocks.resolve, watchTenant: mocks.watch } }));
vi.mock('../services/tenantPath', () => ({ DEFAULT_TENANT_ID: 'epl_2026', setActiveTenant: mocks.activate }));

const tenant: TenantRecord = { id: 'epl_2026', slug: 'epl-2026', name: 'EPL', isActive: true, plan: 'pro', createdAt: 0 };

function open(path = '/epl-2026/admin') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/:tenantSlug/admin" element={<TenantGate><div>Private admin</div></TenantGate>} />
    <Route path="/admin" element={<TenantGate><div>Private admin</div></TenantGate>} />
  </Routes></MemoryRouter>);
}

describe('tenant access gate', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue(tenant); });

  it.each(['/epl-2026/admin', '/admin'])('blocks deactivated default tenants at %s', async (path) => {
    mocks.watch.mockImplementation(async (_id, callback) => { callback({ ...tenant, isActive: false }); return vi.fn(); });
    open(path);
    expect(await screen.findByText(/contact the administrators/)).toBeTruthy();
    expect(screen.queryByText('Private admin')).toBeNull();
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it('revokes an open page and restores access on reactivation', async () => {
    let notify!: (record: TenantRecord | null) => void;
    const unsubscribe = vi.fn();
    mocks.watch.mockImplementation(async (_id, callback) => { notify = callback; callback(tenant); return unsubscribe; });
    const view = open();
    await screen.findByText('Private admin');
    act(() => notify({ ...tenant, isActive: false }));
    expect(screen.queryByText('Private admin')).toBeNull();
    act(() => notify(tenant));
    expect(screen.getByText('Private admin')).toBeTruthy();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('fails closed when registry resolution fails', async () => {
    mocks.resolve.mockRejectedValue(new Error('offline'));
    open();
    await waitFor(() => expect(screen.getByText('Failed to load tournament.')).toBeTruthy());
    expect(screen.queryByText('Private admin')).toBeNull();
  });

  it('fails closed when the live activation listener is denied', async () => {
    mocks.watch.mockImplementation(async (_id, _callback, onError) => { onError(new Error('denied')); return vi.fn(); });
    open();
    expect(await screen.findByText(/Unable to verify tournament access/)).toBeTruthy();
    expect(screen.queryByText('Private admin')).toBeNull();
  });
});