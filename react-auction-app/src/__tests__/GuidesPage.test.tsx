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
});