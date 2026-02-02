import React, { useState, useEffect } from 'react';
import { featureFlagsService, type FeatureFlags } from '../../services/featureFlagsService';
import './FeatureFlagsTab.css';

interface FeatureFlagsTabProps {
  onStatusChange: (status: 'idle' | 'success' | 'error') => void;
}

const FeatureFlagsTab: React.FC<FeatureFlagsTabProps> = ({ onStatusChange }) => {
  const [flags, setFlags] = useState<FeatureFlags>(() => featureFlagsService.getAllFlags());
  const [loading, setLoading] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    // Initialize flags on mount
    featureFlagsService.initialize().then(() => {
      setFlags(featureFlagsService.getAllFlags());
    });

    // Subscribe to changes
    const unsubscribe = featureFlagsService.subscribe((updatedFlags) => {
      setFlags(updatedFlags);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleToggleFlag = async (featureKey: string, currentEnabled: boolean) => {
    setLoading(true);
    try {
      await featureFlagsService.toggleFeature(featureKey, !currentEnabled);
      onStatusChange('success');
      setTimeout(() => onStatusChange('idle'), 2000);
    } catch (error) {
      console.error('[FeatureFlagsTab] Failed to toggle flag:', error);
      onStatusChange('error');
      setTimeout(() => onStatusChange('idle'), 2000);
    } finally {
      setLoading(false);
    }
  };

  const handleResetToDefaults = async () => {
    const confirmed = window.confirm('Reset all features to default state?');
    if (!confirmed) return;

    setLoading(true);
    try {
      await featureFlagsService.resetToDefaults();
      onStatusChange('success');
      setTimeout(() => onStatusChange('idle'), 2000);
    } catch (error) {
      console.error('[FeatureFlagsTab] Failed to reset:', error);
      onStatusChange('error');
      setTimeout(() => onStatusChange('idle'), 2000);
    } finally {
      setLoading(false);
    }
  };

  // Get categories
  const categories: { [key: string]: string } = {
    bidding: '🎯 Bidding Features',
    ui: '🎨 UI & Display',
    notifications: '🔔 Notifications',
    analytics: '📊 Analytics & Logging',
    other: '⚙️ Other'
  };

  // Group flags by category
  const groupedFlags = Object.entries(flags).reduce((acc, [key, flag]) => {
    const category = flag.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push({ key, ...flag });
    return acc;
  }, {} as { [key: string]: any[] });

  const stats = featureFlagsService.getStats();

  return (
    <div className="features-tab">
      <div className="features-header">
        <h3>Feature Flags Management</h3>
        <div className="features-stats">
          <span className="stat">
            <span className="stat-label">Enabled:</span>
            <span className="stat-value enabled">{stats.enabled}</span>
          </span>
          <span className="stat">
            <span className="stat-label">Disabled:</span>
            <span className="stat-value disabled">{stats.disabled}</span>
          </span>
        </div>
      </div>

      <p className="features-description">
        Control which features are enabled or disabled in the auction application. Changes take effect immediately.
      </p>

      <div className="features-list">
        {Object.entries(categories).map(([category, categoryLabel]) => (
          <div key={category} className="feature-category">
            <button
              className={`category-header ${expandedCategory === category ? 'expanded' : ''}`}
              onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
            >
              <span className="category-icon">{categoryLabel}</span>
              <span className="category-arrow">▼</span>
            </button>

            {expandedCategory === category && (
              <div className="category-features">
                {groupedFlags[category]?.map((flag) => (
                  <div key={flag.key} className="feature-item">
                    <div className="feature-info">
                      <div className="feature-name">{flag.name}</div>
                      <div className="feature-description">{flag.description}</div>
                      {flag.updatedBy && (
                        <div className="feature-meta">
                          Last updated by: {flag.updatedBy}
                        </div>
                      )}
                    </div>

                    <div className="feature-toggle">
                      <input
                        type="checkbox"
                        id={flag.key}
                        checked={flag.enabled}
                        onChange={() => handleToggleFlag(flag.key, flag.enabled)}
                        disabled={loading}
                        className="toggle-input"
                      />
                      <label htmlFor={flag.key} className="toggle-label">
                        <span className="toggle-switch"></span>
                        <span className="toggle-text">
                          {flag.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="features-actions">
        <button
          onClick={handleResetToDefaults}
          disabled={loading}
          className="reset-button"
        >
          ↻ Reset to Defaults
        </button>
      </div>

      <div className="features-info">
        <strong>Note:</strong> Feature flags control app functionality in real-time. Disabling a feature will
        immediately prevent users from accessing it.
      </div>
    </div>
  );
};

export default FeatureFlagsTab;
