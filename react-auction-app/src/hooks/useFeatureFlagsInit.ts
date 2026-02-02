import { useEffect, useState } from 'react';
import { featureFlagsService } from '../services/featureFlagsService';

/**
 * Hook to initialize feature flags on app load
 */
export const useFeatureFlagsInit = () => {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    featureFlagsService.initialize().then(() => {
      setInitialized(true);
    });
  }, []);

  return { initialized };
};
