import React, { useState, useEffect, useMemo } from 'react';
import { featureFlagsService, type FeatureFlag, type FeatureFlags } from '../../services/featureFlagsService';
import { FEATURE_CATEGORIES } from '../../config/featureCategories';
import './FeatureFlagsTab.css';

interface FeatureFlagsTabProps {
  onStatusChange: (status: 'idle' | 'success' | 'error') => void;
  /** Show a single category, or every category when omitted / "all". */
  category?: string;
}

type FlagEntry = FeatureFlag & { key: string };

const FeatureFlagsTab: React.FC<FeatureFlagsTabProps> = ({ onStatusChange, category = 'all' }) => {
  const [flags, setFlags] = useState<FeatureFlags>(() => featureFlagsService.getAllFlags());
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    featureFlagsService.initialize().then(() => {
      setFlags(featureFlagsService.getAllFlags());
    });
    return featureFlagsService.subscribe(setFlags);
  }, []);

  const report = (status: 'success' | 'error') => {
    onStatusChange(status);
    setTimeout(() => onStatusChange('idle'), 2000);
  };

  const handleToggleFlag = async (featureKey: string, currentEnabled: boolean) => {
    setLoading(true);
    try {
      await featureFlagsService.toggleFeature(featureKey, !currentEnabled);
      report('success');
    } catch (error) {
      console.error('[FeatureFlagsTab] Failed to toggle flag:', error);
      report('error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetToDefaults = async () => {
    if (!window.confirm('Reset all features to default state?')) return;
    setLoading(true);
    try {
      await featureFlagsService.resetToDefaults();
      report('success');
    } catch (error) {
      console.error('[FeatureFlagsTab] Failed to reset:', error);
      report('error');
    } finally {
      setLoading(false);
    }
  };

  const entries = useMemo<FlagEntry[]>(() => Object.entries(flags).map(([key, flag]) => ({ ...flag, key })), [flags]);
  const needle = query.trim().toLowerCase();
  const visible = entries.filter(flag => {
    if (category !== 'all' && flag.category !== category) return false;
    return !needle || `${flag.name} ${flag.description} ${flag.key}`.toLowerCase().includes(needle);
  });

  const scopeEntries = category === 'all' ? entries : entries.filter(flag => flag.category === category);
  const enabledCount = scopeEntries.filter(flag => flag.enabled).length;
  const groups = FEATURE_CATEGORIES
    .filter(group => category === 'all' || group.key === category)
    .map(group => ({ ...group, items: visible.filter(flag => flag.category === group.key) }))
    .filter(group => group.items.length > 0);
  const activeCategory = FEATURE_CATEGORIES.find(group => group.key === category);

  return (
    <div className="features-tab">
      <div className="features-toolbar">
        <div className="features-summary">
          <strong>{activeCategory?.label ?? 'All features'}</strong>
          <span>{enabledCount} of {scopeEntries.length} enabled</span>
        </div>
        <input
          type="search"
          className="features-search"
          placeholder="Search features"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search features"
        />
      </div>

      <p className="features-description">
        {activeCategory?.description ?? 'Turn features on or off for this auction.'} Changes take effect immediately for everyone using the app.
      </p>

      {groups.map(group => (
        <section key={group.key} className="feature-group">
          {category === 'all' && <h4 className="feature-group__title">{group.label}<span>{group.items.length}</span></h4>}
          <div className="feature-grid">
            {group.items.map(flag => (
              <label key={flag.key} className={`feature-card ${flag.enabled ? 'is-on' : ''}`} htmlFor={flag.key}>
                <div className="feature-card__body">
                  <div className="feature-name">{flag.name}</div>
                  <div className="feature-description">{flag.description}</div>
                  {flag.updatedBy && <div className="feature-meta">Last updated by {flag.updatedBy}</div>}
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
                  <span className="toggle-label">
                    <span className="toggle-switch" />
                    <span className="toggle-text">{flag.enabled ? 'On' : 'Off'}</span>
                  </span>
                </div>
              </label>
            ))}
          </div>
        </section>
      ))}

      {groups.length === 0 && <p className="features-empty">No features match your search.</p>}

      <div className="features-actions">
        <button type="button" onClick={handleResetToDefaults} disabled={loading} className="reset-button">
          Reset all to defaults
        </button>
      </div>
    </div>
  );
};

export default FeatureFlagsTab;
