// ============================================================================
// CUSTOM SCORECARD CANVAS — mirrors a ScorecardLayout onto a 2D canvas so the
// Camera Recorder can burn the exact same design the OBS overlay shows. Both
// surfaces read the same ScorecardLayout + resolve widget content through the
// same scorecardDataBinding helpers, so they never drift out of sync.
// ============================================================================

import { getImg, roundRectPath } from './broadcastCanvas';
import { resolveWidgetContent, type ScorecardDataContext } from './scorecardDataBinding';
import type { ScorecardLayout, ScorecardWidgetInstance } from '../types/scorecardDesigner';

function fontString(weight: number | undefined, size: number | undefined): string {
  return `${weight ?? 700} ${size ?? 22}px 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
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
  const isImageKind = widget.kind === 'team_a_logo' || widget.kind === 'team_b_logo'
    || widget.kind === 'custom_image' || widget.kind === 'tournament_logo' || widget.kind === 'partner_logo';

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

  if (style.boxShadowEnabled) {
    ctx.shadowColor = style.boxShadowColor || 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = style.boxShadowBlur ?? 12;
  }

  if (!isImageKind && style.backgroundColor && style.backgroundColor !== 'transparent') {
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

  if (content.items?.length) {
    ctx.font = fontString(style.fontWeight, style.fontSize);
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
    ctx.font = fontString(style.fontWeight, style.fontSize);
    ctx.textBaseline = 'middle';
    ctx.textAlign = (style.textAlign as CanvasTextAlign) || 'center';
    if (style.textShadowEnabled) {
      ctx.shadowColor = style.textShadowColor || 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = style.textShadowBlur ?? 6;
    }
    ctx.fillStyle = style.color || '#ffffff';
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
  const sorted = [...layout.widgets].sort((a, b) => a.geometry.zIndex - b.geometry.zIndex);
  for (const widget of sorted) drawWidget(ctx, W, H, widget, dataCtx);
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
