import { useEffect, useState, useCallback } from 'react';
import { featureFlagsService, type FeatureFlags } from '../services/featureFlagsService';

/**
 * Hook to access and use feature flags
 */
export const useFeatureFlags = () => {
  const [flags, setFlags] = useState<FeatureFlags>(() => featureFlagsService.getAllFlags());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Initialize flags on first mount
    featureFlagsService.initialize().then(() => {
      setFlags(featureFlagsService.getAllFlags());
      setInitialized(true);
    });

    // Subscribe to flag changes
    const unsubscribe = featureFlagsService.subscribe((updatedFlags) => {
      setFlags(updatedFlags);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const isEnabled = useCallback((featureKey: string): boolean => {
    return featureFlagsService.isEnabled(featureKey);
  }, []);

  const getFlag = useCallback((featureKey: string) => {
    return featureFlagsService.getFlag(featureKey);
  }, []);

  return {
    flags,
    initialized,
    isEnabled,
    getFlag,
    allFlags: flags
  };
};
