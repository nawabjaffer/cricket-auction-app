// ============================================================================
// SCORECARD WIDGET VIEW — renders one ScorecardWidgetInstance as an absolutely
// positioned DOM element inside a relatively-positioned ScorecardLayoutView.
// Shared by the Designer (edit mode, wrapped with drag/resize handles) and the
// live OBS overlay (read-only render) — same markup, same styling either way.
// ============================================================================

import type { CSSProperties, ReactNode } from 'react';
import { ResolvedImage } from '../ResolvedImage';
import type { ScorecardWidgetInstance } from '../../types/scorecardDesigner';
import type { ResolvedWidgetContent } from '../../utils/scorecardDataBinding';
import './ScorecardCanvas.css';

interface ScorecardWidgetViewProps {
  widget: ScorecardWidgetInstance;
  content: ResolvedWidgetContent;
  selected?: boolean;
  interactive?: boolean;
  /** Extra nodes (drag handle, resize handle, toolbar) — designer-only. */
  overlay?: ReactNode;
  onPointerDownBody?: (e: React.PointerEvent) => void;
}

export function ScorecardWidgetView({ widget, content, selected, interactive, overlay, onPointerDownBody }: Readonly<ScorecardWidgetViewProps>) {
  if (!widget.visible) return null;
  if (content.hidden && !interactive) return null;

  const { geometry, style } = widget;
  const isImageKind = widget.kind === 'team_a_logo' || widget.kind === 'team_b_logo'
    || widget.kind === 'custom_image' || widget.kind === 'tournament_logo' || widget.kind === 'partner_logo';

  const containerStyle: CSSProperties = {
    position: 'absolute',
    left: `${geometry.xPct}%`,
    top: `${geometry.yPct}%`,
    width: `${geometry.wPct}%`,
    height: `${geometry.hPct}%`,
    transform: `rotate(${geometry.rotationDeg}deg)`,
    zIndex: geometry.zIndex,
    opacity: style.opacity ?? 1,
    backgroundColor: isImageKind ? 'transparent' : style.backgroundColor,
    borderRadius: style.borderRadius,
    borderWidth: style.borderWidth,
    borderColor: style.borderColor,
    borderStyle: style.borderWidth ? 'solid' : 'none',
    padding: style.padding,
    boxShadow: style.boxShadowEnabled ? `0 4px ${style.boxShadowBlur ?? 12}px ${style.boxShadowColor}` : undefined,
    display: 'flex',
    alignItems: 'center',
    justifyContent: style.textAlign === 'left' ? 'flex-start' : style.textAlign === 'right' ? 'flex-end' : 'center',
    boxSizing: 'border-box',
    cursor: interactive ? (widget.locked ? 'not-allowed' : 'grab') : undefined,
    outline: selected ? '2px dashed #7c3aed' : undefined,
    outlineOffset: selected ? 2 : undefined,
    pointerEvents: interactive ? 'auto' : 'none',
  };

  const textStyle: CSSProperties = {
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing,
    textTransform: style.textTransform,
    textShadow: style.textShadowEnabled ? `0 2px ${style.textShadowBlur ?? 6}px ${style.textShadowColor}` : undefined,
    width: '100%',
    textAlign: style.textAlign ?? 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <div
      className="sc-widget"
      style={containerStyle}
      data-widget-id={widget.id}
      onPointerDown={interactive ? onPointerDownBody : undefined}
    >
      {content.imageUrl ? (
        <ResolvedImage
          src={content.imageUrl}
          alt={widget.label}
          size={256}
          style={{ width: '100%', height: '100%', objectFit: style.objectFit ?? 'contain' }}
        />
      ) : (
        <span style={textStyle}>{content.text ?? widget.label}</span>
      )}
      {overlay}
    </div>
  );
}
