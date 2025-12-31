// ============================================================================
// USE THEME HOOK - Theme Management
// Handles dynamic theming and CSS variables
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { activeConfig, getActiveTheme, tournamentConfigs } from '../config';
import type { Theme } from '../types';

/**
 * Hook for managing application theme
 */
export function useTheme() {
  const [currentTheme, setCurrentTheme] = useState<Theme>(getActiveTheme());
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Apply theme CSS variables to document root
  const applyTheme = useCallback((theme: Theme) => {
    const root = document.documentElement;
    const colors = theme.colors;

    // Set CSS custom properties
    root.style.setProperty('--theme-primary', colors.primary);
    root.style.setProperty('--theme-secondary', colors.secondary);
    root.style.setProperty('--theme-accent', colors.accent);
    root.style.setProperty('--theme-success', colors.success);
    root.style.setProperty('--theme-warning', colors.warning);
    root.style.setProperty('--theme-danger', colors.danger);
    root.style.setProperty('--theme-text', colors.text);
    root.style.setProperty('--theme-text-secondary', colors.textSecondary);

    // Set background
    if (theme.background) {
      root.style.setProperty('--theme-bg-image', `url(${theme.background})`);
    }

    // Add theme class to body
    document.body.className = `theme-${theme.name.toLowerCase().replace(/\s+/g, '-')}`;
    
    setCurrentTheme(theme);
  }, []);

  // Initialize theme on mount
  useEffect(() => {
    applyTheme(getActiveTheme());
  }, [applyTheme]);

  // Switch theme by name
  const switchTheme = useCallback((themeName: string) => {
    // Check in theme map
    const themeFromMap = activeConfig.theme[themeName];
    if (themeFromMap && typeof themeFromMap !== 'string') {
      applyTheme(themeFromMap as Theme);
      return;
    }
    
    // Find theme in tournament configs
    for (const config of Object.values(tournamentConfigs)) {
      const configThemeKey = config.theme;
      const configTheme = activeConfig.theme[configThemeKey];
      if (configTheme && typeof configTheme !== 'string' && (configTheme as Theme).name === themeName) {
        applyTheme(configTheme as Theme);
        return;
      }
    }
    
    // Default theme
    applyTheme(getActiveTheme());
  }, [applyTheme]);

  // Toggle dark mode
  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => {
      const newMode = !prev;
      document.body.classList.toggle('dark-mode', newMode);
      return newMode;
    });
  }, []);

  // Get available themes
  const getAvailableThemes = useCallback((): Theme[] => {
    const themes: Theme[] = [];
    
    // Get themes from theme map
    for (const [key, value] of Object.entries(activeConfig.theme)) {
      if (key !== 'active' && typeof value !== 'string') {
        themes.push(value as Theme);
      }
    }
    
    return themes;
  }, []);

  return {
    currentTheme,
    isDarkMode,
    switchTheme,
    toggleDarkMode,
    applyTheme,
    getAvailableThemes,
  };
}

/**
 * Hook for getting theme-aware class names
 */
export function useThemeClasses() {
  const { currentTheme } = useTheme();

  const getButtonClass = useCallback((variant: 'primary' | 'secondary' | 'danger' | 'success') => {
    const baseClasses = 'px-4 py-2 rounded-lg font-semibold transition-all duration-200';
    
    switch (variant) {
      case 'primary':
        return `${baseClasses} bg-[var(--theme-primary)] text-white hover:opacity-90`;
      case 'secondary':
        return `${baseClasses} bg-[var(--theme-secondary)] text-white hover:opacity-90`;
      case 'danger':
        return `${baseClasses} bg-[var(--theme-danger)] text-white hover:opacity-90`;
      case 'success':
        return `${baseClasses} bg-[var(--theme-success)] text-white hover:opacity-90`;
      default:
        return baseClasses;
    }
  }, [currentTheme]);

  const getCardClass = useCallback(() => {
    return 'bg-white/10 rounded-xl shadow-lg border border-white/20';
  }, [currentTheme]);

  const getOverlayClass = useCallback((type: 'sold' | 'unsold') => {
    const baseClasses = 'fixed inset-0 flex items-center justify-center z-50';
    const bgColor = type === 'sold' 
      ? 'bg-[var(--theme-success)]/90' 
      : 'bg-[var(--theme-danger)]/90';
    
    return `${baseClasses} ${bgColor}`;
  }, [currentTheme]);

  return {
    getButtonClass,
    getCardClass,
    getOverlayClass,
  };
}
