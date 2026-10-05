import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTheme } from '../hooks/useTheme';
import { getActiveTheme } from '../config';

describe('useTheme text contrast tokens', () => {
  it('propagates the configured foreground into shared app and legacy tokens', () => {
    const theme = {
      ...getActiveTheme(),
      name: 'Light test theme',
      colors: {
        ...getActiveTheme().colors,
        text: '#14211f',
        textSecondary: '#5a6866',
      },
    };
    const { result } = renderHook(() => useTheme());

    act(() => result.current.applyTheme(theme));

    expect(document.documentElement.style.getPropertyValue('--theme-text-primary')).toBe('#14211f');
    expect(document.documentElement.style.getPropertyValue('--app-text-primary')).toBe('#14211f');
    expect(document.documentElement.style.getPropertyValue('--app-text-secondary')).toBe('#5a6866');
  });
});