// ============================================================================
// CUSTOM SCORECARD CANVAS — mirrors a ScorecardLayout onto a 2D canvas so the
// Camera Recorder can burn the exact same design the OBS overlay shows. Both
// surfaces read the same ScorecardLayout + resolve widget content through the
// same scorecardDataBinding helpers, so they never drift out of sync.
// ============================================================================

import { getImg, roundRectPath } from './broadcastCanvas';
import { resolveWidgetContent, resolveWidgetVariant, type ScorecardDataContext } from './scorecardDataBinding';
import type { ScorecardLayout, ScorecardWidgetInstance } from '../types/scorecardDesigner';

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, layout: ScorecardLayout): void {
  if (!layout.backgroundImageUrl) return;
  const img = getImg(layout.backgroundImageUrl);
  if (!img) return;
  const geometry = layout.backgroundGeometry ?? { xPct: 0, yPct: 0, wPct: 100, hPct: 100, rotationDeg: 0, zoom: 1 };
  const x = (geometry.xPct / 100) * W;
  const y = (geometry.yPct / 100) * H;
  const w = (geometry.wPct / 100) * W;
  const h = (geometry.hPct / 100) * H;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const imageRatio = (img.naturalWidth || 1) / (img.naturalHeight || 1);
  const boxRatio = w / Math.max(h, 1);
  let drawW = w;
  let drawH = h;
  if (imageRatio > boxRatio) drawW = h * imageRatio;
  else drawH = w / imageRatio;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((geometry.rotationDeg * Math.PI) / 180);
  ctx.scale(geometry.zoom, geometry.zoom);
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

function fontString(weight: number | undefined, size: number | undefined, family?: string): string {
  return `${weight ?? 700} ${size ?? 22}px '${family || 'Inter'}', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
}

function playerSlotGlyph(value: string): string {
  switch (value) {
    case 'person': case '👤': return '👤';
    case 'people': case '👥': return '👥';
    case 'kabaddi': case 'kabaddi-mascot': case '🤼': return '🤼';
    case 'raider': case 'running': case '🏃': return '🏃';
    case 'defender': return '🛡';
    case 'tackle': return '✊';
    case 'raid-target': return '◎';
    case 'red-marker': case '🔴': return '●';
    case 'blue-marker': case '🔵': return '●';
    default: return '👥';
  }
}

function drawWidget(
  ctx: CanvasRenderingContext2D, W: number, H: number, widget: ScorecardWidgetInstance, dataCtx: ScorecardDataContext,
) {
  if (!widget.visible) return;
  const content = resolveWidgetContent(widget, dataCtx);
  if (content.hidden) return;

  const { geometry, style } = widget;
  const x = (geometry.xPct / 100) * W;
  const y = (geometry.yPct / 100) * H;
  const w = (geometry.wPct / 100) * W;
  const h = (geometry.hPct / 100) * H;
  ctx.save();
  ctx.globalAlpha = style.opacity ?? 1;
  const cx = x + w / 2, cy = y + h / 2;
  if (geometry.rotationDeg) {
    ctx.translate(cx, cy);
    ctx.rotate((geometry.rotationDeg * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  const zoom = style.zoom ?? 1;
  if (zoom !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
  }
  if (style.flipX || style.flipY) {
    ctx.translate(cx, cy);
    ctx.scale(style.flipX ? -1 : 1, style.flipY ? -1 : 1);
    ctx.translate(-cx, -cy);
  }

  if (style.boxShadowEnabled) {
    ctx.shadowColor = style.boxShadowColor || 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = style.boxShadowBlur ?? 12;
  }

  if (style.backgroundColor && style.backgroundColor !== 'transparent') {
    roundRectPath(ctx, x, y, w, h, style.borderRadius ?? 0);
    ctx.fillStyle = style.backgroundColor;
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  if (style.borderWidth) {
    roundRectPath(ctx, x, y, w, h, style.borderRadius ?? 0);
    ctx.lineWidth = style.borderWidth;
    ctx.strokeStyle = style.borderColor || '#ffffff';
    ctx.stroke();
  }

  const pad = style.padding ?? 0;
  const contentScale = style.contentScale ?? 1;
  if (contentScale !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(contentScale, contentScale);
    ctx.translate(-cx, -cy);
  }

  if (content.playerSlots?.length) {
    ctx.font = fontString(style.fontWeight, style.fontSize, style.fontFamily);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const slotSize = Math.max(12, style.iconSize ?? style.fontSize ?? 28);
    const slotGap = style.iconGap ?? 6;
    content.playerSlots.forEach((slot, index) => {
      ctx.globalAlpha = (style.opacity ?? 1) * (slot.active ? 1 : 0.28);
      ctx.fillStyle = slot.active ? (style.color || '#ffffff') : '#94a3b8';
      ctx.fillText(playerSlotGlyph(slot.icon), x + pad + index * (slotSize + slotGap), y + h / 2);
    });
    ctx.globalAlpha = style.opacity ?? 1;
  } else if (content.items?.length) {
    ctx.font = fontString(style.fontWeight, style.fontSize, style.fontFamily);
    ctx.textBaseline = 'middle';
    ctx.textAlign = (style.textAlign as CanvasTextAlign) || 'left';
    if (style.textShadowEnabled) {
      ctx.shadowColor = style.textShadowColor || 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = style.textShadowBlur ?? 6;
    }
    ctx.fillStyle = style.color || '#ffffff';
    const rowH = Math.max(20, (style.fontSize ?? 22) * 1.5);
    const textX = style.textAlign === 'right' ? x + w - pad : x + pad;
    let rowY = y + pad + rowH / 2;
    for (const item of content.items) {
      if (rowY > y + h - pad) break;
      const text = style.textTransform === 'uppercase' ? item.text.toUpperCase() : item.text;
      ctx.fillText(text, textX, rowY, w - pad * 2);
      rowY += rowH;
    }
    ctx.shadowBlur = 0;
  } else if (content.imageUrl) {
    const img = getImg(content.imageUrl);
    if (img) {
      const boxW = w - pad * 2, boxH = h - pad * 2;
      const ar = (img.naturalWidth || 1) / (img.naturalHeight || 1);
      let dw = boxW, dh = boxW / ar;
      if (style.objectFit === 'cover') {
        dh = boxH; dw = boxH * ar;
        if (dw < boxW) { dw = boxW; dh = boxW / ar; }
      } else if (dh > boxH) {
        dh = boxH; dw = boxH * ar;
      }
      ctx.drawImage(img, x + pad + (boxW - dw) / 2, y + pad + (boxH - dh) / 2, dw, dh);
    }
  } else if (content.text) {
    ctx.font = fontString(content.urgent ? Math.max(800, style.fontWeight ?? 700) : style.fontWeight, content.urgent ? (style.fontSize ?? 22) * 1.12 : style.fontSize, style.fontFamily);
    ctx.textBaseline = 'middle';
    ctx.textAlign = (style.textAlign as CanvasTextAlign) || 'center';
    if (style.textShadowEnabled) {
      ctx.shadowColor = style.textShadowColor || 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = style.textShadowBlur ?? 6;
    }
    ctx.fillStyle = content.urgent ? '#ef4444' : (style.color || '#ffffff');
    const textX = style.textAlign === 'left' ? x + pad : style.textAlign === 'right' ? x + w - pad : x + w / 2;
    const text = style.textTransform === 'uppercase' ? content.text.toUpperCase() : content.text;
    ctx.fillText(text, textX, y + h / 2, w - pad * 2);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

/** Draws every visible widget of a layout, sorted by z-index, mirroring the DOM renderer 1:1. */
export function drawScorecardLayout(
  ctx: CanvasRenderingContext2D, W: number, H: number, layout: ScorecardLayout, dataCtx: ScorecardDataContext,
): void {
  const viewportId = H > W ? 'mobile-portrait' : W < 900 ? 'mobile-landscape' : W < 1400 ? 'tablet-landscape' : W < 1750 ? 'desktop-small' : 'desktop-hd';
  const variant = layout.viewportVariants?.[viewportId];
  const effectiveLayout = variant ? {
    ...layout,
    backgroundGeometry: variant.backgroundGeometry ?? layout.backgroundGeometry,
    widgets: layout.widgets.map(widget => ({
      ...widget,
      geometry: variant.widgets[widget.id] ? { ...widget.geometry, ...variant.widgets[widget.id] } : widget.geometry,
    })),
  } : layout;
  drawBackground(ctx, W, H, effectiveLayout);
  const sorted = [...effectiveLayout.widgets].sort((a, b) => a.geometry.zIndex - b.geometry.zIndex);
  const renderCtx = effectiveLayout.freezePartnerLogo && effectiveLayout.frozenPartnerLogoUrl
    ? { ...dataCtx, branding: { ...dataCtx.branding, partnerLogo: layout.frozenPartnerLogoUrl } }
    : dataCtx;
  for (const widget of sorted) drawWidget(ctx, W, H, resolveWidgetVariant(widget, renderCtx), renderCtx);
}

/** Pre-warms the image cache for every image-bearing widget so the first drawn frame isn't blank. */
export function preloadScorecardLayoutImages(layout: ScorecardLayout, dataCtx: ScorecardDataContext): void {
  for (const widget of layout.widgets) {
    const content = resolveWidgetContent(widget, dataCtx);
    if (content.imageUrl) getImg(content.imageUrl);
    content.items?.forEach(item => { if (item.imageUrl) getImg(item.imageUrl); });
  }
  if (layout.backgroundImageUrl) getImg(layout.backgroundImageUrl);
}
