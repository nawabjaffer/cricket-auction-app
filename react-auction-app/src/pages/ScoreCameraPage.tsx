// ============================================================================
// SCORE CAMERA PAGE — /:tenantSlug/cricket/scorer/camera?matchId=xxx
//
// Mobile-first camera recorder (works as an installable PWA on iOS & Android).
// Films the match with the device camera and BURNS the live score ticker into
// the recorded video using a canvas-compositing pipeline:
//
//   hidden <video> (camera)  ─┐
//                             ├─► <canvas> draw loop (video + live ticker)
//   Firebase live score ─────┘            │
//                                         ▼
//                          canvas.captureStream() + mic audio
//                                         │
//                                         ▼
//                                   MediaRecorder → .mp4/.webm saved on device
//
// Because the ticker is drawn every animation frame from the latest Firebase
// score, the score on the recording updates live exactly as the scorer scores.
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import {
  IoVideocam, IoStop, IoPause, IoPlay, IoCameraReverse,
  IoArrowBack, IoDownloadOutline, IoShareSocialOutline, IoRefresh,
  IoMic, IoMicOff, IoTabletLandscape,
} from 'react-icons/io5';
import { tenantPath } from '../services/tenantPath';
import { useTenantNavigate as useNavigate } from '../hooks/useTenantNavigate';
import type { LiveScore, MatchSetup, LiveBatsman, ScoringOverlayConfig, OverlayControlState, AnimationConfig } from '../types/scoring';
import './ScoreCameraPage.css';

// ── Firebase: dedicated named app (reuse OBS app for zero-delay reads) ───────
const FB_CONFIG = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
};
const APP_NAME = 'score-obs';
const camApp = getApps().find(a => a.name === APP_NAME) ?? initializeApp(FB_CONFIG, APP_NAME);
const camDb = getDatabase(camApp);

type CanvasWithCapture = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };
type TickerPosition = 'top' | 'bottom';

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortName(name?: string): string {
  if (!name) return '';
  const cleaned = name.trim();
  if (!cleaned) return '';
  const words = cleaned.split(/\s+/);
  if (words.length > 1) return words.map(w => w[0]).join('').slice(0, 4).toUpperCase();
  return cleaned.slice(0, 3).toUpperCase();
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    try { if (MediaRecorder.isTypeSupported(c)) return c; } catch { /* ignore */ }
  }
  return '';
}

function fmtClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ── Image cache (crossOrigin so logos/animations can be drawn into the recording) ──
const _imgCache = new Map<string, HTMLImageElement>();
const _imgFailed = new Set<string>();
function getImg(url?: string): HTMLImageElement | null {
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

function drawImageContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, boxW: number, boxH: number) {
  const ar = (img.naturalWidth || 1) / (img.naturalHeight || 1);
  let w = boxW, h = boxW / ar;
  if (h > boxH) { h = boxH; w = boxH * ar; }
  ctx.drawImage(img, x + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
}

/** Canvas font shorthand matching the OBS overlay (Inter). */
function f(weight: number, size: number): string {
  return `${weight} ${size}px 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
}

// Over-ball chip colors — matched to ScoreOBSOverlayPage.css
const BALL_BASE = { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.6)' };
function obsBallStyle(raw: string, dotSymbol: string): { bg: string; fg: string } {
  const b = (raw || '').toString().toUpperCase().trim();
  if (b.includes('WD') || b.includes('NB') || b.startsWith('B') || b.startsWith('LB') || b.includes('+')) {
    return { bg: 'rgba(245,158,11,0.25)', fg: '#fbbf24' };
  }
  if (b === 'W') return { bg: 'rgba(239,68,68,0.35)', fg: '#f87171' };
  if (b === '4') return { bg: 'rgba(59,130,246,0.3)', fg: '#60a5fa' };
  if (b === '6') return { bg: 'rgba(168,85,247,0.3)', fg: '#c084fc' };
  if (b === '0' || b === dotSymbol || b === '·' || b === '•') return { bg: 'rgba(113,113,122,0.3)', fg: '#71717a' };
  return BALL_BASE;
}

// ── Celebration animations (driven by the same Firebase overlay state) ───────
export type CelebType = 'boundary_four' | 'boundary_six' | 'wicket' | 'duck_out' | 'hat_trick';
const CELEB_META: Record<CelebType, { big: string; text: string; color: string }> = {
  boundary_four: { big: '4', text: 'FOUR!', color: '#22c55e' },
  boundary_six: { big: '6', text: 'MAXIMUM!', color: '#8b5cf6' },
  wicket: { big: 'W', text: 'WICKET!', color: '#ef4444' },
  duck_out: { big: '0', text: 'DUCK!', color: '#f59e0b' },
  hat_trick: { big: '\u2605', text: 'HAT-TRICK!', color: '#a855f7' },
};

function resolveCeleb(config: ScoringOverlayConfig | null, type: CelebType): {
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

/** Full-screen celebration drawn on the recording canvas (image asset or styled text). */
function drawCelebration(ctx: CanvasRenderingContext2D, W: number, H: number, type: CelebType, config: ScoringOverlayConfig | null, progress: number) {
  const { imageUrl, text, color, big } = resolveCeleb(config, type);
  const inT = 0.16, outT = 0.8;
  let alpha = 1, scale = 1;
  if (progress < inT) { const k = progress / inT; alpha = k; scale = 0.7 + 0.3 * (1 - Math.pow(1 - k, 3)); }
  else if (progress > outT) { const k = (progress - outT) / (1 - outT); alpha = 1 - k; scale = 1 + 0.06 * k; }
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

/** Rounded glass panel matching .score-obs__score-strip. */
function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(15,15,30,0.92)');
  g.addColorStop(1, 'rgba(30,30,60,0.92)');
  ctx.fillStyle = g;
  roundRectPath(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, x, y, w, h, 16);
  ctx.stroke();
}

// ── Fullscreen + landscape orientation (best-effort; iOS Safari may ignore) ──
async function enterImmersive() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try { if (el.requestFullscreen) await el.requestFullscreen(); else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen(); } catch { /* ignore */ }
  try { await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape'); } catch { /* ignore */ }
}
function exitImmersive() {
  try { (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.(); } catch { /* ignore */ }
  try { if (document.fullscreenElement) void document.exitFullscreen?.(); } catch { /* ignore */ }
}

/** Top-bar branding (tournament logo + name, LIVE badge, broadcast-partner logo) — matches ScoreOBSOverlayPage. */
function drawTopBar(ctx: CanvasRenderingContext2D, W: number, config: ScoringOverlayConfig | null) {
  // Tournament / franchise logo + name (top-left)
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

  // LIVE badge + partner logo (top-right)
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

/** Draws the broadcast score ticker (OBS-overlay parity) onto the 1920×1080 recording canvas. */
function drawScoreTicker(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  live: LiveScore | null,
  match: MatchSetup | null,
  config: ScoringOverlayConfig | null,
  pos: TickerPosition,
) {
  drawTopBar(ctx, W, config);

  const dotSymbol = config?.tickerConfig?.dotBallSymbol || '0';
  const stripH = 76;
  const padX = 24, gap = 16, dividerPad = 16;

  if (!live || !match) {
    const hint = 'Waiting for live score…';
    ctx.font = f(600, 26);
    const w = Math.max(480, ctx.measureText(hint).width + 64);
    const x0 = (W - w) / 2;
    const y0 = pos === 'bottom' ? H - 30 - 64 : 110;
    drawPanel(ctx, x0, y0, w, 64);
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hint, W / 2, y0 + 32);
    return;
  }

  const isA = live.battingTeamId === match.teamA?.id;
  const battingName = isA ? match.teamA?.name : match.teamB?.name;
  const battingLogoUrl = isA ? match.teamA?.logoUrl : match.teamB?.logoUrl;
  const teamColor = (isA ? match.teamA?.primaryColor : match.teamB?.primaryColor) || '#2563eb';
  const short = shortName(battingName) || 'BAT';
  const scoreTxt = `${live.runs}/${live.wickets}`;
  const oversTxt = `(${live.overs})`;
  const crrTxt = `CRR ${(live.runRate ?? 0).toFixed(2)}`;
  const rrrTxt = live.currentInnings === 2 && live.requiredRate != null ? `RRR ${live.requiredRate.toFixed(2)}` : '';
  const bats = live.currentBatsmen ?? [];
  const batTxt = (b?: LiveBatsman) => (b ? `${b.isOnStrike ? '\u25cf ' : ''}${b.playerName || 'Batter'} ${b.runs}(${b.balls})` : '');
  const bat1 = batTxt(bats[0]);
  const bat2 = batTxt(bats[1]);
  const balls = (live.currentOverBalls && live.currentOverBalls.length ? live.currentOverBalls : live.lastCompletedOverBalls) ?? [];

  // ── Measure segment widths ──
  const logoBox = battingLogoUrl ? 32 : 0;
  ctx.font = f(700, 16); const shortW = ctx.measureText(short).width;
  const teamW = (logoBox ? logoBox + 8 : 0) + shortW;
  ctx.font = f(900, 36); const runsW = ctx.measureText(scoreTxt).width;
  ctx.font = f(500, 16); const oversW = ctx.measureText(oversTxt).width;
  const scoreW = runsW + 6 + oversW;
  ctx.font = f(600, 12);
  const metaW = Math.max(ctx.measureText(crrTxt).width, rrrTxt ? ctx.measureText(rrrTxt).width : 0);
  ctx.font = f(600, 13);
  const batW = Math.max(bat1 ? ctx.measureText(bat1).width : 0, bat2 ? ctx.measureText(bat2).width : 0);
  const ballsW = balls.length ? balls.length * 26 + (balls.length - 1) * 6 : 0;

  const segs = [teamW, scoreW, metaW, batW, ballsW].filter(w => w > 0);
  const content = segs.reduce((a, b) => a + b, 0) + gap * (segs.length - 1) + padX * 2;
  const stripW = Math.max(700, content);
  const x0 = (W - stripW) / 2;
  const y0 = pos === 'bottom' ? H - 30 - stripH : 110;
  const cy = y0 + stripH / 2;

  drawPanel(ctx, x0, y0, stripW, stripH);

  let x = x0 + padX;
  let first = true;
  const dividerAt = (xx: number) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xx, y0 + dividerPad);
    ctx.lineTo(xx, y0 + stripH - dividerPad);
    ctx.stroke();
  };
  const place = (w: number, draw: () => void) => {
    if (w <= 0) return;
    if (!first) { dividerAt(x + gap / 2); x += gap; }
    draw();
    x += w;
    first = false;
  };

  // Team logo + short name
  place(teamW, () => {
    let tx = x;
    if (logoBox) {
      const li = getImg(battingLogoUrl);
      if (li) {
        ctx.save();
        roundRectPath(ctx, tx, cy - 16, 32, 32, 6);
        ctx.clip();
        drawImageContain(ctx, li, tx, cy - 16, 32, 32);
        ctx.restore();
      } else {
        ctx.fillStyle = teamColor;
        roundRectPath(ctx, tx, cy - 16, 32, 32, 6);
        ctx.fill();
      }
      tx += 32 + 8;
    }
    ctx.font = f(700, 16);
    ctx.fillStyle = '#e4e4e7';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(short, tx, cy);
  });

  // Score + overs
  place(scoreW, () => {
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const baseline = cy + 13;
    ctx.font = f(900, 36);
    ctx.fillStyle = '#fafafa';
    ctx.fillText(scoreTxt, x, baseline);
    ctx.font = f(500, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(oversTxt, x + runsW + 6, baseline);
    ctx.textBaseline = 'middle';
  });

  // CRR / RRR
  place(metaW, () => {
    ctx.font = f(600, 12);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (rrrTxt) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(crrTxt, x, cy - 9);
      ctx.fillStyle = '#fdba74';
      ctx.fillText(rrrTxt, x, cy + 9);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(crrTxt, x, cy);
    }
  });

  // Batsmen mini-rows
  place(batW, () => {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (bat1) {
      const s = !!bats[0]?.isOnStrike;
      ctx.font = f(s ? 600 : 500, 13);
      ctx.fillStyle = s ? '#fbbf24' : 'rgba(255,255,255,0.7)';
      ctx.fillText(bat1, x, bat2 ? cy - 9 : cy);
    }
    if (bat2) {
      const s = !!bats[1]?.isOnStrike;
      ctx.font = f(s ? 600 : 500, 13);
      ctx.fillStyle = s ? '#fbbf24' : 'rgba(255,255,255,0.7)';
      ctx.fillText(bat2, x, cy + 9);
    }
  });

  // This-over ball chips
  place(ballsW, () => {
    let bx = x + 13;
    for (const ball of balls) {
      const label = String(ball);
      const { bg, fg } = obsBallStyle(label, dotSymbol);
      ctx.beginPath();
      ctx.arc(bx, cy, 13, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.font = f(700, 12);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx, cy + 1);
      bx += 26 + 6;
    }
    ctx.textAlign = 'left';
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScoreCameraPage() {
  const navigate = useNavigate();

  // DOM refs
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pipeline refs
  const rafRef = useRef<number>(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live-data refs (read inside the rAF draw loop to avoid stale closures)
  const liveRef = useRef<LiveScore | null>(null);
  const matchRef = useRef<MatchSetup | null>(null);
  const facingRef = useRef<'environment' | 'user'>('environment');
  const showTickerRef = useRef(true);
  const tickerPosRef = useRef<TickerPosition>('bottom');
  const recordingRef = useRef(false);
  const pausedRef = useRef(false);
  const includeAudioRef = useRef(true);
  const overlayConfigRef = useRef<ScoringOverlayConfig | null>(null);
  const animRef = useRef<{ type: CelebType; start: number; durationMs: number } | null>(null);
  const lastAnimTsRef = useRef<number>(0);

  // Timer refs
  const startTimeRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const pauseStartRef = useRef(0);

  // State
  const [matchId, setMatchId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveScore | null>(null);
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [tickerPos, setTickerPos] = useState<TickerPosition>('bottom');
  const [showTicker, setShowTicker] = useState(true);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [mimeType] = useState(pickMimeType);
  const [shareSupported] = useState(() => typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: unknown }).share === 'function');

  // Keep refs in sync with state
  useEffect(() => { liveRef.current = live; }, [live]);
  useEffect(() => { matchRef.current = match; }, [match]);
  useEffect(() => { facingRef.current = facing; }, [facing]);
  useEffect(() => { showTickerRef.current = showTicker; }, [showTicker]);
  useEffect(() => { tickerPosRef.current = tickerPos; }, [tickerPos]);
  useEffect(() => { recordingRef.current = recording; }, [recording]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { includeAudioRef.current = includeAudio; }, [includeAudio]);

  // Read matchId from URL
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('matchId');
    if (id) setMatchId(id);
  }, []);

  // Subscribe to Firebase live score + match setup
  useEffect(() => {
    if (!matchId) return;
    const base = tenantPath('scoring');
    const unsubs: Array<() => void> = [];
    unsubs.push(onValue(ref(camDb, `${base}/matches/${matchId}/setup`), snap => {
      if (snap.exists()) setMatch(snap.val());
    }));
    unsubs.push(onValue(ref(camDb, `${base}/matches/${matchId}/live`), snap => {
      if (snap.exists()) setLive(snap.val());
    }));
    // Branding (tournament/partner logos, badge, animation assets) — same source as OBS
    unsubs.push(onValue(ref(camDb, `${base}/overlayConfig`), snap => {
      overlayConfigRef.current = snap.exists() ? (snap.val() as ScoringOverlayConfig) : null;
    }));
    // Celebration triggers — fired by the scorer's overlay control (boundary/six/wicket/...)
    unsubs.push(onValue(ref(camDb, `${base}/matches/${matchId}/overlay`), snap => {
      if (!snap.exists()) return;
      const ctrl = snap.val() as OverlayControlState;
      const celebs: CelebType[] = ['boundary_four', 'boundary_six', 'wicket', 'duck_out', 'hat_trick'];
      const ts = ctrl.lastUpdated || 0;
      const type = ctrl.activeOverlay as CelebType;
      if (celebs.includes(type) && ts !== lastAnimTsRef.current && Date.now() - ts < 15000) {
        const { durationMs, imageUrl } = resolveCeleb(overlayConfigRef.current, type);
        if (imageUrl) getImg(imageUrl); // warm the image cache before drawing
        animRef.current = { type, start: performance.now(), durationMs };
      }
      lastAnimTsRef.current = ts;
    }));
    return () => { unsubs.forEach(u => u()); };
  }, [matchId]);

  // ── Draw loop ──────────────────────────────────────────────────────────────
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoElRef.current;
    if (canvas && video) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const W = canvas.width, H = canvas.height;
        if (video.readyState >= 2 && video.videoWidth) {
          const mirror = facingRef.current === 'user';
          const vw = video.videoWidth, vh = video.videoHeight;
          const scale = Math.max(W / vw, H / vh);
          const dw = vw * scale, dh = vh * scale;
          const dx = (W - dw) / 2, dy = (H - dh) / 2;
          if (mirror) { ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); }
          ctx.drawImage(video, dx, dy, dw, dh);
          if (mirror) ctx.restore();
        } else {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, W, H);
        }
        if (showTickerRef.current) {
          drawScoreTicker(ctx, W, H, liveRef.current, matchRef.current, overlayConfigRef.current, tickerPosRef.current);
        }
        const anim = animRef.current;
        if (anim) {
          const dt = performance.now() - anim.start;
          if (dt >= anim.durationMs) animRef.current = null;
          else drawCelebration(ctx, W, H, anim.type, overlayConfigRef.current, dt / anim.durationMs);
        }
      }
    }
    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  // ── Camera ───────────────────────────────────────────────────────────────
  const startCamera = useCallback(async (mode: 'environment' | 'user') => {
    setError('');
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('unsupported');
      }
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 }, height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      mediaStreamRef.current = stream;
      facingRef.current = mode;
      setFacing(mode);

      const video = videoElRef.current!;
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      // Fixed 1080p landscape recording canvas regardless of the device sensor orientation.
      const canvas = canvasRef.current!;
      canvas.width = 1920;
      canvas.height = 1080;

      void enterImmersive();
      setCameraReady(true);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(drawFrame);
    } catch {
      setError('Unable to access the camera. Allow camera + microphone permissions, and make sure you are on HTTPS.');
      setCameraReady(false);
    } finally {
      setStarting(false);
    }
  }, [drawFrame]);

  const switchCamera = useCallback(() => {
    if (!cameraReady) return;
    startCamera(facing === 'environment' ? 'user' : 'environment');
  }, [cameraReady, facing, startCamera]);

  // ── Recording ───────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    const canvas = canvasRef.current as CanvasWithCapture | null;
    const ms = mediaStreamRef.current;
    if (!canvas?.captureStream || !ms) {
      setError('Recording is not supported on this browser.');
      return;
    }
    try {
      const canvasStream = canvas.captureStream(30);
      const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
      if (includeAudioRef.current) {
        const audio = ms.getAudioTracks()[0];
        if (audio) tracks.push(audio);
      }
      const recStream = new MediaStream(tracks);
      const options: MediaRecorderOptions = { videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 128_000 };
      if (mimeType) options.mimeType = mimeType;

      const recorder = new MediaRecorder(recStream, options);
      chunksRef.current = [];
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
      };
      recorder.start(1000);
      recorderRef.current = recorder;

      startTimeRef.current = Date.now();
      pausedAccumRef.current = 0;
      pauseStartRef.current = 0;
      setElapsed(0);
      setRecording(true);
      setPaused(false);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        if (pauseStartRef.current) return;
        setElapsed(Date.now() - startTimeRef.current - pausedAccumRef.current);
      }, 250);
    } catch {
      setError('Recording failed to start on this device.');
    }
  }, [mimeType]);

  const togglePause = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording' && typeof rec.pause === 'function') {
      rec.pause();
      pauseStartRef.current = Date.now();
      setPaused(true);
    } else if (rec.state === 'paused' && typeof rec.resume === 'function') {
      rec.resume();
      pausedAccumRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = 0;
      setPaused(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    setPaused(false);
  }, []);

  // ── Save / share ──────────────────────────────────────────────────────────
  const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';

  const downloadRecording = useCallback(() => {
    if (!recordedUrl) return;
    const a = document.createElement('a');
    a.href = recordedUrl;
    a.download = `match-${matchId || 'clip'}-${Date.now()}.${fileExt}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [recordedUrl, matchId, fileExt]);

  const shareRecording = useCallback(async () => {
    if (!recordedBlob) return;
    const file = new File([recordedBlob], `match-${Date.now()}.${fileExt}`, { type: recordedBlob.type });
    const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title: 'Match clip' }); return; } catch { /* fall through */ }
    }
    downloadRecording();
  }, [recordedBlob, fileExt, downloadRecording]);

  const discardRecording = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedBlob(null);
    setElapsed(0);
  }, [recordedUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      try { recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop(); } catch { /* ignore */ }
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      exitImmersive();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = match ? `${match.teamA?.name ?? 'Team A'} vs ${match.teamB?.name ?? 'Team B'}` : 'Match Camera';

  return (
    <div className="score-cam">
      {/* Hidden camera feed — drawn onto the canvas each frame */}
      <video ref={videoElRef} className="score-cam__src" playsInline muted autoPlay />

      {/* Composited preview = exactly what gets recorded */}
      <canvas ref={canvasRef} className="score-cam__canvas" />

      {/* Top bar — hidden while recording so the burned-in branding shows cleanly */}
      {!recording && (
        <div className="score-cam__topbar">
          <button className="score-cam__icon-btn" onClick={() => { exitImmersive(); navigate('/cricket/scorer/admin'); }} title="Back">
            <IoArrowBack size={22} />
          </button>
          <div className="score-cam__title">{title}</div>
          <button
            className="score-cam__icon-btn"
            onClick={switchCamera}
            disabled={!cameraReady || recording}
            title="Switch camera"
          >
            <IoCameraReverse size={22} />
          </button>
        </div>
      )}

      {/* Recording clock */}
      {recording && (
        <div className={`score-cam__clock ${paused ? 'score-cam__clock--paused' : ''}`}>
          <span className="score-cam__clock-dot" />
          {paused ? 'Paused' : 'REC'} {fmtClock(elapsed)}
        </div>
      )}

      {/* Center prompt before camera starts */}
      {!cameraReady && (
        <div className="score-cam__center">
          <IoVideocam size={56} color="#fbbf24" />
          <h1>Match Camera Recorder</h1>
          <p>Film the match and record with the live score ticker burned into the video.</p>
          {!matchId && (
            <p className="score-cam__hint">
              Tip: open this page from the Scoring Admin so the live ticker can attach to a match.
            </p>
          )}
          {error && <p className="score-cam__error">{error}</p>}
          <button className="score-cam__start" onClick={() => startCamera('environment')} disabled={starting}>
            {starting ? 'Starting…' : 'Start Camera'}
          </button>
          <div className="score-cam__rotate-hint">
            <IoTabletLandscape size={16} /> Rotate to landscape for best results
          </div>
        </div>
      )}

      {/* Bottom controls */}
      {cameraReady && !recordedUrl && (
        <div className="score-cam__controls">
          <div className="score-cam__toggles">
            <button
              className={`score-cam__chip ${showTicker ? 'score-cam__chip--on' : ''}`}
              onClick={() => setShowTicker(v => !v)}
            >
              {showTicker ? 'Ticker On' : 'Ticker Off'}
            </button>
            <button
              className="score-cam__chip"
              onClick={() => setTickerPos(p => (p === 'bottom' ? 'top' : 'bottom'))}
            >
              Ticker: {tickerPos === 'bottom' ? 'Bottom' : 'Top'}
            </button>
            <button
              className={`score-cam__chip ${includeAudio ? 'score-cam__chip--on' : ''}`}
              onClick={() => setIncludeAudio(v => !v)}
              disabled={recording}
              title="Record microphone audio"
            >
              {includeAudio ? <IoMic size={15} /> : <IoMicOff size={15} />}
              {includeAudio ? ' Audio' : ' Muted'}
            </button>
          </div>

          <div className="score-cam__buttons">
            {!recording ? (
              <button className="score-cam__rec" onClick={startRecording} title="Start recording">
                <IoVideocam size={26} />
              </button>
            ) : (
              <>
                <button className="score-cam__ctrl" onClick={togglePause} title={paused ? 'Resume' : 'Pause'}>
                  {paused ? <IoPlay size={24} /> : <IoPause size={24} />}
                </button>
                <button className="score-cam__stop" onClick={stopRecording} title="Stop">
                  <IoStop size={28} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Result panel */}
      {recordedUrl && (
        <div className="score-cam__result">
          <div className="score-cam__result-card">
            <h2>Recording ready</h2>
            <video className="score-cam__playback" src={recordedUrl} controls playsInline />
            <div className="score-cam__result-actions">
              <button className="score-cam__action score-cam__action--primary" onClick={shareRecording}>
                <IoShareSocialOutline size={18} /> Save to Phone
              </button>
              <button className="score-cam__action" onClick={discardRecording}>
                <IoRefresh size={18} /> Record again
              </button>
              {!shareSupported && (
                <button className="score-cam__action" onClick={downloadRecording}>
                  <IoDownloadOutline size={18} /> Download
                </button>
              )}
            </div>
            <p className="score-cam__result-note">
              Tap <strong>Save to Phone</strong> → <em>Save Video</em> to store the {fileExt.toUpperCase()} clip in your gallery.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
