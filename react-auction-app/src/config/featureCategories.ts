import type { FeatureFlag } from '../services/featureFlagsService';

export const FEATURE_CATEGORIES: Array<{ key: FeatureFlag['category']; label: string; description: string }> = [
  { key: 'bidding', label: 'Bidding', description: 'How teams place and control bids.' },
  { key: 'ui', label: 'Display & interface', description: 'What the auction screens show.' },
  { key: 'notifications', label: 'Notifications', description: 'Sounds and toast messages.' },
  { key: 'streaming', label: 'Streaming', description: 'Broadcast and OBS Studio tools.' },
  { key: 'analytics', label: 'Analytics & audit', description: 'Tracking and audit logging.' },
  { key: 'other', label: 'Other', description: 'Everything else.' },
];
