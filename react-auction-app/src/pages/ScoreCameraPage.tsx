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
import type { LiveScore, MatchSetup, LiveBatsman } from '../types/scoring';
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

function ballChipColors(b: string): { bg: string; fg: string } {
  if (b === 'W') return { bg: '#dc2626', fg: '#ffffff' };
  if (b === '4') return { bg: '#2563eb', fg: '#ffffff' };
  if (b === '6') return { bg: '#7c3aed', fg: '#ffffff' };
  if (b === '0' || b === '·') return { bg: '#475569', fg: '#ffffff' };
  if (b.includes('WD') || b.includes('NB') || b.includes('B')) return { bg: '#f59e0b', fg: '#111827' };
  return { bg: '#10b981', fg: '#06281d' };
}

function drawLiveBadge(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, isRec: boolean, paused: boolean) {
  const w = 104 * u, h = 38 * u;
  ctx.fillStyle = isRec && !paused ? 'rgba(220,38,38,0.95)' : 'rgba(15,23,42,0.85)';
  roundRectPath(ctx, x, y, w, h, 9 * u);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 19 * u, y + h / 2, 7 * u, 0, Math.PI * 2);
  ctx.fillStyle = isRec && !paused ? '#ffffff' : '#ef4444';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${20 * u}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(isRec ? (paused ? 'PAUSE' : 'REC') : 'LIVE', x + 34 * u, y + h / 2 + u);
}

