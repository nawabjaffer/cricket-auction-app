// ============================================================================
// ADMIN PANEL COMPONENT
// Manage auction configuration, teams, players, theme, and export data
// ============================================================================

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { IoClose, IoSave, IoRefresh, IoDownload, IoVideocam, IoAdd, IoTrash, IoArrowUp, IoArrowDown, IoSearch, IoStatsChart, IoCloudUpload } from 'react-icons/io5';
import { auctionPersistence, type AdminSettings, type SponsorRecord, type SpecialCategory, type BidIncrementRange } from '../../services/auctionPersistence';
import { realtimeSync } from '../../services/realtimeSync';
import { googleSheetsService, imagePreloaderService, resolveMediaToStorage, uploadFileToStorage } from '../../services';
import AdminImageBulkUpload from './AdminImageBulkUpload';
import { ThemeSettingsExtended } from './ThemeSettingsExtended';
import '../../components/AdminPanel/ThemeSettingsExtended.css';
import { useAuctionStore } from '../../store/auctionStore';
import { activeConfig } from '../../config';
import { exportSoldPlayers, exportUnsoldPlayers, downloadPlayersTemplate, downloadScoresTemplate } from '../../utils/exportData';
import FeatureFlagsTab from './FeatureFlagsTab';
import StreamingTab from './StreamingTab';
import './AdminPanel.css';
import type { Team, Player, SoldPlayer, UnsoldPlayer, AuctionRoleCategory, BattingStats, BowlingStats } from '../../types';
import { DEFAULT_AUCTION_ROLE_ORDER, createEmptyBattingStats, createEmptyBowlingStats } from '../../types';
import { formatRoleDisplay, getRoleCategory, getRoleBadgeColor } from '../../utils/roleFormatter';
import { localImageCacheService } from '../../services/localImageCache';
import { getCachedStorageUrl, resolveImageAsync } from '../../services/firebaseStorageService';
import { extractDriveFileId } from '../../utils/driveImage';
import { getLiveBlobUrl } from '../../services/mediaBlobCache';

