import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import GuidesPage from '../pages/GuidesPage';

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