// ============================================================================
// withScorerAdminChrome — Higher-Order Component
// Wraps a sport's admin page content with the shared header + quick-actions
// bar so every game type gets identical navigation instead of each admin page
// hand-rolling its own header/switcher markup. Cross-sport switch buttons and
// labels are driven entirely by boolean gameType comparisons.
// ============================================================================

import type { ComponentType } from 'react';
import { useLocation } from 'react-router-dom';
import { IoClose, IoPencil, IoDesktop, IoVideocam, IoGameController, IoSettings } from 'react-icons/io5';
import { useTenantNavigate as useNavigate, getTenantSlugFromPath } from '../hooks/useTenantNavigate';
import { gameTypeIcon, gameTypeLabel, SUPPORTED_GAME_TYPES, type SupportedGameType } from './scorerPages';
import './withScorerAdminChrome.css';

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
          <button className="scorer-chrome__close-btn" onClick={() => navigate('/admin')} title="Back to Auction Admin">
            <IoClose size={20} />
          </button>
        </header>

        <div className="scorer-chrome__quick-actions">
          <button className="scorer-chrome__quick-btn" onClick={() => navigate(`/${gameType}/scorer/update`)}>
            <IoPencil size={14} /> Update Scorecard
          </button>
          <button className="scorer-chrome__quick-btn" onClick={() => window.open(`${baseUrl}/${gameType}/scorer/obs-overlay`, '_blank')}>
            <IoDesktop size={14} /> OBS Overlay
          </button>
          <button className="scorer-chrome__quick-btn" onClick={() => window.open(`${baseUrl}/${gameType}/scorer/camera`, '_blank')}>
            <IoVideocam size={14} /> Camera Recorder
          </button>
          <button className="scorer-chrome__quick-btn" onClick={() => window.open(`${baseUrl}/${gameType}/scorer/obs-dock`, '_blank')}>
            <IoGameController size={14} /> OBS Control Dock
          </button>
          {SUPPORTED_GAME_TYPES.filter(sport => sport !== gameType).map(sport => (
            <button key={sport} className="scorer-chrome__quick-btn" onClick={() => navigate(`/${sport}/scorer/admin`)}>
              <span>{gameTypeIcon(sport)}</span> {gameTypeLabel(sport)} Scorer
            </button>
          ))}
          <button className="scorer-chrome__quick-btn" onClick={() => navigate('/admin')}>
            <IoSettings size={14} /> Auction Admin
          </button>
        </div>

        <Content {...props} />
      </>
    );
  };
}
