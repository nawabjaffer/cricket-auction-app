// ============================================================================
// SCORECARD LAYOUT VIEW — renders a full ScorecardLayout (background + all
// widgets, sorted by z-index) inside a fixed-aspect container. Used by the
// Designer preview canvas and the live OBS overlay renderer.
// ============================================================================

import type { ReactNode } from 'react';
import { ResolvedImage } from '../ResolvedImage';
import { ScorecardWidgetView } from './ScorecardWidgetView';
import type { ScorecardLayout, ScorecardWidgetInstance } from '../../types/scorecardDesigner';
import { resolveWidgetContent, type ScorecardDataContext } from '../../utils/scorecardDataBinding';
import './ScorecardCanvas.css';

interface ScorecardLayoutViewProps {
  layout: ScorecardLayout;
  ctx: ScorecardDataContext;
  selectedWidgetId?: string | null;
  interactive?: boolean;
  className?: string;
  onPointerDownWidget?: (widget: ScorecardWidgetInstance, e: React.PointerEvent) => void;
  onPointerDownBackground?: (e: React.PointerEvent) => void;
  renderWidgetOverlay?: (widget: ScorecardWidgetInstance) => ReactNode;
  renderBackgroundOverlay?: ReactNode;
}

export function ScorecardLayoutView({
  layout, ctx, selectedWidgetId, interactive, className, onPointerDownWidget, onPointerDownBackground,
  renderWidgetOverlay, renderBackgroundOverlay,
}: Readonly<ScorecardLayoutViewProps>) {
  const sorted = [...layout.widgets].sort((a, b) => a.geometry.zIndex - b.geometry.zIndex);
  const backgroundGeometry = layout.backgroundGeometry ?? { xPct: 0, yPct: 0, wPct: 100, hPct: 100, rotationDeg: 0, zoom: 1 };

  return (
    <div className={`sc-canvas ${className ?? ''}`} style={{ backgroundColor: layout.backgroundColor || 'transparent' }}>
      {layout.backgroundImageUrl && (
        <div
          className="sc-canvas__bg"
          style={{
            left: `${backgroundGeometry.xPct}%`,
            top: `${backgroundGeometry.yPct}%`,
            width: `${backgroundGeometry.wPct}%`,
            height: `${backgroundGeometry.hPct}%`,
            transform: `translateZ(0) rotate(${backgroundGeometry.rotationDeg}deg) scale(${backgroundGeometry.zoom})`,
            transformOrigin: 'center center',
            pointerEvents: interactive ? 'auto' : 'none',
          }}
          onPointerDown={interactive ? onPointerDownBackground : undefined}
        >
          <ResolvedImage
            src={layout.backgroundImageUrl}
            alt=""
            size={1920}
            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          />
        </div>
      )}
      {renderBackgroundOverlay}
      {sorted.map(widget => (
        <ScorecardWidgetView
          key={widget.id}
          widget={widget}
          content={resolveWidgetContent(widget, ctx)}
          selected={selectedWidgetId === widget.id}
          interactive={interactive}
          onPointerDownBody={interactive ? (e) => onPointerDownWidget?.(widget, e) : undefined}
          overlay={renderWidgetOverlay?.(widget)}
        />
      ))}
    </div>
  );
}