/** Draws the broadcast-style score ticker directly onto the recording canvas. */
function drawScoreTicker(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  live: LiveScore | null,
  match: MatchSetup | null,
  pos: TickerPosition,
  isRec: boolean,
  paused: boolean,
) {
  const u = W / 1280;
  const font = (weight: number, size: number) =>
    `${weight} ${size * u}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;

  // LIVE / REC badge — always top-left
  drawLiveBadge(ctx, 24 * u, 24 * u, u, isRec, paused);

  // Match title — top-center
  if (match) {
    const title = `${shortName(match.teamA?.name)} v ${shortName(match.teamB?.name)}`;
    ctx.font = font(700, 24);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(title).width + 44 * u;
    ctx.fillStyle = 'rgba(8,12,24,0.6)';
    roundRectPath(ctx, W / 2 - tw / 2, 22 * u, tw, 40 * u, 10 * u);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, W / 2, 42 * u + u);
    ctx.textAlign = 'left';
  }

  const barH = 150 * u;
  const x0 = 24 * u;
  const innerW = W - 48 * u;
  const y0 = pos === 'bottom' ? H - barH - 24 * u : 80 * u;

  if (!live) {
    const hintH = 84 * u;
    const hy = pos === 'bottom' ? H - hintH - 24 * u : 80 * u;
    ctx.fillStyle = 'rgba(8,12,24,0.7)';
    roundRectPath(ctx, x0, hy, innerW, hintH, 14 * u);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = font(600, 26);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Waiting for live score…  open this page with ?matchId=…', 44 * u, hy + hintH / 2);
    return;
  }

  const isA = live.battingTeamId === match?.teamA?.id;
  const battingName = isA ? match?.teamA?.name : match?.teamB?.name;
  const color = (isA ? match?.teamA?.primaryColor : match?.teamB?.primaryColor) || '#2563eb';
  const short = shortName(battingName) || 'BAT';

  // Panel
  ctx.fillStyle = 'rgba(8,12,24,0.82)';
  roundRectPath(ctx, x0, y0, innerW, barH, 16 * u);
  ctx.fill();
  ctx.fillStyle = color;
  roundRectPath(ctx, x0, y0, innerW, 6 * u, 3 * u);
  ctx.fill();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // ── Top row ──
  const yTop = y0 + barH * 0.36;
  let x = x0 + 24 * u;
  ctx.fillStyle = color;
  roundRectPath(ctx, x, yTop - 18 * u, 12 * u, 36 * u, 3 * u);
  ctx.fill();
  x += 26 * u;

  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 32);
  ctx.fillText(short, x, yTop);
  x += ctx.measureText(short).width + 18 * u;

  ctx.fillStyle = '#fbbf24';
  ctx.font = font(800, 44);
  const scoreTxt = `${live.runs}/${live.wickets}`;
  ctx.fillText(scoreTxt, x, yTop);
  x += ctx.measureText(scoreTxt).width + 14 * u;

  ctx.fillStyle = '#cbd5e1';
  ctx.font = font(600, 26);
  ctx.fillText(`(${live.overs} ov)`, x, yTop);

  // Right-aligned rates on the top row
  ctx.textAlign = 'right';
  let xr = x0 + innerW - 24 * u;
  if (live.currentInnings === 2 && live.target != null) {
    const need = Math.max(0, live.target - live.runs);
    ctx.fillStyle = '#fca5a5';
    ctx.font = font(700, 24);
    const needTxt = `Need ${need}`;
    ctx.fillText(needTxt, xr, yTop);
    xr -= ctx.measureText(needTxt).width + 22 * u;
  }
  if (live.currentInnings === 2 && live.requiredRate != null) {
    ctx.fillStyle = '#fdba74';
    ctx.font = font(700, 24);
    const rrr = `RRR ${live.requiredRate.toFixed(2)}`;
    ctx.fillText(rrr, xr, yTop);
    xr -= ctx.measureText(rrr).width + 22 * u;
  }
  ctx.fillStyle = '#93c5fd';
  ctx.font = font(700, 24);
  ctx.fillText(`CRR ${(live.runRate ?? 0).toFixed(2)}`, xr, yTop);
  ctx.textAlign = 'left';

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = Math.max(1, u);
  ctx.beginPath();
  ctx.moveTo(x0 + 24 * u, y0 + barH * 0.54);
  ctx.lineTo(x0 + innerW - 24 * u, y0 + barH * 0.54);
  ctx.stroke();

  // ── Bottom row: batsmen (left) + bowler (right) ──
  const yBot = y0 + barH * 0.76;
  let xb = x0 + 24 * u;
  const batsmen = live.currentBatsmen ?? [];
  const drawBatsman = (b?: LiveBatsman) => {
    if (!b) return;
    const onStrike = !!b.isOnStrike;
    ctx.font = font(onStrike ? 700 : 500, 24);
    ctx.fillStyle = onStrike ? '#fde68a' : '#e2e8f0';
    const txt = `${onStrike ? '● ' : ''}${b.playerName || 'Batter'} ${b.runs}(${b.balls})`;
    ctx.fillText(txt, xb, yBot);
    xb += ctx.measureText(txt).width + 26 * u;
  };
  drawBatsman(batsmen[0]);
  drawBatsman(batsmen[1]);

  const bowler = live.currentBowler;
  if (bowler) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#bae6fd';
    ctx.font = font(600, 24);
    const bTxt = `${bowler.playerName}  ${bowler.overs}-${bowler.maidens}-${bowler.runs}-${bowler.wickets}`;
    ctx.fillText(bTxt, x0 + innerW - 24 * u, yBot);
    ctx.textAlign = 'left';
  }

  // This-over chips — centered on the bottom row
  const balls = live.currentOverBalls ?? [];
  if (balls.length) {
    const chipR = 13 * u;
    const gap = 8 * u;
    const totalW = balls.length * (chipR * 2 + gap);
    let cx = W / 2 - totalW / 2 + chipR;
    const cy = yBot;
    for (const ball of balls) {
      const { bg, fg } = ballChipColors(ball);
      ctx.beginPath();
      ctx.arc(cx, cy, chipR, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.font = font(700, 14);
      ctx.textAlign = 'center';
      ctx.fillText(ball, cx, cy + u);
      ctx.textAlign = 'left';
      cx += chipR * 2 + gap;
    }
  }
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
          drawScoreTicker(ctx, W, H, liveRef.current, matchRef.current, tickerPosRef.current, recordingRef.current, pausedRef.current);
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
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      mediaStreamRef.current = stream;
      facingRef.current = mode;
      setFacing(mode);

      const video = videoElRef.current!;
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      const track = stream.getVideoTracks()[0];
      const s = track?.getSettings?.() ?? {};
      const cw = (s.width as number) || video.videoWidth || 1280;
      const ch = (s.height as number) || video.videoHeight || 720;
      const canvas = canvasRef.current!;
      canvas.width = cw;
      canvas.height = ch;

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
      const options: MediaRecorderOptions = { videoBitsPerSecond: 6_000_000 };
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

      {/* Top bar */}
      <div className="score-cam__topbar">
        <button className="score-cam__icon-btn" onClick={() => navigate('/cricket/scorer/admin')} title="Back">
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
                <IoShareSocialOutline size={18} /> Save / Share
              </button>
              <button className="score-cam__action" onClick={downloadRecording}>
                <IoDownloadOutline size={18} /> Download
              </button>
              <button className="score-cam__action" onClick={discardRecording}>
                <IoRefresh size={18} /> Record again
              </button>
            </div>
            <p className="score-cam__result-note">
              Saved as .{fileExt}. On iPhone, use “Save / Share” → Save Video to add it to Photos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
