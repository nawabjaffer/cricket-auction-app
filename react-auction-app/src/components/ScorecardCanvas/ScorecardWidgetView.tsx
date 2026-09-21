// ============================================================================
// SCORECARD WIDGET VIEW — renders one ScorecardWidgetInstance as an absolutely
// positioned DOM element inside a relatively-positioned ScorecardLayoutView.
// Shared by the Designer (edit mode, wrapped with drag/resize handles) and the
// live OBS overlay (read-only render) — same markup, same styling either way.
// ============================================================================

import type { CSSProperties, ReactNode } from 'react';
import { motion, type Variants } from 'framer-motion';
import { ResolvedImage } from '../ResolvedImage';
import type { ScorecardWidgetInstance, WidgetEntranceAnimation } from '../../types/scorecardDesigner';
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

/** Entrance transform for each animation preset — combined with a plain opacity fade. */
function entranceOffset(anim: WidgetEntranceAnimation): { x?: number; y?: number; scale?: number } {
  switch (anim) {
    case 'slide-up': return { y: 40 };
    case 'slide-down': return { y: -40 };
    case 'slide-left': return { x: 40 };
    case 'slide-right': return { x: -40 };
    case 'zoom-in': return { scale: 0.5 };
    case 'bounce': return { scale: 0.3 };
    default: return {};
  }
}

export function ScorecardWidgetView({ widget, content, selected, interactive, overlay, onPointerDownBody }: Readonly<ScorecardWidgetViewProps>) {
  if (!widget.visible) return null;
  if (content.hidden && !interactive) return null;

  const { geometry, style } = widget;
  const isImageKind = widget.kind === 'team_a_logo' || widget.kind === 'team_b_logo'
    || widget.kind === 'custom_image' || widget.kind === 'tournament_logo' || widget.kind === 'partner_logo';
  const zoom = style.zoom ?? 1;
  const anim = style.entranceAnimation ?? 'none';

  const containerStyle: CSSProperties = {
    position: 'absolute',
    left: `${geometry.xPct}%`,
    top: `${geometry.yPct}%`,
    width: `${geometry.wPct}%`,
    height: `${geometry.hPct}%`,
    transform: `rotate(${geometry.rotationDeg}deg) scale(${zoom})`,
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
    flexDirection: content.items ? 'column' : 'row',
    alignItems: content.items ? 'stretch' : 'center',
    justifyContent: style.textAlign === 'left' ? 'flex-start' : style.textAlign === 'right' ? 'flex-end' : 'center',
    boxSizing: 'border-box',
    overflowY: content.items ? 'auto' : undefined,
    gap: content.items ? 6 : undefined,
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
    whiteSpace: content.items ? 'normal' : 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  // Designer edit mode never animates (would fight with dragging); the live overlay always plays the preset.
  const offset = entranceOffset(anim);
  const variants: Variants = {
    hidden: { opacity: anim === 'none' ? 1 : 0, x: offset.x, y: offset.y, scale: offset.scale },
    shown: {
      opacity: 1, x: 0, y: 0, scale: 1,
      transition: anim === 'bounce'
        ? { type: 'spring', bounce: 0.55, duration: (style.animationDurationMs ?? 600) / 1000, delay: (style.animationDelayMs ?? 0) / 1000 }
        : { duration: (style.animationDurationMs ?? 600) / 1000, delay: (style.animationDelayMs ?? 0) / 1000, ease: 'easeOut' },
    },
  };

  const body = content.items ? (
    content.items.map((item, i) => (
      <span key={`${item.text}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {item.imageUrl && (
          <span style={{ width: '1.6em', height: '1.6em', borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
            <ResolvedImage src={item.imageUrl} size={64} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </span>
        )}
        <span style={textStyle}>{item.text}</span>
      </span>
    ))
  ) : content.imageUrl ? (
    <ResolvedImage
      src={content.imageUrl}
      alt={widget.label}
      size={256}
      style={{ width: '100%', height: '100%', objectFit: style.objectFit ?? 'contain' }}
    />
  ) : (
    <span style={textStyle}>{content.text ?? widget.label}</span>
  );

  return (
    <motion.div
      className="sc-widget"
      style={containerStyle}
      data-widget-id={widget.id}
      onPointerDown={interactive ? onPointerDownBody : undefined}
      initial={interactive ? 'shown' : 'hidden'}
      animate="shown"
      variants={variants}
    >
      {body}
      {overlay}
    </motion.div>
  );
}
