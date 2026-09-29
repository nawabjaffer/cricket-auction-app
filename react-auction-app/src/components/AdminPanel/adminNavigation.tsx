/* eslint-disable react-refresh/only-export-components -- navigation data module, not a component file */
import type { ReactNode } from 'react';
import {
  IoCloudUploadOutline, IoColorPaletteOutline, IoDocumentTextOutline, IoDownloadOutline,
  IoPeopleOutline, IoPersonOutline, IoRefreshOutline, IoRibbonOutline, IoToggleOutline,
  IoVideocamOutline, IoWalletOutline,
} from 'react-icons/io5';
import { FEATURE_CATEGORIES } from '../../config/featureCategories';

export type AdminTab =
  | 'theme' | 'teams' | 'purse' | 'sponsors' | 'players' | 'registration'
  | 'export' | 'features' | 'streaming' | 'storage' | 'reset';

export interface AdminSubsection {
  key: string;
  label: string;
}

export interface AdminNavItem {
  tab: AdminTab;
  label: string;
  description: string;
  icon: ReactNode;
  subsections?: AdminSubsection[];
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Auction setup',
    items: [
      {
        tab: 'theme',
        label: 'Auction settings',
        description: 'Identity, sport, look, bidding rules and access for this auction.',
        icon: <IoColorPaletteOutline size={18} />,
        subsections: [
          { key: 'general', label: 'General & currency' },
          { key: 'sport', label: 'Sport & role order' },
          { key: 'look', label: 'Colors & screen layout' },
          { key: 'bidding', label: 'Bidding & budget rules' },
          { key: 'advanced', label: 'Categories & player stats' },
          { key: 'access', label: 'Team & admin access' },
          { key: 'branding', label: 'Branding & display' },
        ],
      },
      { tab: 'teams', label: 'Teams', description: 'Create and edit the teams taking part.', icon: <IoPeopleOutline size={18} /> },
      { tab: 'purse', label: 'Purse control', description: 'Adjust team budgets and remaining purse.', icon: <IoWalletOutline size={18} /> },
    ],
  },
  {
    label: 'People & partners',
    items: [
      {
        tab: 'players',
        label: 'Players',
        description: 'Manage the player pool, imports and removed players.',
        icon: <IoPersonOutline size={18} />,
        subsections: [
          { key: 'list', label: 'Player pool' },
          { key: 'trash', label: 'Trash' },
        ],
      },
      { tab: 'registration', label: 'Registration form', description: 'Configure the public player registration form.', icon: <IoDocumentTextOutline size={18} /> },
      { tab: 'sponsors', label: 'Sponsors', description: 'Title sponsors, brand owners and sponsor media.', icon: <IoRibbonOutline size={18} /> },
    ],
  },
  {
    label: 'Results',
    items: [
      {
        tab: 'export',
        label: 'Export data',
        description: 'Download the auction outcome.',
        icon: <IoDownloadOutline size={18} />,
        subsections: [
          { key: 'sold', label: 'Sold players' },
          { key: 'unsold', label: 'Unsold players' },
        ],
      },
    ],
  },
  {
    label: 'Broadcast',
    items: [
      {
        tab: 'streaming',
        label: 'Streaming',
        description: 'Run the broadcast, control OBS Studio and open scoring tools.',
        icon: <IoVideocamOutline size={18} />,
        subsections: [
          { key: 'obs', label: 'OBS Studio' },
          { key: 'live', label: 'Live view & overlays' },
          { key: 'rtmp', label: 'RTMP output' },
          { key: 'sports', label: 'Scoring & sport links' },
        ],
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        tab: 'features',
        label: 'Features',
        description: 'Turn app capabilities on or off.',
        icon: <IoToggleOutline size={18} />,
        subsections: [
          { key: 'all', label: 'All features' },
          ...FEATURE_CATEGORIES.map(category => ({ key: category.key, label: category.label })),
        ],
      },
      { tab: 'storage', label: 'Storage', description: 'Browse and clean up uploaded files.', icon: <IoCloudUploadOutline size={18} /> },
      { tab: 'reset', label: 'Reset', description: 'Reset auction progress or clear cached data.', icon: <IoRefreshOutline size={18} /> },
    ],
  },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV.flatMap(group => group.items);

export function findAdminNavItem(tab: AdminTab): AdminNavItem {
  return ADMIN_NAV_ITEMS.find(item => item.tab === tab) ?? ADMIN_NAV_ITEMS[0];
}

export function defaultSubsection(tab: AdminTab): string | undefined {
  return findAdminNavItem(tab).subsections?.[0]?.key;
}
