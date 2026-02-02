// ============================================================================
// USE PREMIUM HOOK - V3 Premium Feature Access
// React hook for checking premium status and features
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { premiumService } from '../services/premiumService';
import type { PremiumUser, PremiumTier, PremiumFeatures } from '../types/premium';

interface UsePremiumResult {
  user: PremiumUser | null;
  tier: PremiumTier;
  features: PremiumFeatures | null;
  isPremium: boolean;
  canUseLiveStreaming: boolean;
  canUseOBS: boolean;
  canUseMultiCamera: boolean;
  canUseRTMP: boolean;
  maxCameras: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function usePremium(userId?: string): UsePremiumResult {
  const [user, setUser] = useState<PremiumUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadPremiumStatus = useCallback(async () => {
    if (!userId) {
      // Use current user from service
      const currentUser = premiumService.getCurrentUser();
      setUser(currentUser);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const premiumUser = await premiumService.loadPremiumUser(userId);
      setUser(premiumUser);
    } catch (error) {
      console.error('[usePremium] Failed to load premium status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadPremiumStatus();

    // Subscribe to changes
    const unsubscribe = premiumService.subscribe((updatedUser) => {
      setUser(updatedUser);
    });

    return unsubscribe;
  }, [loadPremiumStatus]);

  const refresh = useCallback(async () => {
    await loadPremiumStatus();
  }, [loadPremiumStatus]);

  return {
    user,
    tier: user?.tier || 'free',
    features: user?.features || null,
    isPremium: user?.tier !== 'free',
    canUseLiveStreaming: premiumService.canUseLiveStreaming(),
    canUseOBS: premiumService.canUseOBS(),
    canUseMultiCamera: premiumService.canUseMultiCamera(),
    canUseRTMP: premiumService.canUseRTMP(),
    maxCameras: premiumService.getMaxCameras(),
    isLoading,
    refresh,
  };
}
