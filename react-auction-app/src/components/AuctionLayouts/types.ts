// ============================================================================
// AUCTION LAYOUT — Shared contract
//
// Alternate presentation layouts for the live auction screen. Every value is
// supplied by the caller (App) from Firebase-backed state — layouts stay pure
// presentational components so they can be swapped from the admin panel.
// ============================================================================

import type { Player, Team } from '../../types';
import type { SponsorRecord } from '../../services/auctionPersistence';

/** Selectable auction screen presentation styles. */
export type AuctionLayoutStyle = 'classic' | 'spotlight' | 'vibrant';

export interface AuctionStatRow {
  readonly label: string;
  readonly value: string | number;
  readonly category: string;
}

export interface AuctionLayoutProps {
  /** Player currently on the block; `null` renders the home/idle screen. */
  readonly currentPlayer: Player | null;
  /** Resolved (Storage/Drive) image URL for the current player. */
  readonly playerImageSrc: string;
  /** Admin-configured image shown when the current player's image is unavailable. */
  readonly playerPlaceholderSrc: string;
  /** Admin-configured stat rows already filtered for the active sport. */
  readonly statRows: readonly AuctionStatRow[];
  readonly currentBid: number;
  readonly selectedTeam: Team | null;
  /** Highest bid this team may still place, from the auction rules service. */
  readonly maxBidForTeam: number;
  readonly currencySuffix: string;
  readonly organizerName: string;
  readonly organizerLogo: string;
  readonly currentRound: number;
  /** Theme accent driving splash/highlight colors. */
  readonly accentColor: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly gifHueRotate?: number;
  readonly gifAssetPath?: string;
  readonly gifAssets?: readonly { key: string; path: string; hueRotate?: number }[];
  /** Home-screen content shown while no player is on the block. */
  readonly titleSponsor: SponsorRecord | null;
  readonly sponsors: readonly SponsorRecord[];
  readonly playerCounts: { available: number; sold: number; unsold: number };
  readonly teamCount: number;
  /** Offsets top content when the fixed app header is toggled on. */
  readonly headerVisible?: boolean;
}

/** Adds alpha to a `#rrggbb` color; falls back to the input when unparsable. */
export function withAlpha(hex: string, alpha: number): string {
  const normalized = (hex || '').trim().replace('#', '');
  if (!/^[\da-f]{6}$/i.test(normalized)) return hex;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(normalized.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Darkens a `#rrggbb` color by `amount` (0-1) for layered backgrounds. */
export function darken(hex: string, amount: number): string {
  const normalized = (hex || '').trim().replace('#', '');
  if (!/^[\da-f]{6}$/i.test(normalized)) return hex;
  const channels = [0, 2, 4].map((i) => {
    const value = Number.parseInt(normalized.slice(i, i + 2), 16);
    return Math.max(0, Math.round(value * (1 - amount)));
  });
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
