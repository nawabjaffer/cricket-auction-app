// ============================================================================
// ADMIN PANEL COMPONENT
// Manage auction configuration, teams, players, theme, and export data
// ============================================================================

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

import { IoClose, IoSave, IoRefresh, IoDownload, IoAdd, IoTrash, IoArrowUp, IoArrowDown, IoSearch, IoStatsChart, IoCloudUpload, IoRemoveCircleOutline } from 'react-icons/io5';
import { auctionPersistence, type AdminSettings, type SponsorRecord, type SpecialCategory, type BidIncrementRange, type PlayerTrashRecord } from '../../services/auctionPersistence';
import { realtimeSync } from '../../services/realtimeSync';
import { googleSheetsService, imagePreloaderService, resolveMediaToStorage, uploadFileToStorage } from '../../services';
import AdminImageBulkUpload from './AdminImageBulkUpload';
import AdminImageBackgroundRemoval from './AdminImageBackgroundRemoval';
import { ThemeSettingsExtended } from './ThemeSettingsExtended';
import '../../components/AdminPanel/ThemeSettingsExtended.css';
import { useAuctionStore } from '../../store/auctionStore';
import { activeConfig } from '../../config';
import { exportSoldPlayers, exportUnsoldPlayers, downloadCSV, downloadPlayersTemplate, downloadScoresTemplate } from '../../utils/exportData';
import { playerDuplicateMatchById, uniqueImportedPlayerId } from '../../utils/playerDuplicateReview';
import { belongsToTeam } from '../../utils/teamMembership';
import FeatureFlagsTab from './FeatureFlagsTab';
import StreamingTab, { type StreamingSection } from './StreamingTab';
import { ADMIN_NAV, defaultSubsection, findAdminNavItem, type AdminTab } from './adminNavigation';
import { StorageManager } from './StorageManager';
import '../AdminPanel/StorageManager.css';
import './AdminPanel.css';
import './AdminShell.css';
import type { Team, Player, SoldPlayer, UnsoldPlayer, AuctionRoleCategory, BattingStats, BowlingStats } from '../../types';
import { DEFAULT_AUCTION_ROLE_ORDER, createEmptyBattingStats, createEmptyBowlingStats } from '../../types';
import { SPORT_ROLE_ORDERS, DEFAULT_SPORT_STAT_FIELDS, getStatFieldsForSport } from '../../config/playerStatFields';
import { formatRoleDisplay, getRoleCategory, getRoleBadgeColor } from '../../utils/roleFormatter';
import { localImageCacheService } from '../../services/localImageCache';
import { ensureMediaInStorage, getCachedStorageUrl, resolveImageAsync } from '../../services/firebaseStorageService';
import { extractDriveFileId } from '../../utils/driveImage';
import { getLiveBlobUrl } from '../../services/mediaBlobCache';
import { getThemeAssetFilter } from '../../utils/themeAssetFilter';
import { getActiveTenant } from '../../services/tenantPath';
import { tenantService } from '../../services/tenantService';
import { processPlayerImage } from '../../services/playerBackgroundRemovalService';
import { PlayerImageEditor } from './PlayerImageEditor';
import { RegistrationFormSettings } from './RegistrationFormSettings';
import { normalizePlayerName } from '../../utils/playerName';
import { SortableColumnHeader, useSortableRows } from '../SortableTable';

type SoldExportSortColumn = 'name' | 'role' | 'age' | 'teamName' | 'soldAmount' | 'basePrice';
type UnsoldExportSortColumn = 'name' | 'role' | 'age' | 'basePrice' | 'round';
type PurseControlSortColumn = 'team' | 'allocated' | 'spent' | 'remaining' | 'threshold' | 'bought' | 'remainingSlots';

function hasBackgroundRemoved(player: Player): boolean {
  return player.isBackgroundRemoved === true
    || (player.imageProcessingStatus === 'complete' && Boolean(player.processedImageUrl));
}

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

type MediaMigrationStatus = 'pending' | 'migrating' | 'done' | 'failed';
type MediaMigrationOwner = 'player' | 'team' | 'sponsor';
type MediaMigrationField = 'imageUrl' | 'originalImageUrl' | 'processedImageUrl' | 'logoUrl' | 'brandLogoUrl' | 'videoUrl';

interface MediaMigrationRow {
  id: string;
  ownerId: string;
  ownerType: MediaMigrationOwner;
  ownerName: string;
  field: MediaMigrationField;
  label: string;
  url: string;
  storagePath: string;
  status: MediaMigrationStatus;
  error?: string;
}

function PlayerImportReviewModal({ incoming, index, existingPlayers, onDecision, onCancel }: Readonly<{
  incoming: Player[];
  index: number;
  existingPlayers: Player[];
  onDecision: (decision: 'same' | 'different' | 'skip') => void;
  onCancel: () => void;
}>) {
  const player = incoming[index];
  const match = playerDuplicateMatchById(player, existingPlayers);
  const progress = `${index + 1} / ${incoming.length}`;
  return (
    <motion.div className="stats-review-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="stats-review-panel" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <div className="stats-review-header">
          <div><h2>Player Import Review</h2><p style={{ margin: 0, opacity: 0.65 }}>Inspect each imported row before saving · {progress}</p></div>
          <button className="stats-review-close" onClick={onCancel}><IoClose size={22} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 18 }}>
          <div className="stats-review-section">
            <h3 className="stats-section-title">Incoming CSV player</h3>
            <p><strong>{player.name}</strong></p>
            <p>ID: {player.id}</p>
            <p>Phone: {player.phone || player.whatsappNumber || 'Not provided'}</p>
            <p>Place: {player.place || 'Not provided'}</p>
            <p>Role: {player.role || 'Not provided'}</p>
            <p>DOB: {player.dateOfBirth || 'Not provided'}</p>
          </div>
          <div className={`stats-review-section ${match ? 'stats-section-error' : 'stats-section-success'}`}>
            <h3 className="stats-section-title">{match ? 'Possible existing player' : 'No duplicate found'}</h3>
            {match ? (
              <>
                <p><strong>{match.existing.name}</strong></p>
                <p>ID: {match.existing.id}</p>
                <p>Phone: {match.existing.phone || match.existing.whatsappNumber || 'Not provided'}</p>
                <p>Place: {match.existing.place || 'Not provided'}</p>
                <p>Role: {match.existing.role || 'Not provided'}</p>
                <p>DOB: {match.existing.dateOfBirth || 'Not provided'}</p>
                <p className="stats-mismatch-reason">{match.confidence === 'high' ? 'Strong match' : 'Needs manual inspection'}: {match.reasons.join(', ')}</p>
              </>
            ) : <p>This row will be added as a new player.</p>}
          </div>
        </div>
        <div className="stats-review-actions">
          <button className="admin-btn admin-btn-primary" onClick={() => onDecision('same')} disabled={!match}>Same — link existing</button>
          <button className="admin-btn admin-btn-secondary" onClick={() => onDecision('different')}>Different — add new</button>
          <button className="admin-btn admin-btn-secondary" onClick={() => onDecision('skip')}>Skip for now</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AssignedPlayerReviewModal({ rows, index, existingPlayers, soldPlayers, onDecision, onCancel }: Readonly<{
  rows: Array<{ player: Player; team: Team }>;
  index: number;
  existingPlayers: Player[];
  soldPlayers: SoldPlayer[];
  onDecision: (decision: 'same' | 'different' | 'add' | 'skip' | 'remove') => void;
  onCancel: () => void;
}>) {
  const row = rows[index];
  const match = playerDuplicateMatchById(row.player, existingPlayers, {
    incomingTeam: { id: row.team.id, name: row.team.name },
    getExistingTeam: existing => {
      const assigned = soldPlayers.find(player => player.id === existing.id);
      return assigned ? { id: assigned.teamId, name: assigned.teamName } : undefined;
    },
  });
  return (
    <motion.div className="stats-review-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="stats-review-panel" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <div className="stats-review-header">
          <div><h2>Direct Team Assignment Review</h2><p style={{ margin: 0, opacity: 0.65 }}>{index + 1} / {rows.length} · Team: {row.team.name}</p></div>
          <button className="stats-review-close" onClick={onCancel}><IoClose size={22} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 18 }}>
          <div className="stats-review-section"><h3 className="stats-section-title">Incoming player</h3><p><strong>{row.player.name}</strong></p><p>Team: {row.team.name}</p><p>Age: {row.player.age ?? 'Not provided'}</p><p>Phone: {row.player.phone || 'Not provided'}</p><p>Place: {row.player.place || 'Not provided'}</p><p>Role: {row.player.role}</p><p>DOB: {row.player.dateOfBirth || 'Not provided'}</p></div>
          <div className={`stats-review-section ${match ? 'stats-section-error' : 'stats-section-success'}`}><h3 className="stats-section-title">{match ? 'Possible existing player' : 'New player'}</h3>{match ? <><p><strong>{match.existing.name}</strong></p><p>Team: {soldPlayers.find(player => player.id === match.existing.id)?.teamName || 'Not assigned'}</p><p>Age: {match.existing.age ?? 'Not provided'}</p><p>Phone: {match.existing.phone || match.existing.whatsappNumber || 'Not provided'}</p><p>{match.confidence === 'high' ? 'Strong identity match' : 'Manual inspection recommended'}</p><p className="stats-mismatch-reason">{match.reasons.join(', ')}</p></> : <p>Add this player to the player list and assign to {row.team.name}.</p>}</div>
        </div>
        <div className="stats-review-actions">
          {match ? (
            <>
              <button className="admin-btn admin-btn-primary" onClick={() => onDecision('same')}>Same player — use existing</button>
              <button className="admin-btn admin-btn-secondary" onClick={() => onDecision('different')}>Different player — add new</button>
            </>
          ) : <button className="admin-btn admin-btn-primary" onClick={() => onDecision('add')}>Add player to list</button>}
          <button className="admin-btn admin-btn-secondary" onClick={() => onDecision('skip')}>Skip</button>
          <button className="admin-btn admin-btn-secondary" onClick={() => onDecision('remove')}>Remove row</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

type LogoSourceMode = 'drive' | 'upload';

interface GifPreviewAsset {
  key: string;
  name: string;
  path: string;
}

const SPORT_AUCTION_OPTIONS = [
  {
    key: 'cricket',
    name: 'Cricket',
    icon: '🏏',
    desc: 'Classic cricket auction screen with pitch aesthetics, batsman/bowler/all-rounder/WK roles, and batting/bowling statistics.',
    badge: 'Classic',
    accentColor: '#3b82f6',
    glowColor: 'rgba(59, 130, 246, 0.35)',
    presetColors: { primary: '#3b82f6', secondary: '#06b6d4', accent: '#f59e0b' },
  },
  {
    key: 'kabaddi',
    name: 'Kabaddi',
    icon: '🤼',
    desc: 'Pro Kabaddi arena styling with court lines (baulk/bonus line), flame orange & purple aesthetics, and raider/defender roles.',
    badge: 'Pro Arena',
    accentColor: '#f97316',
    glowColor: 'rgba(249, 115, 22, 0.4)',
    presetColors: { primary: '#f97316', secondary: '#7c3aed', accent: '#fbbf24' },
  },
  {
    key: 'football',
    name: 'Football',
    icon: '⚽',
    desc: 'World-class emerald pitch stadium with floodlights, striker/midfielder/defender/goalkeeper roles, and goals/assists stats.',
    badge: 'Stadium Pitch',
    accentColor: '#10b981',
    glowColor: 'rgba(16, 185, 129, 0.35)',
    presetColors: { primary: '#10b981', secondary: '#0284c7', accent: '#ef4444' },
  },
  {
    key: 'volleyball',
    name: 'Volleyball',
    icon: '🏐',
    desc: 'Indoor court atmosphere with attack lines and attacker/setter/libero player roles.',
    badge: 'Indoor Court',
    accentColor: '#0284c7',
    glowColor: 'rgba(2, 132, 199, 0.35)',
    presetColors: { primary: '#0284c7', secondary: '#0369a1', accent: '#facc15' },
  },
  {
    key: 'basketball',
    name: 'Basketball',
    icon: '🏀',
    desc: 'Hardwood arena theme with 3-point key court lines and guard/forward/center player roles.',
    badge: 'Hardwood Arena',
    accentColor: '#b45309',
    glowColor: 'rgba(180, 83, 9, 0.35)',
    presetColors: { primary: '#b45309', secondary: '#78350f', accent: '#fbbf24' },
  },
  {
    key: 'badminton',
    name: 'Badminton',
    icon: '🏸',
    desc: 'Court layout with service line markings and singles/doubles player roles.',
    badge: 'Court Arena',
    accentColor: '#047857',
    glowColor: 'rgba(4, 120, 87, 0.35)',
    presetColors: { primary: '#047857', secondary: '#065f46', accent: '#6ee7b7' },
  },
];

const AUCTION_LAYOUT_OPTIONS: {
  key: 'classic' | 'spotlight' | 'vibrant';
  name: string;
  icon: string;
  desc: string;
  badge: string;
  hint: string;
  accentColor: string;
  glowColor: string;
}[] = [
  {
    key: 'classic',
    name: 'Classic Split',
    icon: '🎛️',
    desc: 'The original two-column auction screen — player details and stat stack on the left, animated player photo with orbiting role icons on the right.',
    badge: 'Default',
    hint: 'Bid paddle + analytics',
    accentColor: '#3b82f6',
    glowColor: 'rgba(59, 130, 246, 0.35)',
  },
  {
    key: 'spotlight',
    name: 'Spotlight Reveal',
    icon: '🔦',
    desc: 'Broadcast-style centre stage: the player cutout is framed by rotating light rays and smoke, with stats split into skewed labels on both sides.',
    badge: 'Cinematic',
    hint: 'Best for big screens',
    accentColor: '#67e8f9',
    glowColor: 'rgba(103, 232, 249, 0.35)',
  },
  {
    key: 'vibrant',
    name: 'Vibrant Splash',
    icon: '🎨',
    desc: 'Bold split screen — an accent colour splash panel behind the player with a clean, scannable stat table down the left side.',
    badge: 'High Contrast',
    hint: 'Great for streaming',
    accentColor: '#d4ff00',
    glowColor: 'rgba(212, 255, 0, 0.3)',
  },
];

interface AdminPanelProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSettingsSaved?: (settings: AdminSettings) => void;
  readonly mode?: 'drawer' | 'page';
}

