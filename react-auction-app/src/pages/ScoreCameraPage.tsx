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
import { ref, onValue } from 'firebase/database';
import {
  IoVideocam, IoStop, IoPause, IoPlay, IoCameraReverse,
  IoArrowBack, IoDownloadOutline, IoShareSocialOutline, IoRefresh,
  IoMic, IoMicOff, IoTabletLandscape, IoWifi,
} from 'react-icons/io5';
import { tenantPath } from '../services/tenantPath';
import { useTenantNavigate as useNavigate } from '../hooks/useTenantNavigate';
import { broadcastDb } from '../services/camera/broadcastDb';
import { multiCamService } from '../services/camera/multiCamService';
import type { LiveScore, MatchSetup, ScoringOverlayConfig, OverlayControlState, MatchLineup, TickerDesign } from '../types/scoring';
import {
  drawScoreTicker, drawCelebration, resolveCeleb, getImg,
  type CelebType, type TickerPosition,
} from '../utils/broadcastCanvas';
import './ScoreCameraPage.css';

// ── Firebase: shared broadcast app (zero-delay reads, same source as OBS) ────
const camDb = broadcastDb;

type CanvasWithCapture = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  const playerImagesRef = useRef<Record<string, string>>({});
  const tickerDesignRef = useRef<TickerDesign | undefined>(undefined);
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
  const [tickerDesign, setTickerDesign] = useState<TickerDesign | undefined>(undefined);
  const [showTicker, setShowTicker] = useState(true);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [mimeType] = useState(pickMimeType);
  const [shareSupported] = useState(() => typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: unknown }).share === 'function');
  const [startingStep, setStartingStep] = useState('');
  // Multi-camera sharing — publishes this phone's feed to the host device
  const [sharing, setSharing] = useState(false);
  const [shareState, setShareState] = useState<RTCPeerConnectionState | 'idle'>('idle');
  const [camName, setCamName] = useState(() => localStorage.getItem('scoreCam.name') || `Cam ${Math.floor(Math.random() * 90 + 10)}`);
  const shareHandleRef = useRef<{ replaceVideoTrack: (t: MediaStreamTrack) => Promise<void>; stop: () => Promise<void> } | null>(null);
  const sourceIdRef = useRef<string>(localStorage.getItem('scoreCam.sourceId') || `cam_${Math.random().toString(36).slice(2, 9)}`);
  // PWA install prompt (Android Chrome fires `beforeinstallprompt`)
  const installPromptRef = useRef<(Event & { prompt?: () => void }) | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOS] = useState(() => /iphone|ipad|ipod/i.test(navigator.userAgent));
  const [isStandalone] = useState(() => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const [showInstallHint, setShowInstallHint] = useState(false);

  // PWA install prompt effect — Android Chrome/Edge fire `beforeinstallprompt`
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      installPromptRef.current = e as Event & { prompt?: () => void };
      if (!isStandalone) setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isStandalone]);

  const triggerInstall = useCallback(async () => {
    const p = installPromptRef.current;
    if (p?.prompt) { await p.prompt(); }
    setShowInstallBanner(false);
  }, []);

  useEffect(() => { liveRef.current = live; }, [live]);
  useEffect(() => { matchRef.current = match; }, [match]);
  useEffect(() => { facingRef.current = facing; }, [facing]);
  useEffect(() => { showTickerRef.current = showTicker; }, [showTicker]);
  useEffect(() => { tickerPosRef.current = tickerPos; }, [tickerPos]);
  useEffect(() => { tickerDesignRef.current = tickerDesign; }, [tickerDesign]);
  useEffect(() => { recordingRef.current = recording; }, [recording]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { includeAudioRef.current = includeAudio; }, [includeAudio]);

  // Read matchId from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('matchId');
    if (id) setMatchId(id);
    if (params.get('share') === '1') setSharing(true);
  }, []);

  useEffect(() => { localStorage.setItem('scoreCam.sourceId', sourceIdRef.current); }, []);
  useEffect(() => { localStorage.setItem('scoreCam.name', camName); }, [camName]);

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
    // Player portraits for the premium ticker — lineups first, auction roster as fallback
    unsubs.push(onValue(ref(camDb, `${base}/matches/${matchId}/lineups`), snap => {
      if (!snap.exists()) return;
      const data = snap.val() as Record<string, MatchLineup>;
      const map = { ...playerImagesRef.current };
      for (const lineup of Object.values(data)) {
        for (const p of lineup?.players || []) {
          if (p.imageUrl) map[p.playerId] = p.imageUrl;
        }
      }
      playerImagesRef.current = map;
    }));
    unsubs.push(onValue(ref(camDb, tenantPath('auction/adminPlayers')), snap => {
      if (!snap.exists()) return;
      const data = snap.val() as Record<string, { id: string; imageUrl?: string }>;
      const map = { ...playerImagesRef.current };
      for (const p of Object.values(data)) {
        if (p.imageUrl && !map[p.id]) map[p.id] = p.imageUrl;
      }
      playerImagesRef.current = map;
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
          drawScoreTicker(ctx, W, H, {
            live: liveRef.current,
            match: matchRef.current,
            config: overlayConfigRef.current,
            position: tickerPosRef.current,
            playerImages: playerImagesRef.current,
            designOverride: tickerDesignRef.current,
          });
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
    setStartingStep('');
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('unsupported');
      }
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());

      // Cascade: try 1080p → 720p → bare constraints so all phones work
      const videoConstraintSets = [
        { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        { facingMode: { ideal: mode } },
      ];
      let stream: MediaStream | null = null;
      let lastErr: Error | null = null;
      for (const vc of videoConstraintSets) {
        try {
          setStartingStep(stream === null && vc === videoConstraintSets[0] ? 'Requesting camera permission…' : 'Trying lower resolution…');
          stream = await navigator.mediaDevices.getUserMedia({
            video: vc,
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          break;
        } catch (e) {
          lastErr = e as Error;
          const n = (e as Error).name;
          // Permission denied — no point retrying lower res
          if (n === 'NotAllowedError' || n === 'SecurityError') throw e;
          // OverconstrainedError / NotFoundError / etc → try next tier
        }
      }
      if (!stream) {
        // Last resort: video-only (iOS PWA sometimes rejects audio+video)
        try {
          setStartingStep('Trying without microphone…');
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: mode } } });
        } catch (e2) {
          throw lastErr ?? (e2 as Error);
        }
      }

      mediaStreamRef.current = stream;
      facingRef.current = mode;
      setFacing(mode);

      setStartingStep('Opening camera preview…');
      const video = videoElRef.current!;
      video.srcObject = stream;
      video.muted = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');

      // Wait for metadata then play — `video.play()` alone can hang on iOS Safari.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => resolve(), 5000); // safety net after 5 s
        video.onloadedmetadata = () => {
          clearTimeout(timeout);
          video.play().then(resolve).catch(err => {
            // AbortError is benign on iOS when srcObject is set late
            if ((err as Error).name === 'AbortError') resolve();
            else reject(err);
          });
        };
        // If metadata already loaded (srcObject set on a re-use)
        if (video.readyState >= 1 && video.videoWidth > 0) {
          clearTimeout(timeout);
          video.play().then(resolve).catch(err => {
            if ((err as Error).name === 'AbortError') resolve();
            else reject(err);
          });
        }
      });

      setStartingStep('Preparing recorder…');
      // Fixed 1080p landscape recording canvas regardless of the device sensor orientation.
      const canvas = canvasRef.current!;
      canvas.width = 1920;
      canvas.height = 1080;

      void enterImmersive();
      setCameraReady(true);
      setStartingStep('');
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(drawFrame);
    } catch (e) {
      const n = (e as Error).name || '';
      if (n === 'NotAllowedError' || n === 'SecurityError') {
        setError('Camera permission was denied. Please allow camera & microphone access in your browser settings, then try again.');
      } else if (n === 'NotFoundError' || n === 'DevicesNotFoundError') {
        setError('No camera found on this device.');
      } else if ((e as Error).message === 'unsupported') {
        setError('Your browser does not support camera access. Please use Chrome, Safari 14+, or Firefox.');
      } else {
        setError('Unable to start camera. Ensure you are on HTTPS and have granted camera + microphone permissions.');
      }
      setCameraReady(false);
    } finally {
      setStarting(false);
      setStartingStep('');
    }
  }, [drawFrame]);

  const switchCamera = useCallback(() => {
    if (!cameraReady) return;
    startCamera(facing === 'environment' ? 'user' : 'environment');
  }, [cameraReady, facing, startCamera]);

  // ── Share this angle to the multi-camera host ───────────────────────────
  const stopSharing = useCallback(async () => {
    const handle = shareHandleRef.current;
    shareHandleRef.current = null;
    setShareState('idle');
    if (handle) { try { await handle.stop(); } catch { /* ignore */ } }
  }, []);

  useEffect(() => {
    if (!sharing || !matchId || !cameraReady) return;
    let cancelled = false;
    const stream = mediaStreamRef.current;
    if (!stream) return;

    multiCamService.initialize(camDb, tenantPath('scoring'));
    setShareState('connecting');
    multiCamService
      .publish(matchId, { id: sourceIdRef.current, name: camName, facing }, stream, s => setShareState(s))
      .then(handle => {
        if (cancelled) { void handle.stop(); return; }
        shareHandleRef.current = handle;
      })
      .catch(() => { if (!cancelled) { setShareState('failed'); setError('Could not connect to the host device.'); } });

    return () => { cancelled = true; };
    // Re-publishing on camera flip is handled by replaceVideoTrack below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, matchId, cameraReady]);

  useEffect(() => {
    if (!sharing) void stopSharing();
  }, [sharing, stopSharing]);

  // Keep the published feed pointed at the currently selected lens.
  useEffect(() => {
    const handle = shareHandleRef.current;
    const track = mediaStreamRef.current?.getVideoTracks()[0];
    if (handle && track) void handle.replaceVideoTrack(track);
  }, [facing, cameraReady]);

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
      void shareHandleRef.current?.stop();
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
          {/* Loading spinner — shown while starting */}
          {starting ? (
            <>
              <div className="score-cam__spinner" />
              <p className="score-cam__loading-text">{startingStep || 'Starting camera…'}</p>
              <p className="score-cam__loading-sub">This may take a few seconds.<br />Allow camera &amp; microphone when prompted.</p>
            </>
          ) : (
            <>
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
                Start Camera
              </button>
              <div className="score-cam__rotate-hint">
                <IoTabletLandscape size={16} /> Rotate to landscape for best results
              </div>

              <label className="score-cam__cam-name">
                <span>Camera name (shown on the host)</span>
                <input value={camName} onChange={e => setCamName(e.target.value)} maxLength={24} />
              </label>

              {/* PWA install — Android */}
              {showInstallBanner && !isStandalone && (
                <div className="score-cam__install-banner">
                  <div className="score-cam__install-text">
                    <strong>Install as app</strong>
                    <span>Add to home screen for the best native camera experience</span>
                  </div>
                  <button className="score-cam__install-btn" onClick={triggerInstall}>Install</button>
                  <button className="score-cam__install-dismiss" onClick={() => setShowInstallBanner(false)}>✕</button>
                </div>
              )}

              {/* iOS install hint */}
              {isIOS && !isStandalone && (
                <button className="score-cam__ios-hint" onClick={() => setShowInstallHint(v => !v)}>
                  📲 Install as iPhone app
                </button>
              )}
              {isIOS && !isStandalone && showInstallHint && (
                <div className="score-cam__ios-steps">
                  <p>To install on iPhone / iPad:</p>
                  <ol>
                    <li>Tap the <strong>Share</strong> button <span className="score-cam__share-icon">⎙</span> at the bottom of Safari</li>
                    <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                    <li>Tap <strong>Add</strong> — the app icon will appear on your home screen</li>
                  </ol>
                  <p className="score-cam__ios-note">Works offline once installed. Opens full-screen like a native app.</p>
                </div>
              )}
            </>
          )}
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
              className="score-cam__chip"
              onClick={() => setTickerDesign(d => (d === 'premium' ? 'glass' : 'premium'))}
              title="Switch between the glass and premium OBS ticker designs"
            >
              Style: {(tickerDesign || overlayConfigRef.current?.tickerConfig?.design || 'glass') === 'premium' ? 'Premium' : 'Glass'}
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
            <button
              className={`score-cam__chip ${sharing ? 'score-cam__chip--on' : ''}`}
              onClick={() => setSharing(v => !v)}
              disabled={!matchId}
              title={matchId ? 'Send this angle to the multi-camera host' : 'Open with a matchId to share'}
            >
              <IoWifi size={15} />
              {sharing ? ` ${shareState === 'connected' ? 'On Air' : 'Linking…'}` : ' Share to host'}
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
