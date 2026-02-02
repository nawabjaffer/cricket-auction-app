// ============================================================================
// PREMIUM TYPES - V3 Premium Features Type Definitions
// Premium-gated live streaming and broadcast capabilities
// ============================================================================

// Premium subscription tiers
export type PremiumTier = 'free' | 'basic' | 'pro' | 'enterprise';

// Premium user profile
export interface PremiumUser {
  uid: string;
  email: string;
  tier: PremiumTier;
  subscriptionId?: string;
  expiresAt?: number;
  features: PremiumFeatures;
}

// Premium feature flags
export interface PremiumFeatures {
  liveStreaming: boolean;
  obsIntegration: boolean;
  multiCamera: boolean;
  customOverlays: boolean;
  rtmpOutput: boolean;
  brandingRemoval: boolean;
  maxCameras: number;
}

// Default feature sets per tier
export const TIER_FEATURES: Record<PremiumTier, PremiumFeatures> = {
  free: {
    liveStreaming: false,
    obsIntegration: false,
    multiCamera: false,
    customOverlays: false,
    rtmpOutput: false,
    brandingRemoval: false,
    maxCameras: 0,
  },
  basic: {
    liveStreaming: true,
    obsIntegration: false,
    multiCamera: false,
    customOverlays: false,
    rtmpOutput: false,
    brandingRemoval: false,
    maxCameras: 1,
  },
  pro: {
    liveStreaming: true,
    obsIntegration: true,
    multiCamera: true,
    customOverlays: true,
    rtmpOutput: true,
    brandingRemoval: false,
    maxCameras: 4,
  },
  enterprise: {
    liveStreaming: true,
    obsIntegration: true,
    multiCamera: true,
    customOverlays: true,
    rtmpOutput: true,
    brandingRemoval: true,
    maxCameras: 8,
  },
};
