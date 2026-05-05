// ============================================================================
// HEADER COMPONENT
// Minimal header with dropdown menu - Apple style
// ============================================================================

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoClose, IoMenu, IoLink, IoRefresh, IoShuffle, IoList, IoSearch } from 'react-icons/io5';
import { getActiveTheme } from '../../config';
import { useAuction } from '../../hooks';
import { useAvailablePlayers, useSoldPlayers, useUnsoldPlayers, useSelectionMode, useTeams } from '../../store';
import { getRoleLabel } from '../../utils/playerStats';
import type { SoldPlayer, UnsoldPlayer } from '../../types';

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
  const [activeDropdown, setActiveDropdown] = useState<'sold' | 'unsold' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const availablePlayers = useAvailablePlayers();
  const soldPlayers = useSoldPlayers();
  const unsoldPlayers = useUnsoldPlayers();
  const selectionMode = useSelectionMode();
  const teams = useTeams();
  const { toggleSelectionMode, currentRound } = useAuction();
  const activeTheme = getActiveTheme();

  const totalPlayers = availablePlayers.length + soldPlayers.length + unsoldPlayers.length;

  const toggleDropdown = useCallback((type: 'sold' | 'unsold') => {
    setActiveDropdown(prev => prev === type ? null : type);
    setIsMenuOpen(false);
  }, []);

  // Close menu and dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className={`header-minimal ${variant === 'live' ? 'header-minimal--live' : ''}`}>
      <div className="header-content">
        {/* Left - Status + Title */}
        <div className="header-left-group">
          {showConnectionStatus && (
            <button
              type="button"
              className="header-connection-icon"
              onClick={() => onDismissConnectionStatus?.()}
              aria-label="Connection status"
              title="Firebase connected - Mobile devices can sync"
            >
              <IoLink />
              <span className="header-connection-tooltip">Firebase connected</span>
            </button>
          )}

          <div className="header-title">
          <span className="title-text">EPL Auction</span>
          <span className="title-badge">R{currentRound}</span>
          </div>
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
        <div className="header-stats" ref={dropdownRef}>
          <div className="stat-pill">
            <span className="stat-dot available" />
            <span className="stat-num">{availablePlayers.length}</span>
          </div>
          <button
            type="button"
            className={`stat-pill stat-pill--interactive ${activeDropdown === 'sold' ? 'stat-pill--active' : ''}`}
            onClick={() => toggleDropdown('sold')}
          >
            <span className="stat-dot sold" />
            <span className="stat-num">{soldPlayers.length}</span>
          </button>
          <button
            type="button"
            className={`stat-pill stat-pill--interactive ${activeDropdown === 'unsold' ? 'stat-pill--active' : ''}`}
            onClick={() => toggleDropdown('unsold')}
          >
            <span className="stat-dot unsold" />
            <span className="stat-num">{unsoldPlayers.length}</span>
          </button>

          {/* Sold Players Dropdown */}
          <AnimatePresence>
            {activeDropdown === 'sold' && (
              <motion.div
                className="stat-dropdown stat-dropdown--sold"
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
              >
                <div className="stat-dropdown__header">
                  <span className="stat-dropdown__title">
                    <span className="stat-dot sold" /> Recent Sold ({soldPlayers.length})
                  </span>
                  <button type="button" className="stat-dropdown__close" onClick={() => setActiveDropdown(null)}>
                    <IoClose size={14} />
                  </button>
                </div>
                <div className="stat-dropdown__list">
                  {soldPlayers.length === 0 ? (
                    <div className="stat-dropdown__empty">No players sold yet</div>
                  ) : (
                    [...soldPlayers].reverse().map((p: SoldPlayer) => (
                      <div key={p.id} className="stat-dropdown__item stat-dropdown__item--sold">
                        <div className="stat-dropdown__item-left">
                          <span className="stat-dropdown__item-name">{p.name}</span>
                          <span className="stat-dropdown__item-meta">{getRoleLabel(p.role)}</span>
                        </div>
                        <div className="stat-dropdown__item-right">
                          <span className="stat-dropdown__item-amount">₹{p.soldAmount}L</span>
                          <span className="stat-dropdown__item-team">{p.teamName}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Unsold Players Dropdown */}
          <AnimatePresence>
            {activeDropdown === 'unsold' && (
              <motion.div
                className="stat-dropdown stat-dropdown--unsold"
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
              >
                <div className="stat-dropdown__header">
                  <span className="stat-dropdown__title">
                    <span className="stat-dot unsold" /> Unsold ({unsoldPlayers.length})
                  </span>
                  <button type="button" className="stat-dropdown__close" onClick={() => setActiveDropdown(null)}>
                    <IoClose size={14} />
                  </button>
                </div>
                <div className="stat-dropdown__list">
                  {unsoldPlayers.length === 0 ? (
                    <div className="stat-dropdown__empty">No unsold players</div>
                  ) : (
                    unsoldPlayers.map((p: UnsoldPlayer) => (
                      <div key={p.id} className="stat-dropdown__item stat-dropdown__item--unsold">
                        <div className="stat-dropdown__item-left">
                          <span className="stat-dropdown__item-name">{p.name}</span>
                          <span className="stat-dropdown__item-meta">{getRoleLabel(p.role)} · Base ₹{p.basePrice}L</span>
                        </div>
                        <div className="stat-dropdown__item-right">
                          <span className="stat-dropdown__item-round">R{p.round}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
                    {activeTheme.seasonLogo ? (
                      <img src={activeTheme.seasonLogo} alt="" className="menu-logo" />
                    ) : (
                      <div className="menu-logo menu-logo--placeholder">
                        <span className="menu-logo-hint">No logo</span>
                      </div>
                    )}
                    <div>
                      <div className="menu-title">{activeTheme.name}</div>
                      <div className="menu-subtitle">Round {currentRound}</div>
                    </div>
                  </div>
                </div>

                <div className="menu-divider" />

                {/* Stats Section */}
                <div className="menu-section menu-section--stats">
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

                {/* Auction Controls */}
                <div className="menu-section menu-section--actions">
                  <div className="menu-label">Auction Controls</div>
                  <button 
                    className="menu-item"
                    title={selectionMode === 'sequential' ? 'Sequential Mode' : 'Random Mode'}
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
                      title="Connect to Team"
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
                      title="Jump to Player ID"
                      onClick={() => { onJumpToPlayer(); setIsMenuOpen(false); }}
                    >
                      <span className="item-icon"><IoSearch /></span>
                      <span className="item-text">Jump to Player ID</span>
                      <span className="item-badge">Press F</span>
                    </button>
                  )}

                  {menuExtras.map((item) => (
                    <button
                      key={item.label}
                      className="menu-item"
                      title={item.description || item.label}
                      onClick={() => {
                        item.onClick();
                        setIsMenuOpen(false);
                      }}
                    >
                      <span className="item-icon">{item.icon || <IoList />}</span>
                      <span className="item-text">{item.label}</span>
                      {item.description && <span className="item-badge">{item.description}</span>}
                    </button>
                  ))}
                </div>

                <div className="menu-divider" />

                {/* Utility */}
                <div className="menu-section menu-section--actions">
                  <div className="menu-label">Utility</div>

                  {onRefresh && (
                    <button 
                      className="menu-item"
                      title="Refresh Data"
                      onClick={() => { onRefresh(); setIsMenuOpen(false); }}
                    >
                      <span className="item-icon"><IoRefresh /></span>
                      <span className="item-text">Refresh Data</span>
                      <span className="item-badge">Reload sheets</span>
                    </button>
                  )}

                  {onShowHelp && (
                    <button 
                      className="menu-item"
                      title="Keyboard Shortcuts"
                      onClick={() => { onShowHelp(); setIsMenuOpen(false); }}
                    >
                      <span className="item-icon">⌨</span>
                      <span className="item-text">Keyboard Shortcuts</span>
                    </button>
                  )}

                  <button 
                    className="menu-item"
                    title="Toggle Fullscreen"
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

                {onResetAuction && (
                  <>
                    <div className="menu-divider" />
                    <div className="menu-section menu-section--actions">
                      <div className="menu-label">Danger Zone</div>
                      <button 
                        className="menu-item danger"
                        title="Reset Auction"
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
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
