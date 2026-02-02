// ============================================================================
// ADMIN PANEL COMPONENT
// Manage auction configuration, teams, players, theme, and export data
// ============================================================================

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoClose, IoSave, IoRefresh, IoDownload, IoVideocam } from 'react-icons/io5';
import { auctionPersistence, type AdminSettings } from '../../services/auctionPersistence';
import { googleSheetsService } from '../../services';
import { useAuctionStore } from '../../store/auctionStore';
import { exportSoldPlayers } from '../../utils/exportData';
import FeatureFlagsTab from './FeatureFlagsTab';
import StreamingTab from './StreamingTab';
import './AdminPanel.css';
import type { Team } from '../../types';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'drawer' | 'page';
}

export function AdminPanel({ isOpen, onClose, mode = 'drawer' }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'theme' | 'teams' | 'players' | 'export' | 'features' | 'streaming' | 'reset'>('theme');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Theme settings
  const [organizerName, setOrganizerName] = useState('');
  const [organizerLogo, setOrganizerLogo] = useState('');
  const [auctionTitle, setAuctionTitle] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');
  const [secondaryColor, setSecondaryColor] = useState('#06b6d4');
  const [accentColor, setAccentColor] = useState('#f59e0b');
  const [maxUnsoldRounds, setMaxUnsoldRounds] = useState(1);

  // Store
  const { teams, setTeams, soldPlayers, originalPlayers, setPlayers, setSoldPlayers, setUnsoldPlayers, resetAuction, reconcilePlayerPools } = useAuctionStore();
  const [editingTeams, setEditingTeams] = useState<Team[]>([]);
  const [editingPlayers, setEditingPlayers] = useState<typeof originalPlayers>([]);
  const [playerSearch, setPlayerSearch] = useState('');

  // Load admin settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await auctionPersistence.getAdminSettings();
        if (settings) {
          setOrganizerName(settings.organizerName);
          setOrganizerLogo(settings.organizerLogo);
          setAuctionTitle(settings.auctionTitle);
          setPrimaryColor(settings.themeColors.primary);
          setSecondaryColor(settings.themeColors.secondary);
          setAccentColor(settings.themeColors.accent);
          setMaxUnsoldRounds(settings.maxUnsoldRounds ?? 1);
          useAuctionStore.getState().setMaxUnsoldRounds(settings.maxUnsoldRounds ?? 1);
        }
      } catch (error) {
        console.error('[AdminPanel] Failed to load settings:', error);
      }
    };

    if (isOpen) {
      loadSettings();
      setEditingTeams(teams);
      setEditingPlayers(originalPlayers);
    }
  }, [isOpen, teams, originalPlayers]);

  // Handle save theme settings
  const handleSaveTheme = async () => {
    setIsSaving(true);
    try {
      const settings: AdminSettings = {
        organizerName,
        organizerLogo,
        numberOfTeams: teams.length,
        maxUnsoldRounds,
        themeColors: {
          primary: primaryColor,
          secondary: secondaryColor,
          accent: accentColor,
        },
        auctionTitle,
        updatedAt: Date.now(),
      };

      await auctionPersistence.saveAdminSettings(settings);

      // Apply theme colors to document
      document.documentElement.style.setProperty('--color-primary', primaryColor);
      document.documentElement.style.setProperty('--color-secondary', secondaryColor);
      document.documentElement.style.setProperty('--color-accent', accentColor);
      useAuctionStore.getState().setMaxUnsoldRounds(maxUnsoldRounds);

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[AdminPanel] Failed to save settings:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle save teams
  const handleSaveTeams = async () => {
    setIsSaving(true);
    try {
      await auctionPersistence.saveTeams(editingTeams);
      setTeams(editingTeams);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[AdminPanel] Failed to save teams:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle export sold players
  const handleExportSoldPlayers = () => {
    if (soldPlayers.length === 0) {
      alert('No sold players to export');
      return;
    }

    const records = soldPlayers.map(player => ({
      id: player.id,
      playerName: player.name,
      role: player.role,
      age: player.age,
      matches: player.matches,
      bestFigures: player.bowlingBestFigures || 'N/A',
      teamName: player.teamName,
      soldAmount: player.soldAmount,
      basePrice: player.basePrice,
      imageUrl: player.imageUrl,
      timestamp: new Date(player.soldDate).getTime(),
    }));

    exportSoldPlayers(records);
  };

  const handleSavePlayers = async () => {
    if (editingPlayers.length === 0) return;

    setIsSaving(true);
    try {
      // Update store (filters sold/unsold automatically)
      setPlayers(editingPlayers);

      // Persist admin overrides to Firebase
      await auctionPersistence.saveAdminPlayers(editingPlayers);

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[AdminPanel] Failed to save players:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePullFromSheets = async () => {
    const confirmed = window.confirm(
      'This will wipe ALL Firebase auction data and reload fresh data from Google Sheets. Continue?'
    );

    if (!confirmed) return;

    setIsSaving(true);
    try {
      // Clear cached sheets data so we pull fresh values
      googleSheetsService.clearCache();

      // Wipe Firebase auction data
      await auctionPersistence.clearAuctionData();
      await auctionPersistence.clearAdminPlayers();

      // Fetch fresh data from Google Sheets
      const [freshTeams, freshPlayers] = await Promise.all([
        googleSheetsService.fetchTeams(),
        googleSheetsService.fetchPlayers([]),
      ]);

      // Save to Firebase
      await auctionPersistence.saveTeams(freshTeams);
      await auctionPersistence.saveInitialSnapshot(freshPlayers, freshTeams);
      await auctionPersistence.saveAdminPlayers(freshPlayers);

      // Update local store
      setTeams(freshTeams);
      setPlayers(freshPlayers);
      setSoldPlayers([]);
      setUnsoldPlayers([]);
      resetAuction();
      reconcilePlayerPools();

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[AdminPanel] Failed to pull data from sheets:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle reset auction
  const handleResetAuction = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to reset the auction? This will clear all sold and unsold players and restore the initial snapshot.'
    );

    if (!confirmed) return;

    try {
      setIsSaving(true);

      // Clear auction data
      await auctionPersistence.clearAuctionData();

      // Get initial snapshot
      const snapshot = await auctionPersistence.getInitialSnapshot();
      if (snapshot) {
        // Restore from snapshot
        useAuctionStore.getState().setPlayers(snapshot.players);
        useAuctionStore.getState().setTeams(snapshot.teams);
        useAuctionStore.getState().setSoldPlayers([]);
        useAuctionStore.getState().setUnsoldPlayers([]);
        useAuctionStore.getState().resetAuction();

        setSaveStatus('success');
        setTimeout(() => {
          setSaveStatus('idle');
          onClose();
          window.location.reload();
        }, 2000);
      } else {
        console.error('[AdminPanel] No initial snapshot found');
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (error) {
      console.error('[AdminPanel] Failed to reset auction:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const panelContent = (
    <div className={`admin-panel ${mode === 'page' ? 'admin-panel--page' : ''}`}>
      {/* Header */}
      <div className="admin-header">
        <h2>Admin Panel</h2>
        <button className="admin-close-btn" onClick={onClose}>
          <IoClose size={24} />
        </button>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'theme' ? 'active' : ''}`}
          onClick={() => setActiveTab('theme')}
        >
          Theme & Settings
        </button>
        <button
          className={`admin-tab ${activeTab === 'teams' ? 'active' : ''}`}
          onClick={() => setActiveTab('teams')}
        >
          Teams
        </button>
        <button
          className={`admin-tab ${activeTab === 'players' ? 'active' : ''}`}
          onClick={() => setActiveTab('players')}
        >
          Players
        </button>
        <button
          className={`admin-tab ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          Export
        </button>
        <button
          className={`admin-tab ${activeTab === 'features' ? 'active' : ''}`}
          onClick={() => setActiveTab('features')}
        >
          Features
        </button>
        <button
          className={`admin-tab ${activeTab === 'streaming' ? 'active' : ''}`}
          onClick={() => setActiveTab('streaming')}
        >
          <IoVideocam style={{ marginRight: 4 }} />
          Streaming
        </button>
        <button
          className={`admin-tab ${activeTab === 'reset' ? 'active' : ''}`}
          onClick={() => setActiveTab('reset')}
        >
          Reset
        </button>
      </div>

      {/* Content */}
      <div className="admin-content">
              {/* Theme Tab */}
              {activeTab === 'theme' && (
                <div className="admin-section">
                  <h3>Auction Settings</h3>

                  <div className="form-group">
                    <label>Organizer Name</label>
                    <input
                      type="text"
                      value={organizerName}
                      onChange={(e) => setOrganizerName(e.target.value)}
                      placeholder="e.g., Cricket League"
                    />
                  </div>

                  <div className="form-group">
                    <label>Auction Title</label>
                    <input
                      type="text"
                      value={auctionTitle}
                      onChange={(e) => setAuctionTitle(e.target.value)}
                      placeholder="e.g., IPL Auction 2024"
                    />
                  </div>

                  <div className="form-group">
                    <label>Max Unsold Rounds</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={maxUnsoldRounds}
                      onChange={(e) => setMaxUnsoldRounds(Math.max(0, parseInt(e.target.value || '0', 10)))}
                      placeholder="e.g., 2"
                    />
                    <small style={{ color: '#6b7280' }}>
                      How many additional rounds to run for unsold players (Round 1 + this value).
                    </small>
                  </div>

                  <div className="form-group">
                    <label>Organizer Logo URL</label>
                    <input
                      type="text"
                      value={organizerLogo}
                      onChange={(e) => setOrganizerLogo(e.target.value)}
                      placeholder="https://example.com/logo.png"
                    />
                  </div>

                  <h3 style={{ marginTop: '2rem' }}>Theme Colors</h3>

                  <div className="color-grid">
                    <div className="color-picker-group">
                      <label>Primary Color</label>
                      <div className="color-input-wrapper">
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                        />
                        <input
                          type="text"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          placeholder="#3b82f6"
                        />
                      </div>
                    </div>

                    <div className="color-picker-group">
                      <label>Secondary Color</label>
                      <div className="color-input-wrapper">
                        <input
                          type="color"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                        />
                        <input
                          type="text"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                          placeholder="#06b6d4"
                        />
                      </div>
                    </div>

                    <div className="color-picker-group">
                      <label>Accent Color</label>
                      <div className="color-input-wrapper">
                        <input
                          type="color"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                        />
                        <input
                          type="text"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          placeholder="#f59e0b"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    className="admin-btn admin-btn-primary"
                    onClick={handleSaveTheme}
                    disabled={isSaving}
                  >
                    <IoSave size={18} /> Save Settings
                  </button>
                </div>
              )}

              {/* Teams Tab */}
              {activeTab === 'teams' && (
                <div className="admin-section">
                  <h3>Manage Teams</h3>

                  <div className="teams-list">
                    {editingTeams.map((team, index) => (
                      <div key={team.id} className="team-edit-item">
                        <div className="form-group">
                          <label>Team {index + 1} Name</label>
                          <input
                            type="text"
                            value={team.name}
                            onChange={(e) => {
                              const updated = [...editingTeams];
                              updated[index].name = e.target.value;
                              setEditingTeams(updated);
                            }}
                          />
                        </div>

                        <div className="form-group">
                          <label>Captain</label>
                          <input
                            type="text"
                            list="admin-captain-list"
                            value={team.captain || ''}
                            placeholder="Select captain"
                            onChange={(e) => {
                              const updated = [...editingTeams];
                              updated[index].captain = e.target.value;
                              setEditingTeams(updated);
                            }}
                          />
                        </div>

                        <div className="form-group">
                          <label>Logo URL</label>
                          <input
                            type="text"
                            value={team.logoUrl}
                            onChange={(e) => {
                              const updated = [...editingTeams];
                              updated[index].logoUrl = e.target.value;
                              setEditingTeams(updated);
                            }}
                          />
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label>Players Threshold</label>
                            <input
                              type="number"
                              value={team.totalPlayerThreshold}
                              onChange={(e) => {
                                const updated = [...editingTeams];
                                updated[index].totalPlayerThreshold = parseInt(e.target.value);
                                setEditingTeams(updated);
                              }}
                            />
                          </div>

                        <div className="form-group">
                          <label>Initial Purse (₹L)</label>
                          <input
                            type="number"
                            value={team.remainingPurse}
                            onChange={(e) => {
                              const updated = [...editingTeams];
                              updated[index].remainingPurse = parseInt(e.target.value);
                              setEditingTeams(updated);
                            }}
                          />
                        </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    className="admin-btn admin-btn-primary"
                    onClick={handleSaveTeams}
                    disabled={isSaving}
                  >
                    <IoSave size={18} /> Save Teams
                  </button>

                  <datalist id="admin-captain-list">
                    {originalPlayers.map((player) => (
                      <option key={player.id} value={player.name} />
                    ))}
                  </datalist>
                </div>
              )}

              {/* Players Tab */}
              {activeTab === 'players' && (
                <div className="admin-section">
                  <h3>Edit Player Listings</h3>
                  <div className="admin-player-toolbar">
                    <input
                      type="text"
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      placeholder="Search player name"
                      className="admin-player-search"
                    />
                    <button
                      className="admin-btn admin-btn-primary"
                      onClick={handleSavePlayers}
                      disabled={isSaving || editingPlayers.length === 0}
                    >
                      <IoSave size={18} /> Save Player Changes
                    </button>
                  </div>

                  <div className="admin-player-list">
                    {editingPlayers
                      .filter((player) =>
                        player.name.toLowerCase().includes(playerSearch.toLowerCase())
                      )
                      .map((player, index) => (
                        <div key={player.id} className="admin-player-row">
                          <div className="admin-player-cell admin-player-name">
                            <label>Name</label>
                            <input
                              type="text"
                              value={player.name}
                              onChange={(e) => {
                                const updated = [...editingPlayers];
                                updated[index] = { ...updated[index], name: e.target.value };
                                setEditingPlayers(updated);
                              }}
                            />
                          </div>
                          <div className="admin-player-cell">
                            <label>Role</label>
                            <input
                              type="text"
                              value={player.role}
                              onChange={(e) => {
                                const updated = [...editingPlayers];
                                updated[index] = { ...updated[index], role: e.target.value as typeof player.role };
                                setEditingPlayers(updated);
                              }}
                            />
                          </div>
                          <div className="admin-player-cell">
                            <label>Base Price (₹L)</label>
                            <input
                              type="number"
                              value={player.basePrice}
                              onChange={(e) => {
                                const updated = [...editingPlayers];
                                updated[index] = { ...updated[index], basePrice: Number(e.target.value) || 0 };
                                setEditingPlayers(updated);
                              }}
                            />
                          </div>
                          <div className="admin-player-cell admin-player-image">
                            <label>Image URL</label>
                            <input
                              type="text"
                              value={player.imageUrl}
                              onChange={(e) => {
                                const updated = [...editingPlayers];
                                updated[index] = { ...updated[index], imageUrl: e.target.value };
                                setEditingPlayers(updated);
                              }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Export Tab */}
              {activeTab === 'export' && (
                <div className="admin-section">
                  <h3>Export Data</h3>

                  <div className="export-info">
                    <p>Total Sold Players: <strong>{soldPlayers.length}</strong></p>
                    <p>Total Revenue: <strong>₹{soldPlayers.reduce((sum, p) => sum + p.soldAmount, 0).toFixed(1)}L</strong></p>
                  </div>

                  <button
                    className="admin-btn admin-btn-success"
                    onClick={handleExportSoldPlayers}
                    disabled={soldPlayers.length === 0}
                  >
                    <IoDownload size={18} /> Export Sold Players CSV
                  </button>
                </div>
              )}

              {/* Features Tab */}
              {activeTab === 'features' && (
                <FeatureFlagsTab onStatusChange={setSaveStatus} />
              )}

              {/* Streaming Tab - V3 Premium */}
              {activeTab === 'streaming' && (
                <StreamingTab onClose={onClose} />
              )}

              {/* Reset Tab */}
              {activeTab === 'reset' && (
                <div className="admin-section">
                  <h3>Reset Auction</h3>

                  <div className="reset-warning">
                    <p>⚠️ This action will:</p>
                    <ul>
                      <li>Clear all sold and unsold players</li>
                      <li>Reset team statistics</li>
                      <li>Restore initial data snapshot from Google Sheets</li>
                      <li>Reload the page</li>
                    </ul>
                  </div>

                  <button
                    className="admin-btn admin-btn-danger"
                    onClick={handleResetAuction}
                    disabled={isSaving}
                  >
                    <IoRefresh size={18} /> Reset Auction
                  </button>

                  <button
                    className="admin-btn admin-btn-warning"
                    onClick={handlePullFromSheets}
                    disabled={isSaving}
                  >
                    <IoRefresh size={18} /> Pull from Sheets (Wipe & Reload)
                  </button>
                </div>
              )}

              {/* Status Message */}
              {saveStatus === 'success' && (
                <div className="admin-success">✅ Saved successfully!</div>
              )}
              {saveStatus === 'error' && (
                <div className="admin-error">❌ Failed to save. Please try again.</div>
              )}
      </div>
    </div>
  );

  if (!isOpen) return null;

  if (mode === 'page') {
    return <div className="admin-panel-page">{panelContent}</div>;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="admin-panel-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            {panelContent}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
