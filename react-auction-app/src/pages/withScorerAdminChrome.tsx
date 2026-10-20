// ============================================================================
// withScorerAdminChrome — Higher-Order Component
// Wraps a sport's admin page content with the shared header + quick-actions
// bar so every game type gets identical navigation instead of each admin page
// hand-rolling its own header/switcher markup. Cross-sport switch buttons and
// labels are driven entirely by boolean gameType comparisons.
// ============================================================================

import type { ComponentType } from 'react';
import { useLocation } from 'react-router-dom';
import { IoClose, IoPencil, IoDesktop, IoVideocam, IoGameController, IoSettings, IoColorPalette, IoHelpCircleOutline, IoLogoAndroid } from 'react-icons/io5';
import { useTenantNavigate as useNavigate, getTenantSlugFromPath } from '../hooks/useTenantNavigate';
import { gameTypeIcon, gameTypeLabel, type SupportedGameType } from './scorerPages';
import './withScorerAdminChrome.css';
import { useMobileScoringOptions } from '../hooks/useMobileScoringOptions';

interface ScorerAdminChromeConfig {
  gameType: SupportedGameType;
  subtitle: string;
}

export function withScorerAdminChrome<P extends object>(
  Content: ComponentType<P>,
  config: Readonly<ScorerAdminChromeConfig>,
): ComponentType<P> {
  return function ScorerAdminWithChrome(props: Readonly<P>) {
    const navigate = useNavigate();
    const location = useLocation();
    const tenantSlug = getTenantSlugFromPath(location.pathname);
    const baseUrl = window.location.origin + (tenantSlug ? `/${tenantSlug}` : '');
    const { gameType, subtitle } = config;
    const { mobile, options } = useMobileScoringOptions(gameType);
    const openQuickTab = (path: string) => {
      window.open(`${baseUrl}${path}`, '_blank', 'noopener,noreferrer');
    };

    return (
      <>
        <header className="scorer-chrome__header">
          <div className="scorer-chrome__header-left">
            <span className="scorer-chrome__icon">{gameTypeIcon(gameType)}</span>
            <div>
              <h1 className="scorer-chrome__title">{gameTypeLabel(gameType)} Scorer</h1>
              <p className="scorer-chrome__subtitle">{subtitle}</p>
            </div>
          </div>
          <div className="scorer-chrome__header-actions">
            {(!mobile || options.guides) && <button className="scorer-chrome__guide-btn" onClick={() => openQuickTab('/help?section=broadcast')}>
              <IoHelpCircleOutline size={16} /> Guides
            </button>}
            {(!mobile || options.tournamentAdmin) && <button className="scorer-chrome__close-btn" onClick={() => navigate('/admin')} title="Back to Auction Admin" aria-label="Back to Auction Admin">
              <IoClose size={20} />
            </button>}
          </div>
        </header>

        {!mobile && <div className="scorer-chrome__quick-actions">
          {gameType === 'cricket' && <button className="scorer-chrome__quick-btn" onClick={() => openQuickTab('/cricket/scoreboard')}>
            <IoDesktop size={14} /> Public Scorecard
          </button>}
          <button className="scorer-chrome__quick-btn" onClick={() => openQuickTab(`/${gameType}/scorer/update`)}>
            <IoPencil size={14} /> Update Scorecard
          </button>
          <button className="scorer-chrome__quick-btn" onClick={() => openQuickTab(`/${gameType}/scorer/obs-overlay`)}>
            <IoDesktop size={14} /> OBS Overlay
          </button>
          <button className="scorer-chrome__quick-btn" onClick={() => openQuickTab(`/${gameType}/scorer/camera`)}>
            <IoVideocam size={14} /> Camera Recorder
          </button>
          <button className="scorer-chrome__quick-btn" onClick={() => openQuickTab(`/${gameType}/scorer/obs-dock`)}>
            <IoGameController size={14} /> OBS Control Dock
          </button>
          <button className="scorer-chrome__quick-btn" onClick={() => openQuickTab(`/${gameType}/scorer/designer`)}>
            <IoColorPalette size={14} /> Scorecard Designer
          </button>
          <button
            className="scorer-chrome__quick-btn scorer-chrome__quick-btn--android"
            onClick={() => openQuickTab(`/${gameType}/scorer/mobile-app?download=1`)}
            title="Download the NJS Live Studio Android app (APK) and pair your phone"
          >
            <IoLogoAndroid size={14} /> Android Live Studio
          </button>
          <button className="scorer-chrome__quick-btn" onClick={() => openQuickTab('/admin')}>
            <IoSettings size={14} /> Auction Admin
          </button>
        </div>}

        <Content {...props} />
      </>
    );
  };
}
