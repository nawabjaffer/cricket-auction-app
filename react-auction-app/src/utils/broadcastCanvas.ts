// ============================================================================
// BROADCAST CANVAS — shared 2D drawing primitives + cricket score ticker
//
// Renders the same broadcast look as ScoreOBSOverlayPage (glass & premium
// ticker designs) onto a 2D canvas so it can be burned into a recording or
// composited into the multi-camera host view.
// ============================================================================

import type {
  LiveScore, MatchSetup, ScoringOverlayConfig, AnimationConfig,
  TickerStatWidget, TickerDesign, TickerInfoMode,
} from '../types/scoring';

export type TickerPosition = 'top' | 'bottom';

// ── Text helpers ─────────────────────────────────────────────────────────────

/** Canvas font shorthand matching the OBS overlay (Inter). */
export function f(weight: number, size: number): string {
  return `${weight} ${size}px 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
}

/** Mirrors tickerName() in ScoreOBSOverlayPage — progressive shortening. */
export function tickerName(rawName: string, maxChars = 14): string {
  const name = (rawName || '').trim().replace(/\s+/g, ' ');
  if (!name) return '—';
  if (name.length <= maxChars) return name.toUpperCase();
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].toUpperCase();
  const first = parts[0];
  const lastInitial = parts.at(-1)!.charAt(0);
  const withInitial = `${first} ${lastInitial}`;
  if (withInitial.length <= maxChars) return withInitial.toUpperCase();
  return first.toUpperCase();
}

/** Mirrors tickerSurname() in ScoreOBSOverlayPage — prefer the surname. */
export function tickerSurname(rawName: string, maxChars = 12): string {
  const name = (rawName || '').trim().replace(/\s+/g, ' ');
  if (!name) return '—';
  const parts = name.split(' ').filter(Boolean);
  const surname = parts.length > 1 ? parts.at(-1)! : parts[0];
  if (surname.length <= maxChars) return surname.toUpperCase();
  return tickerName(name, maxChars);
}

export function shortCode(name?: string): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return '';
  return cleaned.slice(0, 3).toUpperCase();
}

// ── Shape helpers ────────────────────────────────────────────────────────────

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ── Image cache (crossOrigin so remote logos can be drawn into a recording) ──

const _imgCache = new Map<string, HTMLImageElement>();
const _imgFailed = new Set<string>();

export function getImg(url?: string): HTMLImageElement | null {
  if (!url || _imgFailed.has(url)) return null;
  const hit = _imgCache.get(url);
  if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => { _imgFailed.add(url); _imgCache.delete(url); };
  img.src = url;
  _imgCache.set(url, img);
  return null;
}

export function drawImageContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, boxW: number, boxH: number) {
  const ar = (img.naturalWidth || 1) / (img.naturalHeight || 1);
  let w = boxW, h = boxW / ar;
  if (h > boxH) { h = boxH; w = boxH * ar; }
  ctx.drawImage(img, x + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
}

/** Cover-fit an image inside a circle (player portraits). */
export function drawImageCircle(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, radius: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  const ar = (img.naturalWidth || 1) / (img.naturalHeight || 1);
  const box = radius * 2;
  let w = box, h = box / ar;
  if (h < box) { h = box; w = box * ar; }
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

/** Portrait with fallback initial, matching the OBS circular avatars. */
function drawPortrait(
  ctx: CanvasRenderingContext2D,
  url: string | undefined,
  cx: number, cy: number, radius: number,
  ringColor: string, fallbackText: string,
) {
  const img = getImg(url);
  if (img) {
    drawImageCircle(ctx, img, cx, cy, radius);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = f(800, radius);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((fallbackText || '?').charAt(0).toUpperCase(), cx, cy + 1);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

/** Team logo tile with a short-code fallback. */
function drawTeamTile(
  ctx: CanvasRenderingContext2D,
  url: string | undefined, label: string,
  x: number, y: number, size: number,
) {
  ctx.save();
  roundRectPath(ctx, x, y, size, size, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const img = getImg(url);
  if (img) {
    ctx.save();
    roundRectPath(ctx, x + 6, y + 6, size - 12, size - 12, 10);
    ctx.clip();
    drawImageContain(ctx, img, x + 6, y + 6, size - 12, size - 12);
    ctx.restore();
  } else {
    ctx.fillStyle = '#e4e4e7';
    ctx.font = f(800, size * 0.3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shortCode(label), x + size / 2, y + size / 2);
  }
  ctx.restore();
}

// ── Ball chips — colors matched to ScoreOBSOverlayPage.css ───────────────────

const BALL_BASE = { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.6)' };

export function ballChipStyle(raw: string, dotSymbol: string): { bg: string; fg: string } {
  const b = (raw || '').toString().toUpperCase().trim();
  if (!b) return { bg: 'rgba(255,255,255,0.05)', fg: 'rgba(255,255,255,0.25)' };
  if (b.includes('WD') || b.includes('NB') || b.startsWith('B') || b.startsWith('LB') || b.includes('+')) {
    return { bg: 'rgba(245,158,11,0.25)', fg: '#fbbf24' };
  }
  if (b === 'W') return { bg: 'rgba(239,68,68,0.35)', fg: '#f87171' };
  if (b === '4') return { bg: 'rgba(59,130,246,0.3)', fg: '#60a5fa' };
  if (b === '6') return { bg: 'rgba(168,85,247,0.3)', fg: '#c084fc' };
  if (b === '0' || b === dotSymbol || b === '·' || b === '•') return { bg: 'rgba(113,113,122,0.3)', fg: '#71717a' };
  return BALL_BASE;
}

/** Balls of the current over, falling back to the last completed over. */
function ballsToShow(live: LiveScore): string[] {
  const current = live.currentOverBalls || [];
  return current.length > 0 ? current : (live.lastCompletedOverBalls || []);
}

function drawBallChips(
  ctx: CanvasRenderingContext2D,
  balls: string[], dotSymbol: string,
  x: number, cy: number, radius: number, gap: number,
) {
  const count = Math.max(6, balls.length);
  let bx = x + radius;
  for (let i = 0; i < count; i++) {
    const raw = balls[i] ?? '';
    const label = raw === '0' ? dotSymbol : raw;
    const { bg, fg } = ballChipStyle(raw, dotSymbol);
    ctx.beginPath();
    ctx.arc(bx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    if (label) {
      ctx.fillStyle = fg;
      ctx.font = f(700, radius * 0.92);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx, cy + 1);
    }
    bx += radius * 2 + gap;
  }
}

function ballChipsWidth(balls: string[], radius: number, gap: number): number {
  const count = Math.max(6, balls.length);
  return count * radius * 2 + (count - 1) * gap;
}

// ── Celebration animations ───────────────────────────────────────────────────

export type CelebType = 'boundary_four' | 'boundary_six' | 'wicket' | 'duck_out' | 'hat_trick';

const CELEB_META: Record<CelebType, { big: string; text: string; color: string }> = {
  boundary_four: { big: '4', text: 'FOUR!', color: '#22c55e' },
  boundary_six: { big: '6', text: 'MAXIMUM!', color: '#8b5cf6' },
  wicket: { big: 'W', text: 'WICKET!', color: '#ef4444' },
  duck_out: { big: '0', text: 'DUCK!', color: '#f59e0b' },
  hat_trick: { big: '\u2605', text: 'HAT-TRICK!', color: '#a855f7' },
};

export function resolveCeleb(config: ScoringOverlayConfig | null, type: CelebType): {
  imageUrl?: string; text: string; color: string; big: string; durationMs: number;
} {
  const meta = CELEB_META[type];
  const acMap: Record<CelebType, AnimationConfig | undefined> = {
    boundary_four: config?.fourAnimation,
    boundary_six: config?.sixAnimation,
    wicket: config?.wicketAnimation,
    duck_out: config?.duckOutAnimation,
    hat_trick: config?.hatTrickAnimation,
  };
  const legacyMap: Partial<Record<CelebType, string | undefined>> = {
    wicket: config?.wicketImageUrl,
    duck_out: config?.duckOutImageUrl,
    hat_trick: config?.hatTrickImageUrl,
  };
  const defaultDur: Record<CelebType, number> = {
    boundary_four: 3000, boundary_six: 4000, wicket: 4000, duck_out: 5000, hat_trick: 8000,
  };
  const ac = acMap[type];
  const url = ac?.mediaUrl || legacyMap[type];
  const isImg = !!url && /\.(png|gif|jpe?g|webp|svg)(\?|$)/i.test(url);
  return {
    imageUrl: isImg ? url : undefined,
    text: ac?.text || meta.text,
    color: ac?.color || meta.color,
    big: meta.big,
    durationMs: ac?.durationMs || defaultDur[type],
  };
}

/** Full-screen celebration drawn on the canvas (image asset or styled text). */
export function drawCelebration(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  type: CelebType, config: ScoringOverlayConfig | null, progress: number,
) {
  const { imageUrl, text, color, big } = resolveCeleb(config, type);
  const inT = 0.16, outT = 0.8;
  let alpha = 1, scale = 1;
  if (progress < inT) {
    const k = progress / inT;
    alpha = k;
    scale = 0.7 + 0.3 * (1 - Math.pow(1 - k, 3));
  } else if (progress > outT) {
    const k = (progress - outT) / (1 - outT);
    alpha = 1 - k;
    scale = 1 + 0.06 * k;
  }
  alpha = Math.max(0, Math.min(1, alpha));

  ctx.save();
  ctx.globalAlpha = alpha * 0.25;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  const img = getImg(imageUrl);
  if (imageUrl && img) {
    const boxW = W * 0.6, boxH = H * 0.66;
    drawImageContain(ctx, img, -boxW / 2, -boxH / 2, boxW, boxH);
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 60;
    ctx.fillStyle = color;
    ctx.font = f(900, 320);
    ctx.fillText(big, 0, -40);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = f(800, 120);
    ctx.fillText(text, 0, 170);
  }
  ctx.restore();
}

// ── Top bar branding ─────────────────────────────────────────────────────────

/** Tournament logo + name, LIVE badge and broadcast-partner logo. */
export function drawTopBar(ctx: CanvasRenderingContext2D, W: number, config: ScoringOverlayConfig | null) {
  let lx = 20;
  const tl = getImg(config?.tournamentLogo);
  if (tl) { drawImageContain(ctx, tl, lx, 20, 130, 130); lx += 130 + 14; }
  if (config?.tournamentName) {
    ctx.font = f(700, 28);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(config.tournamentName, lx, tl ? 85 : 42);
    ctx.shadowBlur = 0;
  }

  let topRightY = 20;
  if (config?.showLiveBadge !== false) {
    ctx.font = f(800, 22);
    ctx.textBaseline = 'middle';
    const txt = '\u25cf LIVE';
    const bw = ctx.measureText(txt).width + 28;
    const bx = W - 20 - bw, by = 20, bh = 36;
    ctx.fillStyle = 'rgba(239,68,68,0.9)';
    roundRectPath(ctx, bx, by, bw, bh, 7);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(txt, bx + 14, by + bh / 2 + 1);
    topRightY = by + bh + 8;
  }
  const pl = getImg(config?.broadcastPartnerLogo);
  if (pl) {
    const px = W - 20 - 130;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    roundRectPath(ctx, px, topRightY, 130, 130, 8);
    ctx.fill();
    drawImageContain(ctx, pl, px + 8, topRightY + 8, 114, 114);
  }
}

// ── Ticker panels ────────────────────────────────────────────────────────────

function drawGlassPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 18) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(15,15,30,0.92)');
  g.addColorStop(1, 'rgba(30,30,60,0.92)');
  ctx.fillStyle = g;
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.stroke();
}

function drawPremiumPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 18) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(24,16,48,0.96)');
  g.addColorStop(0.5, 'rgba(46,26,86,0.96)');
  g.addColorStop(1, 'rgba(24,16,48,0.96)');
  ctx.fillStyle = g;
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251,191,36,0.45)';
  ctx.lineWidth = 2;
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.stroke();
}

function drawDivider(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();
}

function drawPowerplayBadge(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const w = 46, h = 26;
  ctx.fillStyle = 'rgba(34,197,94,0.9)';
  roundRectPath(ctx, x - w, y, w, h, 8);
  ctx.fill();
  ctx.fillStyle = '#062b12';
  ctx.font = f(800, 15);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PP', x - w / 2, y + h / 2 + 1);
}

// ── Stat widget pills (mirrors OBS widgetPills) ──────────────────────────────

interface WidgetPill { label: string; value: string }

function buildWidgetPills(
  live: LiveScore, match: MatchSetup, config: ScoringOverlayConfig | null, infoMode: TickerInfoMode,
): WidgetPill[] {
  const ticker = config?.tickerConfig;
  const ballsBowled = Math.floor(live.overs) * 6 + Math.round((live.overs % 1) * 10);
  const ballsRemaining = Math.max(0, (match.maxOvers || 20) * 6 - ballsBowled);
  const runsNeeded = live.target !== undefined ? Math.max(0, live.target - live.runs) : 0;
  const runRateText = Number.isFinite(live.runRate) ? live.runRate.toFixed(2) : '0.00';
  const requiredRateText = live.requiredRate !== undefined && Number.isFinite(live.requiredRate)
    ? live.requiredRate.toFixed(2)
    : undefined;
  const projectionRpos = (ticker?.projectionRpos && ticker.projectionRpos.length > 0 ? ticker.projectionRpos : [9, 12, 14])
    .filter(v => Number.isFinite(v) && v > 0)
    .slice(0, 6);

  const modes: TickerStatWidget[] = (ticker?.widgetModes && ticker.widgetModes.length > 0)
    ? ticker.widgetModes
    : (infoMode === 'target' ? ['chase'] : infoMode === 'projection' ? ['projection'] : ['run_rate']);

  const pills: WidgetPill[] = [];
  for (const mode of modes) {
    if (mode === 'run_rate') {
      const parts = [`CRR ${runRateText}`];
      if (requiredRateText) parts.push(`RRR ${requiredRateText}`);
      pills.push({ label: 'RUN RATE', value: parts.join('  |  ') });
    } else if (mode === 'projection') {
      const now = Math.round(live.runRate * live.overs);
      const alt = projectionRpos.map(r => `${r}RPO ${Math.round(r * live.overs)}`).join('  |  ');
      pills.push({ label: 'PROJECTION', value: `NOW ${now}${alt ? `  |  ${alt}` : ''}` });
    } else if (mode === 'chase' && live.currentInnings === 2 && live.target !== undefined) {
      pills.push({ label: 'CHASE', value: `${runsNeeded} RUNS  |  ${ballsRemaining} BALLS` });
    }
  }
  return pills;
}

function measurePill(ctx: CanvasRenderingContext2D, pill: WidgetPill): number {
  ctx.font = f(700, 13);
  const labelW = ctx.measureText(pill.label).width;
  ctx.font = f(700, 15);
  const valueW = ctx.measureText(pill.value).width;
  return Math.max(labelW, valueW) + 24;
}

function drawPill(ctx: CanvasRenderingContext2D, pill: WidgetPill, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRectPath(ctx, x, y, w, h, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251,191,36,0.28)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, x, y, w, h, 9);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = f(700, 13);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(pill.label, x + w / 2, y + h * 0.31);
  ctx.font = f(700, 15);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(pill.value, x + w / 2, y + h * 0.72);
}

// ── Public ticker renderer ───────────────────────────────────────────────────

export interface TickerRenderOptions {
  live: LiveScore | null;
  match: MatchSetup | null;
  config: ScoringOverlayConfig | null;
  position: TickerPosition;
  /** playerId → portrait URL (lineups + auction players). */
  playerImages?: Record<string, string>;
  /** Overrides config.tickerConfig.design when the operator picks one on device. */
  designOverride?: TickerDesign;
  /** Draw tournament branding / LIVE badge above the ticker. */
  withTopBar?: boolean;
}

/**
 * Draws the broadcast score ticker with OBS-overlay parity.
 * Supports both the `glass` and `premium` designs configured in Scoring Admin.
 */
export function drawScoreTicker(
  ctx: CanvasRenderingContext2D, W: number, H: number, opts: TickerRenderOptions,
) {
  const { live, match, config, position, playerImages = {}, designOverride, withTopBar = true } = opts;

  if (withTopBar) drawTopBar(ctx, W, config);

  if (!live || !match) {
    const hint = 'Waiting for live score…';
    ctx.font = f(600, 26);
    const w = Math.max(480, ctx.measureText(hint).width + 64);
    const x0 = (W - w) / 2;
    const y0 = position === 'bottom' ? H - 30 - 64 : 110;
    drawGlassPanel(ctx, x0, y0, w, 64);
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hint, W / 2, y0 + 32);
    return;
  }

  const design: TickerDesign = designOverride || config?.tickerConfig?.design || 'glass';
  if (design === 'premium') drawPremiumTicker(ctx, W, H, live, match, config, position, playerImages);
  else drawGlassTicker(ctx, W, H, live, match, config, position);
}

function resolveTeams(live: LiveScore, match: MatchSetup) {
  const battingIsA = live.battingTeamId === match.teamA?.id;
  return {
    battingName: (battingIsA ? match.teamA?.name : match.teamB?.name) || 'BATTING',
    bowlingName: (battingIsA ? match.teamB?.name : match.teamA?.name) || 'BOWLING',
    battingLogo: battingIsA ? match.teamA?.logoUrl : match.teamB?.logoUrl,
    bowlingLogo: battingIsA ? match.teamB?.logoUrl : match.teamA?.logoUrl,
  };
}

function resolveInfoMode(live: LiveScore, config: ScoringOverlayConfig | null): TickerInfoMode {
  const infoMode = config?.tickerConfig?.infoMode || 'batsmen';
  const hasTarget = live.currentInnings === 2 && live.target !== undefined;
  return infoMode === 'target' && !hasTarget ? 'batsmen' : infoMode;
}

// ── Premium design ───────────────────────────────────────────────────────────

function drawPremiumTicker(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  live: LiveScore, match: MatchSetup, config: ScoringOverlayConfig | null,
  position: TickerPosition, playerImages: Record<string, string>,
) {
  const dotSymbol = config?.tickerConfig?.dotBallSymbol || '0';
  const { battingName, bowlingName, battingLogo, bowlingLogo } = resolveTeams(live, match);
  const infoMode = resolveInfoMode(live, config);
  const pills = buildWidgetPills(live, match, config, infoMode);

  const stripH = 148;
  const padX = 22, gap = 20;
  const tile = 104;
  const portrait = 34;

  // ── Measure ──
  const matchupTxt = `${battingName.toUpperCase()}  vs  ${bowlingName.toUpperCase()}`;
  const scoreTxt = `${live.runs}-${live.wickets}`;
  const oversTxt = `(${live.overs} ov)`;
  ctx.font = f(700, 20); const matchupW = ctx.measureText(matchupTxt).width;
  ctx.font = f(900, 54); const scoreW = ctx.measureText(scoreTxt).width;
  ctx.font = f(500, 20); const oversW = ctx.measureText(oversTxt).width;
  const pillWidths = pills.map(p => measurePill(ctx, p));
  const pillsW = pillWidths.reduce((a, b) => a + b, 0) + Math.max(0, pills.length - 1) * 10;
  const scoreSectionW = Math.max(matchupW, scoreW + 10 + oversW, pillsW);

  const bats = live.currentBatsmen || [];
  const batW = 208;
  const batsSectionW = infoMode === 'batsmen' ? Math.max(1, bats.length) * batW + (bats.length - 1) * 8 : 300;

  const balls = ballsToShow(live);
  const chipR = 15, chipGap = 7;
  const chipsW = ballChipsWidth(balls, chipR, chipGap);
  ctx.font = f(800, 22);
  const bowlerFigures = `${live.currentBowler?.wickets ?? 0}-${live.currentBowler?.runs ?? 0} (${live.currentBowler?.overs ?? 0})`;
  const bowlerFiguresW = ctx.measureText(bowlerFigures).width;
  const goldSectionW = portrait * 2 + 14 + Math.max(chipsW, bowlerFiguresW, 150) + 28;

  const totalW = padX * 2 + tile + gap + scoreSectionW + gap + batsSectionW + gap + goldSectionW + gap + tile;
  const stripW = Math.min(W - 60, Math.max(1180, totalW));
  const x0 = (W - stripW) / 2;
  const y0 = position === 'bottom' ? H - 44 - stripH : 120;
  const cy = y0 + stripH / 2;

  drawPremiumPanel(ctx, x0, y0, stripW, stripH);

  // Gold accent rail along the bottom edge
  const rail = ctx.createLinearGradient(x0, 0, x0 + stripW, 0);
  rail.addColorStop(0, 'rgba(251,191,36,0)');
  rail.addColorStop(0.5, 'rgba(251,191,36,0.85)');
  rail.addColorStop(1, 'rgba(251,191,36,0)');
  ctx.fillStyle = rail;
  ctx.fillRect(x0 + 20, y0 + stripH - 4, stripW - 40, 3);

  let x = x0 + padX;

  // Batting team tile
  drawTeamTile(ctx, battingLogo, battingName, x, cy - tile / 2, tile);
  x += tile + gap;

  // Score section
  {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const topY = y0 + 30;
    ctx.font = f(700, 20);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(matchupTxt, x, topY);

    ctx.textBaseline = 'alphabetic';
    const scoreBaseline = topY + 46;
    ctx.font = f(900, 54);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(scoreTxt, x, scoreBaseline);
    ctx.font = f(500, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(oversTxt, x + scoreW + 10, scoreBaseline);
    if (live.currentInnings === 2) {
      ctx.font = f(800, 14);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('INN 2', x + scoreW + 10, scoreBaseline + 20);
    }
    ctx.textBaseline = 'middle';

    let px = x;
    const pillY = y0 + stripH - 46;
    pills.forEach((pill, i) => {
      drawPill(ctx, pill, px, pillY, pillWidths[i], 36);
      px += pillWidths[i] + 10;
    });
    x += scoreSectionW + gap;
  }

  drawDivider(ctx, x - gap / 2, y0 + 20, stripH - 40);

  // Batsmen portraits
  if (infoMode === 'batsmen') {
    for (const b of bats) {
      const cxP = x + portrait;
      drawPortrait(ctx, playerImages[b.playerId], cxP, cy, portrait, b.isOnStrike ? '#fbbf24' : 'rgba(255,255,255,0.25)', b.playerName);
      const tx = x + portrait * 2 + 12;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = f(700, 18);
      ctx.fillStyle = b.isOnStrike ? '#fbbf24' : '#e4e4e7';
      ctx.fillText(tickerName(b.playerName, 12), tx, cy - 16);
      ctx.font = f(900, 26);
      ctx.fillStyle = '#ffffff';
      const runsTxt = String(b.runs);
      ctx.fillText(runsTxt, tx, cy + 16);
      const runsW = ctx.measureText(runsTxt).width;
      ctx.font = f(500, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(`(${b.balls})`, tx + runsW + 7, cy + 16);
      x += batW + 8;
    }
    x += gap - 8;
  } else {
    const label = infoMode === 'target' ? 'TARGET' : 'PROJECTION';
    const ballsBowled = Math.floor(live.overs) * 6 + Math.round((live.overs % 1) * 10);
    const remaining = Math.max(0, (match.maxOvers || 20) * 6 - ballsBowled);
    const need = live.target !== undefined ? Math.max(0, live.target - live.runs) : 0;
    const value = infoMode === 'target'
      ? `NEED ${need} OFF ${remaining}`
      : `PROJ ${ballsBowled > 0 ? Math.round((live.runs / ballsBowled) * (match.maxOvers || 20) * 6) : '--'}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = f(700, 15);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(label, x, cy - 18);
    ctx.font = f(800, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(value, x, cy + 16);
    x += batsSectionW + gap;
  }

  drawDivider(ctx, x - gap / 2, y0 + 20, stripH - 40);

  // Gold bowler panel
  {
    const panelX = x - 8;
    const panelW = goldSectionW + 12;
    ctx.fillStyle = 'rgba(251,191,36,0.12)';
    roundRectPath(ctx, panelX, y0 + 14, panelW, stripH - 28, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251,191,36,0.4)';
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, panelX, y0 + 14, panelW, stripH - 28, 14);
    ctx.stroke();

    const bowler = live.currentBowler;
    const cxP = panelX + 16 + portrait;
    drawPortrait(ctx, playerImages[bowler?.playerId], cxP, cy, portrait, 'rgba(251,191,36,0.75)', bowler?.playerName || '?');

    const tx = cxP + portrait + 14;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = f(700, 17);
    ctx.fillStyle = '#fde68a';
    ctx.fillText(tickerName(bowler?.playerName || '', 14), tx, y0 + 42);
    ctx.font = f(800, 22);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(bowlerFigures, tx, y0 + 72);
    drawBallChips(ctx, balls, dotSymbol, tx, y0 + stripH - 38, chipR, chipGap);
    x = panelX + panelW + gap;
  }

  // Bowling team tile
  drawTeamTile(ctx, bowlingLogo, bowlingName, x0 + stripW - padX - tile, cy - tile / 2, tile);

  if (live.isPowerplay) drawPowerplayBadge(ctx, x0 + stripW - 14, y0 + 10);
}

