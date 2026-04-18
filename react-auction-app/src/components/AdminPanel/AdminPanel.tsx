// ============================================================================
// ADMIN PANEL COMPONENT
// Manage auction configuration, teams, players, theme, and export data
// ============================================================================

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { IoClose, IoSave, IoRefresh, IoDownload, IoVideocam, IoAdd, IoTrash, IoArrowUp, IoArrowDown } from 'react-icons/io5';
import { auctionPersistence, type AdminSettings, type SponsorRecord } from '../../services/auctionPersistence';
import { googleSheetsService, imagePreloaderService } from '../../services';
import { useAuctionStore } from '../../store/auctionStore';
import { exportSoldPlayers } from '../../utils/exportData';
import FeatureFlagsTab from './FeatureFlagsTab';
import StreamingTab from './StreamingTab';
import './AdminPanel.css';
import type { Team, Player, AuctionRoleCategory, BattingStats, BowlingStats } from '../../types';
import { DEFAULT_AUCTION_ROLE_ORDER, createEmptyBattingStats, createEmptyBowlingStats } from '../../types';
import { formatRoleDisplay, getRoleCategory, getRoleBadgeColor } from '../../utils/roleFormatter';
import { localImageCacheService } from '../../services/localImageCache';

type LogoSourceMode = 'drive' | 'upload';

interface AdminPanelProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly mode?: 'drawer' | 'page';
}

