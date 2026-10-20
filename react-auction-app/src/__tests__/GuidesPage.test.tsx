import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GuidesPage from '../pages/GuidesPage';
import HelpPage from '../pages/HelpPage';

describe('public app help', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 })));
  afterEach(() => vi.unstubAllGlobals());
  it('offers general web and Android help without a tenant or login', async () => {
    render(<MemoryRouter initialEntries={['/help']}><Routes><Route path="/help" element={<HelpPage />} /></Routes></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'NJS Store help' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Web & tournament setup/ }).getAttribute('href')).toBe('/help?section=administration');
    expect(screen.getByRole('link', { name: /Android & live streaming/ }).getAttribute('href')).toBe('/help?section=mobile');
    expect(await screen.findByText('The Android testing download is currently unavailable.')).toBeTruthy();
  });
  it('preserves existing direct links to detailed guides', () => {
    render(<MemoryRouter initialEntries={['/help?section=mobile']}><Routes><Route path="/help" element={<HelpPage />} /></Routes></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'NJS Live Studio for Android' })).toBeTruthy();
  });
  it('returns from a public guide to the customer help hub without a tenant gate', async () => {
    render(<MemoryRouter initialEntries={['/help?section=mobile']}><Routes><Route path="/help" element={<HelpPage />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Help center' }));
    expect(await screen.findByRole('heading', { name: 'NJS Store help' })).toBeTruthy();
    expect(await screen.findByText('The Android testing download is currently unavailable.')).toBeTruthy();
  });
  it('filters customer help topics and switches platform guidance', async () => {
    render(<MemoryRouter initialEntries={['/help']}><HelpPage /></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search help topics' }), { target: { value: 'auction' } });
    expect(screen.getByRole('link', { name: /Run a player auction/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Score a match/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Android' }));
    expect(screen.getByRole('heading', { name: 'Three modes. One match-day app.' })).toBeTruthy();
    expect(await screen.findByText('The Android testing download is currently unavailable.')).toBeTruthy();
  });
  it('explains Android testing limits and links only a validated release', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schema: 1, appId: 'com.njsstore.livestudio', versionName: '1.3.0', versionCode: 1003000, minSdk: 24, size: 1000, file: 'test.apk', sha256: 'a'.repeat(64), channel: 'testing', signing: 'development' }) }));
    render(<MemoryRouter initialEntries={['/help']}><HelpPage /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: /Download Android test APK/ })).toBeTruthy();
    expect(screen.getByText(/Not a production-certified Android release/)).toBeTruthy();
  });
});

describe('guide center', () => {
  it('loads the separate guide sections and displays the selected guide', () => {
    render(
      <MemoryRouter initialEntries={['/help']}>
        <Routes><Route path="/help" element={<GuidesPage />} /></Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Auction Guide' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Kabaddi/ }));
    expect(screen.getByRole('heading', { name: 'Kabaddi Guide' })).toBeTruthy();
  });

  it('filters the section list by guide content', () => {
    render(
      <MemoryRouter initialEntries={['/help']}>
        <Routes><Route path="/help" element={<GuidesPage />} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Search guides'), { target: { value: 'Super Movements' } });
    expect(screen.getByRole('button', { name: /Broadcast & OBS/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Kabaddi/ })).toBeNull();
  });

  it('opens the requested guide section from the scorer header link', () => {
    render(
      <MemoryRouter initialEntries={['/help?section=broadcast']}>
        <Routes><Route path="/help" element={<GuidesPage />} /></Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Broadcast and OBS Guide' })).toBeTruthy();
  });

  it('opens the Android studio guide from its section link', () => {
    render(
      <MemoryRouter initialEntries={['/help?section=mobile']}>
        <Routes><Route path="/help" element={<GuidesPage />} /></Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'NJS Live Studio for Android' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Operator Quick Start' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Device Release Checks' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Android Live Studio/ }).getAttribute('aria-current')).toBe('page');
  });

  it('includes Android setup content in guide searches', () => {
    render(
      <MemoryRouter initialEntries={['/help']}>
        <Routes><Route path="/help" element={<GuidesPage />} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Search guides'), { target: { value: 'Android Keystore AES-GCM' } });
    expect(screen.getByRole('button', { name: /Android Live Studio/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Auction/ })).toBeNull();
  });

  it('includes carrom camera and Android broadcast instructions', () => {
    render(
      <MemoryRouter initialEntries={['/help?section=carrom']}>
        <Routes><Route path="/help" element={<GuidesPage />} /></Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '5. Camera, host and OBS dock' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '6. Android Live Studio' })).toBeTruthy();
    expect(screen.getByText('/<tournament>/carrom/scorer/camera-host')).toBeTruthy();
  });
});