export function AdminPanel({ isOpen, onClose, onSettingsSaved, mode = 'drawer' }: AdminPanelProps) {
  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
  const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

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

  const [activeTab, setActiveTab] = useState<AdminTab>('theme');
  const [activeSubsections, setActiveSubsections] = useState<Partial<Record<AdminTab, string>>>({});
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Theme settings
  const [organizerName, setOrganizerName] = useState('');
  const [organizerLogo, setOrganizerLogo] = useState('');
  const [auctionTitle, setAuctionTitle] = useState('');
  const [selectedSport, setSelectedSport] = useState<string>('cricket');
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');
  const [secondaryColor, setSecondaryColor] = useState('#06b6d4');
  const [accentColor, setAccentColor] = useState('#f59e0b');
  const [gifHueRotate, setGifHueRotate] = useState<number | null>(null);
  const [gifHueRotateByAsset, setGifHueRotateByAsset] = useState<Record<string, number | null>>({});
  const [gifPreviewAssets, setGifPreviewAssets] = useState<GifPreviewAsset[]>([]);
  const [maxUnsoldRounds, setMaxUnsoldRounds] = useState(1);

  // Auction role ordering
  const [auctionRoleOrder, setAuctionRoleOrder] = useState<AuctionRoleCategory[]>([...DEFAULT_AUCTION_ROLE_ORDER]);
  const [newRoleInput, setNewRoleInput] = useState('');
  // Easy login mode for /connect-bidding — true = tap team card, false = username/password
  const [easyLoginMode, setEasyLoginMode] = useState(true);
  // Super Admin Mode quick-access credentials for /connect-bidding-admin (mobile)
  const [superAdminUsername, setSuperAdminUsername] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');

  // Branding placement controls
  const [brandingSettings, setBrandingSettings] = useState({
    showTitleSponsorOnOverlays: true,
    showTitleSponsorInTeamView: true,
    showBrandOnSoldOverlay: true,
    showBrandInTeamHeader: true,
    reduceThresholdByIconPlayers: true,
    breakContentMode: 'sponsors' as 'sponsors' | 'teamOwners' | 'both',
    showSponsorsInBreak: true,
    showTeamOwnersInBreak: false,
    squadViewMode: 'iconPlayers' as 'iconPlayers' | 'owners',
    squadTheme: 'default' as 'default' | 'premium' | 'royal',
  });

  // Currency suffix (L = Lakhs, T = Thousands, etc.)
  const [currencySuffix, setCurrencySuffix] = useState('L');

  // OBS overlay style + accent (broadcast lower-third configuration)
  const [obsOverlayStyle, setObsOverlayStyle] = useState<'classic' | 'broadcast' | 'compact'>('classic');
  const [obsOverlayAccent, setObsOverlayAccent] = useState('#1d4ed8');

  // Live auction screen presentation style
  const [auctionLayout, setAuctionLayout] = useState<'classic' | 'spotlight' | 'vibrant'>('classic');

  // Bid increment ranges
  const [bidIncrementRanges, setBidIncrementRanges] = useState<BidIncrementRange[]>([]);

  // Budget enforcement mode
  const [budgetMode, setBudgetMode] = useState<'constraint' | 'releaseRefund'>('constraint');

  // Store
  const { teams, setTeams, soldPlayers, setSoldPlayers, unsoldPlayers, setUnsoldPlayers, availablePlayers, originalPlayers, setAdminPlayerOverrides, reconcilePlayerPools } = useAuctionStore();
  const [editingTeams, setEditingTeams] = useState<Team[]>([]);
  const [editingSponsors, setEditingSponsors] = useState<SponsorRecord[]>([]);
  const [sharedSponsorTenantSlug, setSharedSponsorTenantSlug] = useState('');
  const [sharedSponsors, setSharedSponsors] = useState<SponsorRecord[]>([]);
  const [selectedSharedSponsorIds, setSelectedSharedSponsorIds] = useState<string[]>([]);
  const [isLoadingSharedSponsors, setIsLoadingSharedSponsors] = useState(false);
  const [teamLogoSources, setTeamLogoSources] = useState<Record<string, LogoSourceMode>>({});
  const [teamOwnerLogoSources, setTeamOwnerLogoSources] = useState<Record<string, LogoSourceMode>>({});
  const [sponsorLogoSources, setSponsorLogoSources] = useState<Record<string, LogoSourceMode>>({});
  const [playerImageSources, setPlayerImageSources] = useState<Record<string, LogoSourceMode>>({});
  const [editingPlayers, setEditingPlayers] = useState<typeof originalPlayers>([]);
  const [playerTrash, setPlayerTrash] = useState<Array<{ id: string; record: PlayerTrashRecord }>>([]);
  const [isPlayerTrashView, setIsPlayerTrashView] = useState(false);
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
  const [isBulkBackgroundRemovalOpen, setIsBulkBackgroundRemovalOpen] = useState(false);
  const [playerImportReview, setPlayerImportReview] = useState<{
    incoming: Player[];
    index: number;
    decisions: Record<string, 'same' | 'different' | 'skip'>;
    skipped: Player[];
  } | null>(null);
  const [assignedImportReview, setAssignedImportReview] = useState<{
    rows: Array<{ player: Player; team: Team }>;
    index: number;
    decisions: Record<string, 'same' | 'different' | 'add' | 'skip' | 'remove'>;
  } | null>(null);
  // Icon player state for the player editor
  const [isIconPlayer, setIsIconPlayer] = useState(false);
  const [iconTeamId, setIconTeamId] = useState<string>('');
  const [isSavingSponsors, setIsSavingSponsors] = useState(false);
  const [isMigratingMedia, setIsMigratingMedia] = useState(false);
  const [isMediaMigrationOpen, setIsMediaMigrationOpen] = useState(false);
  const [mediaMigrationRows, setMediaMigrationRows] = useState<MediaMigrationRow[]>([]);
  const mediaCollectionsRef = useRef({ players: editingPlayers, teams: editingTeams, sponsors: editingSponsors });
  mediaCollectionsRef.current = { players: editingPlayers, teams: editingTeams, sponsors: editingSponsors };
  const [processingPlayerIds, setProcessingPlayerIds] = useState<Record<string, boolean>>({});
  const [processingPlayerLogs, setProcessingPlayerLogs] = useState<Record<string, string[]>>({});
  const [processingEditorImage, setProcessingEditorImage] = useState(false);
  const [editorImageBlob, setEditorImageBlob] = useState<Blob | undefined>();
  const [loadedAdminSettings, setLoadedAdminSettings] = useState<AdminSettings | null>(null);
  const [adminSettingsLoaded, setAdminSettingsLoaded] = useState(false);
  // Holds the latest extended settings from ThemeSettingsExtended, merged on save
  const extendedSettingsRef = useRef<Partial<AdminSettings>>({});
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);
  const statsCsvInputRef = useRef<HTMLInputElement | null>(null);
  const organizerLogoFileRef = useRef<HTMLInputElement | null>(null);
  const [organizerLogoUploading, setOrganizerLogoUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const getGifHue = (assetKey: string) => Object.prototype.hasOwnProperty.call(gifHueRotateByAsset, assetKey)
    ? gifHueRotateByAsset[assetKey]
    : gifHueRotate;
  const getGifFilter = (assetKey: string) => getThemeAssetFilter(
    primaryColor,
    secondaryColor,
    getGifHue(assetKey) ?? undefined,
  );

  useEffect(() => {
    const normalizedPlayers = editingPlayers.map(player => ({ ...player, name: normalizePlayerName(player.name) }));
    if (normalizedPlayers.some((player, index) => player.name !== editingPlayers[index].name)) {
      setEditingPlayers(normalizedPlayers);
    }
  }, [editingPlayers]);

  useEffect(() => {
    if (!isOpen) return;
    const loadGifPreviewAssets = async () => {
      try {
        const response = await fetch('/extras/manifest.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`GIF manifest request failed: ${response.status}`);
        const assets = await response.json() as GifPreviewAsset[];
        setGifPreviewAssets(assets.filter(asset => asset?.key && asset?.name && asset?.path));
      } catch (error) {
        console.error('[AdminPanel] Failed to load GIF preview manifest:', error);
        setGifPreviewAssets([]);
      }
    };
    void loadGifPreviewAssets();
  }, [isOpen]);

  // Stats CSV import state
  type StatsImportMatch = { csvRow: Record<string, string>; player: Player; status: 'matched' };
  type StatsImportMismatch = { csvRow: Record<string, string>; reason: string; status: 'mismatch' | 'missing' };
  const [statsImportResult, setStatsImportResult] = useState<{
    matched: StatsImportMatch[];
    mismatched: StatsImportMismatch[];
  } | null>(null);
  const [showStatsReview, setShowStatsReview] = useState(false);
  type MatchedStatsSortColumn = 'id' | 'name' | 'role' | 'batMatches' | 'runs' | 'highScore' | 'average' | 'strikeRate' | 'bowlMatches' | 'wickets' | 'bestBowling' | 'economy';
  type MismatchedStatsSortColumn = 'id' | 'name' | 'reason';
  const matchedStatsTable = useSortableRows(statsImportResult?.matched ?? [], (item, column: MatchedStatsSortColumn) => {
    switch (column) {
      case 'id': return getStatsCsvField(item.csvRow, 'id') || item.player.id;
      case 'name': return item.player.name;
      case 'role': return getStatsCsvField(item.csvRow, 'cricket role', 'role') || item.player.role;
      case 'batMatches': return getStatsCsvField(item.csvRow, 'batting matches played', 'matches played', 'matches');
      case 'runs': return getStatsCsvField(item.csvRow, 'runs');
      case 'highScore': return getStatsCsvField(item.csvRow, 'highest score', 'hs');
      case 'average': return getStatsCsvField(item.csvRow, 'average');
      case 'strikeRate': return getStatsCsvField(item.csvRow, 'strike rate', 'sr');
      case 'bowlMatches': return getStatsCsvField(item.csvRow, 'bowling matches played', 'bowling matches');
      case 'wickets': return getStatsCsvField(item.csvRow, 'wickets');
      case 'bestBowling': return getStatsCsvField(item.csvRow, 'bb');
      case 'economy': return getStatsCsvField(item.csvRow, 'eco', 'economy');
    }
  });
  const mismatchedStatsTable = useSortableRows(statsImportResult?.mismatched ?? [], (item, column: MismatchedStatsSortColumn) => {
    switch (column) {
      case 'id': return getStatsCsvField(item.csvRow, 'id');
      case 'name': return getStatsCsvField(item.csvRow, 'full name:', 'full name', 'name');
      case 'reason': return item.reason;
    }
  });

  // Icon player searchable picker state
  const [iconPlayerSearch, setIconPlayerSearch] = useState('');
  const [showIconPlayerPicker, setShowIconPlayerPicker] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement>(null);

  // Sold player edit state
  const [editingSoldPlayerId, setEditingSoldPlayerId] = useState<string | null>(null);
  const [soldPlayerDraft, setSoldPlayerDraft] = useState<{ teamId: string; teamName: string; soldAmount: number } | null>(null);
  const [playerTeamDraft, setPlayerTeamDraft] = useState<{ teamId: string; teamName: string } | null>(null);
  const [exportTeamFilter, setExportTeamFilter] = useState('all');

  const filteredExportSoldPlayers = useMemo(() => {
    if (exportTeamFilter === 'all') return soldPlayers;
    const team = teams.find(item => item.id === exportTeamFilter);
    return team ? soldPlayers.filter(player => belongsToTeam(player, team)) : soldPlayers;
  }, [exportTeamFilter, soldPlayers, teams]);
  const soldExportTable = useSortableRows<SoldPlayer, SoldExportSortColumn>(filteredExportSoldPlayers, (player, column) => {
    switch (column) {
      case 'name': return player.name;
      case 'role': return player.role;
      case 'age': return player.age;
      case 'teamName': return player.teamName;
      case 'soldAmount': return player.soldAmount;
      case 'basePrice': return player.basePrice;
    }
  });
  const unsoldExportTable = useSortableRows<UnsoldPlayer, UnsoldExportSortColumn>(unsoldPlayers, (player, column) => {
    switch (column) {
      case 'name': return player.name;
      case 'role': return player.role;
      case 'age': return player.age;
      case 'basePrice': return player.basePrice;
      case 'round': return player.round;
    }
  });

  const showUploadFeedback = (message: string, type: 'success' | 'error' = 'success') => {
    setUploadFeedback({ message, type });
    setTimeout(() => setUploadFeedback(null), 3000);
  };

  const refreshPlayerTrash = async () => {
    const [records, removedIds] = await Promise.all([
      auctionPersistence.getTrashedPlayers(),
      auctionPersistence.getRemovedPlayerIds(),
    ]);
    setPlayerTrash(records);
    useAuctionStore.getState().setRemovedPlayerIds(removedIds);
    return records;
  };

  const filteredPlayers = useMemo(
    () => editingPlayers.filter((player) => player.name.toLowerCase().includes(playerSearch.toLowerCase())),
    [editingPlayers, playerSearch],
  );
  const assignedTeamNameByPlayerId = useMemo(
    () => new Map(soldPlayers.map(sold => [
      sold.id,
      teams.find(team => team.id === sold.teamId)?.name || sold.teamName,
    ])),
    [soldPlayers, teams],
  );
  const filteredTrash = useMemo(
    () => playerTrash.filter(item => item.record.player.name.toLowerCase().includes(playerSearch.toLowerCase())),
    [playerTrash, playerSearch],
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

  // Amount already spent by the team currently open in the editor — computed
  // from real sold-player records so the budget field always reflects truth,
  // never a stale cached remainingPurse.
  const teamDraftSpent = useMemo(() => {
    if (!editingTeamId || !teamDraft) return 0;
    return soldPlayers
      .filter(sp => belongsToTeam(sp, { id: editingTeamId, name: teamDraft.name }))
      .reduce((sum, sp) => sum + (sp.soldAmount || 0), 0);
  }, [editingTeamId, teamDraft?.name, soldPlayers]);

  // Per-team purse summary for the "Purse Control" tab — always derived from
  // actual sold-player records, never from a possibly-stale cached value.
  const purseControlRows = useMemo(() => {
    return editingTeams.map((team) => {
      const soldForTeam = soldPlayers.filter(player => belongsToTeam(player, team));
      const spent = soldForTeam.reduce((sum, sp) => sum + (sp.soldAmount || 0), 0);
      const allocated = team.allocatedAmount ?? 0;
      const threshold = team.totalPlayerThreshold ?? 0;
      const bought = soldForTeam.length;
      return {
        team,
        spent,
        remaining: Math.max(0, allocated - spent),
        allocated,
        threshold,
        bought,
        remainingSlots: Math.max(0, threshold - bought),
      };
    });
  }, [editingTeams, soldPlayers]);
  type PurseControlRow = (typeof purseControlRows)[number];
  const purseControlTable = useSortableRows<PurseControlRow, PurseControlSortColumn>(purseControlRows, (row, column) => {
    switch (column) {
      case 'team': return row.team.name;
      case 'allocated': return row.allocated;
      case 'spent': return row.spent;
      case 'remaining': return row.remaining;
      case 'threshold': return row.threshold;
      case 'bought': return row.bought;
      case 'remainingSlots': return row.remainingSlots;
    }
  });

  const updatePurseField = (teamId: string, field: 'allocatedAmount' | 'totalPlayerThreshold', value: number) => {
    setEditingTeams((current) => current.map((t) => (t.id === teamId ? { ...t, [field]: value } : t)));
  };

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

  useEffect(() => {
    if (!isOpen) {
      setAdminSettingsLoaded(false);
      return;
    }
    let isMounted = true;
    setAdminSettingsLoaded(false);
    const loadSettings = async () => {
      try {
        const ready = await realtimeSync.ensureInitialized();
        if (!ready) return;
        const db = realtimeSync.getDatabase();
        if (!db) return;
        auctionPersistence.initialize(db);
        const settings = await auctionPersistence.getAdminSettings();
        if (!settings || !isMounted) return;
        setLoadedAdminSettings(settings);
        setOrganizerName(settings.organizerName);
        setOrganizerLogo(settings.organizerLogo);
        setAuctionTitle(settings.auctionTitle);
        if (settings.sport) {
          setSelectedSport(settings.sport);
          useAuctionStore.getState().setSport(settings.sport);
        }
        setPrimaryColor(settings.themeColors.primary);
        setSecondaryColor(settings.themeColors.secondary);
        setAccentColor(settings.themeColors.accent);
        setGifHueRotate(typeof settings.gifHueRotate === 'number' ? settings.gifHueRotate : null);
        setGifHueRotateByAsset(Object.fromEntries(
          Object.entries(settings.gifHueRotateByAsset ?? {}).map(([path, hue]) => [path, hue]),
        ));
        setMaxUnsoldRounds(settings.maxUnsoldRounds ?? 1);
        useAuctionStore.getState().setMaxUnsoldRounds(settings.maxUnsoldRounds ?? 1);
        if (settings.auctionRoleOrder?.length) setAuctionRoleOrder(settings.auctionRoleOrder);
        setEasyLoginMode(settings.easyLoginMode !== false);
        setSuperAdminUsername(settings.superAdminUsername ?? '');
        setSuperAdminPassword(settings.superAdminPassword ?? '');
        if (settings.branding) setBrandingSettings(prev => ({ ...prev, ...settings.branding }));
        if (settings.currencySuffix) {
          setCurrencySuffix(settings.currencySuffix);
          useAuctionStore.getState().setCurrencySuffix(settings.currencySuffix);
        }
        if (settings.obsOverlayStyle) setObsOverlayStyle(settings.obsOverlayStyle);
        if (settings.obsOverlayAccent) setObsOverlayAccent(settings.obsOverlayAccent);
        if (settings.auctionLayout) setAuctionLayout(settings.auctionLayout);
        if (settings.bidIncrementRanges?.length) {
          setBidIncrementRanges(settings.bidIncrementRanges);
          useAuctionStore.getState().setBidIncrementRanges(settings.bidIncrementRanges);
        }
        if (settings.budgetMode) setBudgetMode(settings.budgetMode);
      } catch (error) {
        console.error('[AdminPanel] Failed to load settings:', error);
      } finally {
        if (isMounted) setAdminSettingsLoaded(true);
      }
    };
    void loadSettings();
    return () => { isMounted = false; };
  }, [isOpen]);

  // Load related Admin data and initialize editable team/player drafts.
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

    const loadPlayerTrash = async () => {
      try {
        const dbReady = await ensureDb();
        if (!dbReady || !isMounted) return;
        const [records, removedIds] = await Promise.all([
          auctionPersistence.getTrashedPlayers(),
          auctionPersistence.getRemovedPlayerIds(),
        ]);
        if (!isMounted) return;
        setPlayerTrash(records);
        useAuctionStore.getState().setRemovedPlayerIds(removedIds);
      } catch (error) {
        console.error('[AdminPanel] Failed to load player trash:', error);
      }
    };

    if (isOpen) {
      loadSponsors();
      loadPlayerTrash();
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
        gifHueRotate: gifHueRotate ?? undefined,
        gifHueRotateByAsset: Object.fromEntries(
          Object.entries(gifHueRotateByAsset).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
        ) as Record<string, number>,
        auctionTitle,
        sport: selectedSport || 'cricket',
        updatedAt: Date.now(),
        auctionRoleOrder,
        easyLoginMode,
        superAdminUsername: superAdminUsername.trim() || undefined,
        superAdminPassword: superAdminPassword || undefined,
        // Preserve the seating order saved from the mobile Super Admin screen —
        // this form has no editor for it, so never let a theme save clobber it.
        superAdminTeamOrder: loadedAdminSettings?.superAdminTeamOrder,
        bidIncrementRanges: bidIncrementRanges.length > 0 ? bidIncrementRanges : undefined,
        currencySuffix: currencySuffix || 'L',
        obsOverlayStyle,
        obsOverlayAccent,
        auctionLayout,
        budgetMode: budgetMode,
        branding: brandingSettings,
        // Merge in extended settings (player stats, categories, budget, breaks, etc.)
        ...extendedSettingsRef.current,
      };

      // Strip undefined values — Firebase RTDB rejects them
      const clean = JSON.parse(JSON.stringify(settings)) as AdminSettings;

      await auctionPersistence.saveAdminSettings(clean);
      setLoadedAdminSettings(clean);
      setSuperAdminUsername(clean.superAdminUsername ?? '');
      setSuperAdminPassword(clean.superAdminPassword ?? '');
      onSettingsSaved?.(clean);

      // Apply theme colors to document
      document.documentElement.style.setProperty('--theme-primary', primaryColor);
      document.documentElement.style.setProperty('--theme-secondary', secondaryColor);
      document.documentElement.style.setProperty('--theme-accent', accentColor);
      document.documentElement.style.setProperty('--color-primary', primaryColor);
      document.documentElement.style.setProperty('--color-secondary', secondaryColor);
      document.documentElement.style.setProperty('--color-accent', accentColor);
      useAuctionStore.getState().setMaxUnsoldRounds(maxUnsoldRounds);
      useAuctionStore.getState().setBidIncrementRanges(bidIncrementRanges);
      useAuctionStore.getState().setAuctionRoleOrder(auctionRoleOrder);
      useAuctionStore.getState().setCurrencySuffix(currencySuffix || 'L');
      useAuctionStore.getState().setSport(selectedSport || 'cricket');

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

  const handleApplyTeamBudgetDefaults = useCallback((defaults: { totalBudget: number; playerThreshold: number }) => {
    const nextTeams = editingTeams.map((team) => {
      const spent = soldPlayers
        .filter(sold => belongsToTeam(sold, team))
        .reduce((sum, sold) => sum + (sold.soldAmount || 0), 0);
      const allocatedAmount = Math.max(0, defaults.totalBudget, spent);
      const playersBought = team.playersBought || 0;
      return {
        ...team,
        allocatedAmount,
        totalPlayerThreshold: Math.max(playersBought, defaults.playerThreshold),
        remainingPurse: Math.max(0, allocatedAmount - spent),
        remainingPlayers: Math.max(0, Math.max(playersBought, defaults.playerThreshold) - playersBought),
      };
    });
    setEditingTeams(nextTeams);
    showUploadFeedback(`Applied ${defaults.totalBudget}${currencySuffix} budget and ${defaults.playerThreshold} player slots to ${nextTeams.length} teams.`);
  }, [editingTeams, soldPlayers, currencySuffix]);

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

  const handleLoadSharedSponsors = async () => {
    const sourceSlug = sharedSponsorTenantSlug.trim();
    if (!sourceSlug) {
      showUploadFeedback('Enter a tenant slug or ID to load its sponsors.', 'error');
      return;
    }

    setIsLoadingSharedSponsors(true);
    try {
      const sourceTenant = await tenantService.resolveBySlug(sourceSlug);
      const sourceTenantId = sourceTenant?.id ?? sourceSlug;
      if (sourceTenantId === getActiveTenant()) {
        showUploadFeedback('Choose a different tenant to import sponsors from.', 'error');
        setSharedSponsors([]);
        setSelectedSharedSponsorIds([]);
        return;
      }

      const sponsors = await auctionPersistence.getSponsorsForTenant(sourceTenantId);
      setSharedSponsors(sponsors);
      setSelectedSharedSponsorIds([]);
      if (!sponsors.length) {
        showUploadFeedback(`No active sponsors found for tenant "${sourceSlug}".`, 'error');
      }
    } catch (error) {
      console.error('[AdminPanel] Failed to load shared sponsors:', error);
      showUploadFeedback('Failed to load sponsors from that tenant.', 'error');
      setSharedSponsors([]);
      setSelectedSharedSponsorIds([]);
    } finally {
      setIsLoadingSharedSponsors(false);
    }
  };

  const handleAddSharedSponsors = () => {
    const sourceSlug = sharedSponsorTenantSlug.trim();
    const selected = sharedSponsors.filter((sponsor) => selectedSharedSponsorIds.includes(sponsor.id));
    if (!sourceSlug || selected.length === 0) return;

    const importedSourceIds = new Set(
      editingSponsors
        .map((sponsor) => sponsor.sourceSponsorId)
        .filter((id): id is string => Boolean(id)),
    );
    const newSponsors = selected
      .filter((sponsor) => !importedSourceIds.has(sponsor.id))
      .map((sponsor, index) => ({
        ...sponsor,
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `sponsor-${Date.now()}-${index}`,
        order: editingSponsors.length + index + 1,
        sharedFromTenantSlug: sourceSlug,
        sourceSponsorId: sponsor.id,
      }));

    if (!newSponsors.length) {
      showUploadFeedback('The selected sponsors are already added to this tenant.', 'error');
      return;
    }

    setEditingSponsors((current) => [...current, ...newSponsors]);
    setSelectedSharedSponsorIds([]);
    showUploadFeedback(`${newSponsors.length} existing sponsor${newSponsors.length === 1 ? '' : 's'} added.`, 'success');
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
      totalPlayerThreshold: loadedAdminSettings?.budgetRules?.maxPlayersAllowed ?? 15,
      remainingPlayers: loadedAdminSettings?.budgetRules?.maxPlayersAllowed ?? 15,
      allocatedAmount: loadedAdminSettings?.budgetRules?.totalBudgetPerTeam ?? 100,
      remainingPurse: loadedAdminSettings?.budgetRules?.totalBudgetPerTeam ?? 100,
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

  const handleDeletePlayer = async (playerId: string) => {
    const target = editingPlayers.find((player) => player.id === playerId);
    if (!target) return;

    const confirmed = globalThis.confirm(`Move ${target.name} to Trash? You can restore this player later.`);
    if (!confirmed) return;

    try {
      setIsSaving(true);
      await auctionPersistence.movePlayerToTrash(target);
      const updatedPlayers = editingPlayers.filter(player => player.id !== playerId);
      setEditingPlayers(updatedPlayers);
      useAuctionStore.getState().setAdminPlayerOverrides(updatedPlayers);
      await refreshPlayerTrash();
      if (editingPlayerId === playerId) { setEditingPlayerId(null); setPlayerDraft(null); }
      showUploadFeedback(`${target.name} moved to Trash`);
    } catch (error) {
      showUploadFeedback(`Could not move player to Trash: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAllPlayers = async () => {
    if (editingPlayers.length === 0) return;
    const confirmed = globalThis.confirm(
      `Move all ${editingPlayers.length} players to Trash? You can restore them later.`
    );
    if (!confirmed) return;

    try {
      setIsSaving(true);
      await auctionPersistence.movePlayersToTrash(editingPlayers);
      setEditingPlayers([]);
      useAuctionStore.getState().setAdminPlayerOverrides([]);
      await refreshPlayerTrash();
      showUploadFeedback('All players moved to Trash');
    } catch (err) {
      showUploadFeedback(`Failed to move players to Trash: ${(err as Error).message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestorePlayer = async (playerId: string) => {
    try {
      setIsSaving(true);
      const player = await auctionPersistence.restorePlayerFromTrash(playerId);
      const updatedPlayers = editingPlayers.some(item => item.id === playerId) ? editingPlayers : [...editingPlayers, player];
      setEditingPlayers(updatedPlayers);
      useAuctionStore.getState().setAdminPlayerOverrides(updatedPlayers);
      await refreshPlayerTrash();
      showUploadFeedback(`${player.name} restored to the player list`);
    } catch (error) {
      showUploadFeedback(`Could not restore player: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePermanentlyDeletePlayer = async (playerId: string) => {
    const item = playerTrash.find(entry => entry.id === playerId);
    const name = item?.record.player.name || 'this player';
    if (!globalThis.confirm(`Permanently delete ${name}, its Firebase player data, registration record, and image files? This cannot be undone.`)) return;
    try {
      setIsSaving(true);
      await auctionPersistence.permanentlyDeletePlayer(playerId);
      await refreshPlayerTrash();
      const store = useAuctionStore.getState();
      store.setSoldPlayers(store.soldPlayers.filter(player => player.id !== playerId));
      showUploadFeedback(`${name} permanently deleted`);
    } catch (error) {
      showUploadFeedback(`Permanent delete failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEmptyPlayerTrash = async () => {
    if (playerTrash.length === 0) return;
    if (!globalThis.confirm(`Permanently delete all ${playerTrash.length} trashed players and their Firebase data and image files? This cannot be undone.`)) return;
    try {
      setIsSaving(true);
      for (const item of playerTrash) await auctionPersistence.permanentlyDeletePlayer(item.id);
      await refreshPlayerTrash();
      const store = useAuctionStore.getState();
      store.setSoldPlayers(store.soldPlayers.filter(player => !playerTrash.some(item => item.id === player.id)));
      showUploadFeedback('Trash permanently emptied');
    } catch (error) {
      await refreshPlayerTrash().catch(() => undefined);
      showUploadFeedback(`Could not empty Trash: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSoldPlayer = (player: SoldPlayer) => {
    setEditingSoldPlayerId(player.id);
    setSoldPlayerDraft({ 
      teamId: player.teamId || teams.find(team => team.name === player.teamName)?.id || '',
      teamName: player.teamName || '', 
      soldAmount: player.soldAmount 
    });
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
      const previousTeamId = player.teamId || teams.find(team => team.name === player.teamName)?.id || '';

      // Update the soldPlayers list in store
      const updatedList = soldPlayers.map(p => p.id === editingSoldPlayerId ? updatedPlayer : p);
      setSoldPlayers(updatedList);

      // Persist to Firebase
      await auctionPersistence.saveSoldPlayer(updatedPlayer, soldPlayerDraft.teamName);

      // Update team budgets if team or amount changed
      if (previousTeamId !== soldPlayerDraft.teamId || player.soldAmount !== soldPlayerDraft.soldAmount) {
        const updatedTeams = teams.map(t => {
          if (t.id === previousTeamId && previousTeamId !== soldPlayerDraft.teamId) {
            // Old team: refund the player
            return { ...t, remainingPurse: t.remainingPurse + player.soldAmount, playersBought: Math.max(0, t.playersBought - 1) };
          }
          if (t.id === soldPlayerDraft.teamId && previousTeamId !== soldPlayerDraft.teamId) {
            // New team: deduct the amount
            return { ...t, remainingPurse: t.remainingPurse - soldPlayerDraft.soldAmount, playersBought: t.playersBought + 1 };
          }
          if (t.id === soldPlayerDraft.teamId && previousTeamId === soldPlayerDraft.teamId && player.soldAmount !== soldPlayerDraft.soldAmount) {
            // Same team but amount changed: adjust purse
            return { ...t, remainingPurse: t.remainingPurse + player.soldAmount - soldPlayerDraft.soldAmount };
          }
          return t;
        });
        setTeams(updatedTeams);
        await auctionPersistence.saveTeams(useAuctionStore.getState().teams);
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
      await auctionPersistence.saveTeams(useAuctionStore.getState().teams);

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
      await auctionPersistence.saveTeams(useAuctionStore.getState().teams);

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

  const handleMoveRemainingToUnsold = async () => {
    const remaining = useAuctionStore.getState().availablePlayers;
    if (remaining.length === 0) {
      showUploadFeedback('No remaining auction players to move.', 'error');
      return;
    }
    if (!globalThis.confirm(`Move all ${remaining.length} players still in the auction list to Unsold? They will no longer appear in the auction.`)) return;

    try {
      setIsSaving(true);
      const store = useAuctionStore.getState();
      const round = `Round ${store.currentRound}`;
      const unsoldDate = new Date().toISOString();
      await auctionPersistence.saveUnsoldPlayers(remaining, round);
      store.setUnsoldPlayers([
        ...store.unsoldPlayers,
        ...remaining.map(player => ({ ...player, round, unsoldDate })),
      ]);
      reconcilePlayerPools();
      showUploadFeedback(`Moved ${remaining.length} remaining players to Unsold.`);
    } catch (err) {
      showUploadFeedback(`Failed to move remaining players: ${(err as Error).message}`, 'error');
    } finally {
      setIsSaving(false);
    }
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
    const teamSpent = teamDraftSpent;
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
    setPlayerDraft({ ...targetPlayer, name: normalizePlayerName(targetPlayer.name) });
    const soldAssignment = soldPlayers.find(player => player.id === playerId);
    const soldAssignedTeam = soldAssignment
      ? teams.find(team => team.id === soldAssignment.teamId) || teams.find(team => team.name === soldAssignment.teamName)
      : undefined;
    setPlayerTeamDraft({
      teamId: soldAssignedTeam?.id || soldAssignment?.teamId || '',
      teamName: soldAssignedTeam?.name || soldAssignment?.teamName || '',
    });
    setEditorImageBlob(undefined);

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
    setPlayerTeamDraft(null);
    setIsIconPlayer(false);
    setIconTeamId('');
    setEditorImageBlob(undefined);
  };

  const appendPlayerBackgroundLog = (playerId: string, message: string) => {
    const line = `${new Date().toLocaleTimeString()} ${message}`;
    setProcessingPlayerLogs(current => ({
      ...current,
      [playerId]: [...(current[playerId] ?? []).slice(-29), line],
    }));
  };

  const processPlayerBackground = async (player: Player, updateDraft = false, onProcessedBlob?: (blob: Blob) => void, sourceBlob?: Blob) => {
    if (hasBackgroundRemoved(player)) {
      showUploadFeedback(`Background is already removed for ${player.name}.`);
      return;
    }
    if (!player.imageUrl && !player.originalImageUrl) {
      showUploadFeedback(`Add an image for ${player.name} before removing the background.`, 'error');
      return;
    }
    setProcessingPlayerIds(current => ({ ...current, [player.id]: true }));
    setProcessingPlayerLogs(current => ({
      ...current,
      [player.id]: [`${new Date().toLocaleTimeString()} Starting background removal for ${player.name}.`],
    }));
    let failureStage = 'preparing the source image';
    let lastLoggedProgress = 30;
    try {
      // Process the image currently shown in the player list. The original
      // source may be an expired Drive URL while imageUrl is already storage-backed.
      const source = player.imageUrl || player.originalImageUrl;
      if (!source) throw new Error('Player image is empty');
      appendPlayerBackgroundLog(player.id, 'Preparing source image.');
      const storageSource = await ensureMediaInStorage(source, `media/players/${slugify(player.name || player.id)}`);
      appendPlayerBackgroundLog(player.id, 'Source image ready.');
      failureStage = 'fetching the source image';
      const processedUrl = await processPlayerImage({
        playerId: player.id,
        playerName: player.name,
        sourceUrl: storageSource,
        sourceBlob,
        onProcessedBlob,
        onStatus: status => {
          const labels = {
            queued: 'Waiting for the background-removal worker.',
            'loading-model': 'Loading the background-removal model.',
            processing: 'Removing the image background.',
            uploading: 'Uploading the transparent image.',
            complete: 'Image processing complete.',
          };
          if (status === 'loading-model') failureStage = 'loading the background-removal model';
          else if (status === 'processing') failureStage = 'removing the image background';
          else if (status === 'uploading') failureStage = 'uploading the processed image';
          appendPlayerBackgroundLog(player.id, labels[status]);
        },
        onProgress: (message, percent) => {
          if (message.startsWith('Processing ')) {
            const progressStep = Math.floor((percent ?? 0) / 10) * 10;
            if (progressStep > lastLoggedProgress) {
              lastLoggedProgress = progressStep;
              appendPlayerBackgroundLog(player.id, `Background removal ${progressStep}%.`);
            }
            return;
          }
          appendPlayerBackgroundLog(player.id, message);
        },
      });
      failureStage = 'saving the updated player record';
      appendPlayerBackgroundLog(player.id, 'Saving the updated player record.');
      const updatedPlayer: Player = {
        ...player,
        imageUrl: processedUrl,
        originalImageUrl: source,
        processedImageUrl: processedUrl,
        isBackgroundRemoved: true,
        imageProcessingStatus: 'complete',
        imageProcessingError: undefined,
      };
      if (updateDraft && editingPlayerId === player.id) setPlayerDraft(updatedPlayer);
      let latestPlayers: Player[] = [];
      setEditingPlayers(current => {
        latestPlayers = current.map(item => item.id === player.id ? updatedPlayer : item);
        return latestPlayers;
      });
      setAdminPlayerOverrides(latestPlayers.length > 0 ? latestPlayers : editingPlayers.map(item => item.id === player.id ? updatedPlayer : item));
      await auctionPersistence.saveAdminPlayers(latestPlayers.length > 0 ? latestPlayers : editingPlayers.map(item => item.id === player.id ? updatedPlayer : item));
      appendPlayerBackgroundLog(player.id, 'Background removed and player record saved.');
      showUploadFeedback(`Background removed and saved for ${player.name}`);
    } catch (error) {
      console.error('[AdminPanel] Failed to remove player background:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
      appendPlayerBackgroundLog(player.id, `ERROR while ${failureStage}: ${errorMessage}`);
      showUploadFeedback(`Background removal failed for ${player.name} while ${failureStage}: ${errorMessage}`, 'error');
      if (updateDraft && editingPlayerId === player.id) setPlayerDraft(current => current ? { ...current, imageProcessingStatus: 'error', imageProcessingError: String(error) } : current);
    } finally {
      setProcessingPlayerIds(current => ({ ...current, [player.id]: false }));
    }
  };

  const processEditorBackground = async () => {
    if (!playerDraft || !editingPlayerId) return;
    setProcessingEditorImage(true);
    try {
      await processPlayerBackground(playerDraft, true, setEditorImageBlob, editorImageBlob);
    } finally {
      setProcessingEditorImage(false);
    }
  };

  const saveEditedPlayerImage = async (file: File) => {
    if (!playerDraft || !editingPlayerId) return;
    const imageUrl = await uploadFileToStorage(file, `media/players/${slugify(playerDraft.name || playerDraft.id)}/edited-${Date.now()}`);
    const updatedPlayer: Player = {
      ...playerDraft,
      imageUrl,
      originalImageUrl: imageUrl,
      processedImageUrl: hasBackgroundRemoved(playerDraft) ? imageUrl : undefined,
      isBackgroundRemoved: hasBackgroundRemoved(playerDraft),
      imageEdit: undefined,
      imageProcessingStatus: hasBackgroundRemoved(playerDraft) ? 'complete' : 'idle',
      imageProcessingError: undefined,
    };
    const updatedPlayers = editingPlayers.map(player => player.id === editingPlayerId ? updatedPlayer : player);
    setPlayerDraft(updatedPlayer);
    setEditorImageBlob(file);
    setEditingPlayers(updatedPlayers);
    setAdminPlayerOverrides(updatedPlayers);
    await auctionPersistence.saveAdminPlayers(updatedPlayers);
    showUploadFeedback(`Edited image saved for ${updatedPlayer.name}`);
  };

  const savePlayerDraft = async () => {
    if (!editingPlayerId || !playerDraft) return;

    // Block save if duplicate ID
    if (editingPlayers.some(p => p.id === playerDraft.id && p.id !== editingPlayerId)) return;
    // Block save if ID is empty
    if (!playerDraft.id.trim()) return;
    // Block save if icon player toggled on but no team selected
    if (isIconPlayer && !iconTeamId) return;

    const normalizedDraft = { ...playerDraft, name: normalizePlayerName(playerDraft.name) };
    const updatedPlayers = editingPlayers.map((player) => (
      player.id === editingPlayerId
        ? normalizedDraft
        : player
    ));
    const soldPlayerBeingEdited = soldPlayers.find(player => player.id === editingPlayerId);
    const assignedTeam = playerTeamDraft?.teamId ? teams.find(team => team.id === playerTeamDraft.teamId) : undefined;
    const assignedRecord: SoldPlayer | null = assignedTeam
      ? {
        ...soldPlayerBeingEdited,
        ...normalizedDraft,
        soldAmount: soldPlayerBeingEdited?.soldAmount ?? 0,
        soldDate: soldPlayerBeingEdited?.soldDate ?? new Date().toISOString(),
        teamId: assignedTeam.id,
        teamName: assignedTeam.name,
      }
      : null;
    let updatedSoldPlayers = soldPlayers;
    if (assignedRecord) {
      updatedSoldPlayers = soldPlayerBeingEdited
        ? soldPlayers.map(player => player.id === editingPlayerId ? assignedRecord : player)
        : [...soldPlayers, assignedRecord];
    } else if (soldPlayerBeingEdited) {
      updatedSoldPlayers = soldPlayers.filter(player => player.id !== editingPlayerId);
    }
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
          n => n.trim().toLowerCase() === normalizedDraft.name.trim().toLowerCase()
        );
        const updatedIconics = alreadyExists ? currentIconics : [...currentIconics, normalizedDraft.name];
        return { ...t, captain: updatedIconics[0] || '', iconicPlayers: updatedIconics };
      });
    }
    setEditingTeams(updatedTeams);

    // Persist to Firebase and update store with feedback
    setIsSaving(true);
    try {
      await auctionPersistence.saveAdminPlayers(updatedPlayers);
      if (assignedRecord && assignedTeam) {
        if (soldPlayerBeingEdited) await auctionPersistence.saveSoldPlayer(assignedRecord, assignedTeam.name);
        else await auctionPersistence.saveDirectAssignedPlayer(normalizedDraft, assignedTeam);
        if (soldPlayerBeingEdited && normalizedDraft.id !== editingPlayerId) await auctionPersistence.removeSoldPlayer(editingPlayerId);
      } else if (soldPlayerBeingEdited) {
        await auctionPersistence.removeSoldPlayer(editingPlayerId);
      }
      // Sold list first so re-merging the player pool sees the new assignment.
      setSoldPlayers(updatedSoldPlayers);
      const unsoldBeingEdited = unsoldPlayers.find(player => player.id === editingPlayerId);
      if (unsoldBeingEdited) {
        const updatedUnsold: UnsoldPlayer = { ...unsoldBeingEdited, ...normalizedDraft };
        await auctionPersistence.saveUnsoldPlayer(updatedUnsold, updatedUnsold.round);
        if (normalizedDraft.id !== editingPlayerId) await auctionPersistence.removeUnsoldPlayer(editingPlayerId);
        setUnsoldPlayers(unsoldPlayers.map(player => player.id === editingPlayerId ? updatedUnsold : player));
      }
      setAdminPlayerOverrides(updatedPlayers);
      // Persist team changes (icon player assignment) on top of stats recomputed from the sold list
      setTeams(updatedTeams);
      await auctionPersistence.saveTeams(useAuctionStore.getState().teams);
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
      setPlayerDraft({ ...playerDraft, imageUrl: storageUrl, originalImageUrl: storageUrl, processedImageUrl: undefined, isBackgroundRemoved: false, imageProcessingStatus: 'idle', imageProcessingError: undefined });
      setEditorImageBlob(file);
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

  const isFirebaseStorageUrl = (url: string) => url.includes('firebasestorage.googleapis.com')
    || url.includes('firebasestorage.app')
    || url.startsWith('gs://');

  const collectMediaMigrationRows = (): MediaMigrationRow[] => {
    const rows: MediaMigrationRow[] = [];
    const add = (ownerType: MediaMigrationOwner, ownerId: string, ownerName: string, field: MediaMigrationField, label: string, url?: string, storagePath?: string) => {
      const source = url?.trim() || '';
      if (!/^https?:\/\//i.test(source) || isFirebaseStorageUrl(source)) return;
      rows.push({
        id: `${ownerType}:${ownerId}:${field}`,
        ownerId,
        ownerType,
        ownerName,
        field,
        label,
        url: source,
        storagePath: storagePath || `media/${ownerType}/${slugify(ownerName || ownerId)}-${field}`,
        status: 'pending',
      });
    };

    for (const player of editingPlayers) {
      const base = `media/players/${slugify(player.name || player.id)}`;
      add('player', player.id, player.name, 'imageUrl', 'Player image', player.imageUrl, base);
      add('player', player.id, player.name, 'originalImageUrl', 'Original image', player.originalImageUrl, `${base}-original`);
      add('player', player.id, player.name, 'processedImageUrl', 'Processed image', player.processedImageUrl, `${base}-processed`);
    }
    for (const team of editingTeams) {
      add('team', team.id, team.name, 'logoUrl', 'Team logo', team.logoUrl, `media/teams/${slugify(team.name || team.id)}-logo`);
      add('team', team.id, team.name, 'brandLogoUrl', 'Brand logo', team.brandLogoUrl, `media/teams/${slugify(team.name || team.id)}-owner-logo`);
    }
    for (const sponsor of editingSponsors) {
      add('sponsor', sponsor.id, sponsor.name, 'logoUrl', 'Sponsor logo', sponsor.logoUrl, `media/sponsors/${slugify(sponsor.name || sponsor.id)}-logo`);
      add('sponsor', sponsor.id, sponsor.name, 'videoUrl', 'Sponsor video', sponsor.videoUrl, `media/sponsors/${slugify(sponsor.name || sponsor.id)}-video`);
    }
    return rows;
  };

  const openMediaMigration = () => {
    setMediaMigrationRows(collectMediaMigrationRows());
    setIsMediaMigrationOpen(true);
  };

  const migrateMediaRow = async (rowId: string): Promise<boolean> => {
    if (isMigratingMedia) return false;
    const row = mediaMigrationRows.find(item => item.id === rowId);
    if (!row) return false;
    if (row.status === 'done') return true;
    setIsMigratingMedia(true);
    setIsSaving(true);
    setMediaMigrationRows(current => current.map(item => item.id === rowId ? { ...item, status: 'migrating', error: undefined } : item));
    try {
      const storageUrl = await ensureMediaInStorage(row.url, row.storagePath);
      if (!isFirebaseStorageUrl(storageUrl)) throw new Error('Upload did not return a Firebase Storage URL.');
      const collections = mediaCollectionsRef.current;

      if (row.ownerType === 'player') {
        const nextPlayers = collections.players.map(player => player.id === row.ownerId ? { ...player, [row.field]: storageUrl } : player);
        mediaCollectionsRef.current = { ...collections, players: nextPlayers };
        setEditingPlayers(nextPlayers);
        setAdminPlayerOverrides(nextPlayers);
        await auctionPersistence.saveAdminPlayers(nextPlayers);
      } else if (row.ownerType === 'team') {
        const nextTeams = collections.teams.map(team => team.id === row.ownerId ? { ...team, [row.field]: storageUrl } : team);
        mediaCollectionsRef.current = { ...collections, teams: nextTeams };
        setEditingTeams(nextTeams);
        setTeams(nextTeams);
        await auctionPersistence.saveTeams(nextTeams);
      } else {
        const nextSponsors = collections.sponsors.map(sponsor => sponsor.id === row.ownerId ? { ...sponsor, [row.field]: storageUrl } : sponsor);
        mediaCollectionsRef.current = { ...collections, sponsors: nextSponsors };
        setEditingSponsors(nextSponsors);
        await auctionPersistence.saveSponsors(nextSponsors);
      }
      setMediaMigrationRows(current => current.map(item => item.id === rowId ? { ...item, status: 'done', url: storageUrl } : item));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[AdminPanel] Failed to migrate media row ${rowId}:`, error);
      setMediaMigrationRows(current => current.map(item => item.id === rowId ? { ...item, status: 'failed', error: message } : item));
      return false;
    } finally {
      setIsMigratingMedia(false);
      setIsSaving(false);
    }
  };

  const migrateAllMedia = async () => {
    if (isMigratingMedia) return;
    const pendingRows = mediaMigrationRows.filter(row => row.status === 'pending' || row.status === 'failed');
    let failedCount = 0;
    for (const row of pendingRows) {
      if (!await migrateMediaRow(row.id)) failedCount += 1;
    }
    if (failedCount === 0) showUploadFeedback('All listed media migrated to Firebase Storage.');
    else showUploadFeedback(`${failedCount} media file(s) failed. Review the row errors and retry.`, 'error');
  };

  // Handle export sold players
  const handleExportSoldPlayers = (playersToExport: SoldPlayer[] = soldPlayers) => {
    if (playersToExport.length === 0) {
      alert('No sold players to export');
      return;
    }

    const records = playersToExport.map(player => ({
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
    console.log('[AdminPanel] Bulk saving images for players:', editingPlayers);
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
      console.log('[AdminPanel] Bulk saving images for players:', updatedPlayers);
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
      place: findHeaderIndex(headers, ['place', 'location', 'city', 'home town', 'hometown']),
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

      const customStats = selectedSport !== 'cricket'
        ? Object.fromEntries(
          getStatFieldsForSport(selectedSport)
            .filter(field => !['age', 'matches'].includes(field.key))
            .map(field => {
              const fieldHeader = field.label.toLowerCase();
              const value = headers.includes(fieldHeader)
                ? get(headers.indexOf(fieldHeader)).trim()
                : get(headers.indexOf(field.key.toLowerCase())).trim();
              return [field.key, value];
            })
            .filter(([, value]) => value !== ''),
        )
        : undefined;

      parsed.push({
        id: idFromCsv || `CSV-${rowIndex + 1}`,
        name: rawName,
        role: (get(idx.role).trim() || 'Player') as Player['role'],
        place: get(idx.place).trim() || undefined,
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
        ...(customStats ? { customStats } : {}),
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
    const normalizedPlayers = players.map(player => ({ ...player, name: normalizePlayerName(player.name) }));

    // Auto-migrate any Drive / external image URLs to Firebase Storage so
    // imports never leave the app depending on slow / blocked sources.
    const migrated = await Promise.all(normalizedPlayers.map(async (p) => {
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

  const finishPlayerImportReview = async (review: NonNullable<typeof playerImportReview>) => {
    const existingPlayers = [...editingPlayers];
    const usedIds = new Set(existingPlayers.map(player => player.id));
    const mergedPlayers = [...existingPlayers];
    const knownPlayers = [...existingPlayers];
    let additions = 0;
    let linked = 0;

    review.incoming.forEach((incoming) => {
      const match = playerDuplicateMatchById(incoming, knownPlayers);
      const decision = review.decisions[incoming.id];
      if (match && decision === 'same') {
        const existingIndex = mergedPlayers.findIndex(player => player.id === match.existing.id);
        if (existingIndex >= 0) {
          const imageChanged = Boolean(incoming.imageUrl && incoming.imageUrl !== match.existing.imageUrl);
          mergedPlayers[existingIndex] = { ...match.existing, ...incoming, id: match.existing.id, imageUrl: incoming.imageUrl || match.existing.imageUrl };
          if (imageChanged) {
            mergedPlayers[existingIndex] = {
              ...mergedPlayers[existingIndex],
              originalImageUrl: incoming.imageUrl,
              processedImageUrl: undefined,
              isBackgroundRemoved: false,
              imageProcessingStatus: 'idle',
              imageProcessingError: undefined,
            };
          }
        }
        linked += 1;
        return;
      }
      if (match && decision !== 'different') return;
      const id = uniqueImportedPlayerId(incoming.id, usedIds);
      usedIds.add(id);
      const added = { ...incoming, id };
      mergedPlayers.push(added);
      knownPlayers.push(added);
      additions += 1;
    });

    await applyImportedPlayers(mergedPlayers);
    setPlayerImportReview(null);
    showUploadFeedback(`Imported ${additions} new players; linked ${linked} existing players.`);
  };

  const handleImportPlayersFromCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsSaving(true);
    try {
      const text = await file.text();
      const csvPlayers = parseCsvPlayers(text);
      setPlayerImportReview({ incoming: csvPlayers, index: 0, decisions: {}, skipped: [] });
    } catch (error) {
      console.error('[AdminPanel] Failed importing CSV players:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const downloadAssignedPlayersTemplate = () => {
    const header = ['ID', 'Name', 'Team Name', 'Phone', 'WhatsApp Number', 'Role', 'Place', 'Date of Birth', 'Age', 'Image URL'];
    const sample = ['PLAYER001', 'Alex Player', editingTeams[0]?.name || 'Select an existing team', '', '', 'Player', '', '', '', ''];
    downloadCSV([header, sample].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n'), 'direct-team-players-template.csv');
  };

  const importAssignedPlayersCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('CSV has no player rows');
    const headers = parseCsvLine(lines[0]).map(header => header.toLowerCase().trim());
    const at = (...names: string[]) => headers.findIndex(header => names.includes(header));
    const get = (cells: string[], index: number) => index >= 0 ? (cells[index] || '').trim() : '';
    const nameIndex = at('name', 'player name', 'playername');
    const teamIndex = at('team', 'team name', 'teamname');
    if (nameIndex < 0 || teamIndex < 0) throw new Error('CSV requires Name and Team Name columns');
    const rows: Array<{ player: Player; team: Team }> = [];
    lines.slice(1).forEach((line, rowIndex) => {
      const cells = parseCsvLine(line);
      const name = get(cells, nameIndex);
      const teamName = get(cells, teamIndex).toLowerCase();
      const team = editingTeams.find(item => item.name.trim().toLowerCase() === teamName || item.id.toLowerCase() === teamName);
      if (!name || !team) return;
      const age = Number.parseInt(get(cells, at('age')), 10);
      rows.push({
        team,
        player: {
          id: get(cells, at('id')) || `direct_${Date.now()}_${rowIndex}`,
          name,
          imageUrl: get(cells, at('image url', 'image_url', 'image')),
          role: (get(cells, at('role')) || 'Player') as Player['role'],
          place: get(cells, at('place', 'location')) || undefined,
          phone: get(cells, at('phone', 'mobile')) || undefined,
          whatsappNumber: get(cells, at('whatsapp number', 'whatsapp')) || undefined,
          dateOfBirth: get(cells, at('date of birth', 'dob')) || undefined,
          age: Number.isFinite(age) ? age : null,
          matches: '0', runs: '0', wickets: '0', battingBestFigures: 'N/A', bowlingBestFigures: 'N/A', basePrice: 0,
        },
      });
    });
    if (!rows.length) throw new Error('No rows matched existing teams');
    setAssignedImportReview({ rows, index: 0, decisions: {} });
  };

  const finishAssignedImport = async (review: NonNullable<typeof assignedImportReview>) => {
    let added = 0; let skipped = 0; let removed = 0;
    const nextPlayers = [...editingPlayers];
    let nextSoldPlayers = [...soldPlayers];
    const existingTeams = new Map(soldPlayers.flatMap(player => player.teamId || player.teamName
      ? [[player.id, { id: player.teamId, name: player.teamName }] as const]
      : []));
    for (const { player, team } of review.rows) {
      const decision = review.decisions[player.id] || 'skip';
      if (decision === 'remove') { removed += 1; continue; }
      if (decision === 'skip') { skipped += 1; continue; }
      const duplicate = playerDuplicateMatchById(player, nextPlayers, {
        incomingTeam: { id: team.id, name: team.name },
        getExistingTeam: existing => existingTeams.get(existing.id),
      });
      let canonical = decision === 'same' ? duplicate?.existing : undefined;
      if (!canonical) {
        canonical = { ...player, id: uniqueImportedPlayerId(player.id, new Set(nextPlayers.map(item => item.id))) };
        nextPlayers.push(canonical);
        existingTeams.set(canonical.id, { id: team.id, name: team.name });
        added += 1;
      }
      await auctionPersistence.saveDirectAssignedPlayer(canonical, team);
      const existingSoldPlayer = nextSoldPlayers.find(item => item.id === canonical.id);
      const assignedSoldPlayer: SoldPlayer = {
        ...canonical,
        soldAmount: 0,
        teamId: team.id,
        teamName: team.name,
        soldDate: existingSoldPlayer?.soldDate || new Date().toISOString(),
      };
      nextSoldPlayers = [
        ...nextSoldPlayers.filter(item => item.id !== canonical.id),
        assignedSoldPlayer,
      ];
    }
    setSoldPlayers(nextSoldPlayers);
    reconcilePlayerPools();
    if (added > 0) {
      await auctionPersistence.saveAdminPlayers(nextPlayers);
      setEditingPlayers(nextPlayers);
      setAdminPlayerOverrides(nextPlayers);
      reconcilePlayerPools();
    }
    setAssignedImportReview(null);
    showUploadFeedback(`Assigned ${added} new player(s); skipped ${skipped}; removed ${removed}.`);
  };

  // @ts-expect-error - Function defined for future use
  const _handleImportPlayersFromSheets = async () => {
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
    if (selectedSport !== 'cricket') {
      const fields = getStatFieldsForSport(selectedSport).filter(field => !['age', 'matches'].includes(field.key));
      const updates = new Map(matches.map(({ csvRow, player }) => {
        const customStats = { ...(player.customStats || {}) };
        for (const field of fields) {
          const candidates = [field.label.toLowerCase(), field.key.toLowerCase()];
          const value = candidates.map(candidate => csvRow[candidate]).find(candidateValue => candidateValue != null && candidateValue !== '');
          if (value != null) customStats[field.key] = value;
        }
        const matchesValue = csvRow.matches ?? csvRow['matches played'];
        return [player.id, { ...player, matches: matchesValue || player.matches, customStats }] as const;
      }));
      const updatedPlayers = editingPlayers.map(player => updates.get(player.id) || player);
      setEditingPlayers(updatedPlayers);
      setAdminPlayerOverrides(updatedPlayers);
      reconcilePlayerPools();
      await auctionPersistence.saveAdminPlayers(updatedPlayers);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
      return;
    }

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

  const activeSub = activeTab === 'players'
    ? (isPlayerTrashView ? 'trash' : 'list')
    : (activeSubsections[activeTab] ?? defaultSubsection(activeTab) ?? '');
  const activeNavGroup = ADMIN_NAV.find(group => group.items.some(item => item.tab === activeTab));
  const activeNavItem = findAdminNavItem(activeTab);
  const activeNavSub = activeNavItem.subsections?.find(sub => sub.key === activeSub);

  const selectSection = (tab: AdminTab, sub?: string) => {
    setActiveTab(tab);
    if (tab === 'players') {
      if (sub) setIsPlayerTrashView(sub === 'trash');
    } else {
      const nextSub = sub ?? activeSubsections[tab] ?? defaultSubsection(tab);
      if (nextSub) setActiveSubsections(prev => ({ ...prev, [tab]: nextSub }));
    }
    setIsNavOpen(false);
  };

  const panelContent = (
    <div className={`admin-panel adm-shell ${mode === 'page' ? 'admin-panel--page' : 'admin-panel--drawer'}`}>
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
      <AdminImageBackgroundRemoval
        players={editingPlayers}
        isOpen={isBulkBackgroundRemovalOpen}
        onClose={() => setIsBulkBackgroundRemovalOpen(false)}
        onBulkSave={async updatedPlayers => {
          await handleBulkSaveImages(updatedPlayers);
          setIsBulkBackgroundRemovalOpen(false);
        }}
      />

      {isMediaMigrationOpen && createPortal(
        <div className="admin-media-migration-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !isMigratingMedia) setIsMediaMigrationOpen(false); }}>
          <section className="admin-media-migration" role="dialog" aria-modal="true" aria-labelledby="admin-media-migration-title">
            <header className="admin-media-migration__header">
              <div>
                <h2 id="admin-media-migration-title">Media Migration</h2>
                <p>Review remote media files and move each one into Firebase Storage.</p>
              </div>
              <button type="button" className="admin-close-btn" onClick={() => setIsMediaMigrationOpen(false)} disabled={isMigratingMedia} aria-label="Close media migration">
                <IoClose size={22} />
              </button>
            </header>
            <div className="admin-media-migration__summary">
              <span>{mediaMigrationRows.length} file{mediaMigrationRows.length === 1 ? '' : 's'} found</span>
              <span>{mediaMigrationRows.filter(row => row.status === 'done').length} migrated</span>
              <span>{mediaMigrationRows.filter(row => row.status === 'failed').length} failed</span>
            </div>
            <div className="admin-media-migration__list">
              {mediaMigrationRows.map(row => (
                <article className="admin-media-migration__row" key={row.id}>
                  <div className="admin-media-migration__details">
                    <strong>{row.ownerName}</strong>
                    <span>{row.label} · {row.ownerType}</span>
                    <a href={row.url} target="_blank" rel="noreferrer" title={row.url}>{row.url}</a>
                    {row.error && <small className="admin-media-migration__error">{row.error}</small>}
                  </div>
                  <div className="admin-media-migration__row-actions">
                    <span className={`admin-media-migration__status admin-media-migration__status--${row.status}`}>
                      {row.status === 'migrating' ? 'Migrating…' : row.status === 'done' ? 'Migrated' : row.status === 'failed' ? 'Failed' : 'Pending'}
                    </span>
                    <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => void migrateMediaRow(row.id)} disabled={isMigratingMedia || row.status === 'done'}>
                      {row.status === 'failed' ? 'Retry' : 'Migrate'}
                    </button>
                  </div>
                </article>
              ))}
              {mediaMigrationRows.length === 0 && <div className="admin-empty-state">All listed media is already in Firebase Storage.</div>}
            </div>
            <footer className="admin-media-migration__footer">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setIsMediaMigrationOpen(false)} disabled={isMigratingMedia}>Close</button>
              <button type="button" className="admin-btn admin-btn-primary" onClick={() => void migrateAllMedia()} disabled={isMigratingMedia || !mediaMigrationRows.some(row => row.status === 'pending' || row.status === 'failed')}>
                <IoCloudUpload size={17} /> {isMigratingMedia ? 'Migrating…' : 'Migrate All'}
              </button>
            </footer>
          </section>
        </div>,
        document.body,
      )}

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

      <div className="adm-layout">
        <aside className={`adm-sidebar ${isNavOpen ? 'is-open' : ''}`} aria-label="Admin sections">
          <nav className="adm-nav">
            {ADMIN_NAV.map(group => (
              <div key={group.label} className="adm-nav-group">
                <p className="adm-nav-group__label">{group.label}</p>
                {group.items.map(item => {
                  const isActive = activeTab === item.tab;
                  return (
                    <div key={item.tab}>
                      <button
                        type="button"
                        className={`adm-nav-item ${isActive ? 'is-active' : ''}`}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => selectSection(item.tab)}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                      {isActive && item.subsections && (
                        <ul className="adm-subnav">
                          {item.subsections.map(sub => (
                            <li key={sub.key}>
                              <button
                                type="button"
                                className={`adm-subnav__item ${activeSub === sub.key ? 'is-active' : ''}`}
                                onClick={() => selectSection(item.tab, sub.key)}
                              >
                                {sub.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        <section className="adm-main">
          <header className="adm-main__header">
            <button type="button" className="adm-menu-toggle" onClick={() => setIsNavOpen(open => !open)} aria-expanded={isNavOpen}>
              Menu
            </button>
            <div className="adm-main__titles">
              <p className="adm-breadcrumb">
                {activeNavGroup?.label} <span>/</span> {activeNavItem.label}
                {activeNavSub && <> <span>/</span> {activeNavSub.label}</>}
              </p>
              <h2>{activeNavSub?.label ?? activeNavItem.label}</h2>
              <p className="adm-main__desc">{activeNavItem.description}</p>
            </div>
            <button className="admin-close-btn" onClick={onClose} aria-label="Close admin panel">
              <IoClose size={22} />
            </button>
          </header>

      <div className="adm-content">
              {/* Theme Tab */}
              {activeTab === 'theme' && (
                <div className="admin-section">
                  <div className="adm-sub" hidden={activeSub !== 'general'}>
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

                  <h3 style={{ marginTop: '2rem' }}>Currency Display</h3>
                  <small style={{ color: '#6b7280', display: 'block', marginBottom: '0.75rem' }}>
                    Set the suffix shown after bid amounts (e.g. "L" for Lakhs, "T" for Thousands, "K" for K).
                  </small>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.85rem', color: '#000' }}>Suffix:</label>
                    <select
                      value={currencySuffix}
                      onChange={(e) => setCurrencySuffix(e.target.value)}
                      style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', background: '#1e293b', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      <option value="L">L (Lakhs)</option>
                      <option value="T">T (Thousands)</option>
                      <option value="K">K (Thousands)</option>
                      <option value="Cr">Cr (Crores)</option>
                    </select>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Preview: ₹10.00{currencySuffix}</span>
                  </div>

                  <div className="adm-sub" hidden={activeSub !== 'look'}>
                  </div>

                  <h3 style={{ marginTop: '2rem' }}>OBS Overlay Style</h3>
                  <small style={{ color: '#6b7280', display: 'block', marginBottom: '0.75rem' }}>
                    Choose the live player lower-third design shown on the OBS overlay (<code>/obs-overlay</code>).
                    The <strong>Broadcast</strong> style shows a TV-quality card with player image, CricHeroes stats,
                    a big centered bid and a bottom marquee controlled from Connect-Bidding Admin.
                  </small>
                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                    {([
                      { key: 'classic', label: 'Classic', desc: 'Bottom-center card' },
                      { key: 'broadcast', label: 'Broadcast', desc: 'TV lower-third + marquee' },
                      { key: 'compact', label: 'Compact', desc: 'Slim strip' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setObsOverlayStyle(opt.key)}
                        style={{
                          flex: '1 1 150px', textAlign: 'left', cursor: 'pointer',
                          padding: '0.7rem 0.9rem', borderRadius: '10px',
                          background: obsOverlayStyle === opt.key ? 'rgba(29,78,216,0.22)' : '#1e293b',
                          border: `1px solid ${obsOverlayStyle === opt.key ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                          color: `${obsOverlayStyle === opt.key ? '#000' : '#fff'}`,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 , color: `${obsOverlayStyle === opt.key ? '#000' : '#fff'}`,}}>
                          {obsOverlayStyle === opt.key && <span style={{ color: '#60a5fa' }}>●</span>}
                          {opt.label}
                        </div>
                        <div style={{ fontSize: '0.72rem', marginTop: 2, color: `${obsOverlayStyle === opt.key ? '#535c68' : '#bbc9de'}`, }}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.85rem', color: '#000' }}>Accent color:</label>
                    <input
                      type="color"
                      value={obsOverlayAccent}
                      onChange={(e) => setObsOverlayAccent(e.target.value)}
                      style={{ width: 44, height: 32, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Blue gradient &amp; highlights on the broadcast overlay.</span>
                  </div>

                  <div className="adm-sub" hidden={activeSub !== 'bidding'}>
                  </div>

                  <h3 style={{ marginTop: '2rem' }}>Bid Increment Ranges</h3>
                  <small style={{ color: '#6b7280', display: 'block', marginBottom: '0.75rem' }}>
                    Configure bid increments based on current bid amount. If empty, default increment ({activeConfig.auction.bidIncrements.default}{currencySuffix}) is used.
                    The Q/W keys multiply bids by the configured increment for faster bidding.
                  </small>
                  {bidIncrementRanges.map((range, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
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
                      <span>→</span>
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
                        step={0.1}
                        min={0.1}
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`increment-mode-${index}`}
                          checked={(range as { mode?: string }).mode !== 'multiplier'}
                          onChange={() => {
                            const updated = [...bidIncrementRanges];
                            updated[index] = { ...updated[index], mode: 'amount' } as typeof updated[number];
                            setBidIncrementRanges(updated);
                          }}
                        />
                        +₹{currencySuffix}
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`increment-mode-${index}`}
                          checked={(range as { mode?: string }).mode === 'multiplier'}
                          onChange={() => {
                            const updated = [...bidIncrementRanges];
                            updated[index] = { ...updated[index], mode: 'multiplier' } as typeof updated[number];
                            setBidIncrementRanges(updated);
                          }}
                        />
                        ×(multiplier)
                      </label>
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

                  <div className="adm-sub" hidden={activeSub !== 'look'}>
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

                  <div className="admin-form-field" style={{ marginTop: '1rem', maxWidth: 560 }}>
                    <label htmlFor="gif-hue-rotate">Default GIF Hue Rotation (fallback)</label>
                    <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '0.25rem 0 0.5rem' }}>
                      Set individual GIF colors below. This value is used only when an asset does not have its own override.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <input
                        id="gif-hue-rotate"
                        type="range"
                        min={-180}
                        max={180}
                        step={1}
                        value={gifHueRotate ?? 0}
                        onChange={(e) => setGifHueRotate(Number(e.target.value))}
                        style={{ flex: 1 }}
                      />
                      <input
                        type="number"
                        min={-180}
                        max={180}
                        step={1}
                        value={gifHueRotate ?? ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          setGifHueRotate(value === '' ? null : Math.max(-180, Math.min(180, Number(value))));
                        }}
                        placeholder="Auto"
                        aria-label="GIF hue rotation in degrees"
                        style={{ width: 90 }}
                      />
                      <span style={{ minWidth: 42, color: '#f8fafc', fontWeight: 700 }}>
                        {gifHueRotate == null ? 'Auto' : `${gifHueRotate}°`}
                      </span>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        onClick={() => setGifHueRotate(null)}
                      >
                        Auto
                      </button>
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                      <strong style={{ color: '#000', fontSize: '0.9rem' }}>GIF Preview</strong>
                      <p style={{ color: '#94a3b8', fontSize: '0.78rem', margin: '0.25rem 0 0.75rem' }}>
                        GIFs are loaded at runtime from <code>/extras/manifest.json</code>. Set a different hue for every asset.
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                        {gifPreviewAssets.map(asset => (
                          <div
                            key={asset.path}
                            style={{
                              overflow: 'hidden',
                              border: '1px solid rgba(255,255,255,0.14)',
                              borderRadius: 8,
                              background: 'rgba(0,0,0,0.28)',
                            }}
                          >
                            <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img
                                src={asset.path}
                                alt={`${asset.name} preview`}
                                style={{ width: '100%', height: '100%', objectFit: 'contain', filter: getGifFilter(asset.key) }}
                              />
                            </div>
                            <div style={{ padding: '0.45rem 0.55rem', color: '#e2e8f0', fontSize: '0.75rem', fontWeight: 700 }}>
                              {asset.name}
                            </div>
                            <div style={{ padding: '0 0.55rem 0.6rem' }}>
                              <input
                                type="range"
                                min={-180}
                                max={180}
                                step={1}
                                value={getGifHue(asset.key) ?? 0}
                                onChange={(e) => setGifHueRotateByAsset(prev => ({ ...prev, [asset.key]: Number(e.target.value) }))}
                                style={{ width: '100%' }}
                                aria-label={`${asset.name} hue rotation`}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.35rem' }}>
                                <input
                                  type="number"
                                  min={-180}
                                  max={180}
                                  step={1}
                                  value={getGifHue(asset.key) ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setGifHueRotateByAsset(prev => ({
                                      ...prev,
                                      [asset.key]: value === '' ? null : Math.max(-180, Math.min(180, Number(value))),
                                    }));
                                  }}
                                  placeholder="Auto"
                                  aria-label={`${asset.name} hue rotation in degrees`}
                                  style={{ width: 68 }}
                                />
                                <span style={{ color: '#cbd5e1', fontSize: '0.72rem', fontWeight: 700 }}>
                                  {getGifHue(asset.key) == null ? 'Auto' : `${getGifHue(asset.key)}°`}
                                </span>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn-secondary admin-btn-sm"
                                  onClick={() => setGifHueRotateByAsset(prev => ({ ...prev, [asset.key]: null }))}
                                >
                                  Auto
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {gifPreviewAssets.length === 0 && (
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                            Loading GIF assets...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="adm-sub" hidden={activeSub !== 'sport'}>
                  </div>

                  {/* Auction Game / Sport Selection */}
                  <div className="admin-sport-section">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <div>
                        <h3 style={{ margin: 0 }}>Auction Game / Sport</h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '0.25rem 0 0' }}>
                          Select the game/sport for this tournament. The main auction screen will adapt its background (from local public assets), court/pitch line overlays, player role styling, and stat fields.
                        </p>
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc', background: 'rgba(255,255,255,0.08)', padding: '0.35rem 0.75rem', borderRadius: 8 }}>
                        Active: {SPORT_AUCTION_OPTIONS.find(s => s.key === selectedSport)?.name || 'Cricket'} {SPORT_AUCTION_OPTIONS.find(s => s.key === selectedSport)?.icon || '🏏'}
                      </span>
                    </div>

                    <div className="admin-sport-grid">
                      {SPORT_AUCTION_OPTIONS.map((sp) => {
                        const isSelected = selectedSport === sp.key;
                        const handleSelectSport = () => {
                          setSelectedSport(sp.key);
                          setPrimaryColor(sp.presetColors.primary);
                          setSecondaryColor(sp.presetColors.secondary);
                          setAccentColor(sp.presetColors.accent);
                          const defRoles = SPORT_ROLE_ORDERS[sp.key] || SPORT_ROLE_ORDERS.cricket;
                          setAuctionRoleOrder([...defRoles]);
                          const defStats = DEFAULT_SPORT_STAT_FIELDS[sp.key] || DEFAULT_SPORT_STAT_FIELDS.cricket;
                          extendedSettingsRef.current = {
                            ...extendedSettingsRef.current,
                            playerStatsFields: defStats,
                          };
                        };

                        return (
                          <div
                            key={sp.key}
                            className={`admin-sport-card ${isSelected ? 'active' : ''}`}
                            style={{
                              '--sport-accent-color': sp.accentColor,
                              '--sport-glow-color': sp.glowColor,
                            } as React.CSSProperties}
                            onClick={handleSelectSport}
                          >
                            <div className="admin-sport-card-header">
                              <div className="admin-sport-icon-title">
                                <span className="admin-sport-icon">{sp.icon}</span>
                                <span className="admin-sport-title">{sp.name}</span>
                              </div>
                              <span className="admin-sport-badge">{sp.badge}</span>
                            </div>
                            <p className="admin-sport-desc">{sp.desc}</p>
                            <div className="admin-sport-footer">
                              <div className="admin-sport-palette" title="Recommended color theme for this sport">
                                <span className="admin-sport-swatch" style={{ background: sp.presetColors.primary }} />
                                <span className="admin-sport-swatch" style={{ background: sp.presetColors.secondary }} />
                                <span className="admin-sport-swatch" style={{ background: sp.presetColors.accent }} />
                              </div>
                              <button
                                type="button"
                                className="admin-sport-apply-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectSport();
                                }}
                                title="Select this sport, apply theme colors, default roles, and stat fields"
                              >
                                {isSelected ? 'Selected ✓' : 'Select Sport'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Auction Role Order (Dynamically reflects the selected sport) */}
                  <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <h3 style={{ margin: 0 }}>Auction Role Order</h3>
                        <small style={{ color: '#94a3b8', display: 'block', marginTop: '0.25rem' }}>
                          Sequence in which player roles appear during the auction for {SPORT_AUCTION_OPTIONS.find(s => s.key === selectedSport)?.name || selectedSport}. Drag or use arrows to reorder.
                        </small>
                      </div>
                      <button
                        type="button"
                        className="admin-btn admin-btn-ghost admin-btn-sm"
                        onClick={() => {
                          const defRoles = SPORT_ROLE_ORDERS[selectedSport] || SPORT_ROLE_ORDERS.cricket;
                          setAuctionRoleOrder([...defRoles]);
                        }}
                        title={`Reset to default role sequence for ${selectedSport}`}
                      >
                        <IoRefresh size={14} /> Reset to {SPORT_AUCTION_OPTIONS.find(s => s.key === selectedSport)?.name || selectedSport} Roles
                      </button>
                    </div>

                    <div className="admin-role-order-list" style={{ marginTop: '0.75rem' }}>
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
                            {auctionRoleOrder.length > 1 && (
                              <button
                                type="button"
                                className="admin-btn admin-btn-ghost admin-btn-sm"
                                onClick={() => {
                                  setAuctionRoleOrder(prev => prev.filter((_, i) => i !== index));
                                }}
                                title="Remove role from sequence"
                                style={{ color: '#f87171' }}
                              >
                                <IoTrash size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add Custom Role */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '0.75rem' }}>
                      <input
                        type="text"
                        value={newRoleInput}
                        onChange={(e) => setNewRoleInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newRoleInput.trim()) {
                            const trimmed = newRoleInput.trim();
                            if (!auctionRoleOrder.includes(trimmed)) {
                              setAuctionRoleOrder(prev => [...prev, trimmed]);
                            }
                            setNewRoleInput('');
                          }
                        }}
                        placeholder={`Add custom role (e.g. ${selectedSport === 'kabaddi' ? 'Right Corner' : (selectedSport === 'football' ? 'Winger' : 'Top Order Batsman')})`}
                        style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.85rem' }}
                      />
                      <button
                        type="button"
                        className="admin-btn admin-btn-ghost admin-btn-sm"
                        disabled={!newRoleInput.trim()}
                        onClick={() => {
                          const trimmed = newRoleInput.trim();
                          if (trimmed && !auctionRoleOrder.includes(trimmed)) {
                            setAuctionRoleOrder(prev => [...prev, trimmed]);
                          }
                          setNewRoleInput('');
                        }}
                      >
                        <IoAdd size={16} /> Add Role
                      </button>
                    </div>
                  </div>

                  <div className="adm-sub" hidden={activeSub !== 'look'}>
                  </div>

                  {/* Auction Screen Layout */}
                  <div className="admin-sport-section">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <div>
                        <h3 style={{ margin: 0 }}>Auction Screen Layout</h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '0.25rem 0 0' }}>
                          Choose how the live auction screen presents the player on the block. Player name, role, photo, stats, bids, and sponsors are read from your tournament data in every layout.
                        </p>
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc', background: 'rgba(255,255,255,0.08)', padding: '0.35rem 0.75rem', borderRadius: 8 }}>
                        Active: {AUCTION_LAYOUT_OPTIONS.find(l => l.key === auctionLayout)?.name || 'Classic'}
                      </span>
                    </div>

                    <div className="admin-sport-grid">
                      {AUCTION_LAYOUT_OPTIONS.map((lo) => {
                        const isSelected = auctionLayout === lo.key;
                        return (
                          <div
                            key={lo.key}
                            className={`admin-sport-card ${isSelected ? 'active' : ''}`}
                            style={{
                              '--sport-accent-color': lo.accentColor,
                              '--sport-glow-color': lo.glowColor,
                            } as React.CSSProperties}
                            onClick={() => setAuctionLayout(lo.key)}
                          >
                            <div className="admin-sport-card-header">
                              <div className="admin-sport-icon-title">
                                <span className="admin-sport-icon">{lo.icon}</span>
                                <span className="admin-sport-title">{lo.name}</span>
                              </div>
                              <span className="admin-sport-badge">{lo.badge}</span>
                            </div>
                            <p className="admin-sport-desc">{lo.desc}</p>
                            <div className="admin-sport-footer">
                              <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>{lo.hint}</span>
                              <button
                                type="button"
                                className="admin-sport-apply-btn"
                                onClick={(e) => { e.stopPropagation(); setAuctionLayout(lo.key); }}
                                title={`Use the ${lo.name} auction screen layout`}
                              >
                                {isSelected ? 'Selected ✓' : 'Use Layout'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="adm-sub" hidden={activeSub !== 'advanced'}>
                  </div>

                  {/* Extended Settings - Player Stats, Categories, Budget, Breaks, Loading, Owners, Iconic Players */}
                  <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '2rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Advanced Configuration</h3>
                    <ThemeSettingsExtended
                      settings={loadedAdminSettings}
                      teams={editingTeams}
                      sport={selectedSport}
                      currencySuffix={currencySuffix}
                      onChange={(partial) => { extendedSettingsRef.current = partial; }}
                      onApplyTeamDefaults={handleApplyTeamBudgetDefaults}
                    />
                  </div>

                  <div className="adm-sub" hidden={activeSub !== 'bidding'}>
                  </div>

                  {/* Budget Enforcement Mode */}
                  <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '2rem' }}>
                    <h3 style={{ marginBottom: '0.5rem' }}>Budget Enforcement Mode</h3>
                    <small style={{ color: '#94a3b8', display: 'block', marginBottom: '0.75rem' }}>
                      Choose how the system handles bids that exceed a team's budget.
                    </small>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer', color: '#e2e8f0' }}>
                        <input
                          type="radio"
                          name="budgetMode"
                          checked={budgetMode !== 'releaseRefund'}
                          onChange={() => setBudgetMode('constraint')}
                        />
                        Block Bid (constraint)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer', color: '#e2e8f0' }}>
                        <input
                          type="radio"
                          name="budgetMode"
                          checked={budgetMode === 'releaseRefund'}
                          onChange={() => setBudgetMode('releaseRefund')}
                        />
                        Release & Refund (prompt team to drop a player)
                      </label>
                    </div>
                  </div>

                  <div className="adm-sub" hidden={activeSub !== 'access'}>
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

                  <h3 style={{ marginTop: '2rem' }}>Super Admin Mobile Access</h3>
                  <p style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: '1rem' }}>
                    Set a lightweight username/password (separate from your admin email login) so a helper
                    can open <code>/connect-bidding-admin</code> on their phone and control every team's
                    bidding, sold/unsold, undo, and player search without needing full admin access.
                  </p>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="super-admin-username">Super Admin Username</label>
                      <input
                        id="super-admin-username"
                        type="text"
                        value={superAdminUsername}
                        disabled={!adminSettingsLoaded}
                        onChange={(e) => setSuperAdminUsername(e.target.value)}
                        placeholder={adminSettingsLoaded ? 'e.g. organizer' : 'Loading settings...'}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="super-admin-password">Super Admin Password</label>
                      <input
                        id="super-admin-password"
                        type="text"
                        value={superAdminPassword}
                        disabled={!adminSettingsLoaded}
                        onChange={(e) => setSuperAdminPassword(e.target.value)}
                        placeholder={adminSettingsLoaded ? 'Shared with trusted helpers only' : 'Loading settings...'}
                      />
                    </div>
                  </div>

                  <div className="adm-sub" hidden={activeSub !== 'branding'}>
                  </div>

                  {/* Branding & Placement Controls */}
                  <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '2rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Branding & Display Controls</h3>
                    <p style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: '1rem' }}>
                      Control where title sponsor logos, brand names, and owners appear in the auction UI.
                    </p>

                    <div className="admin-branding-controls">
                      <label className="admin-branding-toggle">
                        <input
                          type="checkbox"
                          checked={brandingSettings.showTitleSponsorOnOverlays}
                          onChange={(e) => setBrandingSettings(prev => ({ ...prev, showTitleSponsorOnOverlays: e.target.checked }))}
                        />
                        <span className="admin-branding-toggle-label">Show title sponsor on sold/unsold overlays</span>
                      </label>

                      <label className="admin-branding-toggle">
                        <input
                          type="checkbox"
                          checked={brandingSettings.showTitleSponsorInTeamView}
                          onChange={(e) => setBrandingSettings(prev => ({ ...prev, showTitleSponsorInTeamView: e.target.checked }))}
                        />
                        <span className="admin-branding-toggle-label">Show title sponsor in team squad view</span>
                      </label>

                      <label className="admin-branding-toggle">
                        <input
                          type="checkbox"
                          checked={brandingSettings.showBrandOnSoldOverlay}
                          onChange={(e) => setBrandingSettings(prev => ({ ...prev, showBrandOnSoldOverlay: e.target.checked }))}
                        />
                        <span className="admin-branding-toggle-label">Show brand owner on sold overlay</span>
                      </label>

                      <label className="admin-branding-toggle">
                        <input
                          type="checkbox"
                          checked={brandingSettings.showBrandInTeamHeader}
                          onChange={(e) => setBrandingSettings(prev => ({ ...prev, showBrandInTeamHeader: e.target.checked }))}
                        />
                        <span className="admin-branding-toggle-label">Show brand owner in team header</span>
                      </label>

                      <label className="admin-branding-toggle">
                        <input
                          type="checkbox"
                          checked={brandingSettings.reduceThresholdByIconPlayers}
                          onChange={(e) => setBrandingSettings(prev => ({ ...prev, reduceThresholdByIconPlayers: e.target.checked }))}
                        />
                        <span className="admin-branding-toggle-label">Auto-reduce player slots by icon player count</span>
                        <small className="admin-branding-hint">When enabled, iconic players don't count against auction slots</small>
                      </label>

                      {/* Break Content Section */}
                      <div className="admin-branding-section-divider" />
                      <h4 className="admin-branding-section-title">Break Overlay Content</h4>
                      <p style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: '0.75rem' }}>
                        Choose what to display during auction breaks — sponsor images, team owner images, or both.
                      </p>

                      <label className="admin-branding-toggle">
                        <input
                          type="checkbox"
                          checked={brandingSettings.showSponsorsInBreak}
                          onChange={(e) => setBrandingSettings(prev => ({ ...prev, showSponsorsInBreak: e.target.checked }))}
                        />
                        <span className="admin-branding-toggle-label">Show sponsor images/videos during break</span>
                        <small className="admin-branding-hint">Displays sponsor brochures, videos, and logo carousel</small>
                      </label>

                      <label className="admin-branding-toggle">
                        <input
                          type="checkbox"
                          checked={brandingSettings.showTeamOwnersInBreak}
                          onChange={(e) => setBrandingSettings(prev => ({ ...prev, showTeamOwnersInBreak: e.target.checked }))}
                        />
                        <span className="admin-branding-toggle-label">Show team owner/brand images during break</span>
                        <small className="admin-branding-hint">Displays owner portraits and brand logos in a showcase gallery</small>
                      </label>

                      <div className="admin-branding-radio-group">
                        <span className="admin-branding-radio-title">Break display layout</span>
                        <label className="admin-branding-radio">
                          <input
                            type="radio"
                            name="breakContentMode"
                            value="sponsors"
                            checked={brandingSettings.breakContentMode === 'sponsors'}
                            onChange={() => setBrandingSettings(prev => ({ ...prev, breakContentMode: 'sponsors' }))}
                          />
                          <span>Sponsors only (center stage)</span>
                        </label>
                        <label className="admin-branding-radio">
                          <input
                            type="radio"
                            name="breakContentMode"
                            value="teamOwners"
                            checked={brandingSettings.breakContentMode === 'teamOwners'}
                            onChange={() => setBrandingSettings(prev => ({ ...prev, breakContentMode: 'teamOwners' }))}
                          />
                          <span>Team owners only (full gallery)</span>
                        </label>
                        <label className="admin-branding-radio">
                          <input
                            type="radio"
                            name="breakContentMode"
                            value="both"
                            checked={brandingSettings.breakContentMode === 'both'}
                            onChange={() => setBrandingSettings(prev => ({ ...prev, breakContentMode: 'both' }))}
                          />
                          <span>Both (sponsors center + owners side panel)</span>
                        </label>
                      </div>

                      {/* Squad View Mode */}
                      <div className="admin-branding-section-divider" />
                      <h4 className="admin-branding-section-title">Team Squad View - Right Panel</h4>
                      <p style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: '0.75rem' }}>
                        Choose what to display in the right panel of the team squad view.
                      </p>

                      <div className="admin-branding-radio-group">
                        <span className="admin-branding-radio-title">Show in squad view right panel</span>
                        <label className="admin-branding-radio">
                          <input
                            type="radio"
                            name="squadViewMode"
                            value="iconPlayers"
                            checked={brandingSettings.squadViewMode === 'iconPlayers'}
                            onChange={() => setBrandingSettings(prev => ({ ...prev, squadViewMode: 'iconPlayers' }))}
                          />
                          <span>Icon Players (captain / star players)</span>
                        </label>
                        <label className="admin-branding-radio">
                          <input
                            type="radio"
                            name="squadViewMode"
                            value="owners"
                            checked={brandingSettings.squadViewMode === 'owners'}
                            onChange={() => setBrandingSettings(prev => ({ ...prev, squadViewMode: 'owners' }))}
                          />
                          <span>Brand Owners (owner photos & brand images)</span>
                        </label>
                      </div>

                      <div className="admin-branding-radio-group" style={{ marginTop: '0.75rem' }}>
                        <span className="admin-branding-radio-title">Squad view style</span>
                        <label className="admin-branding-radio">
                          <input
                            type="radio"
                            name="squadTheme"
                            value="default"
                            checked={brandingSettings.squadTheme === 'default'}
                            onChange={() => setBrandingSettings(prev => ({ ...prev, squadTheme: 'default' }))}
                          />
                          <span>Default</span>
                        </label>
                        <label className="admin-branding-radio">
                          <input
                            type="radio"
                            name="squadTheme"
                            value="premium"
                            checked={brandingSettings.squadTheme === 'premium'}
                            onChange={() => setBrandingSettings(prev => ({ ...prev, squadTheme: 'premium' }))}
                          />
                          <span>Premium (IPL-like glass cards)</span>
                        </label>
                        <label className="admin-branding-radio">
                          <input
                            type="radio"
                            name="squadTheme"
                            value="royal"
                            checked={brandingSettings.squadTheme === 'royal'}
                            onChange={() => setBrandingSettings(prev => ({ ...prev, squadTheme: 'royal' }))}
                          />
                          <span>Royal (gold-accent highlight)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  </div>

                  <div className="adm-savebar">
                    <span>Changes in every settings section are saved together.</span>
                    <button
                      className="admin-btn admin-btn-primary"
                      onClick={handleSaveTheme}
                      disabled={isSaving || !adminSettingsLoaded}
                    >
                      <IoSave size={18} /> Save Settings
                    </button>
                  </div>
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

              {/* Purse Control Tab */}
              {activeTab === 'purse' && (
                <div className="admin-section">
                  <h3>Team Purse Control</h3>
                  <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                    Correct each team's total budget and squad size threshold here. Spent and remaining
                    amounts are always calculated live from actual sold players, so they can never drift
                    after a restart. To edit or undo an individual sale, use the Export tab's sold-players table.
                  </p>

                  <div className="admin-purse-table-wrapper">
                    <table className="admin-purse-table">
                      <thead>
                        <tr>
                          <SortableColumnHeader column="team" label="Team" sortState={purseControlTable.sortState} onSort={purseControlTable.requestSort} />
                          <SortableColumnHeader column="allocated" label="Total Budget (₹L)" sortState={purseControlTable.sortState} onSort={purseControlTable.requestSort} />
                          <SortableColumnHeader column="spent" label="Spent (₹L)" sortState={purseControlTable.sortState} onSort={purseControlTable.requestSort} />
                          <SortableColumnHeader column="remaining" label="Remaining (₹L)" sortState={purseControlTable.sortState} onSort={purseControlTable.requestSort} />
                          <SortableColumnHeader column="threshold" label="Threshold" sortState={purseControlTable.sortState} onSort={purseControlTable.requestSort} />
                          <SortableColumnHeader column="bought" label="Bought" sortState={purseControlTable.sortState} onSort={purseControlTable.requestSort} />
                          <SortableColumnHeader column="remainingSlots" label="Slots Left" sortState={purseControlTable.sortState} onSort={purseControlTable.requestSort} />
                        </tr>
                      </thead>
                      <tbody>
                        {purseControlTable.sortedRows.map(({ team, spent, remaining, allocated, threshold, bought, remainingSlots }) => (
                          <tr key={team.id}>
                            <td className="admin-purse-team-name">{team.name}</td>
                            <td>
                              <input
                                type="number"
                                className="admin-purse-input"
                                value={allocated}
                                min={0}
                                onChange={(e) => updatePurseField(team.id, 'allocatedAmount', Number.parseInt(e.target.value || '0', 10) || 0)}
                              />
                            </td>
                            <td className="admin-purse-readonly">₹{spent}</td>
                            <td className="admin-purse-readonly admin-purse-remaining">₹{remaining}</td>
                            <td>
                              <input
                                type="number"
                                className="admin-purse-input admin-purse-input-narrow"
                                value={threshold}
                                min={0}
                                onChange={(e) => updatePurseField(team.id, 'totalPlayerThreshold', Number.parseInt(e.target.value || '0', 10) || 0)}
                              />
                            </td>
                            <td className="admin-purse-readonly">{bought}</td>
                            <td className="admin-purse-readonly">{remainingSlots}</td>
                          </tr>
                        ))}
                        {purseControlRows.length === 0 && (
                          <tr>
                            <td colSpan={7} className="admin-empty-state">No teams yet. Add a team in the Teams tab first.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <button
                    className="admin-btn admin-btn-primary"
                    onClick={handleSaveTeams}
                    disabled={isSaving}
                    style={{ marginTop: '1.25rem' }}
                  >
                    <IoSave size={18} /> Save Purse Changes
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

                  <div className="admin-media-field" style={{ marginBottom: '1rem' }}>
                    <div className="admin-media-header">
                      <label>Reuse Existing Sponsors</label>
                      <span>Import sponsors from another tenant slug or ID</span>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="shared-sponsor-tenant">Source Tenant</label>
                        <input
                          id="shared-sponsor-tenant"
                          type="text"
                          value={sharedSponsorTenantSlug}
                          onChange={(e) => setSharedSponsorTenantSlug(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleLoadSharedSponsors();
                          }}
                          placeholder="e.g., summer-league"
                        />
                      </div>
                      <div className="form-group" style={{ alignSelf: 'end' }}>
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary"
                          onClick={() => void handleLoadSharedSponsors()}
                          disabled={isLoadingSharedSponsors || isSavingSponsors}
                        >
                          {isLoadingSharedSponsors ? 'Loading...' : 'Load Sponsors'}
                        </button>
                      </div>
                    </div>

                    {sharedSponsors.length > 0 && (
                      <div className="admin-source-option" style={{ display: 'block', marginTop: '0.75rem' }}>
                        {sharedSponsors.map((sponsor) => {
                          const alreadyImported = editingSponsors.some(
                            (current) => current.sourceSponsorId === sponsor.id,
                          );
                          return (
                            <label key={sponsor.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.35rem 0' }}>
                              <input
                                type="checkbox"
                                checked={selectedSharedSponsorIds.includes(sponsor.id)}
                                disabled={alreadyImported}
                                onChange={(e) => {
                                  setSelectedSharedSponsorIds((current) => e.target.checked
                                    ? [...current, sponsor.id]
                                    : current.filter((id) => id !== sponsor.id));
                                }}
                              />
                              <span>{sponsor.name}{alreadyImported ? ' (already added)' : ''}</span>
                            </label>
                          );
                        })}
                        <button
                          type="button"
                          className="admin-btn admin-btn-primary admin-btn-sm"
                          onClick={handleAddSharedSponsors}
                          disabled={selectedSharedSponsorIds.length === 0 || isSavingSponsors}
                          style={{ marginTop: '0.5rem' }}
                        >
                          Add Selected Sponsors
                        </button>
                      </div>
                    )}
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
                  <div className="admin-player-view-switch" role="tablist" aria-label="Player list views">
                    <button type="button" role="tab" aria-selected={!isPlayerTrashView} className={!isPlayerTrashView ? 'active' : ''} onClick={() => setIsPlayerTrashView(false)}>
                      Player List <span>{editingPlayers.length}</span>
                    </button>
                    <button type="button" role="tab" aria-selected={isPlayerTrashView} className={isPlayerTrashView ? 'active' : ''} onClick={() => setIsPlayerTrashView(true)}>
                      Trash <span>{playerTrash.length}</span>
                    </button>
                  </div>
                  {!isPlayerTrashView ? (
                    <>
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
                      onClick={openMediaMigration}
                      disabled={isSaving || isMigratingMedia}
                    >
                      <IoRefresh size={18} /> Review &amp; Migrate Media
                    </button>

                    <button
                      className="admin-btn admin-btn-secondary"
                      onClick={() => csvFileInputRef.current?.click()}
                      disabled={isSaving}
                    >
                      <IoDownload size={18} /> Import CSV
                    </button>
                    {editingTeams.length > 0 && (
                      <>
                        <button className="admin-btn admin-btn-secondary" onClick={downloadAssignedPlayersTemplate} title="Template includes existing team names for direct assignment">
                          <IoDownload size={18} /> Team Assignment Template
                        </button>
                        <label className="admin-btn admin-btn-secondary" style={{ cursor: 'pointer' }}>
                          <IoCloudUpload size={18} /> Import Team Players
                          <input type="file" accept=".csv,text/csv" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importAssignedPlayersCsv(file).catch(error => showUploadFeedback(String(error), 'error')); }} />
                        </label>
                      </>
                    )}
                    <button
                      className="admin-btn admin-btn-info"
                      onClick={() => downloadPlayersTemplate(editingPlayers, selectedSport)}
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
                      type="button"
                      className="admin-btn admin-btn-warning"
                      onClick={() => { setIsBulkBackgroundRemovalOpen(true); showUploadFeedback('Opening bulk background removal', 'success'); }}
                      disabled={isSaving || editingPlayers.length === 0}
                      title="Select player images for background removal; already processed images are skipped"
                    >
                      <IoRemoveCircleOutline size={18} /> Bulk Remove Backgrounds
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
                      onClick={() => downloadScoresTemplate(selectedSport)}
                      disabled={isSaving}
                      title="Download CSV template for player statistics"
                    >
                      <IoDownload size={18} /> Scores Template
                    </button>
                    <button
                      className="admin-btn admin-btn-danger"
                      onClick={handleDeleteAllPlayers}
                      disabled={isSaving || editingPlayers.length === 0}
                      title="Move all listed players to Trash"
                    >
                      <IoTrash size={18} /> Move All to Trash
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
                            {hasBackgroundRemoved(player) && <span className="admin-background-removed-flag">Background removed</span>}
                            {(() => { const cat = getAgeCategory(player.age); return cat ? <span className="admin-underage-chip" style={cat.color ? { background: cat.color } : undefined}>{cat.label}</span> : null; })()}
                          </div>
                          <small>
                            <span className="admin-role-dot" style={{ background: getRoleBadgeColor(player.role) }} />
                            {formatRoleDisplay(player.role)} | Base: ₹{player.basePrice}L | Team: {assignedTeamNameByPlayerId.get(player.id) || '—'}
                          </small>
                          {(processingPlayerIds[player.id] || processingPlayerLogs[player.id]?.at(-1)?.includes('ERROR')) && (
                            <div className="admin-player-background-log" role={processingPlayerIds[player.id] ? 'log' : 'status'} aria-live="polite">
                              {processingPlayerLogs[player.id]?.slice(-6).map((line, index) => <small key={`${index}-${line}`}>{line}</small>)}
                            </div>
                          )}
                        </div>
                        <div className="admin-compact-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn-warning admin-btn-sm"
                            onClick={() => { void processPlayerBackground(player); }}
                            disabled={Boolean(processingPlayerIds[player.id]) || !player.imageUrl || hasBackgroundRemoved(player)}
                            title={hasBackgroundRemoved(player) ? 'Background already removed' : 'Remove image background and save the processed PNG'}
                          >
                            {processingPlayerIds[player.id] ? 'Processing...' : hasBackgroundRemoved(player) ? 'BG Removed' : 'Remove BG'}
                          </button>
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
                            disabled={isSaving}
                            title="Move player to Trash"
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
                    </>
                  ) : (
                    <>
                      <div className="admin-player-toolbar">
                        <input
                          type="text"
                          value={playerSearch}
                          onChange={(event) => setPlayerSearch(event.target.value)}
                          placeholder="Search trashed players"
                          className="admin-player-search"
                        />
                        <button type="button" className="admin-btn admin-btn-danger" onClick={() => void handleEmptyPlayerTrash()} disabled={isSaving || playerTrash.length === 0}>
                          <IoTrash size={18} /> Permanently Delete All
                        </button>
                      </div>
                      <div className="admin-compact-list">
                        {filteredTrash.map(({ id, record }) => (
                          <div key={id} className="admin-compact-item admin-compact-item--trash">
                            <CompactPlayerAvatar imageUrl={record.player.imageUrl} playerName={record.player.name} />
                            <div className="admin-compact-main">
                              <strong>{record.player.name}</strong>
                              <small>{formatRoleDisplay(record.player.role)} · Removed {record.deletedAt ? new Date(record.deletedAt).toLocaleString() : 'date unavailable'}</small>
                            </div>
                            <div className="admin-compact-actions">
                              <button type="button" className="admin-btn admin-btn-success admin-btn-sm" onClick={() => void handleRestorePlayer(id)} disabled={isSaving}>
                                <IoRefresh size={15} /> Restore
                              </button>
                              <button type="button" className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => void handlePermanentlyDeletePlayer(id)} disabled={isSaving}>
                                <IoTrash size={15} /> Delete permanently
                              </button>
                            </div>
                          </div>
                        ))}
                        {filteredTrash.length === 0 && <div className="admin-empty-state">{playerTrash.length === 0 ? 'Trash is empty.' : 'No trashed players match your search.'}</div>}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Export Tab */}
              {activeTab === 'export' && (
                <div className="admin-section">
                  <div className="adm-sub" hidden={activeSub !== 'sold'}>
                  <h3>Export Data</h3>

                  <div className="export-info">
                    <label className="admin-export-team-filter">
                      <span>Filter team</span>
                      <select value={exportTeamFilter} onChange={event => setExportTeamFilter(event.target.value)}>
                        <option value="all">All teams</option>
                        {teams.map(team => <option key={team.id} value={team.id}>{team.name} · {team.id}</option>)}
                      </select>
                    </label>
                    <p>Sold Players: <strong>{filteredExportSoldPlayers.length}</strong></p>
                    <p>Total Revenue: <strong>₹{filteredExportSoldPlayers.reduce((sum, p) => sum + p.soldAmount, 0).toFixed(1)}L</strong></p>
                  </div>

                  {filteredExportSoldPlayers.length > 0 && (
                    <div className="admin-export-table-wrapper">
                      <table className="admin-export-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Photo</th>
                              <SortableColumnHeader column="name" label="Player" sortState={soldExportTable.sortState} onSort={soldExportTable.requestSort} />
                              <SortableColumnHeader column="role" label="Role" sortState={soldExportTable.sortState} onSort={soldExportTable.requestSort} />
                              <SortableColumnHeader column="age" label="Age" sortState={soldExportTable.sortState} onSort={soldExportTable.requestSort} />
                              <SortableColumnHeader column="teamName" label="Team" sortState={soldExportTable.sortState} onSort={soldExportTable.requestSort} />
                              <SortableColumnHeader column="soldAmount" label="Sold (₹L)" sortState={soldExportTable.sortState} onSort={soldExportTable.requestSort} />
                              <SortableColumnHeader column="basePrice" label="Base (₹L)" sortState={soldExportTable.sortState} onSort={soldExportTable.requestSort} />
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                            {soldExportTable.sortedRows.map((p, i) => {
                            const editedPlayer = editingPlayers.find(player => player.id === p.id);
                            const displayName = editedPlayer?.name || p.name;
                            const displayImage = editedPlayer?.processedImageUrl || editedPlayer?.imageUrl || p.imageUrl;
                            return (
                              <tr key={p.id}>
                                <td>{i + 1}</td>
                                <td><CompactPlayerAvatar imageUrl={displayImage} playerName={displayName} /></td>
                                <td>
                                  {displayName}
                                  <small style={{ display: 'block', color: '#71717a', fontSize: '0.68rem' }}>ID: {p.id}</small>
                                </td>
                                <td>
                                  <span className="admin-role-dot" style={{ background: getRoleBadgeColor(editedPlayer?.role || p.role) }} />
                                  {formatRoleDisplay(editedPlayer?.role || p.role)}
                                </td>
                                <td>{editedPlayer?.age ?? p.age ?? 'N/A'}</td>
                                <td>
                                  {editingSoldPlayerId === p.id ? (
                                    <select
                                      value={soldPlayerDraft?.teamId || p.teamId || ''}
                                      onChange={(e) => {
                                        const t = teams.find(tm => tm.id === e.target.value);
                                        if (t) setSoldPlayerDraft(prev => prev ? { ...prev, teamId: t.id, teamName: t.name } : prev);
                                      }}
                                    >
                                      {teams.map(t => <option key={t.id} value={t.id}>{t.name} · {t.id}</option>)}
                                    </select>
                                  ) : <>{p.teamName}<small style={{ display: 'block', color: '#71717a', fontSize: '0.68rem' }}>Team ID: {p.teamId || teams.find(team => team.name === p.teamName)?.id || 'legacy'}</small></>}
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
                                <td>₹{editedPlayer?.basePrice ?? p.basePrice}</td>
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
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {filteredExportSoldPlayers.length === 0 && (
                    <div className="admin-empty-state">No players sold yet. Sold players will appear here as the auction progresses.</div>
                  )}

                  <button
                    className="admin-btn admin-btn-success"
                    onClick={() => handleExportSoldPlayers(soldExportTable.sortedRows)}
                    disabled={filteredExportSoldPlayers.length === 0}
                    style={{ marginTop: '1rem' }}
                  >
                    <IoDownload size={18} /> Export Sold Players CSV
                  </button>
                  </div>

                  {/* ── Unsold Players Section ── */}
                  <div className="adm-sub" hidden={activeSub !== 'unsold'}>
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
                            <SortableColumnHeader column="name" label="Player" sortState={unsoldExportTable.sortState} onSort={unsoldExportTable.requestSort} />
                            <SortableColumnHeader column="role" label="Role" sortState={unsoldExportTable.sortState} onSort={unsoldExportTable.requestSort} />
                            <SortableColumnHeader column="age" label="Age" sortState={unsoldExportTable.sortState} onSort={unsoldExportTable.requestSort} />
                            <SortableColumnHeader column="basePrice" label="Base (₹L)" sortState={unsoldExportTable.sortState} onSort={unsoldExportTable.requestSort} />
                            <SortableColumnHeader column="round" label="Round" sortState={unsoldExportTable.sortState} onSort={unsoldExportTable.requestSort} />
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unsoldExportTable.sortedRows.map((p, i) => (
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
                    className="admin-btn admin-btn-warning"
                    onClick={() => void handleMoveRemainingToUnsold()}
                    disabled={isSaving || availablePlayers.length === 0}
                    style={{ marginTop: '1rem', marginRight: '0.5rem' }}
                    title="Moves every player still in the auction list to the Unsold list"
                  >
                    Move remaining auction players to Unsold ({availablePlayers.length})
                  </button>
                  <button
                    className="admin-btn admin-btn-success"
                    onClick={handleExportUnsoldPlayers}
                    disabled={unsoldPlayers.length === 0}
                    style={{ marginTop: '1rem' }}
                  >
                    <IoDownload size={18} /> Export Unsold Players CSV
                  </button>
                  </div>
                </div>
              )}

              {/* Features Tab */}
              {activeTab === 'registration' && (
                <div className="admin-section">
                  <RegistrationFormSettings />
                </div>
              )}

              {/* Features Tab */}
              {activeTab === 'features' && (
                <FeatureFlagsTab onStatusChange={setSaveStatus} category={activeSub || 'all'} />
              )}

              {/* Streaming Tab - V3 Premium */}
              {activeTab === 'streaming' && (
                <StreamingTab onClose={onClose} section={(activeSub || 'obs') as StreamingSection} />
              )}

              {/* Storage Tab */}
              {activeTab === 'storage' && (
                <div className="admin-section">
                  <h3>Storage Management</h3>
                  <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                    Browse, manage, and clean up Firebase Storage objects. Identify unused files to free up space.
                  </p>
                  <StorageManager />
                </div>
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
                        <label>Total Budget (₹L)</label>
                        <input
                          type="number"
                          value={teamDraft.allocatedAmount ?? 0}
                          onChange={(e) => {
                            const newAllocated = Number.parseInt(e.target.value || '0', 10) || 0;
                            setTeamDraft({
                              ...teamDraft,
                              allocatedAmount: newAllocated,
                              remainingPurse: Math.max(0, newAllocated - teamDraftSpent),
                            });
                          }}
                        />
                        <small className="admin-field-hint">
                          Already spent: ₹{teamDraftSpent}L · Remaining after save: ₹{Math.max(0, (teamDraft.allocatedAmount ?? 0) - teamDraftSpent)}L
                        </small>
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
                          onBlur={() => setPlayerDraft(current => current ? { ...current, name: normalizePlayerName(current.name) } : current)}
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Place</label>
                        <input
                          type="text"
                          value={playerDraft.place || ''}
                          onChange={(e) => setPlayerDraft({ ...playerDraft, place: e.target.value })}
                          placeholder="e.g. Bengaluru"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Team</label>
                        <select
                          className="admin-select"
                          value={playerTeamDraft?.teamId || ''}
                          onChange={event => {
                            const team = teams.find(item => item.id === event.target.value);
                            setPlayerTeamDraft({ teamId: team?.id || '', teamName: team?.name || '' });
                          }}
                        >
                          <option value="">No team</option>
                          {teams.map(team => <option key={team.id} value={team.id}>{team.name} · {team.id}</option>)}
                        </select>
                        <small className="admin-field-hint">Assigns the player directly to this team (₹0 unless already sold). Leave empty to remove any assignment.</small>
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
                          onChange={(e) => setPlayerDraft({ ...playerDraft, imageUrl: e.target.value, originalImageUrl: e.target.value, processedImageUrl: undefined, isBackgroundRemoved: false, imageProcessingStatus: 'idle', imageProcessingError: undefined })}
                          placeholder="https://drive.google.com/..."
                        />
                      )}
                      {playerDraft.imageUrl && (
                        <PlayerImageEditor
                          imageUrl={playerDraft.imageUrl}
                          sourceBlob={editorImageBlob}
                          auctionLayout={auctionLayout}
                          edit={playerDraft.imageEdit}
                          processing={processingEditorImage}
                          onChange={(imageEdit) => setPlayerDraft(current => current ? { ...current, imageEdit } : current)}
                          onSaveImage={saveEditedPlayerImage}
                          processingLogs={editingPlayerId ? processingPlayerLogs[editingPlayerId] : undefined}
                          onRemoveBackground={() => { void processEditorBackground(); }}
                        />
                      )}
                      {playerDraft.imageProcessingError && (
                        <small className="form-error">{playerDraft.imageProcessingError}</small>
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
        </section>
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
                  <SortableColumnHeader column="id" label="ID" sortState={matchedStatsTable.sortState} onSort={matchedStatsTable.requestSort} />
                  <SortableColumnHeader column="name" label="Player Name" sortState={matchedStatsTable.sortState} onSort={matchedStatsTable.requestSort} />
                  <SortableColumnHeader column="role" label="Role" sortState={matchedStatsTable.sortState} onSort={matchedStatsTable.requestSort} />
                  <SortableColumnHeader column="batMatches" label="Bat M" sortState={matchedStatsTable.sortState} onSort={matchedStatsTable.requestSort} />
                  <SortableColumnHeader column="runs" label="Runs" sortState={matchedStatsTable.sortState} onSort={matchedStatsTable.requestSort} />
                  <SortableColumnHeader column="highScore" label="HS" sortState={matchedStatsTable.sortState} onSort={matchedStatsTable.requestSort} />
                  <SortableColumnHeader column="average" label="Avg" sortState={matchedStatsTable.sortState} onSort={matchedStatsTable.requestSort} />
                  <SortableColumnHeader column="strikeRate" label="SR" sortState={matchedStatsTable.sortState} onSort={matchedStatsTable.requestSort} />
                  <SortableColumnHeader column="bowlMatches" label="Bowl M" sortState={matchedStatsTable.sortState} onSort={matchedStatsTable.requestSort} />
                  <SortableColumnHeader column="wickets" label="Wkts" sortState={matchedStatsTable.sortState} onSort={matchedStatsTable.requestSort} />
                  <SortableColumnHeader column="bestBowling" label="BB" sortState={matchedStatsTable.sortState} onSort={matchedStatsTable.requestSort} />
                  <SortableColumnHeader column="economy" label="Eco" sortState={matchedStatsTable.sortState} onSort={matchedStatsTable.requestSort} />
                </tr>
              </thead>
              <tbody>
                {matchedStatsTable.sortedRows.map(({ csvRow, player }) => (
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
                  <SortableColumnHeader column="id" label="CSV ID" sortState={mismatchedStatsTable.sortState} onSort={mismatchedStatsTable.requestSort} />
                  <SortableColumnHeader column="name" label="CSV Name" sortState={mismatchedStatsTable.sortState} onSort={mismatchedStatsTable.requestSort} />
                  <SortableColumnHeader column="reason" label="Reason" sortState={mismatchedStatsTable.sortState} onSort={mismatchedStatsTable.requestSort} />
                </tr>
              </thead>
              <tbody>
                {mismatchedStatsTable.sortedRows.map((item, i) => (
                  <tr key={`${getStatsCsvField(item.csvRow, 'id')}-${item.reason}-${i}`}>
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

  const playerReviewContent = playerImportReview ? (
    <PlayerImportReviewModal
      incoming={playerImportReview.incoming}
      index={playerImportReview.index}
      existingPlayers={editingPlayers}
      onDecision={(decision) => {
        const currentIndex = playerImportReview.index;
        const currentPlayer = playerImportReview.incoming[currentIndex];
        const nextDecisions = { ...playerImportReview.decisions, [currentPlayer.id]: decision };
        if (decision === 'skip' && currentIndex < playerImportReview.incoming.length - 1) {
          const reordered = [...playerImportReview.incoming];
          const [deferred] = reordered.splice(currentIndex, 1);
          reordered.push(deferred);
          setPlayerImportReview({ ...playerImportReview, incoming: reordered, decisions: nextDecisions });
          return;
        }
        const nextIndex = currentIndex + 1;
        if (nextIndex >= playerImportReview.incoming.length) {
          void finishPlayerImportReview({ ...playerImportReview, decisions: nextDecisions });
        } else {
          setPlayerImportReview({ ...playerImportReview, index: nextIndex, decisions: nextDecisions });
        }
      }}
      onCancel={() => setPlayerImportReview(null)}
    />
  ) : null;

  const assignedReviewContent = assignedImportReview ? (
    <AssignedPlayerReviewModal
      rows={assignedImportReview.rows}
      index={assignedImportReview.index}
      existingPlayers={editingPlayers}
      soldPlayers={soldPlayers}
      onDecision={(decision) => {
        const current = assignedImportReview.rows[assignedImportReview.index];
        const nextDecisions = { ...assignedImportReview.decisions, [current.player.id]: decision };
        const nextIndex = assignedImportReview.index + 1;
        if (nextIndex >= assignedImportReview.rows.length) void finishAssignedImport({ ...assignedImportReview, decisions: nextDecisions });
        else setAssignedImportReview({ ...assignedImportReview, index: nextIndex, decisions: nextDecisions });
      }}
      onCancel={() => setAssignedImportReview(null)}
    />
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
          {playerReviewContent}
          {assignedReviewContent}
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
        {playerReviewContent}
        {assignedReviewContent}
      </AnimatePresence>
    </>
  );
}
