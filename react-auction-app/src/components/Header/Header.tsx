// ============================================================================
// HEADER COMPONENT
// Minimal header with dropdown menu - Apple style
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getActiveTheme } from '../../config';
import { useAuction } from '../../hooks';
import { useAvailablePlayers, useSoldPlayers, useUnsoldPlayers, useSelectionMode, useTeams } from '../../store';

interface HeaderProps {
  onRefresh?: () => void;
  onShowHelp?: () => void;
  bidMultiplier?: number;
  onJumpToPlayer?: () => void;
  onShowConnectToTeam?: () => void;
}

export function Header({ onRefresh, onShowHelp, bidMultiplier = 1, onJumpToPlayer, onShowConnectToTeam }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const availablePlayers = useAvailablePlayers();
  const soldPlayers = useSoldPlayers();
  const unsoldPlayers = useUnsoldPlayers();
  const selectionMode = useSelectionMode();
  const teams = useTeams();
  const { toggleSelectionMode, currentRound } = useAuction();
  const activeTheme = getActiveTheme();

  const totalPlayers = availablePlayers.length + soldPlayers.length + unsoldPlayers.length;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="header-minimal">
      <div className="header-content">
        {/* Left - Title */}
        <div className="header-title">
          <span className="title-text">Cricket Auction</span>
          <span className="title-badge">R{currentRound}</span>
        </div>

        {/* Center - Team Keys Mapping (subtle) */}
        <div className="team-keys-hint">
          {teams.slice(0, 8).map((team, index) => (
            <span key={team.id} className="team-key-item">
              <span className="key-num">{index + 1}</span>
              <span className="key-team">{team.name.substring(0, 3).toUpperCase()}</span>
            </span>
          ))}
          <span className="bid-multiplier-hint">
            <span className="multiplier-label">×{bidMultiplier}</span>
            <span className="multiplier-keys">Q↑ W↓</span>
          </span>
        </div>

        {/* Right - Quick Stats */}
        <div className="header-stats">
          <div className="stat-pill">
            <span className="stat-dot available" />
            <span className="stat-num">{availablePlayers.length}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-dot sold" />
            <span className="stat-num">{soldPlayers.length}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-dot unsold" />
            <span className="stat-num">{unsoldPlayers.length}</span>
          </div>
        </div>

        {/* View Hint - Keyboard shortcuts */}
        <div className="header-view-hint">
          <kbd>S</kbd> Sold <kbd>U</kbd> Unsold <kbd>N</kbd> Next <kbd>T</kbd> Teams <kbd>Z</kbd> Undo
        </div>

        {/* Far Right - Menu Button */}
        <div className="header-actions" ref={menuRef}>
          <motion.button
            className="menu-trigger"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            whileTap={{ scale: 0.95 }}
          >
            <span className="menu-icon">
              {isMenuOpen ? '✕' : '☰'}
            </span>
          </motion.button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                className="dropdown-menu"
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
              >
                {/* Theme Info */}
                <div className="menu-section">
                  <div className="menu-header">
                    {activeTheme.seasonLogo && (
                      <img src={activeTheme.seasonLogo} alt="" className="menu-logo" />
                    )}
                    <div>
                      <div className="menu-title">{activeTheme.name}</div>
                      <div className="menu-subtitle">Round {currentRound}</div>
                    </div>
                  </div>
                </div>

                <div className="menu-divider" />

                {/* Stats Section */}
                <div className="menu-section">
                  <div className="menu-label">Player Stats</div>
                  <div className="menu-stats">
                    <div className="menu-stat">
                      <span className="stat-icon available">●</span>
                      <span className="stat-name">Available</span>
                      <span className="stat-value">{availablePlayers.length}/{totalPlayers}</span>
                    </div>
                    <div className="menu-stat">
                      <span className="stat-icon sold">●</span>
                      <span className="stat-name">Sold</span>
                      <span className="stat-value">{soldPlayers.length}</span>
                    </div>
                    <div className="menu-stat">
                      <span className="stat-icon unsold">●</span>
                      <span className="stat-name">Unsold</span>
                      <span className="stat-value">{unsoldPlayers.length}</span>
                    </div>
                  </div>
                </div>

                <div className="menu-divider" />

                {/* Actions */}
                <div className="menu-section">
                  <button 
                    className="menu-item"
                    onClick={() => { toggleSelectionMode(); }}
                  >
                    <span className="item-icon">{selectionMode === 'sequential' ? '📋' : '🎲'}</span>
                    <span className="item-text">
                      {selectionMode === 'sequential' ? 'Sequential Mode' : 'Random Mode'}
                    </span>
                    <span className="item-badge">
                      {selectionMode === 'sequential' ? 'Tap to randomize' : 'Tap for sequence'}
                    </span>
                  </button>

                  {/* Connect to Team - QR Modal */}
                  {onShowConnectToTeam && (
                    <button
                      className="menu-item"
                      onClick={() => { onShowConnectToTeam(); setIsMenuOpen(false); }}
                    >
                      <span className="item-icon">🔗</span>
                      <span className="item-text">Connect to Team</span>
                      <span className="item-badge">QR & Login</span>
                    </button>
                  )}

                  {onJumpToPlayer && selectionMode === 'sequential' && (
                    <button 
                      className="menu-item"
                      onClick={() => { onJumpToPlayer(); setIsMenuOpen(false); }}
                    >
                      <span className="item-icon">🎯</span>
                      <span className="item-text">Jump to Player ID</span>
                      <span className="item-badge">Press F</span>
                    </button>
                  )}

                  {onRefresh && (
                    <button 
                      className="menu-item"
                      onClick={() => { onRefresh(); setIsMenuOpen(false); }}
                    >
                      <span className="item-icon">↻</span>
                      <span className="item-text">Refresh Data</span>
                    </button>
                  )}

                  {onShowHelp && (
                    <button 
                      className="menu-item"
                      onClick={() => { onShowHelp(); setIsMenuOpen(false); }}
                    >
                      <span className="item-icon">⌨</span>
                      <span className="item-text">Keyboard Shortcuts</span>
                    </button>
                  )}

                  <button 
                    className="menu-item"
                    onClick={() => {
                      if (document.fullscreenElement) {
                        document.exitFullscreen();
                      } else {
                        document.documentElement.requestFullscreen();
                      }
                      setIsMenuOpen(false);
                    }}
                  >
                    <span className="item-icon">⛶</span>
                    <span className="item-text">Toggle Fullscreen</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
