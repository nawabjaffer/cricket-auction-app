// ============================================================================
// SCORE CAMERA HOST — /:tenantSlug/cricket/scorer/camera/host?matchId=xxx
//
// Production device for a multi-camera shoot. Every phone running the camera
// page in "share" mode appears here as a live angle; the host picks which one
// is on air, and the program feed is composited with the same broadcast ticker
// used by the OBS overlay, then recorded locally.
//
// The on-air choice is stored in RTDB, so the scorer can switch angles from
// the scoring screen while they score.
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { ref, onValue } from 'firebase/database';
import {
  IoArrowBack, IoVideocam, IoStop, IoRadioButtonOn, IoDownloadOutline,
  IoRefresh, IoWifi, IoCopyOutline, IoCheckmarkCircle,
} from 'react-icons/io5';
import { tenantPath } from '../services/tenantPath';
import { useTenantNavigate as useNavigate, getTenantSlugFromPath } from '../hooks/useTenantNavigate';
import { broadcastDb } from '../services/camera/broadcastDb';
import { multiCamService, SOURCE_STALE_MS, type CameraSource } from '../services/camera/multiCamService';
import { drawScoreTicker, drawCelebration, resolveCeleb, getImg, type CelebType, type TickerPosition } from '../utils/broadcastCanvas';
import type {
  LiveScore, MatchSetup, ScoringOverlayConfig, OverlayControlState, MatchLineup, TickerDesign,
} from '../types/scoring';
import './ScoreCameraHostPage.css';

type CanvasWithCapture = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const c of ['video/mp4;codecs=h264,aac', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']) {
    try { if (MediaRecorder.isTypeSupported(c)) return c; } catch { /* ignore */ }
  }
  return '';
}

function fmtClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