export function AdminPanel({ isOpen, onClose, mode = 'drawer' }: AdminPanelProps) {
  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
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

  // Auction role ordering
  const [auctionRoleOrder, setAuctionRoleOrder] = useState<AuctionRoleCategory[]>([...DEFAULT_AUCTION_ROLE_ORDER]);
  // Under-age spotlight threshold
  const [underAgeThreshold, setUnderAgeThreshold] = useState(18);

  // Store
  const { teams, setTeams, soldPlayers, originalPlayers, setPlayers, reconcilePlayerPools } = useAuctionStore();
  const [editingTeams, setEditingTeams] = useState<Team[]>([]);
  const [editingSponsors, setEditingSponsors] = useState<SponsorRecord[]>([]);
  const [teamLogoSources, setTeamLogoSources] = useState<Record<string, LogoSourceMode>>({});
  const [teamOwnerLogoSources, setTeamOwnerLogoSources] = useState<Record<string, LogoSourceMode>>({});
  const [sponsorLogoSources, setSponsorLogoSources] = useState<Record<string, LogoSourceMode>>({});
  const [playerImageSources, setPlayerImageSources] = useState<Record<string, LogoSourceMode>>({});
  const [editingPlayers, setEditingPlayers] = useState<typeof originalPlayers>([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [teamPage, setTeamPage] = useState(1);
  const [playerPage, setPlayerPage] = useState(1);
  const [sponsorPage, setSponsorPage] = useState(1);
  const [teamPageSize, setTeamPageSize] = useState<number>(10);
  const [playerPageSize, setPlayerPageSize] = useState<number>(10);
  const [sponsorPageSize, setSponsorPageSize] = useState<number>(10);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamDraft, setTeamDraft] = useState<Team | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [playerDraft, setPlayerDraft] = useState<Player | null>(null);
  const [isSavingSponsors, setIsSavingSponsors] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showUploadFeedback = (message: string, type: 'success' | 'error' = 'success') => {
    setUploadFeedback({ message, type });
    setTimeout(() => setUploadFeedback(null), 3000);
  };

  const filteredPlayers = useMemo(
    () => editingPlayers.filter((player) => player.name.toLowerCase().includes(playerSearch.toLowerCase())),
    [editingPlayers, playerSearch],
  );

  const totalTeamPages = Math.max(1, Math.ceil(editingTeams.length / teamPageSize));
  const totalPlayerPages = Math.max(1, Math.ceil(filteredPlayers.length / playerPageSize));
  const totalSponsorPages = Math.max(1, Math.ceil(editingSponsors.length / sponsorPageSize));

  const paginatedTeams = useMemo(
    () => editingTeams.slice((teamPage - 1) * teamPageSize, teamPage * teamPageSize),
    [editingTeams, teamPage, teamPageSize],
  );

  const paginatedPlayers = useMemo(
    () => filteredPlayers.slice((playerPage - 1) * playerPageSize, playerPage * playerPageSize),
    [filteredPlayers, playerPage, playerPageSize],
  );

  const paginatedSponsors = useMemo(
    () => editingSponsors.slice((sponsorPage - 1) * sponsorPageSize, sponsorPage * sponsorPageSize),
    [editingSponsors, sponsorPage, sponsorPageSize],
  );

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

  const getPlayerImageSourceMode = (imageUrl: string | undefined): LogoSourceMode => (
    imageUrl?.startsWith('data:') ? 'upload' : 'drive'
  );

  const teamDraftLogoSource: LogoSourceMode = editingTeamId && teamDraft
    ? (teamLogoSources[editingTeamId] || getLogoSourceMode(teamDraft.logoUrl))
    : 'drive';

  const teamDraftOwnerLogoSource: LogoSourceMode = editingTeamId && teamDraft
    ? (teamOwnerLogoSources[editingTeamId] || getLogoSourceMode(teamDraft.brandLogoUrl))
    : 'drive';

  const playerDraftImageSource: LogoSourceMode = editingPlayerId && playerDraft
    ? (playerImageSources[editingPlayerId] || getPlayerImageSourceMode(playerDraft.imageUrl))
    : 'drive';

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
          if (settings.auctionRoleOrder?.length) {
            setAuctionRoleOrder(settings.auctionRoleOrder);
          }
          if (settings.underAgeThreshold != null) {
            setUnderAgeThreshold(settings.underAgeThreshold);
          }
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
      setTeamOwnerLogoSources(Object.fromEntries(
        teams.map((team) => [team.id, getLogoSourceMode(team.brandLogoUrl)])
      ));
      setEditingPlayers(originalPlayers.map((player) => ({ ...player })));
      setPlayerImageSources(Object.fromEntries(
        originalPlayers.map((player) => [player.id, getPlayerImageSourceMode(player.imageUrl)])
      ));
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, teams, originalPlayers]);

  useEffect(() => {
    setTeamPage((current) => Math.min(current, totalTeamPages));
  }, [totalTeamPages]);

  useEffect(() => {
    setPlayerPage((current) => Math.min(current, totalPlayerPages));
  }, [totalPlayerPages]);

  useEffect(() => {
    setSponsorPage((current) => Math.min(current, totalSponsorPages));
  }, [totalSponsorPages]);

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
        auctionRoleOrder,
        underAgeThreshold,
      };

      await auctionPersistence.saveAdminSettings(settings);

      // Apply theme colors to document
      document.documentElement.style.setProperty('--color-primary', primaryColor);
      document.documentElement.style.setProperty('--color-secondary', secondaryColor);
      document.documentElement.style.setProperty('--color-accent', accentColor);
      useAuctionStore.getState().setMaxUnsoldRounds(maxUnsoldRounds);
      useAuctionStore.getState().setAuctionRoleOrder(auctionRoleOrder);

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
    setIsSavingSponsors(true);
    try {
      await auctionPersistence.saveSponsors(editingSponsors);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[AdminPanel] Failed to save sponsors:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setIsSavingSponsors(false);
    }
  };

  const handleAddTeam = () => {
    const newIndex = editingTeams.length + 1;
    const newTeamId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `team-${Date.now()}-${newIndex}`;

    const newTeam: Team = {
      id: newTeamId,
      name: `Team ${newIndex}`,
      logoUrl: '',
      brandLogoUrl: '',
      ownerCompany: '',
      brandTagline: '',
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
    setTeamOwnerLogoSources((prev) => ({ ...prev, [newTeamId]: 'drive' }));
  };

  const handleDeletePlayer = (playerId: string) => {
    const target = editingPlayers.find((player) => player.id === playerId);
    if (!target) return;

    const confirmed = globalThis.confirm(`Delete ${target.name} from admin players list?`);
    if (!confirmed) return;

    setEditingPlayers((current) => current.filter((player) => player.id !== playerId));
  };

  const openTeamEditor = (teamId: string) => {
    const targetTeam = editingTeams.find((team) => team.id === teamId);
    if (!targetTeam) return;

    setEditingTeamId(teamId);
    setTeamDraft({ ...targetTeam });
  };

  const closeTeamEditor = () => {
    setEditingTeamId(null);
    setTeamDraft(null);
  };

  const saveTeamDraft = async () => {
    if (!editingTeamId || !teamDraft) return;

    const updatedTeams = editingTeams.map((team) => (
      team.id === editingTeamId
        ? { ...teamDraft }
        : team
    ));
    setEditingTeams(updatedTeams);

    // Persist to Firebase and update store
    try {
      await auctionPersistence.saveTeams(updatedTeams);
      setTeams(updatedTeams);
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      showUploadFeedback(`Team "${teamDraft.name}" saved successfully`);
    } catch (error) {
      console.error('[AdminPanel] Failed to save team draft:', error);
      showUploadFeedback('Failed to save team changes.', 'error');
    }
    closeTeamEditor();
  };

  const openPlayerEditor = (playerId: string) => {
    const targetPlayer = editingPlayers.find((player) => player.id === playerId);
    if (!targetPlayer) return;

    setEditingPlayerId(playerId);
    setPlayerDraft({ ...targetPlayer });
  };

  const closePlayerEditor = () => {
    setEditingPlayerId(null);
    setPlayerDraft(null);
  };

  const savePlayerDraft = async () => {
    if (!editingPlayerId || !playerDraft) return;

    // Block save if duplicate ID
    if (editingPlayers.some(p => p.id === playerDraft.id && p.id !== editingPlayerId)) return;
    // Block save if ID is empty
    if (!playerDraft.id.trim()) return;

    const updatedPlayers = editingPlayers.map((player) => (
      player.id === editingPlayerId
        ? { ...playerDraft }
        : player
    ));
    setEditingPlayers(updatedPlayers);

    // If the ID was changed, update the image sources mapping
    if (playerDraft.id !== editingPlayerId) {
      setPlayerImageSources((prev) => {
        const updated = { ...prev };
        updated[playerDraft.id] = prev[editingPlayerId] || 'drive';
        delete updated[editingPlayerId];
        return updated;
      });
    }

    // Persist to Firebase and update store with feedback
    setIsSaving(true);
    try {
      setPlayers(updatedPlayers);
      await auctionPersistence.saveAdminPlayers(updatedPlayers);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (error) {
      console.error('[AdminPanel] Failed to save player draft:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
    closePlayerEditor();
  };

  const handleTeamDraftLogoFileChange = async (file?: File | null) => {
    if (!file || !teamDraft || !editingTeamId) return;
    if (!file.type.startsWith('image/')) {
      showUploadFeedback('Invalid file type. Please select an image file.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showUploadFeedback('Image too large. Max 5MB allowed.', 'error');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setTeamDraft({ ...teamDraft, logoUrl: dataUrl });
      setTeamLogoSources((prev) => ({ ...prev, [editingTeamId]: 'upload' }));
      showUploadFeedback(`Team logo uploaded: ${file.name}`);
    } catch {
      showUploadFeedback('Failed to read image file.', 'error');
    }
  };

  const handleTeamDraftOwnerLogoFileChange = async (file?: File | null) => {
    if (!file || !teamDraft || !editingTeamId) return;
    if (!file.type.startsWith('image/')) {
      showUploadFeedback('Invalid file type. Please select an image file.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showUploadFeedback('Image too large. Max 5MB allowed.', 'error');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setTeamDraft({ ...teamDraft, brandLogoUrl: dataUrl });
      setTeamOwnerLogoSources((prev) => ({ ...prev, [editingTeamId]: 'upload' }));
      showUploadFeedback(`Owner logo uploaded: ${file.name}`);
    } catch {
      showUploadFeedback('Failed to read image file.', 'error');
    }
  };

  const handlePlayerDraftImageFileChange = async (file?: File | null) => {
    if (!file || !playerDraft || !editingPlayerId) return;
    if (!file.type.startsWith('image/')) {
      showUploadFeedback('Invalid file type. Please select an image file.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showUploadFeedback('Image too large. Max 5MB allowed.', 'error');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPlayerDraft({ ...playerDraft, imageUrl: dataUrl });
      setPlayerImageSources((prev) => ({ ...prev, [editingPlayerId]: 'upload' }));
      showUploadFeedback(`Player image uploaded: ${file.name}`);
    } catch {
      showUploadFeedback('Failed to read image file.', 'error');
    }
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

  const handleAddPlayer = () => {
    const nextIndex = editingPlayers.length + 1;
    const newPlayerId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `player-${Date.now()}-${nextIndex}`;

    const newPlayer: Player = {
      id: newPlayerId,
      name: `Player ${nextIndex}`,
      role: 'Player',
      imageUrl: '',
      basePrice: 0,
      age: null,
      matches: '0',
      runs: '0',
      wickets: '0',
      battingBestFigures: 'N/A',
      bowlingBestFigures: 'N/A',
      dateOfBirth: '',
    };

    setEditingPlayers((current) => [...current, newPlayer]);
    setPlayerImageSources((prev) => ({ ...prev, [newPlayerId]: 'drive' }));
    setPlayerSearch('');
    setPlayerPage(Math.max(1, Math.ceil((editingPlayers.length + 1) / playerPageSize)));
    setEditingPlayerId(newPlayerId);
    setPlayerDraft({ ...newPlayer });
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

  const handleSponsorLogoFileChange = async (index: number, file?: File | null) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    await updateSponsorLogo(index, 'upload', dataUrl);
  };

  const handleSponsorVideoFileChange = async (index: number, file?: File | null) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    const updated = [...editingSponsors];
    if (updated[index]) {
      updated[index] = { ...updated[index], videoUrl: dataUrl };
      setEditingSponsors(updated);
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
      bestFigures: player.bowlingBestFigures || player.battingBestFigures || 'N/A',
      teamName: player.teamName,
      teamId: player.teamId,
      soldAmount: player.soldAmount,
      basePrice: player.basePrice,
      imageUrl: player.imageUrl,
      timestamp: new Date(player.soldDate).getTime(),
      auctionRound: useAuctionStore.getState().currentRound ?? 1,
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
      // Expanded batting stats
      batInnings: findHeaderIndex(headers, ['inns', 'innings', 'bat_innings', 'batting_innings']),
      batNotOut: findHeaderIndex(headers, ['not out', 'notout', 'not_out', 'no']),
      batHighestScore: findHeaderIndex(headers, ['highest score', 'highestscore', 'highest_score', 'hs']),
      batAverage: findHeaderIndex(headers, ['average', 'bat_average', 'batting_average', 'bat_avg']),
      batStrikeRate: findHeaderIndex(headers, ['strike rate', 'strikerate', 'strike_rate', 'sr', 'bat_sr']),
      batThirties: findHeaderIndex(headers, ['30s', 'thirties']),
      batFifties: findHeaderIndex(headers, ['50s', 'fifties']),
      batHundreds: findHeaderIndex(headers, ['100s', 'hundreds', 'centuries']),
      batFours: findHeaderIndex(headers, ['4s', 'fours']),
      batSixes: findHeaderIndex(headers, ['6s', 'sixes']),
      // Expanded bowling stats
      bowlMatches: findHeaderIndex(headers, ['bowling matches', 'bowl_matches', 'bowling_matches']),
      bowlInnings: findHeaderIndex(headers, ['bowling innings', 'bowl_innings', 'bowling_innings']),
      bowlOvers: findHeaderIndex(headers, ['overs']),
      bowlMaidens: findHeaderIndex(headers, ['maidens']),
      bowlRuns: findHeaderIndex(headers, ['bowling runs', 'bowl_runs', 'bowling_runs', 'runs_conceded']),
      bowlBb: findHeaderIndex(headers, ['bb', 'best bowling', 'best_bowling']),
      bowlThreeWkts: findHeaderIndex(headers, ['3wkts', '3_wickets', 'three_wickets']),
      bowlFiveWkts: findHeaderIndex(headers, ['5wkts', '5_wickets', 'five_wickets']),
      bowlEconomy: findHeaderIndex(headers, ['eco', 'economy']),
      bowlSr: findHeaderIndex(headers, ['bowl_sr', 'bowling_sr', 'bowling_strike_rate']),
      bowlAvg: findHeaderIndex(headers, ['bowl_avg', 'bowling_avg', 'bowling_average']),
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

      // Build expanded stats if any relevant column exists
      const hasBattingCols = [idx.batInnings, idx.batNotOut, idx.batHighestScore, idx.batAverage, idx.batStrikeRate, idx.batFifties, idx.batHundreds, idx.batFours, idx.batSixes, idx.batThirties].some((i) => i >= 0);
      const hasBowlingCols = [idx.bowlMatches, idx.bowlInnings, idx.bowlOvers, idx.bowlMaidens, idx.bowlRuns, idx.bowlBb, idx.bowlThreeWkts, idx.bowlFiveWkts, idx.bowlEconomy, idx.bowlSr, idx.bowlAvg].some((i) => i >= 0);

      const battingStats = hasBattingCols ? {
        matches: get(idx.matches).trim() || '0',
        innings: get(idx.batInnings).trim() || '0',
        notOut: get(idx.batNotOut).trim() || '0',
        runs: get(idx.runs).trim() || '0',
        highestScore: get(idx.batHighestScore).trim() || '0',
        average: get(idx.batAverage).trim() || '0.00',
        strikeRate: get(idx.batStrikeRate).trim() || '0.00',
        thirties: get(idx.batThirties).trim() || '0',
        fifties: get(idx.batFifties).trim() || '0',
        hundreds: get(idx.batHundreds).trim() || '0',
        fours: get(idx.batFours).trim() || '0',
        sixes: get(idx.batSixes).trim() || '0',
      } : undefined;

      const bowlingStats = hasBowlingCols ? {
        matches: get(idx.bowlMatches).trim() || get(idx.matches).trim() || '0',
        innings: get(idx.bowlInnings).trim() || '0',
        overs: get(idx.bowlOvers).trim() || '0',
        maidens: get(idx.bowlMaidens).trim() || '0',
        runs: get(idx.bowlRuns).trim() || '0',
        wickets: get(idx.wickets).trim() || '0',
        bestBowling: get(idx.bowlBb).trim() || get(idx.bowlingBest).trim() || 'N/A',
        threeWickets: get(idx.bowlThreeWkts).trim() || '0',
        fiveWickets: get(idx.bowlFiveWkts).trim() || '0',
        economy: get(idx.bowlEconomy).trim() || '0.00',
        strikeRate: get(idx.bowlSr).trim() || '0.00',
        average: get(idx.bowlAvg).trim() || '0.00',
      } : undefined;

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
        ...(battingStats ? { battingStats } : {}),
        ...(bowlingStats ? { bowlingStats } : {}),
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
      {/* Global saving progress bar */}
      <AnimatePresence>
        {(isSaving || isSavingSponsors) && (
          <motion.div
            className="admin-saving-bar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="admin-saving-bar-fill"
              initial={{ width: '0%' }}
              animate={{ width: '90%' }}
              transition={{ duration: 3, ease: 'easeOut' }}
            />
            <span className="admin-saving-bar-text">Saving...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save status toast */}
      <AnimatePresence>
        {saveStatus !== 'idle' && !isSaving && !isSavingSponsors && (
          <motion.div
            className={`admin-save-toast admin-save-toast--${saveStatus}`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {saveStatus === 'success' ? '✓ Saved successfully' : '✗ Save failed — please retry'}
          </motion.div>
        )}
      </AnimatePresence>

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

                  <h3 style={{ marginTop: '2rem' }}>Auction Role Order</h3>
                  <small style={{ color: '#6b7280', display: 'block', marginBottom: '0.75rem' }}>
                    Configure the sequence in which player roles appear during the auction. Drag or use arrows to reorder.
                  </small>
                  <div className="admin-role-order-list">
                    {auctionRoleOrder.map((role, index) => (
                      <div key={role} className="admin-role-order-item">
                        <span className="admin-role-order-badge" style={{ background: getRoleBadgeColor(role) }}>
                          {index + 1}
                        </span>
                        <span className="admin-role-order-label">{role}</span>
                        <div className="admin-role-order-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn-ghost admin-btn-sm"
                            disabled={index === 0}
                            onClick={() => {
                              const updated = [...auctionRoleOrder];
                              [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
                              setAuctionRoleOrder(updated);
                            }}
                            title="Move up"
                          >
                            <IoArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-ghost admin-btn-sm"
                            disabled={index === auctionRoleOrder.length - 1}
                            onClick={() => {
                              const updated = [...auctionRoleOrder];
                              [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
                              setAuctionRoleOrder(updated);
                            }}
                            title="Move down"
                          >
                            <IoArrowDown size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <h3 style={{ marginTop: '2rem' }}>Under-Age Spotlight</h3>
                  <div className="form-group">
                    <label>Under-Age Threshold</label>
                    <input
                      type="number"
                      min={0}
                      max={25}
                      value={underAgeThreshold}
                      onChange={(e) => setUnderAgeThreshold(Math.max(0, Number.parseInt(e.target.value || '18', 10)))}
                      placeholder="e.g., 18"
                    />
                    <small style={{ color: '#6b7280' }}>
                      Players below this age will get a special "Under {underAgeThreshold}" spotlight badge during the auction.
                    </small>
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
                      disabled={isSaving}
                    >
                      <IoAdd size={18} /> Add Team
                    </button>
                    <span className="admin-teams-limit">
                      {editingTeams.length} teams configured
                    </span>
                    <label className="admin-page-size">
                      <span>Rows per page</span>
                      <select
                        value={teamPageSize}
                        onChange={(e) => {
                          setTeamPageSize(Number(e.target.value));
                          setTeamPage(1);
                        }}
                      >
                        {PAGE_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="admin-compact-list">
                    {paginatedTeams.map((team, pageIndex) => {
                      const absoluteIndex = (teamPage - 1) * teamPageSize + pageIndex;

                      return (
                        <div key={team.id} className="admin-compact-item">
                          <div className="admin-compact-main">
                            <strong>{team.name || `Team ${absoluteIndex + 1}`}</strong>
                            <small>Icon Player: {team.captain || 'Not set'} | Purse: ₹{team.remainingPurse ?? 0}L | Threshold: {team.totalPlayerThreshold ?? 11}</small>
                          </div>
                          <div className="admin-compact-actions">
                            <button
                              type="button"
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              onClick={() => openTeamEditor(team.id)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-danger admin-btn-sm"
                              onClick={() => handleDeleteTeam(absoluteIndex)}
                              title="Delete this team"
                            >
                              <IoTrash size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {editingTeams.length === 0 && (
                      <div className="admin-empty-state">No teams yet. Add a team to begin.</div>
                    )}
                  </div>

                  <div className="admin-pagination">
                    <button
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={() => setTeamPage((current) => Math.max(1, current - 1))}
                      disabled={teamPage === 1}
                    >
                      Previous
                    </button>
                    <span>Page {teamPage} of {totalTeamPages}</span>
                    <button
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={() => setTeamPage((current) => Math.min(totalTeamPages, current + 1))}
                      disabled={teamPage >= totalTeamPages}
                    >
                      Next
                    </button>
                  </div>

                  <div className="admin-page-number-strip">
                    {Array.from({ length: totalTeamPages }, (_, index) => index + 1).map((pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        className={`admin-page-number ${teamPage === pageNumber ? 'active' : ''}`}
                        onClick={() => setTeamPage(pageNumber)}
                      >
                        {pageNumber}
                      </button>
                    ))}
                  </div>

                  <button
                    className="admin-btn admin-btn-primary"
                    onClick={handleSaveTeams}
                    disabled={isSaving}
                  >
                    <IoSave size={18} /> Bulk Save All Teams
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
                      disabled={isSavingSponsors}
                    >
                      <IoAdd size={18} /> Add Sponsor
                    </button>
                    <span className="admin-teams-limit">
                      {editingSponsors.length} sponsors configured
                    </span>
                    <label className="admin-page-size">
                      <span>Rows per page</span>
                      <select
                        value={sponsorPageSize}
                        onChange={(e) => {
                          setSponsorPageSize(Number(e.target.value));
                          setSponsorPage(1);
                        }}
                      >
                        {PAGE_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="teams-list">
                    {paginatedSponsors.map((sponsor, pageIndex) => {
                      const absoluteIndex = (sponsorPage - 1) * sponsorPageSize + pageIndex;

                      return (
                        <div key={sponsor.id} className="team-edit-item">
                          <div className="form-group">
                            <label>Sponsor Name</label>
                            <input
                              type="text"
                              value={sponsor.name}
                              onChange={(e) => {
                                const updated = [...editingSponsors];
                                updated[absoluteIndex] = { ...updated[absoluteIndex], name: e.target.value };
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

                            <div className="admin-source-toggle" role="radiogroup" aria-label={`Sponsor ${absoluteIndex + 1} image source`}>
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
                                    void handleSponsorLogoFileChange(absoluteIndex, e.target.files?.[0]);
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
                                    updated[absoluteIndex] = { ...updated[absoluteIndex], logoUrl: e.target.value };
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
                                  updated[absoluteIndex] = { ...updated[absoluteIndex], tier: e.target.value };
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
                                  updated[absoluteIndex] = { ...updated[absoluteIndex], website: e.target.value };
                                  setEditingSponsors(updated);
                                }}
                                placeholder="https://example.com"
                              />
                            </div>
                          </div>

                          <div className="form-row">
                            <div className="form-group">
                              <label>Video URL (for break ads)</label>
                              <input
                                type="text"
                                value={sponsor.videoUrl || ''}
                                onChange={(e) => {
                                  const updated = [...editingSponsors];
                                  updated[absoluteIndex] = { ...updated[absoluteIndex], videoUrl: e.target.value };
                                  setEditingSponsors(updated);
                                }}
                                placeholder="https://... or paste video URL"
                              />
                              <input
                                type="file"
                                accept="video/*"
                                onChange={(e) => handleSponsorVideoFileChange(absoluteIndex, e.target.files?.[0])}
                                style={{ marginTop: '4px' }}
                              />
                            </div>
                          </div>

                          <div className="form-row">
                            <div className="form-group">
                              <label>Display Order</label>
                              <input
                                type="number"
                                value={sponsor.order ?? absoluteIndex + 1}
                                onChange={(e) => {
                                  const updated = [...editingSponsors];
                                  updated[absoluteIndex] = { ...updated[absoluteIndex], order: Number(e.target.value) || 0 };
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
                                    updated[absoluteIndex] = { ...updated[absoluteIndex], active: e.target.checked };
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
                                    updated[absoluteIndex] = { ...updated[absoluteIndex], isTitleSponsor: e.target.checked };
                                    setEditingSponsors(updated);
                                  }}
                                />
                                Title Sponsor
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="admin-pagination">
                    <button
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={() => setSponsorPage((current) => Math.max(1, current - 1))}
                      disabled={sponsorPage === 1}
                    >
                      Previous
                    </button>
                    <span>Page {sponsorPage} of {totalSponsorPages}</span>
                    <button
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={() => setSponsorPage((current) => Math.min(totalSponsorPages, current + 1))}
                      disabled={sponsorPage >= totalSponsorPages}
                    >
                      Next
                    </button>
                  </div>

                  <div className="admin-page-number-strip">
                    {Array.from({ length: totalSponsorPages }, (_, index) => index + 1).map((pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        className={`admin-page-number ${sponsorPage === pageNumber ? 'active' : ''}`}
                        onClick={() => setSponsorPage(pageNumber)}
                      >
                        {pageNumber}
                      </button>
                    ))}
                  </div>

                  <button
                    className="admin-btn admin-btn-primary"
                    onClick={handleSaveSponsors}
                    disabled={isSavingSponsors}
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
                      className="admin-btn admin-btn-success"
                      onClick={handleAddPlayer}
                      disabled={isSaving}
                    >
                      <IoAdd size={18} /> Add Player
                    </button>
                    <button
                      className="admin-btn admin-btn-primary"
                      onClick={handleSavePlayers}
                      disabled={isSaving || editingPlayers.length === 0}
                    >
                      <IoSave size={18} /> Bulk Save All Players
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
                    <label className="admin-page-size">
                      <span>Rows per page</span>
                      <select
                        value={playerPageSize}
                        onChange={(e) => {
                          setPlayerPageSize(Number(e.target.value));
                          setPlayerPage(1);
                        }}
                      >
                        {PAGE_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <input
                      ref={csvFileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleImportPlayersFromCsv}
                      style={{ display: 'none' }}
                    />
                  </div>

                  <div className="admin-compact-list">
                    {paginatedPlayers.map((player) => (
                      <div key={player.id} className="admin-compact-item">
                        <div className="admin-compact-main">
                          <div className="admin-player-name-row">
                            <strong>{player.name}</strong>
                            {player.age != null && player.age > 0 && player.age < underAgeThreshold && (
                              <span className="admin-underage-chip">U{underAgeThreshold}</span>
                            )}
                          </div>
                          <small>
                            <span className="admin-role-dot" style={{ background: getRoleBadgeColor(player.role) }} />
                            {formatRoleDisplay(player.role)} | Base: ₹{player.basePrice}L
                          </small>
                        </div>
                        <div className="admin-compact-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            onClick={() => openPlayerEditor(player.id)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-danger admin-btn-sm"
                            onClick={() => handleDeletePlayer(player.id)}
                          >
                            <IoTrash size={16} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {filteredPlayers.length === 0 && (
                      <div className="admin-empty-state">No players found for your search.</div>
                    )}
                  </div>

                  <div className="admin-pagination">
                    <button
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={() => setPlayerPage((current) => Math.max(1, current - 1))}
                      disabled={playerPage === 1}
                    >
                      Previous
                    </button>
                    <span>Page {playerPage} of {totalPlayerPages}</span>
                    <button
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={() => setPlayerPage((current) => Math.min(totalPlayerPages, current + 1))}
                      disabled={playerPage >= totalPlayerPages}
                    >
                      Next
                    </button>
                  </div>

                  <div className="admin-page-number-strip">
                    {Array.from({ length: totalPlayerPages }, (_, index) => index + 1).map((pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        className={`admin-page-number ${playerPage === pageNumber ? 'active' : ''}`}
                        onClick={() => setPlayerPage(pageNumber)}
                      >
                        {pageNumber}
                      </button>
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

                  {soldPlayers.length > 0 && (
                    <div className="admin-export-table-wrapper">
                      <table className="admin-export-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Player</th>
                            <th>Role</th>
                            <th>Age</th>
                            <th>Team</th>
                            <th>Sold (₹L)</th>
                            <th>Base (₹L)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {soldPlayers.map((p, i) => (
                            <tr key={p.id}>
                              <td>{i + 1}</td>
                              <td>{p.name}</td>
                              <td>
                                <span className="admin-role-dot" style={{ background: getRoleBadgeColor(p.role) }} />
                                {formatRoleDisplay(p.role)}
                              </td>
                              <td>{p.age ?? 'N/A'}</td>
                              <td>{p.teamName}</td>
                              <td className="admin-export-amount">₹{p.soldAmount}</td>
                              <td>₹{p.basePrice}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {soldPlayers.length === 0 && (
                    <div className="admin-empty-state">No players sold yet. Sold players will appear here as the auction progresses.</div>
                  )}

                  <button
                    className="admin-btn admin-btn-success"
                    onClick={handleExportSoldPlayers}
                    disabled={soldPlayers.length === 0}
                    style={{ marginTop: '1rem' }}
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
                    className="admin-btn admin-btn-secondary"
                    onClick={handleResetImageCache}
                    disabled={isSaving}
                  >
                    <IoRefresh size={18} /> Reset Local Image Cache
                  </button>
                </div>
              )}

              {teamDraft && editingTeamId && (
                <div className="admin-edit-modal-backdrop" onClick={closeTeamEditor}>
                  <div className="admin-edit-modal" onClick={(e) => e.stopPropagation()}>
                    <h3>Edit Team</h3>

                    <div className="form-group">
                      <label>Team Name</label>
                      <input
                        type="text"
                        value={teamDraft.name}
                        onChange={(e) => setTeamDraft({ ...teamDraft, name: e.target.value })}
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Icon Player</label>
                        <input
                          type="text"
                          list="admin-captain-list"
                          value={teamDraft.captain || ''}
                          onChange={(e) => setTeamDraft({ ...teamDraft, captain: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Owner Name</label>
                        <input
                          type="text"
                          value={teamDraft.ownerCompany || ''}
                          onChange={(e) => setTeamDraft({ ...teamDraft, ownerCompany: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Brand Tagline</label>
                      <input
                        type="text"
                        value={teamDraft.brandTagline || ''}
                        onChange={(e) => setTeamDraft({ ...teamDraft, brandTagline: e.target.value })}
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Players Threshold</label>
                        <input
                          type="number"
                          value={teamDraft.totalPlayerThreshold}
                          onChange={(e) => setTeamDraft({ ...teamDraft, totalPlayerThreshold: Number.parseInt(e.target.value || '0', 10) || 0 })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Initial Purse (₹L)</label>
                        <input
                          type="number"
                          value={teamDraft.remainingPurse}
                          onChange={(e) => setTeamDraft({ ...teamDraft, remainingPurse: Number.parseInt(e.target.value || '0', 10) || 0 })}
                        />
                      </div>
                    </div>

                    <div className="admin-media-field">
                      <div className="admin-media-header">
                        <label>Team Logo</label>
                        <span>Drive link or direct upload</span>
                      </div>
                      <div className="admin-source-toggle">
                        <label className="admin-source-option">
                          <input
                            type="radio"
                            checked={teamDraftLogoSource === 'drive'}
                            onChange={() => setTeamLogoSources((prev) => ({ ...prev, [editingTeamId]: 'drive' }))}
                          />
                          Drive Link
                        </label>
                        <label className="admin-source-option">
                          <input
                            type="radio"
                            checked={teamDraftLogoSource === 'upload'}
                            onChange={() => setTeamLogoSources((prev) => ({ ...prev, [editingTeamId]: 'upload' }))}
                          />
                          Direct Upload
                        </label>
                      </div>

                      {teamDraftLogoSource === 'upload' ? (
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            void handleTeamDraftLogoFileChange(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      ) : (
                        <input
                          type="text"
                          value={teamDraft.logoUrl}
                          onChange={(e) => setTeamDraft({ ...teamDraft, logoUrl: e.target.value })}
                          placeholder="https://drive.google.com/..."
                        />
                      )}
                      {teamDraft.logoUrl && (
                        <div className="admin-upload-preview">
                          <img src={teamDraft.logoUrl} alt="Team logo preview" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          <span>Logo set</span>
                        </div>
                      )}
                    </div>

                    <div className="admin-media-field">
                      <div className="admin-media-header">
                        <label>Owner Logo</label>
                        <span>Drive link or direct upload</span>
                      </div>
                      <div className="admin-source-toggle">
                        <label className="admin-source-option">
                          <input
                            type="radio"
                            checked={teamDraftOwnerLogoSource === 'drive'}
                            onChange={() => setTeamOwnerLogoSources((prev) => ({ ...prev, [editingTeamId]: 'drive' }))}
                          />
                          Drive Link
                        </label>
                        <label className="admin-source-option">
                          <input
                            type="radio"
                            checked={teamDraftOwnerLogoSource === 'upload'}
                            onChange={() => setTeamOwnerLogoSources((prev) => ({ ...prev, [editingTeamId]: 'upload' }))}
                          />
                          Direct Upload
                        </label>
                      </div>

                      {teamDraftOwnerLogoSource === 'upload' ? (
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            void handleTeamDraftOwnerLogoFileChange(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      ) : (
                        <input
                          type="text"
                          value={teamDraft.brandLogoUrl || ''}
                          onChange={(e) => setTeamDraft({ ...teamDraft, brandLogoUrl: e.target.value })}
                          placeholder="https://drive.google.com/..."
                        />
                      )}
                    </div>

                    <div className="admin-modal-actions">
                      <button className="admin-btn admin-btn-secondary" type="button" onClick={closeTeamEditor}>Cancel</button>
                      <button className="admin-btn admin-btn-primary" type="button" onClick={saveTeamDraft}>Save Team</button>
                    </div>
                  </div>
                </div>
              )}

              {playerDraft && editingPlayerId && (
                <div className="admin-edit-modal-backdrop" onClick={closePlayerEditor}>
                  <div className="admin-edit-modal admin-edit-modal--wide" onClick={(e) => e.stopPropagation()}>
                    <div className="admin-modal-header-row">
                      <h3>Edit Player</h3>
                      <div className="admin-role-preview">
                        <span
                          className="admin-role-chip"
                          style={{ background: getRoleBadgeColor(playerDraft.role), color: '#fff' }}
                        >
                          {formatRoleDisplay(playerDraft.role)}
                        </span>
                        {playerDraft.age != null && playerDraft.age > 0 && playerDraft.age < underAgeThreshold && (
                          <span className="admin-underage-chip">U{underAgeThreshold}</span>
                        )}
                      </div>
                    </div>

                    {/* Basic Info */}
                    <div className="form-row">
                      <div className="form-group">
                        <label>Player ID</label>
                        <input
                          type="text"
                          value={playerDraft.id}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, id: e.target.value })}
                          className={editingPlayers.some(p => p.id === playerDraft.id && p.id !== editingPlayerId) ? 'input-error' : ''}
                        />
                        {editingPlayers.some(p => p.id === playerDraft.id && p.id !== editingPlayerId) && (
                          <span className="form-error">Duplicate ID — another player already uses this ID</span>
                        )}
                      </div>
                      <div className="form-group">
                        <label>Name</label>
                        <input
                          type="text"
                          value={playerDraft.name}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, name: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Role</label>
                        <input
                          type="text"
                          value={playerDraft.role}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, role: e.target.value as Player['role'] })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Base Price (₹L)</label>
                        <input
                          type="number"
                          value={playerDraft.basePrice}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, basePrice: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Age</label>
                        <input
                          type="number"
                          value={playerDraft.age ?? ''}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, age: e.target.value ? Number(e.target.value) : null })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Matches (legacy)</label>
                        <input
                          type="text"
                          value={playerDraft.matches}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, matches: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Runs (legacy)</label>
                        <input
                          type="text"
                          value={playerDraft.runs}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, runs: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Wickets (legacy)</label>
                        <input
                          type="text"
                          value={playerDraft.wickets}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, wickets: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Highest Scored</label>
                        <input
                          type="text"
                          value={playerDraft.battingBestFigures}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, battingBestFigures: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Bowling Best</label>
                        <input
                          type="text"
                          value={playerDraft.bowlingBestFigures}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, bowlingBestFigures: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* ── Batting Stats ── */}
                    {(getRoleCategory(playerDraft.role) !== 'Bowler') && (
                      <>
                        <h4 className="admin-stats-heading">Batting Statistics</h4>
                        <div className="admin-stats-grid">
                          {(Object.keys(playerDraft.battingStats ?? createEmptyBattingStats()) as (keyof BattingStats)[]).map((field) => (
                            <div key={`bat-${field}`} className="form-group form-group--compact">
                              <label>{field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</label>
                              <input
                                type="text"
                                value={(playerDraft.battingStats ?? createEmptyBattingStats())[field]}
                                onChange={(e) => {
                                  const updated = { ...(playerDraft.battingStats ?? createEmptyBattingStats()), [field]: e.target.value };
                                  setPlayerDraft({ ...playerDraft, battingStats: updated });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* ── Bowling Stats ── */}
                    {(getRoleCategory(playerDraft.role) !== 'Batsman' && getRoleCategory(playerDraft.role) !== 'Wicket Keeper Batsman') && (
                      <>
                        <h4 className="admin-stats-heading">Bowling Statistics</h4>
                        <div className="admin-stats-grid">
                          {(Object.keys(playerDraft.bowlingStats ?? createEmptyBowlingStats()) as (keyof BowlingStats)[]).map((field) => (
                            <div key={`bowl-${field}`} className="form-group form-group--compact">
                              <label>{field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</label>
                              <input
                                type="text"
                                value={(playerDraft.bowlingStats ?? createEmptyBowlingStats())[field]}
                                onChange={(e) => {
                                  const updated = { ...(playerDraft.bowlingStats ?? createEmptyBowlingStats()), [field]: e.target.value };
                                  setPlayerDraft({ ...playerDraft, bowlingStats: updated });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* ── All-Rounder: Show both ── */}
                    {getRoleCategory(playerDraft.role) === 'All-Rounder' && !playerDraft.battingStats && (
                      <small style={{ color: '#6b7280' }}>All-Rounder: both batting and bowling stats are shown above.</small>
                    )}

                    <div className="admin-media-field">
                      <div className="admin-media-header">
                        <label>Player Image</label>
                        <span>Drive link or direct upload PNG</span>
                      </div>
                      <div className="admin-source-toggle">
                        <label className="admin-source-option">
                          <input
                            type="radio"
                            checked={playerDraftImageSource === 'drive'}
                            onChange={() => setPlayerImageSources((prev) => ({ ...prev, [editingPlayerId]: 'drive' }))}
                          />
                          Drive Link
                        </label>
                        <label className="admin-source-option">
                          <input
                            type="radio"
                            checked={playerDraftImageSource === 'upload'}
                            onChange={() => setPlayerImageSources((prev) => ({ ...prev, [editingPlayerId]: 'upload' }))}
                          />
                          Direct Upload PNG
                        </label>
                      </div>

                      {playerDraftImageSource === 'upload' ? (
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            void handlePlayerDraftImageFileChange(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      ) : (
                        <input
                          type="text"
                          value={playerDraft.imageUrl}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, imageUrl: e.target.value })}
                          placeholder="https://drive.google.com/..."
                        />
                      )}
                    </div>

                    <div className="admin-modal-actions">
                      <button className="admin-btn admin-btn-secondary" type="button" onClick={closePlayerEditor}>Cancel</button>
                      <button
                        className="admin-btn admin-btn-primary"
                        type="button"
                        onClick={savePlayerDraft}
                        disabled={!playerDraft.id.trim() || editingPlayers.some(p => p.id === playerDraft.id && p.id !== editingPlayerId)}
                      >
                        Save Player
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Status Message */}
              {saveStatus === 'success' && (
                <div className="admin-success">✅ Saved successfully!</div>
              )}
              {saveStatus === 'error' && (
                <div className="admin-error">❌ Failed to save. Please try again.</div>
              )}

              {/* Upload Feedback Toast */}
              <AnimatePresence>
                {uploadFeedback && (
                  <motion.div
                    className={`admin-upload-toast admin-upload-toast--${uploadFeedback.type}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                  >
                    {uploadFeedback.type === 'success' ? '✅' : '❌'} {uploadFeedback.message}
                  </motion.div>
                )}
              </AnimatePresence>
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
