// ============================================================================
// SCORECARD LAYOUT VIEW — renders a full ScorecardLayout (background + all
// widgets, sorted by z-index) inside a fixed-aspect container. Used by the
// Designer preview canvas and the live OBS overlay renderer.
// ============================================================================

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ResolvedImage } from '../ResolvedImage';
import { ScorecardWidgetView } from './ScorecardWidgetView';
import type { ScorecardLayout, ScorecardWidgetInstance } from '../../types/scorecardDesigner';
import { resolveWidgetContent, resolveWidgetVariant, type ScorecardDataContext } from '../../utils/scorecardDataBinding';
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
  const broadcastHostRef = useRef<HTMLDivElement>(null);
  const [broadcastScale, setBroadcastScale] = useState(1);
  const [broadcastZoom, setBroadcastZoom] = useState(1);
  const [broadcastViewportId, setBroadcastViewportId] = useState('desktop-hd');
  const isBroadcast = !interactive;

  useLayoutEffect(() => {
    if (!isBroadcast) return;
    const host = broadcastHostRef.current?.parentElement;
    if (!host) return;
    const updateScale = () => {
      const width = host.clientWidth || window.innerWidth;
      const height = host.clientHeight || window.innerHeight;
      setBroadcastScale(Math.min(width / 1920, height / 1080));
      const portrait = height > width;
      setBroadcastViewportId(portrait ? 'mobile-portrait' : width < 900 ? 'mobile-landscape' : width < 1400 ? 'tablet-landscape' : width < 1750 ? 'desktop-small' : 'desktop-hd');
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(host);
    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [isBroadcast]);

  useLayoutEffect(() => {
    if (!isBroadcast) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setBroadcastZoom(value => Math.min(1.5, Number((value + 0.05).toFixed(2))));
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setBroadcastZoom(value => Math.max(0.75, Number((value - 0.05).toFixed(2))));
      } else if (event.key === '0') {
        setBroadcastZoom(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isBroadcast]);

  const viewportVariant = isBroadcast ? layout.viewportVariants?.[broadcastViewportId] : undefined;
  const effectiveLayout = viewportVariant ? {
    ...layout,
    backgroundGeometry: viewportVariant.backgroundGeometry ?? layout.backgroundGeometry,
    widgets: layout.widgets.map(widget => ({
      ...widget,
      geometry: viewportVariant.widgets[widget.id] ? { ...widget.geometry, ...viewportVariant.widgets[widget.id] } : widget.geometry,
    })),
  } : layout;
  const sorted = [...effectiveLayout.widgets].sort((a, b) => a.geometry.zIndex - b.geometry.zIndex);
  const backgroundGeometry = effectiveLayout.backgroundGeometry ?? { xPct: 0, yPct: 0, wPct: 100, hPct: 100, rotationDeg: 0, zoom: 1 };
  const renderCtx = layout.freezePartnerLogo && layout.frozenPartnerLogoUrl
    ? { ...ctx, branding: { ...ctx.branding, partnerLogo: layout.frozenPartnerLogoUrl } }
    : ctx;

  const canvas = (
    <div
      ref={broadcastHostRef}
      className={`sc-canvas ${isBroadcast ? 'sc-canvas--broadcast' : ''} ${className ?? ''}`}
      style={isBroadcast ? {
        backgroundColor: layout.backgroundColor || 'transparent',
        transform: `translate(-50%, -50%) scale(${broadcastScale * broadcastZoom})`,
      } : { backgroundColor: layout.backgroundColor || 'transparent' }}
    >
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
            style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
          />
        </div>
      )}
      {renderBackgroundOverlay}
      {sorted.map(widget => (
        (() => {
          const effectiveWidget = resolveWidgetVariant(widget, renderCtx, !!interactive);
          return <ScorecardWidgetView
          key={widget.id}
          widget={effectiveWidget}
          content={resolveWidgetContent(effectiveWidget, renderCtx, !!interactive)}
          selected={selectedWidgetId === widget.id}
          interactive={interactive}
          onPointerDownBody={interactive ? (e) => onPointerDownWidget?.(effectiveWidget, e) : undefined}
          overlay={renderWidgetOverlay?.(effectiveWidget)}
        />;
        })()
      ))}
    </div>
  );

  if (!isBroadcast) return canvas;
  return (
    <>
      {canvas}
      <div className="sc-canvas__zoom-control" title="Final overlay zoom: use + and - keys">
        <button type="button" onClick={() => setBroadcastZoom(value => Math.max(0.75, Number((value - 0.05).toFixed(2))))} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => setBroadcastZoom(1)} aria-label="Reset overlay zoom">{Math.round(broadcastZoom * 100)}%</button>
        <button type="button" onClick={() => setBroadcastZoom(value => Math.min(1.5, Number((value + 0.05).toFixed(2))))} aria-label="Zoom in">+</button>
      </div>
    </>
  );
}