export default function ScoreCameraHostPage() {
  const navigate = useNavigate();
  const tenantSlug = getTenantSlugFromPath(window.location.pathname);

  const [matchId, setMatchId] = useState<string | null>(null);
  const [sources, setSources] = useState<CameraSource[]>([]);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [tickerPos, setTickerPos] = useState<TickerPosition>('bottom');
  const [tickerDesign, setTickerDesign] = useState<TickerDesign | undefined>(undefined);
  const [showTicker, setShowTicker] = useState(true);
  const [copied, setCopied] = useState(false);
  const [mimeType] = useState(pickMimeType);

  // Refs used inside the rAF loop
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const detachRefs = useRef<Record<string, () => void>>({});
  const rafRef = useRef(0);
  const drawFrameRef = useRef<() => void>(() => {});
  const liveRef = useRef<LiveScore | null>(null);
  const matchRef = useRef<MatchSetup | null>(null);
  const configRef = useRef<ScoringOverlayConfig | null>(null);
  const playerImagesRef = useRef<Record<string, string>>({});
  const activeIdRef = useRef<string | null>(null);
  const showTickerRef = useRef(true);
  const tickerPosRef = useRef<TickerPosition>('bottom');
  const tickerDesignRef = useRef<TickerDesign | undefined>(undefined);
  const animRef = useRef<{ type: CelebType; start: number; durationMs: number } | null>(null);
  const lastAnimTsRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { showTickerRef.current = showTicker; }, [showTicker]);
  useEffect(() => { tickerPosRef.current = tickerPos; }, [tickerPos]);
  useEffect(() => { tickerDesignRef.current = tickerDesign; }, [tickerDesign]);

  // ── Match id from URL ──
  useEffect(() => {
    setMatchId(new URLSearchParams(window.location.search).get('matchId'));
  }, []);

  // ── Init signalling ──
  useEffect(() => {
    multiCamService.initialize(broadcastDb, tenantPath('scoring'));
  }, []);

  // ── Live score + branding (same sources as the OBS overlay) ──
  useEffect(() => {
    if (!matchId) return;
    const base = tenantPath('scoring');
    const unsubs: Array<() => void> = [];
    unsubs.push(onValue(ref(broadcastDb, `${base}/matches/${matchId}/setup`), s => {
      if (s.exists()) matchRef.current = s.val();
    }));
    unsubs.push(onValue(ref(broadcastDb, `${base}/matches/${matchId}/live`), s => {
      if (s.exists()) liveRef.current = s.val();
    }));
    unsubs.push(onValue(ref(broadcastDb, `${base}/overlayConfig`), s => {
      configRef.current = s.exists() ? (s.val() as ScoringOverlayConfig) : null;
    }));
    unsubs.push(onValue(ref(broadcastDb, `${base}/matches/${matchId}/lineups`), s => {
      if (!s.exists()) return;
      const data = s.val() as Record<string, MatchLineup>;
      const map = { ...playerImagesRef.current };
      for (const l of Object.values(data)) {
        for (const p of l?.players || []) if (p.imageUrl) map[p.playerId] = p.imageUrl;
      }
      playerImagesRef.current = map;
    }));
    unsubs.push(onValue(ref(broadcastDb, tenantPath('auction/adminPlayers')), s => {
      if (!s.exists()) return;
      const data = s.val() as Record<string, { id: string; imageUrl?: string }>;
      const map = { ...playerImagesRef.current };
      for (const p of Object.values(data)) if (p.imageUrl && !map[p.id]) map[p.id] = p.imageUrl;
      playerImagesRef.current = map;
    }));
    unsubs.push(onValue(ref(broadcastDb, `${base}/matches/${matchId}/overlay`), s => {
      if (!s.exists()) return;
      const ctrl = s.val() as OverlayControlState;
      const celebs: CelebType[] = ['boundary_four', 'boundary_six', 'wicket', 'duck_out', 'hat_trick'];
      const ts = ctrl.lastUpdated || 0;
      const type = ctrl.activeOverlay as CelebType;
      if (celebs.includes(type) && ts !== lastAnimTsRef.current && Date.now() - ts < 15000) {
        const { durationMs, imageUrl } = resolveCeleb(configRef.current, type);
        if (imageUrl) getImg(imageUrl);
        animRef.current = { type, start: performance.now(), durationMs };
      }
      lastAnimTsRef.current = ts;
    }));
    return () => unsubs.forEach(u => u());
  }, [matchId]);

  // ── Camera sources + program selection ──
  useEffect(() => {
    if (!matchId) return;
    const unsubSources = multiCamService.subscribeSources(matchId, list => {
      const fresh = list.filter(s => Date.now() - (s.lastSeen || 0) < SOURCE_STALE_MS);
      setSources(fresh);
    });
    const unsubProgram = multiCamService.subscribeProgram(matchId, p => setActiveId(p.activeSourceId));
    return () => { unsubSources(); unsubProgram(); };
  }, [matchId]);

  // Attach to any source we are not yet connected to; detach ones that left.
  useEffect(() => {
    if (!matchId) return;
    const ids = new Set(sources.map(s => s.id));

    for (const s of sources) {
      if (detachRefs.current[s.id]) continue;
      detachRefs.current[s.id] = () => { /* placeholder while connecting */ };
      multiCamService
        .attachSource(matchId, s.id, stream => {
          setStreams(prev => ({ ...prev, [s.id]: stream }));
        })
        .then(detach => { detachRefs.current[s.id] = detach; })
        .catch(() => {
          delete detachRefs.current[s.id];
        });
    }

    for (const id of Object.keys(detachRefs.current)) {
      if (ids.has(id)) continue;
      detachRefs.current[id]?.();
      delete detachRefs.current[id];
      setStreams(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, [sources, matchId]);

  // Auto-select the first angle when nothing is on air.
  useEffect(() => {
    if (!matchId || activeId || sources.length === 0) return;
    void multiCamService.setProgram(matchId, sources[0].id);
  }, [sources, activeId, matchId]);

  // Bind incoming streams to their video elements.
  useEffect(() => {
    for (const [id, stream] of Object.entries(streams)) {
      const el = videoRefs.current[id];
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
        el.play().catch(() => { /* autoplay guard */ });
      }
    }
  }, [streams]);

  // ── Program compositing loop ──
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const W = canvas.width, H = canvas.height;
        const video = activeIdRef.current ? videoRefs.current[activeIdRef.current] : null;
        if (video && video.readyState >= 2 && video.videoWidth) {
          const scale = Math.max(W / video.videoWidth, H / video.videoHeight);
          const dw = video.videoWidth * scale, dh = video.videoHeight * scale;
          ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
        } else {
          ctx.fillStyle = '#08080f';
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.font = "600 34px 'Inter', system-ui, sans-serif";
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('Waiting for a camera to join…', W / 2, H / 2);
        }
        if (showTickerRef.current) {
          drawScoreTicker(ctx, W, H, {
            live: liveRef.current,
            match: matchRef.current,
            config: configRef.current,
            position: tickerPosRef.current,
            playerImages: playerImagesRef.current,
            designOverride: tickerDesignRef.current,
          });
        }
        const anim = animRef.current;
        if (anim) {
          const dt = performance.now() - anim.start;
          if (dt >= anim.durationMs) animRef.current = null;
          else drawCelebration(ctx, W, H, anim.type, configRef.current, dt / anim.durationMs);
        }
      }
    }
    rafRef.current = requestAnimationFrame(() => drawFrameRef.current());
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) { canvas.width = 1920; canvas.height = 1080; }
    drawFrameRef.current = drawFrame;
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  // ── Recording the program feed ──
  const startRecording = useCallback(() => {
    const canvas = canvasRef.current as CanvasWithCapture | null;
    if (!canvas?.captureStream) { setError('Recording is not supported in this browser.'); return; }
    try {
      const stream = canvas.captureStream(30);
      const active = activeIdRef.current ? streams[activeIdRef.current] : null;
      const audio = active?.getAudioTracks?.()[0];
      const tracks: MediaStreamTrack[] = [...stream.getVideoTracks()];
      if (audio) tracks.push(audio);
      const options: MediaRecorderOptions = { videoBitsPerSecond: 12_000_000 };
      if (mimeType) options.mimeType = mimeType;
      const rec = new MediaRecorder(new MediaStream(tracks), options);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
        setRecordedUrl(URL.createObjectURL(blob));
      };
      rec.start(1000);
      recorderRef.current = rec;
      startTimeRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 250);
    } catch {
      setError('Could not start recording.');
    }
  }, [mimeType, streams]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    Object.values(detachRefs.current).forEach(fn => fn?.());
    try { if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop(); } catch { /* ignore */ }
  }, []);

  const takeSource = (id: string) => {
    if (!matchId) return;
    void multiCamService.setProgram(matchId, id);
  };

  const joinUrl = matchId
    ? `${window.location.origin}${tenantSlug ? `/${tenantSlug}` : ''}/cricket/scorer/camera?matchId=${matchId}&share=1`
    : '';

  const copyJoinUrl = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  const fileExt = mimeType.includes('mp4') ? 'mp4' : 'webm';

  return (
    <div className="cam-host">
      <header className="cam-host__bar">
        <button className="cam-host__icon-btn" onClick={() => navigate('/cricket/scorer/camera/admin')} title="Back">
          <IoArrowBack size={20} />
        </button>
        <div className="cam-host__title">
          <IoWifi size={18} />
          <span>Multi-Camera Host</span>
          <small>{sources.length} camera{sources.length === 1 ? '' : 's'} connected</small>
        </div>
        {recording && (
          <div className="cam-host__rec"><span className="cam-host__rec-dot" /> REC {fmtClock(elapsed)}</div>
        )}
      </header>

      {!matchId && (
        <p className="cam-host__warn">
          Open this page with a <code>?matchId=…</code> so the ticker and camera routing can attach to a match.
        </p>
      )}
      {error && <p className="cam-host__warn">{error}</p>}

      <div className="cam-host__layout">
        {/* Program output */}
        <section className="cam-host__program">
          <div className="cam-host__program-head">
            <span className="cam-host__on-air"><IoRadioButtonOn size={13} /> ON AIR</span>
            <span className="cam-host__program-name">
              {sources.find(s => s.id === activeId)?.name || 'No camera selected'}
            </span>
          </div>
          <canvas ref={canvasRef} className="cam-host__canvas" />
          <div className="cam-host__controls">
            <button className={`cam-host__chip ${showTicker ? 'is-on' : ''}`} onClick={() => setShowTicker(v => !v)}>
              {showTicker ? 'Ticker On' : 'Ticker Off'}
            </button>
            <button className="cam-host__chip" onClick={() => setTickerPos(p => (p === 'bottom' ? 'top' : 'bottom'))}>
              {tickerPos === 'bottom' ? 'Bottom' : 'Top'}
            </button>
            <button className="cam-host__chip" onClick={() => setTickerDesign(d => (d === 'premium' ? 'glass' : 'premium'))}>
              {(tickerDesign || configRef.current?.tickerConfig?.design || 'glass') === 'premium' ? 'Premium' : 'Glass'}
            </button>
            {!recording ? (
              <button className="cam-host__rec-btn" onClick={startRecording}><IoVideocam size={18} /> Record program</button>
            ) : (
              <button className="cam-host__rec-btn cam-host__rec-btn--stop" onClick={stopRecording}><IoStop size={18} /> Stop</button>
            )}
            {recordedUrl && (
              <>
                <a className="cam-host__chip" href={recordedUrl} download={`program-${Date.now()}.${fileExt}`}>
                  <IoDownloadOutline size={15} /> Save
                </a>
                <button className="cam-host__chip" onClick={() => { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); }}>
                  <IoRefresh size={15} /> Clear
                </button>
              </>
            )}
          </div>
        </section>

        {/* Angle grid */}
        <aside className="cam-host__angles">
          <div className="cam-host__angles-head">
            <h2>Camera angles</h2>
            {joinUrl && (
              <button className="cam-host__chip" onClick={copyJoinUrl} title="Copy the link camera phones should open">
                {copied ? <IoCheckmarkCircle size={15} /> : <IoCopyOutline size={15} />} {copied ? 'Copied' : 'Join link'}
              </button>
            )}
          </div>

          {sources.length === 0 && (
            <p className="cam-host__empty">
              No cameras yet. Open the join link on each phone and tap <strong>Share to host</strong>.
            </p>
          )}

          <div className="cam-host__grid">
            {sources.map(s => (
              <button
                key={s.id}
                className={`cam-host__tile ${activeId === s.id ? 'is-live' : ''}`}
                onClick={() => takeSource(s.id)}
                title={`Take ${s.name}`}
              >
                <video
                  ref={el => { videoRefs.current[s.id] = el; }}
                  className="cam-host__tile-video"
                  autoPlay
                  muted
                  playsInline
                />
                <span className="cam-host__tile-name">{s.name}</span>
                {activeId === s.id && <span className="cam-host__tile-live">LIVE</span>}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
