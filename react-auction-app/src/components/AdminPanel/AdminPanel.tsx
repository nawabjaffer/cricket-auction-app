// ============================================================================
// ADMIN PANEL COMPONENT
// Manage auction configuration, teams, players, theme, and export data
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { IoClose, IoSave, IoRefresh, IoDownload, IoVideocam, IoAdd, IoTrash } from 'react-icons/io5';
import { auctionPersistence, type AdminSettings, type SponsorRecord } from '../../services/auctionPersistence';
import { googleSheetsService, imagePreloaderService } from '../../services';
import { useAuctionStore } from '../../store/auctionStore';
import { exportSoldPlayers } from '../../utils/exportData';
import FeatureFlagsTab from './FeatureFlagsTab';
import StreamingTab from './StreamingTab';
import './AdminPanel.css';
import type { Team, Player } from '../../types';
import { localImageCacheService } from '../../services/localImageCache';

type LogoSourceMode = 'drive' | 'upload';

interface AdminPanelProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly mode?: 'drawer' | 'page';
}

export function AdminPanel({ isOpen, onClose, mode = 'drawer' }: AdminPanelProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'theme' | 'teams' | 'sponsors' | 'players' | 'export' | 'features' | 'streaming' | 'reset'>('theme');
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
  const [editingSponsors, setEditingSponsors] = useState<SponsorRecord[]>([]);
  const [teamLogoSources, setTeamLogoSources] = useState<Record<string, LogoSourceMode>>({});
  const [sponsorLogoSources, setSponsorLogoSources] = useState<Record<string, LogoSourceMode>>({});
  const [editingPlayers, setEditingPlayers] = useState<typeof originalPlayers>([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          resolve(result);
          return;
        }
        reject(new Error('Unable to read image file'));
      };
      reader.onerror = () => reject(new Error('Unable to read image file'));
      reader.readAsDataURL(file);
    });
  };

  const getLogoSourceMode = (logoUrl: string | undefined): LogoSourceMode => (
    logoUrl?.startsWith('data:') ? 'upload' : 'drive'
  );

  // Load admin settings on mount
  useEffect(() => {
    let isMounted = true;

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

    const loadSponsors = async () => {
      try {
        const sponsors = await auctionPersistence.getSponsors();
        if (!isMounted) return;

        setEditingSponsors(sponsors);
        setSponsorLogoSources(Object.fromEntries(
          sponsors.map((sponsor) => [sponsor.id, getLogoSourceMode(sponsor.logoUrl)])
        ));
      } catch (error) {
        console.error('[AdminPanel] Failed to load sponsors:', error);
        if (isMounted) {
          setEditingSponsors([]);
          setSponsorLogoSources({});
        }
      }
    };

    if (isOpen) {
      loadSettings();
      loadSponsors();
      setEditingTeams(teams.map((team) => ({ ...team })));
      setTeamLogoSources(Object.fromEntries(
        teams.map((team) => [team.id, getLogoSourceMode(team.logoUrl)])
      ));
      setEditingPlayers(originalPlayers.map((player) => ({ ...player })));
    }
    return () => {
      isMounted = false;
    };
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
      // Invalidate the teams query cache so fresh data is fetched
      queryClient.invalidateQueries({ queryKey: ['teams'] });
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

  const handleDeleteTeam = (index: number) => {
    const teamToDelete = editingTeams[index];
    if (!teamToDelete) return;

    const confirmed = globalThis.confirm(
      `Are you sure you want to delete ${teamToDelete.name}? This action cannot be undone.`
    );

    if (!confirmed) return;

    const updated = editingTeams.filter((_, i) => i !== index);
    setEditingTeams(updated);
  };

  const handleSaveSponsors = async () => {
    setIsSaving(true);
    try {
      await auctionPersistence.saveSponsors(editingSponsors);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[AdminPanel] Failed to save sponsors:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTeam = () => {
    if (editingTeams.length >= 10) return;

    const newIndex = editingTeams.length + 1;
    const newTeamId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `team-${Date.now()}-${newIndex}`;

    const newTeam: Team = {
      id: newTeamId,
      name: `Team ${newIndex}`,
      logoUrl: '',
      playersBought: 0,
      totalPlayerThreshold: 11,
      remainingPlayers: 11,
      allocatedAmount: 0,
      remainingPurse: 0,
      highestBid: 0,
      captain: '',
      underAgePlayers: 0,
      primaryColor: '#3b82f6',
      secondaryColor: '#06b6d4',
    };

    setEditingTeams([...editingTeams, newTeam]);
    setTeamLogoSources((prev) => ({ ...prev, [newTeamId]: 'drive' }));
  };

  const handleAddSponsor = () => {
    const newIndex = editingSponsors.length + 1;
    const newSponsorId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `sponsor-${Date.now()}-${newIndex}`;

    const newSponsor: SponsorRecord = {
      id: newSponsorId,
      name: `Sponsor ${newIndex}`,
      logoUrl: '',
      website: '',
      tier: '',
      active: true,
      order: newIndex,
      isTitleSponsor: false,
    };

    setEditingSponsors([...editingSponsors, newSponsor]);
    setSponsorLogoSources((prev) => ({ ...prev, [newSponsorId]: 'drive' }));
  };

  const updateTeamLogo = async (index: number, source: LogoSourceMode, value?: string) => {
    const updated = [...editingTeams];
    const team = updated[index];
    if (!team) return;

    if (typeof value === 'string') {
      team.logoUrl = value;
    }

    setEditingTeams(updated);
    setTeamLogoSources((prev) => ({ ...prev, [team.id]: source }));
  };

  const updateSponsorLogo = async (index: number, source: LogoSourceMode, value?: string) => {
    const updated = [...editingSponsors];
    const sponsor = updated[index];
    if (!sponsor) return;

    if (typeof value === 'string') {
      sponsor.logoUrl = value;
    }

    setEditingSponsors(updated);
    setSponsorLogoSources((prev) => ({ ...prev, [sponsor.id]: source }));
  };

  const handleTeamLogoFileChange = async (index: number, file?: File | null) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    await updateTeamLogo(index, 'upload', dataUrl);
  };

  const handleSponsorLogoFileChange = async (index: number, file?: File | null) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    await updateSponsorLogo(index, 'upload', dataUrl);
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

  const parseCsvLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }

    values.push(current.trim());
    return values;
  };

  const findHeaderIndex = (headers: string[], candidates: string[]): number => {
    return headers.findIndex((header) => candidates.includes(header));
  };

  const parseCsvPlayers = (text: string): Player[] => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());

    const idx = {
      id: findHeaderIndex(headers, ['id', 'playerid', 'player_id']),
      name: findHeaderIndex(headers, ['name', 'playername', 'player_name']),
      role: findHeaderIndex(headers, ['role', 'playerrole', 'player_role']),
      basePrice: findHeaderIndex(headers, ['baseprice', 'base_price', 'base price']),
      imageUrl: findHeaderIndex(headers, ['imageurl', 'image_url', 'image', 'photo', 'photourl']),
      age: findHeaderIndex(headers, ['age']),
      matches: findHeaderIndex(headers, ['matches']),
      runs: findHeaderIndex(headers, ['runs']),
      wickets: findHeaderIndex(headers, ['wickets']),
      battingBest: findHeaderIndex(headers, ['battingbestfigures', 'batting_best', 'batting best']),
      bowlingBest: findHeaderIndex(headers, ['bowlingbestfigures', 'bowling_best', 'bowling best']),
      dob: findHeaderIndex(headers, ['dateofbirth', 'dob', 'date_of_birth']),
    };

    if (idx.name < 0) {
      throw new Error('CSV requires at least a Name column.');
    }

    const parsed: Player[] = [];

    lines.slice(1).forEach((line, rowIndex) => {
      const cells = parseCsvLine(line);
      const get = (col: number) => (col >= 0 ? cells[col] ?? '' : '');
      const rawName = get(idx.name).trim();
      if (!rawName) return;

      const basePrice = Number.parseFloat(get(idx.basePrice));
      const age = Number.parseInt(get(idx.age), 10);
      const idFromCsv = get(idx.id).trim();

      parsed.push({
        id: idFromCsv || `CSV-${rowIndex + 1}`,
        name: rawName,
        role: (get(idx.role).trim() || 'Player') as Player['role'],
        imageUrl: get(idx.imageUrl).trim(),
        basePrice: Number.isFinite(basePrice) ? basePrice : 0,
        age: Number.isFinite(age) ? age : null,
        matches: get(idx.matches).trim() || '0',
        runs: get(idx.runs).trim() || 'N/A',
        wickets: get(idx.wickets).trim() || 'N/A',
        battingBestFigures: get(idx.battingBest).trim() || 'N/A',
        bowlingBestFigures: get(idx.bowlingBest).trim() || 'N/A',
        dateOfBirth: get(idx.dob).trim() || '',
      });
    });

    return parsed;
  };

  const applyImportedPlayers = async (players: Player[]) => {
    if (players.length === 0) {
      throw new Error('No valid players found to import.');
    }

    setEditingPlayers(players);
    setPlayers(players);
    reconcilePlayerPools();
    await auctionPersistence.saveAdminPlayers(players);
  };

  const handleImportPlayersFromSheets = async () => {
    setIsSaving(true);
    try {
      googleSheetsService.clearCache('players');
      const sheetPlayers = await googleSheetsService.fetchPlayers([]);
      await applyImportedPlayers(sheetPlayers);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[AdminPanel] Failed importing players from sheets:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleImportPlayersFromCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsSaving(true);
    try {
      const text = await file.text();
      const csvPlayers = parseCsvPlayers(text);
      await applyImportedPlayers(csvPlayers);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[AdminPanel] Failed importing CSV players:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetImageCache = async () => {
    try {
      await localImageCacheService.clearCache();
      imagePreloaderService.clearCache();
      alert('Local player image cache has been reset successfully.');
    } catch (error) {
      console.error('[AdminPanel] Failed to reset image cache:', error);
      alert('Failed to reset image cache. Please check console logs.');
    }
  };

  const handlePullFromSheets = async () => {
    const confirmed = globalThis.confirm(
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
    const confirmed = globalThis.confirm(
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
          globalThis.location.reload();
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
          className={`admin-tab ${activeTab === 'sponsors' ? 'active' : ''}`}
          onClick={() => setActiveTab('sponsors')}
        >
          Sponsors
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
                      onChange={(e) => setMaxUnsoldRounds(Math.max(0, Number.parseInt(e.target.value || '0', 10)))}
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

                  <div className="admin-teams-toolbar">
                    <button
                      className="admin-btn admin-btn-primary"
                      onClick={handleAddTeam}
                      disabled={isSaving || editingTeams.length >= 10}
                    >
                      <IoAdd size={18} /> Add Team
                    </button>
                    <span className="admin-teams-limit">
                      {editingTeams.length}/10 teams configured
                    </span>
                  </div>

                  <div className="teams-list">
                    {editingTeams.map((team, index) => (
                      <div key={team.id} className="team-edit-item">
                        <div className="admin-team-header">
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
                          <button
                            type="button"
                            className="admin-btn admin-btn-danger admin-btn-sm"
                            onClick={() => handleDeleteTeam(index)}
                            title="Delete this team"
                          >
                            <IoTrash size={16} />
                          </button>
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

                        <div className="admin-media-field">
                          <div className="admin-media-header">
                            <label>Team Logo</label>
                            <span>Choose Drive link or direct upload</span>
                          </div>

                          <div className="admin-source-toggle" role="radiogroup" aria-label={`Team ${index + 1} logo source`}>
                            <label className="admin-source-option">
                              <input
                                type="radio"
                                name={`team-logo-source-${team.id}`}
                                checked={(teamLogoSources[team.id] || getLogoSourceMode(team.logoUrl)) === 'drive'}
                                onChange={() => setTeamLogoSources((prev) => ({ ...prev, [team.id]: 'drive' }))}
                              />
                              Drive Link
                            </label>
                            <label className="admin-source-option">
                              <input
                                type="radio"
                                name={`team-logo-source-${team.id}`}
                                checked={(teamLogoSources[team.id] || getLogoSourceMode(team.logoUrl)) === 'upload'}
                                onChange={() => setTeamLogoSources((prev) => ({ ...prev, [team.id]: 'upload' }))}
                              />
                              Direct Upload
                            </label>
                          </div>

                          {(teamLogoSources[team.id] || getLogoSourceMode(team.logoUrl)) === 'upload' ? (
                            <div className="admin-media-source-panel">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  void handleTeamLogoFileChange(index, e.target.files?.[0]);
                                  e.target.value = '';
                                }}
                              />
                              <small>Uploaded images are stored as embedded data URLs so they remain available in the auction app.</small>
                            </div>
                          ) : (
                            <div className="admin-media-source-panel">
                              <input
                                type="text"
                                value={team.logoUrl}
                                onChange={(e) => {
                                  const updated = [...editingTeams];
                                  updated[index].logoUrl = e.target.value;
                                  setEditingTeams(updated);
                                }}
                                placeholder="https://drive.google.com/..."
                              />
                              <small>Paste a public Drive link or any direct image URL.</small>
                            </div>
                          )}

                          {team.logoUrl && (
                            <div className="admin-logo-preview">
                              <img src={team.logoUrl} alt={`${team.name} logo preview`} />
                              <span>{teamLogoSources[team.id] === 'upload' ? 'Direct upload preview' : 'Drive link preview'}</span>
                            </div>
                          )}
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label>Players Threshold</label>
                            <input
                              type="number"
                              value={team.totalPlayerThreshold}
                              onChange={(e) => {
                                const updated = [...editingTeams];
                                updated[index].totalPlayerThreshold = Number.parseInt(e.target.value, 10);
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
                              updated[index].remainingPurse = Number.parseInt(e.target.value, 10);
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

              {/* Sponsors Tab */}
              {activeTab === 'sponsors' && (
                <div className="admin-section">
                  <h3>Manage Sponsorships</h3>

                  <div className="admin-teams-toolbar">
                    <button
                      className="admin-btn admin-btn-primary"
                      onClick={handleAddSponsor}
                      disabled={isSaving}
                    >
                      <IoAdd size={18} /> Add Sponsor
                    </button>
                    <span className="admin-teams-limit">
                      {editingSponsors.length} sponsors configured
                    </span>
                  </div>

                  <div className="teams-list">
                    {editingSponsors.map((sponsor, index) => (
                      <div key={sponsor.id} className="team-edit-item">
                        <div className="form-group">
                          <label>Sponsor Name</label>
                          <input
                            type="text"
                            value={sponsor.name}
                            onChange={(e) => {
                              const updated = [...editingSponsors];
                              updated[index] = { ...updated[index], name: e.target.value };
                              setEditingSponsors(updated);
                            }}
                            placeholder="e.g., Official Partner"
                          />
                        </div>

                        <div className="admin-media-field">
                          <div className="admin-media-header">
                            <label>Sponsorship Image</label>
                            <span>Choose Drive link or direct upload</span>
                          </div>

                          <div className="admin-source-toggle" role="radiogroup" aria-label={`Sponsor ${index + 1} image source`}>
                            <label className="admin-source-option">
                              <input
                                type="radio"
                                name={`sponsor-logo-source-${sponsor.id}`}
                                checked={(sponsorLogoSources[sponsor.id] || getLogoSourceMode(sponsor.logoUrl)) === 'drive'}
                                onChange={() => setSponsorLogoSources((prev) => ({ ...prev, [sponsor.id]: 'drive' }))}
                              />
                              Drive Link
                            </label>
                            <label className="admin-source-option">
                              <input
                                type="radio"
                                name={`sponsor-logo-source-${sponsor.id}`}
                                checked={(sponsorLogoSources[sponsor.id] || getLogoSourceMode(sponsor.logoUrl)) === 'upload'}
                                onChange={() => setSponsorLogoSources((prev) => ({ ...prev, [sponsor.id]: 'upload' }))}
                              />
                              Direct Upload
                            </label>
                          </div>

                          {(sponsorLogoSources[sponsor.id] || getLogoSourceMode(sponsor.logoUrl)) === 'upload' ? (
                            <div className="admin-media-source-panel">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  void handleSponsorLogoFileChange(index, e.target.files?.[0]);
                                  e.target.value = '';
                                }}
                              />
                              <small>Upload the sponsor artwork directly. It will be embedded into Firebase and shown in the auction app.</small>
                            </div>
                          ) : (
                            <div className="admin-media-source-panel">
                              <input
                                type="text"
                                value={sponsor.logoUrl || ''}
                                onChange={(e) => {
                                  const updated = [...editingSponsors];
                                  updated[index] = { ...updated[index], logoUrl: e.target.value };
                                  setEditingSponsors(updated);
                                }}
                                placeholder="https://drive.google.com/..."
                              />
                              <small>Paste a public Drive link or a direct image URL for the sponsor artwork.</small>
                            </div>
                          )}

                          {sponsor.logoUrl && (
                            <div className="admin-logo-preview">
                              <img src={sponsor.logoUrl} alt={`${sponsor.name} preview`} />
                              <span>{sponsorLogoSources[sponsor.id] === 'upload' ? 'Uploaded sponsor image' : 'Linked sponsor image'}</span>
                            </div>
                          )}
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label>Tier</label>
                            <input
                              type="text"
                              value={sponsor.tier || ''}
                              onChange={(e) => {
                                const updated = [...editingSponsors];
                                updated[index] = { ...updated[index], tier: e.target.value };
                                setEditingSponsors(updated);
                              }}
                              placeholder="e.g., title, platinum, gold"
                            />
                          </div>

                          <div className="form-group">
                            <label>Website</label>
                            <input
                              type="text"
                              value={sponsor.website || ''}
                              onChange={(e) => {
                                const updated = [...editingSponsors];
                                updated[index] = { ...updated[index], website: e.target.value };
                                setEditingSponsors(updated);
                              }}
                              placeholder="https://example.com"
                            />
                          </div>
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label>Display Order</label>
                            <input
                              type="number"
                              value={sponsor.order ?? index + 1}
                              onChange={(e) => {
                                const updated = [...editingSponsors];
                                updated[index] = { ...updated[index], order: Number(e.target.value) || 0 };
                                setEditingSponsors(updated);
                              }}
                            />
                          </div>

                          <div className="form-group admin-checkbox-group">
                            <label>
                              <input
                                type="checkbox"
                                checked={sponsor.active !== false}
                                onChange={(e) => {
                                  const updated = [...editingSponsors];
                                  updated[index] = { ...updated[index], active: e.target.checked };
                                  setEditingSponsors(updated);
                                }}
                              />
                              Active
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={Boolean(sponsor.isTitleSponsor)}
                                onChange={(e) => {
                                  const updated = [...editingSponsors];
                                  updated[index] = { ...updated[index], isTitleSponsor: e.target.checked };
                                  setEditingSponsors(updated);
                                }}
                              />
                              Title Sponsor
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    className="admin-btn admin-btn-primary"
                    onClick={handleSaveSponsors}
                    disabled={isSaving}
                  >
                    <IoSave size={18} /> Save Sponsors
                  </button>
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
                    <button
                      className="admin-btn admin-btn-warning"
                      onClick={handleImportPlayersFromSheets}
                      disabled={isSaving}
                    >
                      <IoRefresh size={18} /> Import from Sheets
                    </button>
                    <button
                      className="admin-btn admin-btn-secondary"
                      onClick={() => csvFileInputRef.current?.click()}
                      disabled={isSaving}
                    >
                      <IoDownload size={18} /> Import CSV
                    </button>
                    <input
                      ref={csvFileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleImportPlayersFromCsv}
                      style={{ display: 'none' }}
                    />
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

                  <button
                    className="admin-btn admin-btn-secondary"
                    onClick={handleResetImageCache}
                    disabled={isSaving}
                  >
                    <IoRefresh size={18} /> Reset Local Image Cache
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