// Small avatar that resolves Google Drive / Firebase Storage URLs the same way
// PlayerCard does, so admin thumbnails match what the auction listing shows.
function CompactPlayerAvatar({ imageUrl, playerName }: { readonly imageUrl?: string; readonly playerName: string }) {
  const [src, setSrc] = useState<string>(() => {
    if (!imageUrl) return '';
    const cached = getCachedStorageUrl(imageUrl);
    if (cached) {
      const blob = getLiveBlobUrl(cached);
      return blob || cached;
    }
    const fileId = extractDriveFileId(imageUrl);
    if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}=s96`;
    return imageUrl;
  });
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!imageUrl) { setSrc(''); return; }
    let alive = true;
    setErrored(false);
    const cached = getCachedStorageUrl(imageUrl);
    if (cached) {
      const blob = getLiveBlobUrl(cached);
      setSrc(blob || cached);
      return () => { alive = false; };
    }
    const fileId = extractDriveFileId(imageUrl);
    if (fileId) setSrc(`https://lh3.googleusercontent.com/d/${fileId}=s96`);
    else setSrc(imageUrl);
    const storagePath = `images/players/${playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    resolveImageAsync(imageUrl, storagePath, (url) => {
      if (!alive) return;
      const blob = getLiveBlobUrl(url);
      setSrc(blob || url);
    });
    return () => { alive = false; };
  }, [imageUrl, playerName]);

  const showError = !imageUrl || errored;

  return (
    <div className="admin-compact-avatar" aria-hidden="true">
      {!showError && src && (
        <img
          src={src}
          alt=""
          className="admin-compact-avatar-img"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      )}
      {showError && <span className="admin-compact-avatar-error">✕</span>}
    </div>
  );
}

type LogoSourceMode = 'drive' | 'upload';

interface AdminPanelProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSettingsSaved?: (settings: AdminSettings) => void;
  readonly mode?: 'drawer' | 'page';
}

export function AdminPanel({ isOpen, onClose, onSettingsSaved, mode = 'drawer' }: AdminPanelProps) {
  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
  const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const isDriveLikeUrl = (value?: string) => {
    const url = (value ?? '').trim().toLowerCase();
    return url.includes('drive.google.com') || url.includes('docs.google.com') || url.includes('googleusercontent.com');
  };

  // Get matching special category for a player's age
  const getAgeCategory = (age?: number | null) => {
    if (age == null || age <= 0) return null;
    const cats: SpecialCategory[] = extendedSettingsRef.current?.specialCategories ?? loadedAdminSettings?.specialCategories ?? [];
    return cats.find(c => {
      if (c.ageMax != null && age > c.ageMax) return false;
      if (c.ageMin != null && age < c.ageMin) return false;
      if (c.ageMax == null && c.ageMin == null) return false;
      return true;
    }) ?? null;
  };

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
  // Easy login mode for /connect-bidding — true = tap team card, false = username/password
  const [easyLoginMode, setEasyLoginMode] = useState(true);

  // Bid increment ranges
  const [bidIncrementRanges, setBidIncrementRanges] = useState<BidIncrementRange[]>([]);

  // Store
  const { teams, setTeams, soldPlayers, setSoldPlayers, unsoldPlayers, setUnsoldPlayers, originalPlayers, setAdminPlayerOverrides, reconcilePlayerPools } = useAuctionStore();
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
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  // Icon player state for the player editor
  const [isIconPlayer, setIsIconPlayer] = useState(false);
  const [iconTeamId, setIconTeamId] = useState<string>('');
  const [isSavingSponsors, setIsSavingSponsors] = useState(false);
  const [isMigratingMedia, setIsMigratingMedia] = useState(false);
  const [loadedAdminSettings, setLoadedAdminSettings] = useState<AdminSettings | null>(null);
  // Holds the latest extended settings from ThemeSettingsExtended, merged on save
  const extendedSettingsRef = useRef<Partial<AdminSettings>>({});
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);
  const statsCsvInputRef = useRef<HTMLInputElement | null>(null);
  const organizerLogoFileRef = useRef<HTMLInputElement | null>(null);
  const [organizerLogoUploading, setOrganizerLogoUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Stats CSV import state
  type StatsImportMatch = { csvRow: Record<string, string>; player: Player; status: 'matched' };
  type StatsImportMismatch = { csvRow: Record<string, string>; reason: string; status: 'mismatch' | 'missing' };
  const [statsImportResult, setStatsImportResult] = useState<{
    matched: StatsImportMatch[];
    mismatched: StatsImportMismatch[];
  } | null>(null);
  const [showStatsReview, setShowStatsReview] = useState(false);

  // Icon player searchable picker state
  const [iconPlayerSearch, setIconPlayerSearch] = useState('');
  const [showIconPlayerPicker, setShowIconPlayerPicker] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement>(null);

  // Sold player edit state
  const [editingSoldPlayerId, setEditingSoldPlayerId] = useState<string | null>(null);
  const [soldPlayerDraft, setSoldPlayerDraft] = useState<{ teamId: string; teamName: string; soldAmount: number } | null>(null);

  const showUploadFeedback = (message: string, type: 'success' | 'error' = 'success') => {
    setUploadFeedback({ message, type });
    setTimeout(() => setUploadFeedback(null), 3000);
  };

  const filteredPlayers = useMemo(
    () => editingPlayers.filter((player) => player.name.toLowerCase().includes(playerSearch.toLowerCase())),
    [editingPlayers, playerSearch],
  );

  // All players available for icon player selection (editingPlayers + originalPlayers, deduplicated)
  const allPlayersForIconPicker = useMemo(() => {
    const seen = new Set<string>();
    const merged: Player[] = [];
    // Prefer editingPlayers (includes manually added), then fill from originalPlayers
    for (const p of editingPlayers) {
      if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
    }
    for (const p of originalPlayers) {
      if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
    }
    return merged;
  }, [editingPlayers, originalPlayers]);

  // Filtered icon player list for the search picker
  const filteredIconPlayers = useMemo(() => {
    if (!iconPlayerSearch.trim()) return allPlayersForIconPicker;
    const q = iconPlayerSearch.toLowerCase();
    return allPlayersForIconPicker.filter(p =>
      p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }, [allPlayersForIconPicker, iconPlayerSearch]);

  // Map of team IDs that already have icon players assigned (for 1:1 enforcement)
  const teamsWithIconPlayers = useMemo(() => {
    const map = new Map<string, string>(); // teamId -> playerName
    for (const t of editingTeams) {
      if (t.captain?.trim()) map.set(t.id, t.captain.trim());
    }
    return map;
  }, [editingTeams]);

  // Available teams for icon player assignment (teams that don't already have an icon player, or the current player's team)
  const availableTeamsForIcon = useMemo(() => {
    return editingTeams.filter(t => {
      const assigned = teamsWithIconPlayers.get(t.id);
      // Allow if no icon player, or if it's the current player being edited
      return !assigned || (playerDraft && assigned.toLowerCase() === playerDraft.name.trim().toLowerCase());
    });
  }, [editingTeams, teamsWithIconPlayers, playerDraft]);

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

    const ensureDb = async (): Promise<boolean> => {
      const ok = await realtimeSync.ensureInitialized();
      if (!ok) return false;
      const db = realtimeSync.getDatabase();
      if (db) {
        auctionPersistence.initialize(db);
        return true;
      }
      return false;
    };

    const loadSettings = async () => {
      try {
        const dbReady = await ensureDb();
        if (!dbReady || !isMounted) return;
        const settings = await auctionPersistence.getAdminSettings();
        if (settings) {
          setLoadedAdminSettings(settings);
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
          setEasyLoginMode(settings.easyLoginMode !== false); // default true
          if (settings.bidIncrementRanges?.length) {
            setBidIncrementRanges(settings.bidIncrementRanges);
            useAuctionStore.getState().setBidIncrementRanges(settings.bidIncrementRanges);
          }
        }
      } catch (error) {
        console.error('[AdminPanel] Failed to load settings:', error);
      }
    };

    const loadSponsors = async () => {
      try {
        const dbReady = await ensureDb();
        if (!dbReady || !isMounted) return;
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

  // Close icon player picker on click outside
  useEffect(() => {
    if (!showIconPlayerPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target as Node)) {
        setShowIconPlayerPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showIconPlayerPicker]);

  // Handle save theme settings
  const handleSaveTheme = async () => {
    setIsSaving(true);
    try {
      // Ensure DB is ready
      await realtimeSync.ensureInitialized();
      const db = realtimeSync.getDatabase();
      if (db) auctionPersistence.initialize(db);

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
        easyLoginMode,
        bidIncrementRanges: bidIncrementRanges.length > 0 ? bidIncrementRanges : undefined,
        // Merge in extended settings (player stats, categories, budget, breaks, etc.)
        ...extendedSettingsRef.current,
      };

      // Strip undefined values — Firebase RTDB rejects them
      const clean = JSON.parse(JSON.stringify(settings)) as AdminSettings;

      await auctionPersistence.saveAdminSettings(clean);
      setLoadedAdminSettings(clean);
      onSettingsSaved?.(clean);

      // Apply theme colors to document
      document.documentElement.style.setProperty('--color-primary', primaryColor);
      document.documentElement.style.setProperty('--color-secondary', secondaryColor);
      document.documentElement.style.setProperty('--color-accent', accentColor);
      useAuctionStore.getState().setMaxUnsoldRounds(maxUnsoldRounds);
      useAuctionStore.getState().setBidIncrementRanges(bidIncrementRanges);
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
      const normalizedTeams = editingTeams.map((team) => ({
        ...team,
        allocatedAmount: Math.max(team.allocatedAmount ?? 0, team.remainingPurse ?? 0),
      }));
      await auctionPersistence.saveTeams(normalizedTeams);
      setEditingTeams(normalizedTeams);
      setTeams(normalizedTeams);
      reconcilePlayerPools();

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

  const handleDeleteAllPlayers = async () => {
    if (editingPlayers.length === 0) return;
    const confirmed = globalThis.confirm(
      `Delete ALL ${editingPlayers.length} players? They will need to be re-imported via bulk import.`
    );
    if (!confirmed) return;

    try {
      setIsSaving(true);
      await auctionPersistence.clearAdminPlayers();
      setEditingPlayers([]);
      setAdminPlayerOverrides([]);
      showUploadFeedback('All players deleted. Re-import when ready.');
    } catch (err) {
      showUploadFeedback(`Failed to delete players: ${(err as Error).message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSoldPlayer = (player: SoldPlayer) => {
    setEditingSoldPlayerId(player.id);
    setSoldPlayerDraft({ teamId: player.teamId, teamName: player.teamName, soldAmount: player.soldAmount });
  };

  const handleSaveSoldPlayerEdit = async () => {
    if (!editingSoldPlayerId || !soldPlayerDraft) return;
    const player = soldPlayers.find(p => p.id === editingSoldPlayerId);
    if (!player) return;

    try {
      setIsSaving(true);
      const updatedPlayer: SoldPlayer = {
        ...player,
        teamId: soldPlayerDraft.teamId,
        teamName: soldPlayerDraft.teamName,
        soldAmount: soldPlayerDraft.soldAmount,
      };

      // Update the soldPlayers list in store
      const updatedList = soldPlayers.map(p => p.id === editingSoldPlayerId ? updatedPlayer : p);
      setSoldPlayers(updatedList);

      // Persist to Firebase
      await auctionPersistence.saveSoldPlayer(updatedPlayer, soldPlayerDraft.teamName);

      // Update team budgets if team or amount changed
      if (player.teamId !== soldPlayerDraft.teamId || player.soldAmount !== soldPlayerDraft.soldAmount) {
        const updatedTeams = teams.map(t => {
          if (t.id === player.teamId && player.teamId !== soldPlayerDraft.teamId) {
            // Old team: refund the player
            return { ...t, remainingPurse: t.remainingPurse + player.soldAmount, playersBought: Math.max(0, t.playersBought - 1) };
          }
          if (t.id === soldPlayerDraft.teamId && player.teamId !== soldPlayerDraft.teamId) {
            // New team: deduct the amount
            return { ...t, remainingPurse: t.remainingPurse - soldPlayerDraft.soldAmount, playersBought: t.playersBought + 1 };
          }
          if (t.id === soldPlayerDraft.teamId && player.teamId === soldPlayerDraft.teamId && player.soldAmount !== soldPlayerDraft.soldAmount) {
            // Same team but amount changed: adjust purse
            return { ...t, remainingPurse: t.remainingPurse + player.soldAmount - soldPlayerDraft.soldAmount };
          }
          return t;
        });
        setTeams(updatedTeams);
        await auctionPersistence.saveTeams(updatedTeams);
      }

      setEditingSoldPlayerId(null);
      setSoldPlayerDraft(null);
      showUploadFeedback(`Updated ${player.name} successfully.`);
    } catch (err) {
      showUploadFeedback(`Failed to update: ${(err as Error).message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndoSoldPlayer = async (player: SoldPlayer) => {
    const confirmed = globalThis.confirm(`Undo sale of ${player.name} (₹${player.soldAmount}L) from ${player.teamName}? This will return them to the available pool.`);
    if (!confirmed) return;

    try {
      setIsSaving(true);

      // Remove from sold players
      const updatedSold = soldPlayers.filter(p => p.id !== player.id);
      setSoldPlayers(updatedSold);
      await auctionPersistence.removeSoldPlayer(player.id);

      // Refund team budget
      const updatedTeams = teams.map(t => {
        if (t.id === player.teamId) {
          return { ...t, remainingPurse: t.remainingPurse + player.soldAmount, playersBought: Math.max(0, t.playersBought - 1) };
        }
        return t;
      });
      setTeams(updatedTeams);
      await auctionPersistence.saveTeams(updatedTeams);

      showUploadFeedback(`Undid sale of ${player.name}. Player returned to available pool.`);
    } catch (err) {
      showUploadFeedback(`Failed to undo sale: ${(err as Error).message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndoUnsoldPlayer = async (player: UnsoldPlayer) => {
    const confirmed = globalThis.confirm(`Undo unsold status of ${player.name}? This will return them to the available pool.`);
    if (!confirmed) return;

    try {
      setIsSaving(true);

      // Remove from unsold players in store
      const updatedUnsold = unsoldPlayers.filter(p => p.id !== player.id);
      setUnsoldPlayers(updatedUnsold);

      // Remove from Firebase
      await auctionPersistence.removeUnsoldPlayer(player.id);

      // Reconcile player pools so the player appears in available again
      reconcilePlayerPools();

      showUploadFeedback(`Undid unsold status of ${player.name}. Player returned to available pool.`);
    } catch (err) {
      showUploadFeedback(`Failed to undo unsold: ${(err as Error).message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Unsold → Sold: move an unsold player directly to a team
  const [editingUnsoldPlayerId, setEditingUnsoldPlayerId] = useState<string | null>(null);
  const [unsoldSellDraft, setUnsoldSellDraft] = useState<{ teamId: string; teamName: string; soldAmount: number } | null>(null);

  const handleEditUnsoldPlayer = (player: UnsoldPlayer) => {
    setEditingUnsoldPlayerId(player.id);
    setUnsoldSellDraft({ teamId: teams[0]?.id || '', teamName: teams[0]?.name || '', soldAmount: player.basePrice });
  };

  const handleSaveUnsoldToSold = async () => {
    if (!editingUnsoldPlayerId || !unsoldSellDraft) return;
    const player = unsoldPlayers.find(p => p.id === editingUnsoldPlayerId);
    if (!player) return;

    try {
      setIsSaving(true);

      const soldPlayer: SoldPlayer = {
        ...player,
        soldAmount: unsoldSellDraft.soldAmount,
        teamName: unsoldSellDraft.teamName,
        teamId: unsoldSellDraft.teamId,
        soldDate: new Date().toISOString(),
      };

      // Remove from unsold
      const updatedUnsold = unsoldPlayers.filter(p => p.id !== player.id);
      setUnsoldPlayers(updatedUnsold);
      await auctionPersistence.removeUnsoldPlayer(player.id);

      // Add to sold
      const updatedSold = [...soldPlayers, soldPlayer];
      setSoldPlayers(updatedSold);
      await auctionPersistence.saveSoldPlayer(soldPlayer, unsoldSellDraft.teamName);

      // Update team budget
      const updatedTeams = teams.map(t => {
        if (t.id === unsoldSellDraft.teamId) {
          return {
            ...t,
            playersBought: t.playersBought + 1,
            remainingPurse: t.remainingPurse - unsoldSellDraft.soldAmount,
            highestBid: Math.max(t.highestBid, unsoldSellDraft.soldAmount),
          };
        }
        return t;
      });
      setTeams(updatedTeams);
      await auctionPersistence.saveTeams(updatedTeams);

      setEditingUnsoldPlayerId(null);
      setUnsoldSellDraft(null);
      showUploadFeedback(`${player.name} moved to ${unsoldSellDraft.teamName} for ₹${unsoldSellDraft.soldAmount}L`);
    } catch (err) {
      showUploadFeedback(`Failed to move player: ${(err as Error).message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportUnsoldPlayers = () => {
    if (unsoldPlayers.length === 0) {
      alert('No unsold players to export');
      return;
    }

    const records = unsoldPlayers.map(player => ({
      id: player.id,
      name: player.name,
      role: player.role,
      age: player.age ?? null,
      matches: player.matches ?? '',
      bowlingBest: player.bowlingBestFigures || 'N/A',
      basePrice: player.basePrice ?? 0,
      round: player.round,
      timestamp: player.unsoldDate ? new Date(player.unsoldDate).getTime() : Date.now(),
      imageUrl: player.imageUrl ?? '',
    }));

    exportUnsoldPlayers(records);
  };

  const openTeamEditor = (teamId: string) => {
    const targetTeam = editingTeams.find((team) => team.id === teamId);
    if (!targetTeam) return;

    setEditingTeamId(teamId);
    setTeamDraft({ ...targetTeam });
    setIconPlayerSearch('');
    setShowIconPlayerPicker(false);
  };

  const closeTeamEditor = () => {
    setEditingTeamId(null);
    setTeamDraft(null);
    setShowIconPlayerPicker(false);
  };

  const saveTeamDraft = async () => {
    if (!editingTeamId || !teamDraft) return;

    // Reconcile budget against actual sold players for this team so that the
    // displayed "remaining" never drifts when admin edits a team mid-auction.
    // allocatedAmount is the source of truth for "total budget"; remainingPurse
    // is derived = allocatedAmount - sum(soldPlayer.soldAmount for this team).
    const teamSpent = soldPlayers
      .filter(sp => sp.teamId === editingTeamId || sp.teamName === teamDraft.name)
      .reduce((sum, sp) => sum + (sp.soldAmount || 0), 0);
    const newAllocated = Math.max(teamDraft.allocatedAmount ?? 0, teamSpent);
    const newRemaining = Math.max(0, newAllocated - teamSpent);

    const normalizedDraft = {
      ...teamDraft,
      allocatedAmount: newAllocated,
      remainingPurse: newRemaining,
    };
    const updatedTeams = editingTeams.map((team) => (
      team.id === editingTeamId
        ? { ...normalizedDraft }
        : team
    ));
    setEditingTeams(updatedTeams);

    // Persist to Firebase and update store
    try {
      await auctionPersistence.saveTeams(updatedTeams);
      setTeams(updatedTeams);
      reconcilePlayerPools();
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

    // Check if this player is currently an icon player for any team
    const assignedTeam = editingTeams.find(t => t.captain?.trim().toLowerCase() === targetPlayer.name.trim().toLowerCase());
    if (assignedTeam) {
      setIsIconPlayer(true);
      setIconTeamId(assignedTeam.id);
    } else {
      setIsIconPlayer(false);
      setIconTeamId('');
    }
  };

  const closePlayerEditor = () => {
    setEditingPlayerId(null);
    setPlayerDraft(null);
    setIsIconPlayer(false);
    setIconTeamId('');
  };

  const savePlayerDraft = async () => {
    if (!editingPlayerId || !playerDraft) return;

    // Block save if duplicate ID
    if (editingPlayers.some(p => p.id === playerDraft.id && p.id !== editingPlayerId)) return;
    // Block save if ID is empty
    if (!playerDraft.id.trim()) return;
    // Block save if icon player toggled on but no team selected
    if (isIconPlayer && !iconTeamId) return;

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

    // Update teams for icon player assignment
    // First, find old name of this player (before edit) to clear from any team
    const oldPlayer = editingPlayers.find(p => p.id === editingPlayerId);
    const oldName = oldPlayer?.name?.trim().toLowerCase() || '';
    let updatedTeams = editingTeams.map(t => {
      // Clear this player from any team they were previously icon for
      if (t.captain?.trim().toLowerCase() === oldName) {
        const filteredIconics = (t.iconicPlayers || []).filter(
          n => n.trim().toLowerCase() !== oldName
        );
        return { ...t, captain: filteredIconics[0] || '', iconicPlayers: filteredIconics };
      }
      return t;
    });
    // Now assign to the selected team if icon player is enabled
    if (isIconPlayer && iconTeamId) {
      updatedTeams = updatedTeams.map(t => {
        if (t.id !== iconTeamId) return t;
        const currentIconics = t.iconicPlayers || (t.captain ? [t.captain] : []);
        const alreadyExists = currentIconics.some(
          n => n.trim().toLowerCase() === playerDraft.name.trim().toLowerCase()
        );
        const updatedIconics = alreadyExists ? currentIconics : [...currentIconics, playerDraft.name];
        return { ...t, captain: updatedIconics[0] || '', iconicPlayers: updatedIconics };
      });
    }
    setEditingTeams(updatedTeams);

    // Persist to Firebase and update store with feedback
    setIsSaving(true);
    try {
      setAdminPlayerOverrides(updatedPlayers);
      await auctionPersistence.saveAdminPlayers(updatedPlayers);
      // Also persist team changes (icon player assignment)
      setTeams(updatedTeams);
      await auctionPersistence.saveTeams(updatedTeams);
      reconcilePlayerPools();
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

  const handleOrganizerLogoFileChange = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showUploadFeedback('Invalid file type. Please select an image file.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showUploadFeedback('Image too large. Max 5MB allowed.', 'error');
      return;
    }
    try {
      setOrganizerLogoUploading(true);
      const storageUrl = await uploadFileToStorage(
        file,
        `media/organizer/logo-${Date.now()}`
      );
      setOrganizerLogo(storageUrl);
      showUploadFeedback(`Organizer logo uploaded: ${file.name}`);
    } catch {
      showUploadFeedback('Failed to upload organizer logo.', 'error');
    } finally {
      setOrganizerLogoUploading(false);
    }
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
      const storageUrl = await uploadFileToStorage(
        file,
        `media/teams/${slugify(teamDraft.name || editingTeamId)}-logo-${Date.now()}`
      );
      setTeamDraft({ ...teamDraft, logoUrl: storageUrl });
      setTeamLogoSources((prev) => ({ ...prev, [editingTeamId]: 'upload' }));
      showUploadFeedback(`Team logo uploaded to Firebase Storage: ${file.name}`);
    } catch {
      showUploadFeedback('Failed to upload team logo to Firebase Storage.', 'error');
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
      const storageUrl = await uploadFileToStorage(
        file,
        `media/teams/${slugify(teamDraft.name || editingTeamId)}-owner-logo-${Date.now()}`
      );
      setTeamDraft({ ...teamDraft, brandLogoUrl: storageUrl });
      setTeamOwnerLogoSources((prev) => ({ ...prev, [editingTeamId]: 'upload' }));
      showUploadFeedback(`Owner logo uploaded to Firebase Storage: ${file.name}`);
    } catch {
      showUploadFeedback('Failed to upload owner logo to Firebase Storage.', 'error');
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
      const storageUrl = await uploadFileToStorage(
        file,
        `media/players/${slugify(playerDraft.name || editingPlayerId)}-${Date.now()}`
      );
      setPlayerDraft({ ...playerDraft, imageUrl: storageUrl });
      setPlayerImageSources((prev) => ({ ...prev, [editingPlayerId]: 'upload' }));
      showUploadFeedback(`Player image uploaded to Firebase Storage: ${file.name}`);
    } catch {
      showUploadFeedback('Failed to upload player image to Firebase Storage.', 'error');
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
      phone: '',
      whatsappNumber: '',
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
    setIsIconPlayer(false);
    setIconTeamId('');
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
    const sponsor = editingSponsors[index];
    if (!sponsor) return;
    try {
      const storageUrl = await uploadFileToStorage(
        file,
        `media/sponsors/${slugify(sponsor.name || sponsor.id)}-logo-${Date.now()}`
      );
      await updateSponsorLogo(index, 'upload', storageUrl);
      showUploadFeedback(`Sponsor logo uploaded to Firebase Storage: ${file.name}`);
    } catch {
      showUploadFeedback('Failed to upload sponsor logo to Firebase Storage.', 'error');
    }
  };

  const handleSponsorVideoFileChange = async (index: number, file?: File | null) => {
    if (!file) return;
    const sponsor = editingSponsors[index];
    if (!sponsor) return;
    try {
      const storageUrl = await uploadFileToStorage(
        file,
        `media/sponsors/${slugify(sponsor.name || sponsor.id)}-video-${Date.now()}`
      );
    const updated = [...editingSponsors];
    if (updated[index]) {
      updated[index] = { ...updated[index], videoUrl: storageUrl };
      setEditingSponsors(updated);
    }
      showUploadFeedback(`Sponsor video uploaded to Firebase Storage: ${file.name}`);
    } catch {
      showUploadFeedback('Failed to upload sponsor video to Firebase Storage.', 'error');
    }
  };

  const handleMigrateDriveMediaToStorage = async () => {
    if (isMigratingMedia) return;
    setIsMigratingMedia(true);
    setIsSaving(true);
    try {
      let migratedCount = 0;
      const toStorage = async (url: string | undefined, storagePath: string): Promise<string> => {
        const raw = (url ?? '').trim();
        if (!raw) return raw;
        if (raw.includes('firebasestorage.googleapis.com') || raw.includes('firebasestorage.app')) return raw;
        if (!isDriveLikeUrl(raw)) return raw;
        const resolved = await resolveMediaToStorage(raw, storagePath);
        if (resolved !== raw) migratedCount += 1;
        return resolved;
      };

      const nextPlayers = await Promise.all(editingPlayers.map(async (player) => ({
        ...player,
        imageUrl: await toStorage(player.imageUrl, `media/players/${slugify(player.name || player.id)}`),
      })));

      const nextTeams = await Promise.all(editingTeams.map(async (team) => ({
        ...team,
        logoUrl: await toStorage(team.logoUrl, `media/teams/${slugify(team.name || team.id)}-logo`),
        brandLogoUrl: await toStorage(team.brandLogoUrl, `media/teams/${slugify(team.name || team.id)}-owner-logo`),
      })));

      const nextSponsors = await Promise.all(editingSponsors.map(async (sponsor) => ({
        ...sponsor,
        logoUrl: await toStorage(sponsor.logoUrl, `media/sponsors/${slugify(sponsor.name || sponsor.id)}-logo`),
        videoUrl: await toStorage(sponsor.videoUrl, `media/sponsors/${slugify(sponsor.name || sponsor.id)}-video`),
      })));

      setEditingPlayers(nextPlayers);
      setEditingTeams(nextTeams);
      setEditingSponsors(nextSponsors);

      setAdminPlayerOverrides(nextPlayers);
      setTeams(nextTeams);
      reconcilePlayerPools();

      await Promise.all([
        auctionPersistence.saveAdminPlayers(nextPlayers),
        auctionPersistence.saveTeams(nextTeams),
        auctionPersistence.saveSponsors(nextSponsors),
      ]);

      showUploadFeedback(`Migration complete: ${migratedCount} Drive media URL(s) moved to Firebase Storage.`);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[AdminPanel] Failed to migrate Drive media:', error);
      showUploadFeedback('Drive media migration failed. Check console for details.', 'error');
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsMigratingMedia(false);
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
      setAdminPlayerOverrides(editingPlayers);

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

  const handleBulkSaveImages = async (updatedPlayers: Player[]) => {
    setIsSaving(true);
    try {
      // Persist uploaded image URLs and update store
      await auctionPersistence.saveAdminPlayers(updatedPlayers);
      setAdminPlayerOverrides(updatedPlayers);

      // Preload uploaded images into local cache (best-effort)
      const items = updatedPlayers
        .filter(p => p.imageUrl)
        .map(p => ({ url: p.imageUrl as string, storagePath: `images/players/${p.id}` }));
      void imagePreloaderService.preloadImages(items.map(i => i.url)).catch(() => {});

      showUploadFeedback('Player images saved', 'success');
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('[AdminPanel] bulk save images failed', err);
      showUploadFeedback('Failed to save images', 'error');
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
      throw err;
    } finally {
      setIsSaving(false);
      setIsBulkUploadOpen(false);
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
      phone: findHeaderIndex(headers, ['phone', 'phonenumber', 'phone number', 'mobile', 'mobile number', 'contact number']),
      whatsappNumber: findHeaderIndex(headers, ['whatsapp', 'whatsappnumber', 'whatsapp number', 'wa', 'wa number', 'whatsapp no']),
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
      const phone = get(idx.phone).trim();
      const whatsappNumber = get(idx.whatsappNumber).trim() || phone;

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
        phone: phone || undefined,
        whatsappNumber: whatsappNumber || undefined,
        ...(battingStats ? { battingStats } : {}),
        ...(bowlingStats ? { bowlingStats } : {}),
      });
    });

    // Merge with existing players to preserve images if the CSV image mapping is missing/empty
    const mergedParsed = parsed.map(p => {
      const existing = editingPlayers.find(ep => ep.id === p.id);
      if (existing && existing.imageUrl && !p.imageUrl) {
        return { ...p, imageUrl: existing.imageUrl };
      }
      return p;
    });

    return mergedParsed;
  };

  const applyImportedPlayers = async (players: Player[]) => {
    if (players.length === 0) {
      throw new Error('No valid players found to import.');
    }

    // Auto-migrate any Drive / external image URLs to Firebase Storage so
    // imports never leave the app depending on slow / blocked sources.
    const migrated = await Promise.all(players.map(async (p) => {
      if (!p.imageUrl || typeof p.imageUrl !== 'string') return p;
      const url = p.imageUrl.trim();
      if (!url) return p;
      if (url.startsWith('data:') || url.startsWith('blob:')) return p;
      if (url.includes('firebasestorage')) return p;
      try {
        const storagePath = `media/players/${p.id ?? p.name ?? 'unknown'}`;
        const storageUrl = await resolveMediaToStorage(url, storagePath);
        return storageUrl && storageUrl !== url ? { ...p, imageUrl: storageUrl } : p;
      } catch {
        return p;
      }
    }));

    setEditingPlayers(migrated);
    setAdminPlayerOverrides(migrated);
    reconcilePlayerPools();
    await auctionPersistence.saveAdminPlayers(migrated);
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

  // ── Stats CSV Import ──
  // Format: Id, Full Name, Phone Number, Cricket Role, CricHeroes Link,
  //   Batting: Matches Played, INNS, NOT OUT, Runs, Highest Score, Average, Strike Rate, 30s, 50s, 100s, 4s, 6s
  //   Bowling: Matches played, Innings, Overs, Maidens, Runs, Wickets, BB, 3WKTS, 5WKTS, ECO, SR, AVG
  const parseStatsCsv = (text: string): Record<string, string>[] => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
    const rows: Record<string, string>[] = [];

    lines.slice(1).forEach(line => {
      const cells = parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
      rows.push(row);
    });

    return rows;
  };

  const getStatsCsvField = (row: Record<string, string>, ...candidates: string[]): string => {
    for (const c of candidates) {
      const val = row[c];
      if (val !== undefined && val !== '') return val;
    }
    return '';
  };

  const matchStatsToPlayers = (csvRows: Record<string, string>[]) => {
    const matched: StatsImportMatch[] = [];
    const mismatched: StatsImportMismatch[] = [];

    // Build lookup maps from editing players
    const byId = new Map(editingPlayers.map(p => [p.id.trim().toLowerCase(), p]));
    const byName = new Map(editingPlayers.map(p => [p.name.trim().toLowerCase(), p]));

    for (const row of csvRows) {
      const csvId = getStatsCsvField(row, 'id').trim();
      const csvName = getStatsCsvField(row, 'full name:', 'full name', 'name', 'playername').trim();

      if (!csvName && !csvId) {
        mismatched.push({ csvRow: row, reason: 'No ID or Name in CSV row', status: 'missing' });
        continue;
      }

      // Try matching by ID first, then by name
      let player: Player | undefined;
      let matchMethod = '';

      if (csvId && byId.has(csvId.toLowerCase())) {
        player = byId.get(csvId.toLowerCase());
        matchMethod = 'id';
      }

      if (!player && csvName && byName.has(csvName.toLowerCase())) {
        player = byName.get(csvName.toLowerCase());
        matchMethod = 'name';
      }

      if (!player) {
        mismatched.push({
          csvRow: row,
          reason: `No matching player found (ID: "${csvId}", Name: "${csvName}")`,
          status: 'mismatch',
        });
        continue;
      }

      // Safety check: if matched by ID, verify name matches too
      if (matchMethod === 'id' && csvName) {
        const normalizedPlayerName = player.name.trim().toLowerCase();
        const normalizedCsvName = csvName.toLowerCase();
        if (normalizedPlayerName !== normalizedCsvName) {
          mismatched.push({
            csvRow: row,
            reason: `ID matched "${player.name}" but CSV name is "${csvName}" — possible mismatch`,
            status: 'mismatch',
          });
          continue;
        }
      }

      matched.push({ csvRow: row, player, status: 'matched' });
    }

    return { matched, mismatched };
  };

  const applyStatsToPlayers = async (matches: StatsImportMatch[]) => {
    const updateMap = new Map<string, { battingStats: BattingStats; bowlingStats: BowlingStats; role: string; matches: string; runs: string; wickets: string; battingBestFigures: string; bowlingBestFigures: string }>();

    for (const { csvRow, player } of matches) {
      const g = (...cs: string[]) => getStatsCsvField(csvRow, ...cs);

      const battingStats: BattingStats = {
        matches: g('batting matches played', 'batting matches', 'matches played') || g('matches') || '0',
        innings: g('inns', 'innings', 'bat_innings') || '0',
        notOut: g('not out', 'notout', 'no') || '0',
        runs: g('runs') || '0',
        highestScore: g('highest score', 'highestscore', 'hs') || '0',
        average: g('average', 'bat_average', 'batting average') || '0.00',
        strikeRate: g('strike rate', 'strikerate', 'sr') || '0.00',
        thirties: g('30s', 'thirties') || '0',
        fifties: g('50s', 'fifties') || '0',
        hundreds: g('100s', 'hundreds', 'centuries') || '0',
        fours: g('4s', 'fours') || '0',
        sixes: g('6s', 'sixes') || '0',
      };

      const bowlingStats: BowlingStats = {
        matches: g('bowling matches played', 'bowling matches') || g('matches') || '0',
        innings: g('bowling innings', 'bowl_innings') || '0',
        overs: g('overs') || '0',
        maidens: g('maidens') || '0',
        runs: g('bowling runs', 'bowl_runs', 'runs_conceded') || '0',
        wickets: g('wickets') || '0',
        bestBowling: g('bb', 'best bowling') || 'N/A',
        threeWickets: g('3wkts', '3_wickets', 'three_wickets') || '0',
        fiveWickets: g('5wkts', '5_wickets', 'five_wickets') || '0',
        economy: g('eco', 'economy') || '0.00',
        strikeRate: g('bowling sr', 'bowl_sr') || '0.00',
        average: g('bowling avg', 'bowl_avg', 'avg') || '0.00',
      };

      const role = g('cricket role', 'role') || player.role;

      updateMap.set(player.id, {
        battingStats,
        bowlingStats,
        role,
        matches: battingStats.matches,
        runs: battingStats.runs,
        wickets: bowlingStats.wickets,
        battingBestFigures: battingStats.highestScore !== '0' ? battingStats.highestScore : player.battingBestFigures,
        bowlingBestFigures: bowlingStats.bestBowling !== 'N/A' ? bowlingStats.bestBowling : player.bowlingBestFigures,
      });
    }

    const updatedPlayers = editingPlayers.map(p => {
      const stats = updateMap.get(p.id);
      if (!stats) return p;
      return {
        ...p,
        role: (stats.role || p.role) as Player['role'],
        matches: stats.matches,
        runs: stats.runs,
        wickets: stats.wickets,
        battingBestFigures: stats.battingBestFigures,
        bowlingBestFigures: stats.bowlingBestFigures,
        battingStats: stats.battingStats,
        bowlingStats: stats.bowlingStats,
      };
    });

    setEditingPlayers(updatedPlayers);
    setAdminPlayerOverrides(updatedPlayers);
    reconcilePlayerPools();
    try {
      await auctionPersistence.saveAdminPlayers(updatedPlayers);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('[AdminPanel] Failed saving stats:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleImportStatsCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const csvRows = parseStatsCsv(text);

      if (csvRows.length === 0) {
        showUploadFeedback('CSV file is empty or has no data rows.', 'error');
        return;
      }

      const result = matchStatsToPlayers(csvRows);
      setStatsImportResult(result);

      if (result.mismatched.length > 0) {
        // Show review overlay so user can see and fix mismatches
        setShowStatsReview(true);
      } else {
        // All matched — apply immediately
        setIsSaving(true);
        await applyStatsToPlayers(result.matched);
        showUploadFeedback(`Stats imported for ${result.matched.length} player(s).`);
        setStatsImportResult(null);
        setIsSaving(false);
      }
    } catch (err) {
      console.error('[AdminPanel] Stats CSV import failed:', err);
      showUploadFeedback('Failed to parse stats CSV. Check format.', 'error');
    }
  };

  const handleApplyMatchedStats = async () => {
    if (!statsImportResult) return;
    setIsSaving(true);
    await applyStatsToPlayers(statsImportResult.matched);
    showUploadFeedback(`Stats applied for ${statsImportResult.matched.length} player(s). ${statsImportResult.mismatched.length} row(s) skipped.`);
    setShowStatsReview(false);
    setStatsImportResult(null);
    setIsSaving(false);
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

  // Soft reset — clears all auction progress but keeps current player data (no sheets reload)
  const handleSoftResetAuction = async () => {
    const confirmed = globalThis.confirm(
      'RESET AUCTION PROGRESS?\n\nThis will:\n• Clear ALL sold & unsold players\n• Reset ALL team budgets & stats to original\n• Reset rounds back to Round 1\n• Clear bid history\n\nPlayer data will NOT be reloaded from sheets.\nThis cannot be undone.'
    );
    if (!confirmed) return;

    try {
      setIsSaving(true);

      // 1. Clear Firebase auction data (sold, unsold, teams)
      await auctionPersistence.clearAuctionData();

      // 2. Reset teams to original budgets (zero out auction progress)
      const store = useAuctionStore.getState();
      const resetTeams = store.teams.map((team) => ({
        ...team,
        playersBought: 0,
        remainingPlayers: team.totalPlayerThreshold,
        remainingPurse: team.allocatedAmount,
        highestBid: 0,
        underAgePlayers: 0,
      }));

      // 3. Apply reset to store
      store.setTeams(resetTeams);
      store.setSoldPlayers([]);
      store.setUnsoldPlayers([]);
      store.resetAuction();

      // 4. Re-populate available players from current data (not from sheets)
      const currentPlayers = editingPlayers.length > 0 ? editingPlayers : originalPlayers;
      store.setPlayers(currentPlayers);

      // 5. Persist reset teams to Firebase
      await auctionPersistence.saveTeams(resetTeams);

      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (error) {
      console.error('[AdminPanel] Failed to soft-reset auction:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // Wipe ONLY live broadcast/session paths in RTDB. Preserves teams, players,
  // sponsors, theme, settings and per-team wishlists. Use between sessions to
  // prevent stale "live state" from leaking into the next auction.
  const handleClearLiveSessionState = async () => {
    const confirmed = globalThis.confirm(
      'CLEAR LIVE SESSION STATE?\n\n' +
      'This will wipe stale live-broadcast data from Firebase:\n' +
      '  • Current player / current bid snapshot\n' +
      '  • Mobile bid stream\n' +
      '  • Session reset signals\n' +
      '  • Overlay broadcast control flags\n\n' +
      'PRESERVED: Teams, players, sponsors, theme, admin settings, wishlists,\n' +
      'sold/unsold player history.\n\n' +
      'Safe to run between auction sessions.'
    );
    if (!confirmed) return;

    try {
      setIsSaving(true);
      await auctionPersistence.clearLiveSessionState();
      showUploadFeedback('Live session state cleared. Stale broadcast data removed.');
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (error) {
      console.error('[AdminPanel] Failed to clear live session state:', error);
      showUploadFeedback('Failed to clear live session state.', 'error');
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
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

      <AdminImageBulkUpload
        players={editingPlayers}
        page={playerPage}
        pageSize={playerPageSize}
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onBulkSave={handleBulkSaveImages}
      />

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
                    <label>Organizer Logo</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={organizerLogo}
                        onChange={(e) => setOrganizerLogo(e.target.value)}
                        placeholder="https://example.com/logo.png or upload →"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="admin-btn admin-btn-ghost admin-btn-sm"
                        title="Upload logo from device"
                        disabled={organizerLogoUploading}
                        onClick={() => organizerLogoFileRef.current?.click()}
                        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        {organizerLogoUploading ? 'Uploading…' : '⬆ Upload'}
                      </button>
                    </div>
                    <input
                      ref={organizerLogoFileRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        void handleOrganizerLogoFileChange(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    {organizerLogo && (
                      <div className="admin-upload-preview" style={{ marginTop: '0.5rem' }}>
                        <img
                          src={organizerLogo}
                          alt="Organizer logo preview"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <span>Logo set</span>
                      </div>
                    )}
                  </div>

                  <h3 style={{ marginTop: '2rem' }}>Bid Increment Ranges</h3>
                  <small style={{ color: '#6b7280', display: 'block', marginBottom: '0.75rem' }}>
                    Configure bid increments based on current bid amount. If empty, default increment ({activeConfig.auction.bidIncrements.default}L) is used.
                  </small>
                  {bidIncrementRanges.map((range, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <input
                        type="number"
                        value={range.minAmount}
                        onChange={(e) => {
                          const updated = [...bidIncrementRanges];
                          updated[index] = { ...updated[index], minAmount: Number(e.target.value) };
                          setBidIncrementRanges(updated);
                        }}
                        placeholder="Min"
                        style={{ width: '5rem' }}
                        step={0.5}
                      />
                      <span>–</span>
                      <input
                        type="number"
                        value={range.maxAmount}
                        onChange={(e) => {
                          const updated = [...bidIncrementRanges];
                          updated[index] = { ...updated[index], maxAmount: Number(e.target.value) };
                          setBidIncrementRanges(updated);
                        }}
                        placeholder="Max"
                        style={{ width: '5rem' }}
                        step={0.5}
                      />
                      <span>→ ₹</span>
                      <input
                        type="number"
                        value={range.increment}
                        onChange={(e) => {
                          const updated = [...bidIncrementRanges];
                          updated[index] = { ...updated[index], increment: Number(e.target.value) };
                          setBidIncrementRanges(updated);
                        }}
                        placeholder="Increment"
                        style={{ width: '5rem' }}
                        step={0.5}
                        min={0.5}
                      />
                      <span>L</span>
                      <button
                        type="button"
                        className="admin-btn admin-btn-danger admin-btn-sm"
                        onClick={() => setBidIncrementRanges(bidIncrementRanges.filter((_, i) => i !== index))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary admin-btn-sm"
                    onClick={() => setBidIncrementRanges([...bidIncrementRanges, { minAmount: 0, maxAmount: 100, increment: 0.5 }])}
                  >
                    + Add Range
                  </button>

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

                  <h3 style={{ marginTop: '2rem' }}>Connect-Bidding Login</h3>
                  <div className="form-group">
                    <label className="admin-toggle-row">
                      <input
                        type="checkbox"
                        checked={easyLoginMode}
                        onChange={(e) => setEasyLoginMode(e.target.checked)}
                      />
                      <span>Easy Login Mode</span>
                    </label>
                    <small style={{ color: '#6b7280', display: 'block', marginTop: '0.35rem' }}>
                      {easyLoginMode
                        ? 'ON — team representatives tap their team card on /connect-bidding to join instantly. No password required.'
                        : 'OFF — team representatives must enter the username and password configured per team in the Teams tab.'}
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

                  {/* Extended Settings - Player Stats, Categories, Budget, Breaks, Loading, Owners, Iconic Players */}
                  <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '2rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Advanced Configuration</h3>
                    <ThemeSettingsExtended
                      settings={loadedAdminSettings}
                      teams={editingTeams}
                      onChange={(partial) => { extendedSettingsRef.current = partial; }}
                    />
                  </div>

                  <button
                    className="admin-btn admin-btn-primary"
                    onClick={handleSaveTheme}
                    disabled={isSaving}
                    style={{ marginTop: '1.5rem' }}
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
                      onClick={handleMigrateDriveMediaToStorage}
                      disabled={isSaving || isMigratingMedia}
                    >
                      <IoRefresh size={18} /> {isMigratingMedia ? 'Migrating Media...' : 'Migrate Drive Media to Storage'}
                    </button>

                    <button
                      className="admin-btn admin-btn-secondary"
                      onClick={() => csvFileInputRef.current?.click()}
                      disabled={isSaving}
                    >
                      <IoDownload size={18} /> Import CSV
                    </button>
                    <button
                      className="admin-btn admin-btn-info"
                      onClick={() => downloadPlayersTemplate(editingPlayers)}
                      disabled={isSaving}
                      title="Download current players in sheet format for bulk edit and re-import"
                    >
                      <IoDownload size={18} /> Players Template
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-info"
                      onClick={() => { setIsBulkUploadOpen(true); showUploadFeedback('Opening bulk image uploader', 'success'); }}
                      disabled={isSaving}
                      title="Open bulk image uploader (page-scoped)"
                    >
                      <IoCloudUpload size={18} /> Bulk Upload Images
                    </button>
                    <button
                      className="admin-btn admin-btn-accent"
                      onClick={() => statsCsvInputRef.current?.click()}
                      disabled={isSaving}
                    >
                      <IoStatsChart size={18} /> Import Scores
                    </button>
                    <button
                      className="admin-btn admin-btn-info"
                      onClick={downloadScoresTemplate}
                      disabled={isSaving}
                      title="Download CSV template for player statistics"
                    >
                      <IoDownload size={18} /> Scores Template
                    </button>
                    <button
                      className="admin-btn admin-btn-danger"
                      onClick={handleDeleteAllPlayers}
                      disabled={isSaving || editingPlayers.length === 0}
                      title="Delete all players — will need to be re-imported via bulk import"
                    >
                      <IoTrash size={18} /> Delete All Players
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
                    <input
                      ref={statsCsvInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleImportStatsCsv}
                      style={{ display: 'none' }}
                    />
                  </div>

                  <div className="admin-compact-list">
                    {paginatedPlayers.map((player) => (
                      <div key={player.id} className="admin-compact-item">
                        <CompactPlayerAvatar imageUrl={player.imageUrl} playerName={player.name} />
                        <div className="admin-compact-main">
                          <div className="admin-player-name-row">
                            <strong>{player.name}</strong>
                            {(() => { const cat = getAgeCategory(player.age); return cat ? <span className="admin-underage-chip" style={cat.color ? { background: cat.color } : undefined}>{cat.label}</span> : null; })()}
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
                            <th>Actions</th>
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
                              <td>
                                {editingSoldPlayerId === p.id ? (
                                  <select
                                    value={soldPlayerDraft?.teamId || ''}
                                    onChange={(e) => {
                                      const t = teams.find(tm => tm.id === e.target.value);
                                      if (t) setSoldPlayerDraft(prev => prev ? { ...prev, teamId: t.id, teamName: t.name } : prev);
                                    }}
                                  >
                                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                  </select>
                                ) : p.teamName}
                              </td>
                              <td className="admin-export-amount">
                                {editingSoldPlayerId === p.id ? (
                                  <input
                                    type="number"
                                    value={soldPlayerDraft?.soldAmount ?? 0}
                                    onChange={(e) => setSoldPlayerDraft(prev => prev ? { ...prev, soldAmount: Number(e.target.value) } : prev)}
                                    style={{ width: '5rem' }}
                                    step={0.5}
                                    min={0}
                                  />
                                ) : `₹${p.soldAmount}`}
                              </td>
                              <td>₹{p.basePrice}</td>
                              <td>
                                {editingSoldPlayerId === p.id ? (
                                  <>
                                    <button className="admin-btn admin-btn-success admin-btn-sm" onClick={handleSaveSoldPlayerEdit} disabled={isSaving}>Save</button>
                                    <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => { setEditingSoldPlayerId(null); setSoldPlayerDraft(null); }} style={{ marginLeft: 4 }}>Cancel</button>
                                  </>
                                ) : (
                                  <>
                                    <button className="admin-btn admin-btn-warning admin-btn-sm" onClick={() => handleEditSoldPlayer(p)} disabled={isSaving} title="Edit team/amount">Edit</button>
                                    <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => handleUndoSoldPlayer(p)} disabled={isSaving} title="Undo sale" style={{ marginLeft: 4 }}>Undo</button>
                                  </>
                                )}
                              </td>
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

                  {/* ── Unsold Players Section ── */}
                  <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '2rem 0 1.5rem' }} />
                  <h3>Unsold Players</h3>
                  <div className="export-info">
                    <p>Total Unsold Players: <strong>{unsoldPlayers.length}</strong></p>
                  </div>

                  {unsoldPlayers.length > 0 && (
                    <div className="admin-export-table-wrapper">
                      <table className="admin-export-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Player</th>
                            <th>Role</th>
                            <th>Age</th>
                            <th>Base (₹L)</th>
                            <th>Round</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unsoldPlayers.map((p, i) => (
                            <tr key={p.id}>
                              <td>{i + 1}</td>
                              <td>{p.name}</td>
                              <td>
                                <span className="admin-role-dot" style={{ background: getRoleBadgeColor(p.role) }} />
                                {formatRoleDisplay(p.role)}
                              </td>
                              <td>{p.age ?? 'N/A'}</td>
                              <td>₹{p.basePrice}</td>
                              <td>{p.round}</td>
                              <td>
                                {editingUnsoldPlayerId === p.id ? (
                                  <>
                                    <select
                                      value={unsoldSellDraft?.teamId || ''}
                                      onChange={(e) => {
                                        const t = teams.find(tm => tm.id === e.target.value);
                                        if (t) setUnsoldSellDraft(prev => prev ? { ...prev, teamId: t.id, teamName: t.name } : prev);
                                      }}
                                      style={{ marginRight: 4 }}
                                    >
                                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                    <input
                                      type="number"
                                      value={unsoldSellDraft?.soldAmount ?? 0}
                                      onChange={(e) => setUnsoldSellDraft(prev => prev ? { ...prev, soldAmount: Number(e.target.value) } : prev)}
                                      style={{ width: '5rem', marginRight: 4 }}
                                      step={0.5}
                                      min={0}
                                    />
                                    <button className="admin-btn admin-btn-success admin-btn-sm" onClick={handleSaveUnsoldToSold} disabled={isSaving}>Sell</button>
                                    <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => { setEditingUnsoldPlayerId(null); setUnsoldSellDraft(null); }} style={{ marginLeft: 4 }}>Cancel</button>
                                  </>
                                ) : (
                                  <>
                                    <button className="admin-btn admin-btn-warning admin-btn-sm" onClick={() => handleEditUnsoldPlayer(p)} disabled={isSaving} title="Move to sold (assign to team)">Sell</button>
                                    <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => handleUndoUnsoldPlayer(p)} disabled={isSaving} title="Undo unsold - return to available" style={{ marginLeft: 4 }}>Undo</button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {unsoldPlayers.length === 0 && (
                    <div className="admin-empty-state">No unsold players. Unsold players will appear here as the auction progresses.</div>
                  )}

                  <button
                    className="admin-btn admin-btn-success"
                    onClick={handleExportUnsoldPlayers}
                    disabled={unsoldPlayers.length === 0}
                    style={{ marginTop: '1rem' }}
                  >
                    <IoDownload size={18} /> Export Unsold Players CSV
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
                  {/* Soft Reset — keeps player data, clears progress */}
                  <h3>Reset Auction Progress</h3>
                  <div className="reset-warning reset-warning--amber">
                    <p>⚠️ This will:</p>
                    <ul>
                      <li>Clear all sold & unsold player records</li>
                      <li>Reset all team budgets & stats to original</li>
                      <li>Reset rounds back to Round 1</li>
                      <li>Clear all bid history</li>
                    </ul>
                    <p style={{ marginTop: '0.5rem', opacity: 0.8, fontSize: '0.8rem' }}>
                      ✓ Player data will be kept as-is (no reload from sheets)
                    </p>
                  </div>

                  <button
                    className="admin-btn admin-btn-warning"
                    onClick={handleSoftResetAuction}
                    disabled={isSaving}
                    style={{ marginBottom: '2rem' }}
                  >
                    <IoRefresh size={18} /> Reset Auction Progress
                  </button>

                  <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.1)', margin: '1.5rem 0' }} />

                  {/* Live Session State — wipes only live broadcast paths */}
                  <h3>Clear Live Session State</h3>
                  <div className="reset-warning reset-warning--amber">
                    <p>🧹 Removes stale live-only data from Firebase:</p>
                    <ul>
                      <li>Current player / current bid snapshot</li>
                      <li>Mobile bid stream</li>
                      <li>Session reset signals</li>
                      <li>Overlay broadcast control flags</li>
                    </ul>
                    <p style={{ marginTop: '0.5rem', opacity: 0.8, fontSize: '0.8rem' }}>
                      ✓ Preserves teams, players, sponsors, theme, settings, wishlists, sold/unsold history.
                    </p>
                  </div>

                  <button
                    className="admin-btn admin-btn-secondary"
                    onClick={handleClearLiveSessionState}
                    disabled={isSaving}
                    style={{ marginBottom: '2rem' }}
                  >
                    <IoRefresh size={18} /> Clear Live Session State
                  </button>

                  <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.1)', margin: '1.5rem 0' }} />

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
                      <div className="form-group" ref={iconPickerRef}>
                        <label>Icon Player(s)</label>
                        <div className="icon-player-picker">
                          <div
                            className={`icon-player-selected ${showIconPlayerPicker ? 'open' : ''}`}
                            onClick={() => setShowIconPlayerPicker(prev => !prev)}
                          >
                            <span className={(teamDraft.iconicPlayers?.length || teamDraft.captain) ? 'has-value' : 'placeholder'}>
                              {(teamDraft.iconicPlayers?.length ? teamDraft.iconicPlayers.join(', ') : teamDraft.captain) || '— Select iconic player(s) —'}
                            </span>
                            {(teamDraft.iconicPlayers?.length || teamDraft.captain) ? (
                              <button
                                type="button"
                                className="icon-player-clear"
                                onClick={(e) => { e.stopPropagation(); setTeamDraft({ ...teamDraft, captain: '', iconicPlayers: [] }); }}
                              >
                                <IoClose size={14} />
                              </button>
                            ) : null}
                          </div>

                          {showIconPlayerPicker && (
                            <div className="icon-player-dropdown">
                              <div className="icon-player-search">
                                <IoSearch size={14} />
                                <input
                                  type="text"
                                  placeholder="Search by name, role, or ID..."
                                  value={iconPlayerSearch}
                                  onChange={(e) => setIconPlayerSearch(e.target.value)}
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                                {iconPlayerSearch && (
                                  <button className="icon-search-clear" onClick={() => setIconPlayerSearch('')}>
                                    <IoClose size={12} />
                                  </button>
                                )}
                              </div>
                              <div className="icon-player-list">
                                {filteredIconPlayers.length === 0 ? (
                                  <div className="icon-player-empty">No players found</div>
                                ) : (
                                  filteredIconPlayers.slice(0, 50).map((p) => {
                                    const currentIconics = teamDraft.iconicPlayers ?? (teamDraft.captain ? [teamDraft.captain] : []);
                                    const isSelected = currentIconics.some(n => n.toLowerCase() === p.name.toLowerCase());
                                    return (
                                      <button
                                        key={p.id}
                                        type="button"
                                        className={`icon-player-option ${isSelected ? 'selected' : ''}`}
                                        onClick={() => {
                                          let updated: string[];
                                          if (isSelected) {
                                            updated = currentIconics.filter(n => n.toLowerCase() !== p.name.toLowerCase());
                                          } else {
                                            updated = [...currentIconics, p.name];
                                          }
                                          setTeamDraft({
                                            ...teamDraft,
                                            captain: updated[0] || '',
                                            iconicPlayers: updated,
                                          });
                                        }}
                                      >
                                        <span className="icon-player-name">{isSelected ? '✓ ' : ''}{p.name}</span>
                                        <span className="icon-player-role" style={{ background: getRoleBadgeColor(getRoleCategory(p.role)) }}>
                                          {formatRoleDisplay(p.role)}
                                        </span>
                                      </button>
                                    );
                                  })
                                )}
                                {filteredIconPlayers.length > 50 && (
                                  <div className="icon-player-more">+{filteredIconPlayers.length - 50} more — refine search</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
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
                          onChange={(e) => {
                            const newPurse = Number.parseInt(e.target.value || '0', 10) || 0;
                            setTeamDraft({ ...teamDraft, remainingPurse: newPurse, allocatedAmount: newPurse });
                          }}
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

                    <div className="admin-media-field">
                      <div className="admin-media-header">
                        <label>Team Login (strict mode)</label>
                        <span>{easyLoginMode ? 'Optional — Easy Login is ON' : 'Required — Easy Login is OFF'}</span>
                      </div>
                      <div className="form-row">
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>Username</label>
                          <input
                            type="text"
                            value={teamDraft.authUsername || ''}
                            onChange={(e) => setTeamDraft({ ...teamDraft, authUsername: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                            placeholder="e.g. royal"
                            autoComplete="off"
                          />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>Password</label>
                          <input
                            type="text"
                            value={teamDraft.authPassword || ''}
                            onChange={(e) => setTeamDraft({ ...teamDraft, authPassword: e.target.value.trim() })}
                            placeholder="e.g. royal@2026"
                            autoComplete="off"
                          />
                        </div>
                      </div>
                      <small style={{ color: '#6b7280' }}>
                        Used on /connect-bidding when Easy Login is OFF. Share these with the team manager only.
                      </small>
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
                        {(() => { const cat = getAgeCategory(playerDraft.age); return cat ? <span className="admin-underage-chip" style={cat.color ? { background: cat.color } : undefined}>{cat.label}</span> : null; })()}
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

                    {/* Icon Player Assignment */}
                    <div className="icon-player-assignment">
                      <label className="icon-toggle-row">
                        <input
                          type="checkbox"
                          checked={isIconPlayer}
                          onChange={(e) => {
                            setIsIconPlayer(e.target.checked);
                            if (!e.target.checked) setIconTeamId('');
                          }}
                        />
                        <span className="icon-toggle-label">Icon Player</span>
                        <span className="icon-toggle-hint">(excluded from auction, assigned directly to team)</span>
                      </label>

                      {isIconPlayer && (
                        <div className="icon-team-select">
                          <label>Assign to Team <span className="required">*</span></label>
                          <select
                            value={iconTeamId}
                            onChange={(e) => setIconTeamId(e.target.value)}
                            className={`admin-select ${isIconPlayer && !iconTeamId ? 'input-error' : ''}`}
                          >
                            <option value="">— Select team —</option>
                            {availableTeamsForIcon.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}{teamsWithIconPlayers.has(t.id) ? ` (current: ${teamsWithIconPlayers.get(t.id)})` : ''}
                              </option>
                            ))}
                          </select>
                          {isIconPlayer && !iconTeamId && (
                            <span className="form-error">Team is required for icon players</span>
                          )}
                          {editingTeams.length > availableTeamsForIcon.length && (
                            <span className="icon-team-note">
                              {editingTeams.length - availableTeamsForIcon.length} team(s) already have icon players assigned
                            </span>
                          )}
                        </div>
                      )}
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
                        <label>Phone Number</label>
                        <input
                          type="text"
                          value={playerDraft.phone || ''}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, phone: e.target.value })}
                          placeholder="e.g. +919876543210"
                        />
                      </div>
                      <div className="form-group">
                        <label>WhatsApp Number</label>
                        <input
                          type="text"
                          value={playerDraft.whatsappNumber || ''}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, whatsappNumber: e.target.value })}
                          placeholder="e.g. +919912345678"
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
                        disabled={!playerDraft.id.trim() || editingPlayers.some(p => p.id === playerDraft.id && p.id !== editingPlayerId) || (isIconPlayer && !iconTeamId)}
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

  const statsReviewContent = statsImportResult ? (
    <motion.div
      className="stats-review-panel"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
    >
      <div className="stats-review-header">
        <h2>Scores Import Review</h2>
        <button className="stats-review-close" onClick={() => { setShowStatsReview(false); setStatsImportResult(null); }}>
          <IoClose size={22} />
        </button>
      </div>

      <div className="stats-review-summary">
        <div className="stats-summary-card stats-summary-success">
          <span className="stats-summary-count">{statsImportResult.matched.length}</span>
          <span className="stats-summary-label">Matched</span>
        </div>
        <div className="stats-summary-card stats-summary-error">
          <span className="stats-summary-count">{statsImportResult.mismatched.length}</span>
          <span className="stats-summary-label">Mismatched / Missing</span>
        </div>
        <div className="stats-summary-card stats-summary-total">
          <span className="stats-summary-count">{statsImportResult.matched.length + statsImportResult.mismatched.length}</span>
          <span className="stats-summary-label">Total Rows</span>
        </div>
      </div>

      {statsImportResult.matched.length > 0 && (
        <div className="stats-review-section">
          <h3 className="stats-section-title stats-section-success">Matched Players ({statsImportResult.matched.length})</h3>
          <div className="stats-review-table-wrap">
            <table className="stats-review-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Player Name</th>
                  <th>Role</th>
                  <th>Bat M</th>
                  <th>Runs</th>
                  <th>HS</th>
                  <th>Avg</th>
                  <th>SR</th>
                  <th>Bowl M</th>
                  <th>Wkts</th>
                  <th>BB</th>
                  <th>Eco</th>
                </tr>
              </thead>
              <tbody>
                {statsImportResult.matched.map(({ csvRow, player }) => (
                  <tr key={player.id}>
                    <td>{player.id}</td>
                    <td><strong>{player.name}</strong></td>
                    <td>{getStatsCsvField(csvRow, 'cricket role', 'role') || player.role}</td>
                    <td>{getStatsCsvField(csvRow, 'batting matches played', 'matches played', 'matches')}</td>
                    <td>{getStatsCsvField(csvRow, 'runs')}</td>
                    <td>{getStatsCsvField(csvRow, 'highest score', 'hs')}</td>
                    <td>{getStatsCsvField(csvRow, 'average')}</td>
                    <td>{getStatsCsvField(csvRow, 'strike rate', 'sr')}</td>
                    <td>{getStatsCsvField(csvRow, 'bowling matches played', 'bowling matches')}</td>
                    <td>{getStatsCsvField(csvRow, 'wickets')}</td>
                    <td>{getStatsCsvField(csvRow, 'bb')}</td>
                    <td>{getStatsCsvField(csvRow, 'eco', 'economy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {statsImportResult.mismatched.length > 0 && (
        <div className="stats-review-section">
          <h3 className="stats-section-title stats-section-error">Mismatched / Missing ({statsImportResult.mismatched.length})</h3>
          <div className="stats-review-table-wrap">
            <table className="stats-review-table stats-review-table-error">
              <thead>
                <tr>
                  <th>CSV ID</th>
                  <th>CSV Name</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {statsImportResult.mismatched.map((item, i) => (
                  <tr key={i}>
                    <td>{getStatsCsvField(item.csvRow, 'id')}</td>
                    <td>{getStatsCsvField(item.csvRow, 'full name:', 'full name', 'name')}</td>
                    <td className="stats-mismatch-reason">{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="stats-review-actions">
        <button
          className="admin-btn admin-btn-primary"
          onClick={handleApplyMatchedStats}
          disabled={isSaving || statsImportResult.matched.length === 0}
        >
          <IoSave size={18} /> Apply {statsImportResult.matched.length} Matched Scores
        </button>
        <button
          className="admin-btn admin-btn-secondary"
          onClick={() => { setShowStatsReview(false); setStatsImportResult(null); }}
        >
          Cancel
        </button>
      </div>
    </motion.div>
  ) : null;

  if (!isOpen) return null;

  if (mode === 'page') {
    return (
      <>
        <div className="admin-panel-page">{panelContent}</div>
        {/* Stats Import Review Overlay (page mode) */}
        <AnimatePresence>
          {showStatsReview && statsImportResult && (
            <motion.div
              className="stats-review-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {statsReviewContent}
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <>
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

      {/* Stats Import Review Overlay (drawer mode) */}
      <AnimatePresence>
        {showStatsReview && statsImportResult && (
          <motion.div
            className="stats-review-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {statsReviewContent}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
