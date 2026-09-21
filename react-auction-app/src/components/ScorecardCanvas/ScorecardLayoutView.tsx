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
  renderWidgetOverlay?: (widget: ScorecardWidgetInstance) => ReactNode;
}

export function ScorecardLayoutView({
  layout, ctx, selectedWidgetId, interactive, className, onPointerDownWidget, renderWidgetOverlay,
}: Readonly<ScorecardLayoutViewProps>) {
  const sorted = [...layout.widgets].sort((a, b) => a.geometry.zIndex - b.geometry.zIndex);

  return (
    <div className={`sc-canvas ${className ?? ''}`} style={{ backgroundColor: layout.backgroundColor || 'transparent' }}>
      {layout.backgroundImageUrl && (
        <ResolvedImage
          src={layout.backgroundImageUrl}
          alt=""
          size={1920}
          className="sc-canvas__bg"
        />
      )}
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
