// ============================================================================
// HEADER COMPONENT
// Minimal header with dropdown menu - Apple style
// ============================================================================

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoClose, IoMenu, IoLink, IoRefresh, IoShuffle, IoList, IoSearch } from 'react-icons/io5';
import { getActiveTheme } from '../../config';
import { useAuction } from '../../hooks';
import { useAvailablePlayers, useSoldPlayers, useUnsoldPlayers, useSelectionMode, useTeams } from '../../store';

interface HeaderProps {
  onRefresh?: () => void;
  onResetAuction?: () => void;
  onShowHelp?: () => void;
  bidMultiplier?: number;
  onJumpToPlayer?: () => void;
  onShowConnectToTeam?: () => void;
  showConnectionStatus?: boolean;
  onDismissConnectionStatus?: () => void;
  variant?: 'default' | 'live';
  menuExtras?: Array<{
    label: string;
    description?: string;
    icon?: ReactNode;
    onClick: () => void;
  }>;
}

export function Header({ onRefresh, onResetAuction, onShowHelp, bidMultiplier = 1, onJumpToPlayer, onShowConnectToTeam, showConnectionStatus = false, onDismissConnectionStatus, variant = 'default', menuExtras = [] }: HeaderProps) {
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
    <header className={`header-minimal ${variant === 'live' ? 'header-minimal--live' : ''}`}>
      {/* Firebase Connection Status Banner */}
      <AnimatePresence>
        {showConnectionStatus && (
          <motion.div
            className="connection-status-banner"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="banner-content">
              <div className="banner-indicator">
                <div className="pulse-dot" />
              </div>
              <span className="banner-text">Firebase Connected - Mobile devices can sync</span>
              {onDismissConnectionStatus && (
                <button
                  className="banner-close"
                  onClick={onDismissConnectionStatus}
                  aria-label="Dismiss"
                >
                  <IoClose />
                </button>
              )}
            </div>

                {menuExtras.length > 0 && (
                  <>
                    <div className="menu-divider" />
                    <div className="menu-section">
                      <div className="menu-label">Live Controls</div>
                      {menuExtras.map((item) => (
                        <button
                          key={item.label}
                          className="menu-item"
                          onClick={() => {
                            item.onClick();
                            setIsMenuOpen(false);
                          }}
                        >
                          {item.icon && <span className="item-icon">{item.icon}</span>}
                          <span className="item-text">{item.label}</span>
                          {item.description && (
                            <span className="item-badge">{item.description}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
          </motion.div>
        )}
      </AnimatePresence>

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
              {isMenuOpen ? <IoClose /> : <IoMenu />}
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
                    <span className="item-icon">{selectionMode === 'sequential' ? <IoList /> : <IoShuffle />}</span>
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
                      <span className="item-icon"><IoLink /></span>
                      <span className="item-text">Connect to Team</span>
                      <span className="item-badge">QR & Login</span>
                    </button>
                  )}

                  {onJumpToPlayer && selectionMode === 'sequential' && (
                    <button 
                      className="menu-item"
                      onClick={() => { onJumpToPlayer(); setIsMenuOpen(false); }}
                    >
                      <span className="item-icon"><IoSearch /></span>
                      <span className="item-text">Jump to Player ID</span>
                      <span className="item-badge">Press F</span>
                    </button>
                  )}

                  {onRefresh && (
                    <button 
                      className="menu-item"
                      onClick={() => { onRefresh(); setIsMenuOpen(false); }}
                    >
                      <span className="item-icon"><IoRefresh /></span>
                      <span className="item-text">Refresh Data</span>
                      <span className="item-badge">Reload sheets</span>
                    </button>
                  )}

                  {onResetAuction && (
                    <button 
                      className="menu-item danger"
                      onClick={() => {
                        if (confirm('Reset entire auction? This will clear all bids and reload from Google Sheets. This action cannot be undone!')) {
                          onResetAuction();
                          setIsMenuOpen(false);
                        }
                      }}
                    >
                      <span className="item-icon"><IoRefresh /></span>
                      <span className="item-text">Reset Auction</span>
                      <span className="item-badge warning">Clear all bids</span>
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