// ── Glass design (default) ───────────────────────────────────────────────────

function drawGlassTicker(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  live: LiveScore, match: MatchSetup, config: ScoringOverlayConfig | null,
  position: TickerPosition,
) {
  const dotSymbol = config?.tickerConfig?.dotBallSymbol || '0';
  const { battingName, bowlingName, battingLogo, bowlingLogo } = resolveTeams(live, match);
  const infoMode = resolveInfoMode(live, config);

  const stripH = 112;
  const padX = 20, gap = 18, tile = 74;

  const bats = live.currentBatsmen || [];
  ctx.font = f(600, 19);
  const batNameW = Math.max(80, ...bats.map(b => ctx.measureText(tickerSurname(b.playerName)).width));
  const batsW = infoMode === 'batsmen' ? batNameW + 86 : 240;

  const scoreTxt = `${live.runs}-${live.wickets}`;
  ctx.font = f(900, 40); const scoreW = ctx.measureText(scoreTxt).width;
  ctx.font = f(600, 18); const oversW = ctx.measureText(String(live.overs)).width;
  const matchupTxt = `${shortCode(bowlingName)} v ${shortCode(battingName)}`;
  ctx.font = f(700, 15); const matchupW = ctx.measureText(matchupTxt).width;
  const rateTxt = `RUN RATE ${live.runRate}${live.requiredRate !== undefined ? ` · REQ ${live.requiredRate}` : ''}`;
  ctx.font = f(600, 13); const rateW = ctx.measureText(rateTxt).width;
  const centerW = Math.max(scoreW + 18 + oversW, matchupW, rateW) + 28;

  const balls = ballsToShow(live);
  const chipR = 13, chipGap = 6;
  const chipsW = ballChipsWidth(balls, chipR, chipGap);
  ctx.font = f(800, 20);
  const figuresTxt = `${live.currentBowler?.wickets ?? 0}-${live.currentBowler?.runs ?? 0} (${live.currentBowler?.overs ?? 0})`;
  const bowlerW = Math.max(chipsW, ctx.measureText(figuresTxt).width, 150);

  const totalW = padX * 2 + tile + gap + batsW + gap + centerW + gap + bowlerW + gap + tile;
  const stripW = Math.min(W - 60, Math.max(940, totalW));
  const x0 = (W - stripW) / 2;
  const y0 = position === 'bottom' ? H - 40 - stripH : 116;
  const cy = y0 + stripH / 2;

  drawGlassPanel(ctx, x0, y0, stripW, stripH);

  let x = x0 + padX;

  drawTeamTile(ctx, battingLogo, battingName, x, cy - tile / 2, tile);
  x += tile + gap;

  // Batsmen rows
  if (infoMode === 'batsmen') {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    bats.slice(0, 2).forEach((b, i) => {
      const rowY = bats.length > 1 ? (i === 0 ? cy - 20 : cy + 20) : cy;
      if (b.isOnStrike) {
        ctx.beginPath();
        ctx.arc(x + 6, rowY, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
      }
      ctx.font = f(b.isOnStrike ? 700 : 600, 19);
      ctx.fillStyle = b.isOnStrike ? '#fbbf24' : 'rgba(255,255,255,0.78)';
      ctx.fillText(tickerSurname(b.playerName), x + 20, rowY);
      ctx.font = f(800, 20);
      ctx.fillStyle = '#ffffff';
      const rTxt = String(b.runs);
      ctx.fillText(rTxt, x + 20 + batNameW + 12, rowY);
      ctx.font = f(500, 15);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(`(${b.balls})`, x + 20 + batNameW + 14 + ctx.measureText(rTxt).width + 10, rowY);
    });
    x += batsW + gap;
  } else {
    const ballsBowled = Math.floor(live.overs) * 6 + Math.round((live.overs % 1) * 10);
    const remaining = Math.max(0, (match.maxOvers || 20) * 6 - ballsBowled);
    const need = live.target !== undefined ? Math.max(0, live.target - live.runs) : 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = f(700, 14);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(infoMode === 'target' ? 'TARGET' : 'PROJECTION', x, cy - 18);
    ctx.font = f(800, 24);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(
      infoMode === 'target'
        ? `NEED ${need} OFF ${remaining}`
        : `PROJ ${ballsBowled > 0 ? Math.round((live.runs / ballsBowled) * (match.maxOvers || 20) * 6) : '--'}`,
      x, cy + 14,
    );
    x += batsW + gap;
  }

  drawDivider(ctx, x - gap / 2, y0 + 16, stripH - 32);

  // Center score pill
  {
    const pillX = x;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRectPath(ctx, pillX - 8, y0 + 12, centerW + 16, stripH - 24, 12);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const midX = pillX + centerW / 2;
    ctx.font = f(700, 15);
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.fillText(matchupTxt, midX, y0 + 26);

    ctx.textBaseline = 'alphabetic';
    ctx.font = f(900, 40);
    ctx.fillStyle = '#ffffff';
    const baseline = cy + 12;
    const groupW = scoreW + 12 + oversW;
    const startX = midX - groupW / 2;
    ctx.textAlign = 'left';
    ctx.fillText(scoreTxt, startX, baseline);
    ctx.font = f(600, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(String(live.overs), startX + scoreW + 12, baseline);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = f(600, 13);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(rateTxt, midX, y0 + stripH - 22);
    x += centerW + gap;
  }

  drawDivider(ctx, x - gap / 2, y0 + 16, stripH - 32);

  // Bowler + this over
  {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = f(600, 17);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText(tickerSurname(live.currentBowler?.playerName || ''), x, y0 + 30);
    ctx.font = f(800, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(figuresTxt, x, y0 + 58);
    drawBallChips(ctx, balls, dotSymbol, x, y0 + stripH - 30, chipR, chipGap);
  }

  drawTeamTile(ctx, bowlingLogo, bowlingName, x0 + stripW - padX - tile, cy - tile / 2, tile);

  if (live.isPowerplay) drawPowerplayBadge(ctx, x0 + stripW - 12, y0 + 8);
}
