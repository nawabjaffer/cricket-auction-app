// ============================================================================
// LIVE ADMIN PAGE - Broadcast Control Panel
// Controls what displays on the /live broadcast screen
// Features: Mode switcher, preview, camera config, multi-cam layout,
//           transitions, break timer, ad runner
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  IoPlay, IoPause, IoStop, IoTv, IoTime, IoImage, IoTrophy,
  IoRefresh, IoVideocam, IoGrid, IoSwapHorizontal, IoTrash,
  IoEye, IoSettings, IoCheckmark,
} from 'react-icons/io5';
import {
  realtimeSync,
  type BroadcastControlState,
  type BroadcastMode,
  type BroadcastTransition,
  type CameraLayoutMode,
  type PersistedCameraConfig,
  type MobileBiddingConfig,
} from '../services/realtimeSync';
import { auctionPersistence, type SponsorRecord } from '../services/auctionPersistence';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useTheme } from '../hooks/useTheme';
import { AdminLogin } from '../components/AdminLogin';
import { BreakOverlay } from '../components/Overlays/BreakOverlay';
import './LiveAdminPage.css';

type AdminTab = 'control' | 'cameras' | 'preview';

export default function LiveAdminPage() {
  const { isAuthenticated } = useAdminAuth();
  const { currentTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<AdminTab>('control');

  // Broadcast control state
  const [currentMode, setCurrentMode] = useState<BroadcastMode>('auction');
  const [breakDuration, setBreakDuration] = useState(120);
  const [breakRunning, setBreakRunning] = useState(false);
  const [breakTimeLeft, setBreakTimeLeft] = useState(120);
  const [selectedTransition, setSelectedTransition] = useState<BroadcastTransition>('cut');
  const [selectedLayout, setSelectedLayout] = useState<CameraLayoutMode>('single');
  const [sponsors, setSponsors] = useState<SponsorRecord[]>([]);
  const [activeSponsorId, setActiveSponsorId] = useState<string | null>(null);
  const [sponsorDisplayDuration, setSponsorDisplayDuration] = useState(15);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

  // Camera management state
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [primaryDeviceId, setPrimaryDeviceId] = useState<string | null>(null);
  const [previewStreams, setPreviewStreams] = useState<Map<string, MediaStream>>(new Map());
  const [cameraPermissionGranted, setCameraPermissionGranted] = useState(false);
  const [savedCameraConfig, setSavedCameraConfig] = useState(false);
  const previewVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  // Mobile bidding config state
  const [mbMaxStats, setMbMaxStats] = useState(6);
  const [mbEnableRaise, setMbEnableRaise] = useState(true);
  const [mbEnableStop, setMbEnableStop] = useState(true);
  const [savedMbConfig, setSavedMbConfig] = useState(false);

  // Load sponsors (wait for DB initialization)
  useEffect(() => {
    const loadSponsors = async () => {
      try {
        // Ensure Firebase DB is ready before accessing auctionPersistence
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (db) auctionPersistence.initialize(db);
        const loaded = await auctionPersistence.getSponsors();
        setSponsors(loaded);
      } catch (err) {
        console.error('[LiveAdmin] Failed to load sponsors:', err);
      }
    };
    loadSponsors();

    const unsub = auctionPersistence.subscribeSponsors((updated) => {
      setSponsors(updated);
    });
    return unsub;
  }, []);

  // Subscribe to broadcast control from Firebase — keeps admin in sync with /live
  useEffect(() => {
    const unsub = realtimeSync.subscribeBroadcastControl((control) => {
      if (!control) return;
      // If /live ended the break (timer expired), sync back to admin
      if (control.mode !== currentMode) {
        setCurrentMode(control.mode);
        if (control.mode !== 'break') {
          setBreakRunning(false);
        }
      }
    });
    return unsub;
  }, [currentMode]);

  // Load existing camera config from Firebase
  useEffect(() => {
    const unsub = realtimeSync.subscribeCameraConfig((config) => {
      if (config) {
        setSelectedDeviceIds(config.deviceIds || []);
        setSelectedLayout(config.layout || 'single');
        setPrimaryDeviceId(config.primaryDeviceId || null);
      }
    });
    return unsub;
  }, []);

  // Load mobile bidding config from Firebase
  useEffect(() => {
    const unsub = realtimeSync.subscribeMobileBiddingConfig((config) => {
      if (config) {
        setMbMaxStats(config.maxStatsToShow);
        setMbEnableRaise(config.enableRaiseBid);
        setMbEnableStop(config.enableStopBidding);
      }
    });
    return unsub;
  }, []);

  // Sync broadcast control to Firebase
  const syncControl = useCallback(async (mode: BroadcastMode, extra?: Partial<BroadcastControlState>) => {
    const control: BroadcastControlState = {
      mode,
      transition: selectedTransition,
      cameraLayout: selectedLayout,
      sponsorDisplayDuration,
      lastUpdate: Date.now(),
      ...extra,
    };
    await realtimeSync.setBroadcastControl(control);
    setLastSyncTime(Date.now());
  }, [selectedTransition, selectedLayout, sponsorDisplayDuration]);

  // Mode change handler — break mode now requires explicit push
  const handleModeChange = useCallback((mode: BroadcastMode) => {
    if (mode === 'break') {
      // Just preview break — don't push to live yet
      setCurrentMode('break');
      setBreakTimeLeft(breakDuration);
      setBreakRunning(false);
      return;
    }
    setCurrentMode(mode);
    setBreakRunning(false);
    if (mode === 'ad' && activeSponsorId) {
      syncControl(mode, { activeSponsorId });
    } else {
      syncControl(mode);
    }
  }, [breakDuration, activeSponsorId, syncControl]);

  // Push break to live — actually syncs to Firebase and starts the timer
  const pushBreakToLive = useCallback(() => {
    setBreakTimeLeft(breakDuration);
    setBreakRunning(true);
    syncControl('break', { breakDuration, breakStartedAt: Date.now(), sponsorDisplayDuration });
  }, [breakDuration, sponsorDisplayDuration, syncControl]);

  // Break timer countdown
  useEffect(() => {
    if (!breakRunning || currentMode !== 'break') return;
    const interval = setInterval(() => {
      setBreakTimeLeft((prev) => {
        if (prev <= 1) {
          setBreakRunning(false);
          handleModeChange('auction');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [breakRunning, currentMode, handleModeChange]);

  // Run ad for specific sponsor
  const runAd = useCallback((sponsorId: string) => {
    setActiveSponsorId(sponsorId);
    setCurrentMode('ad');
    syncControl('ad', { activeSponsorId: sponsorId });
  }, [syncControl]);

  // Camera: request permission and enumerate devices
  const refreshDevices = useCallback(async () => {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tempStream.getTracks().forEach(t => t.stop());
      setCameraPermissionGranted(true);

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(videoDevices);
    } catch (err) {
      console.error('[LiveAdmin] Camera permission denied:', err);
    }
  }, []);

  // Request permission once on tab switch to cameras
  useEffect(() => {
    if (activeTab === 'cameras' && !cameraPermissionGranted) {
      refreshDevices();
    }
  }, [activeTab, cameraPermissionGranted, refreshDevices]);

  // Toggle a camera device selection
  const toggleDevice = useCallback((deviceId: string) => {
    setSelectedDeviceIds(prev => {
      if (prev.includes(deviceId)) {
        const stream = previewStreams.get(deviceId);
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
          setPreviewStreams(p => { const n = new Map(p); n.delete(deviceId); return n; });
        }
        return prev.filter(id => id !== deviceId);
      }
      if (prev.length >= 4) return prev;
      return [...prev, deviceId];
    });
  }, [previewStreams]);

  // Start preview stream for a device
  const startPreview = useCallback(async (deviceId: string) => {
    if (previewStreams.has(deviceId)) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 360 } },
      });
      setPreviewStreams(prev => new Map(prev).set(deviceId, stream));
    } catch (err) {
      console.error('[LiveAdmin] Failed to start preview:', err);
    }
  }, [previewStreams]);

  // Auto-start previews for selected devices on cameras/preview tab
  useEffect(() => {
    if (activeTab === 'cameras' || activeTab === 'preview') {
      for (const deviceId of selectedDeviceIds) {
        if (!previewStreams.has(deviceId)) {
          startPreview(deviceId);
        }
      }
    }
  }, [activeTab, selectedDeviceIds, startPreview, previewStreams]);

  // Attach streams to video elements
  useEffect(() => {
    for (const [deviceId, stream] of previewStreams) {
      // Attach to camera tab preview
      const video = previewVideoRefs.current.get(deviceId);
      if (video && video.srcObject !== stream) {
        video.srcObject = stream;
        video.play().catch(() => {});
      }
      // Attach to preview tab
      const previewVideo = previewVideoRefs.current.get(`preview-${deviceId}`);
      if (previewVideo && previewVideo.srcObject !== stream) {
        previewVideo.srcObject = stream;
        previewVideo.play().catch(() => {});
      }
    }
  }, [previewStreams, activeTab]);

  // Cleanup preview streams on unmount
  useEffect(() => {
    const streams = previewStreams;
    return () => {
      for (const stream of streams.values()) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save camera config to Firebase
  const saveCameraConfig = useCallback(async () => {
    const config: PersistedCameraConfig = {
      deviceIds: selectedDeviceIds,
      layout: selectedLayout,
      primaryDeviceId: primaryDeviceId || selectedDeviceIds[0],
      lastUpdate: Date.now(),
    };
    await realtimeSync.saveCameraConfig(config);
    setSavedCameraConfig(true);
    setTimeout(() => setSavedCameraConfig(false), 2000);
  }, [selectedDeviceIds, selectedLayout, primaryDeviceId]);

  // Save mobile bidding config to Firebase
  const saveMobileBiddingConfig = useCallback(async () => {
    const config: MobileBiddingConfig = {
      maxStatsToShow: mbMaxStats,
      enableRaiseBid: mbEnableRaise,
      enableStopBidding: mbEnableStop,
    };
    await realtimeSync.saveMobileBiddingConfig(config);
    setSavedMbConfig(true);
    setTimeout(() => setSavedMbConfig(false), 2000);
  }, [mbMaxStats, mbEnableRaise, mbEnableStop]);

  const videoSponsors = useMemo(
    () => sponsors.filter((s) => s.active !== false && s.videoUrl),
    [sponsors],
  );

  const logoSponsors = useMemo(
    () => sponsors.filter((s) => s.active !== false && s.logoUrl),
    [sponsors],
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  return (
    <div className="live-admin-page">
      <header className="la-header">
        <div className="la-header-left">
          <IoTv size={20} />
          <h1>Live Broadcast Control</h1>
        </div>
        <div className="la-header-right">
          {lastSyncTime && (
            <span className="la-sync-indicator">
              Synced {new Date(lastSyncTime).toLocaleTimeString()}
            </span>
          )}
          <span className={`la-status-dot ${currentMode === 'auction' ? 'live' : 'paused'}`} />
          <span className="la-status-label">{currentMode === 'auction' ? 'LIVE' : currentMode.toUpperCase()}</span>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="la-tabs">
        {([
          { id: 'control' as AdminTab, icon: <IoSettings size={16} />, label: 'Control' },
          { id: 'cameras' as AdminTab, icon: <IoVideocam size={16} />, label: 'Cameras' },
          { id: 'preview' as AdminTab, icon: <IoEye size={16} />, label: 'Preview' },
        ]).map(({ id, icon, label }) => (
          <button
            key={id}
            className={`la-tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {icon} {label}
          </button>
        ))}
      </nav>

      <main className="la-main">
        {/* ═══════════ CONTROL TAB ═══════════ */}
        {activeTab === 'control' && (
          <>
            {/* Mode Switcher */}
            <section className="la-section">
              <h2 className="la-section-title">Broadcast Mode</h2>
              <div className="la-mode-grid">
                {([
                  { mode: 'auction' as BroadcastMode, icon: <IoPlay size={24} />, label: 'Auction', desc: 'Live auction feed' },
                  { mode: 'break' as BroadcastMode, icon: <IoPause size={24} />, label: 'Break', desc: 'Timer + sponsor ads' },
                  { mode: 'ad' as BroadcastMode, icon: <IoImage size={24} />, label: 'Ad Run', desc: 'Show sponsor content' },
                  { mode: 'standings' as BroadcastMode, icon: <IoTrophy size={24} />, label: 'Standings', desc: 'Team leaderboard' },
                ]).map(({ mode, icon, label, desc }) => (
                  <motion.button
                    key={mode}
                    className={`la-mode-card ${currentMode === mode ? 'active' : ''}`}
                    onClick={() => handleModeChange(mode)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="la-mode-icon">{icon}</div>
                    <div className="la-mode-label">{label}</div>
                    <div className="la-mode-desc">{desc}</div>
                  </motion.button>
                ))}
              </div>
            </section>

            {/* Transition Selector */}
            <section className="la-section">
              <h2 className="la-section-title">
                <IoSwapHorizontal size={18} /> Transition Style
              </h2>
              <div className="la-transition-grid">
                {([
                  { id: 'cut' as BroadcastTransition, label: 'Cut', desc: 'Instant switch' },
                  { id: 'fade' as BroadcastTransition, label: 'Fade', desc: 'Cross-dissolve' },
                  { id: 'slide' as BroadcastTransition, label: 'Slide', desc: 'Slide left' },
                  { id: 'zoom' as BroadcastTransition, label: 'Zoom', desc: 'Zoom in/out' },
                ]).map(({ id, label, desc }) => (
                  <button
                    key={id}
                    className={`la-transition-card ${selectedTransition === id ? 'active' : ''}`}
                    onClick={() => setSelectedTransition(id)}
                  >
                    <span className="la-transition-label">{label}</span>
                    <span className="la-transition-desc">{desc}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Break Timer Control with Live BreakOverlay Preview — always visible */}
            <section className="la-section">
              <h2 className="la-section-title">
                <IoTime size={18} /> Break Preview & Timer
              </h2>

              {/* Actual BreakOverlay preview — scaled inside a frame */}
              <div className="la-break-live-preview">
                <div className={`la-break-live-preview-status ${breakRunning ? 'live' : currentMode === 'break' ? 'preview' : 'idle'}`}>
                  {breakRunning ? '● LIVE ON AIR' : currentMode === 'break' ? '○ PREVIEW — NOT LIVE YET' : '○ STANDBY'}
                </div>
                <div className="la-break-live-preview-frame">
                  <BreakOverlay
                    isVisible={true}
                    durationSeconds={breakTimeLeft}
                    sponsorDisplayDuration={sponsorDisplayDuration}
                    sponsors={sponsors}
                    organizerLogo={currentTheme.seasonLogo}
                    auctionTitle={currentTheme.name ? `${currentTheme.name} AUCTION` : undefined}
                    onClose={() => {
                      setBreakRunning(false);
                      handleModeChange('auction');
                    }}
                  />
                </div>
              </div>

              <div className="la-timer-panel">
                <div className="la-timer-display">{formatTime(breakTimeLeft)}</div>
                <div className="la-timer-controls">
                  <label>
                    Break Duration (seconds):
                    <input
                      type="number"
                      value={breakDuration}
                      onChange={(e) => setBreakDuration(Math.max(10, Number(e.target.value) || 120))}
                      min={10}
                      max={3600}
                      className="la-input"
                    />
                  </label>
                  <label>
                    Sponsor Display (seconds):
                    <input
                      type="number"
                      value={sponsorDisplayDuration}
                      onChange={(e) => setSponsorDisplayDuration(Math.max(10, Math.min(60, Number(e.target.value) || 15)))}
                      min={10}
                      max={60}
                      className="la-input"
                    />
                  </label>
                  <div className="la-timer-buttons">
                    {!breakRunning ? (
                      <button
                        className="la-btn la-btn-success la-btn-push-live"
                        onClick={() => {
                          if (currentMode !== 'break') handleModeChange('break');
                          pushBreakToLive();
                        }}
                      >
                        <IoPlay size={16} /> Push Break to Live
                      </button>
                    ) : (
                      <>
                        <button
                          className="la-btn la-btn-success"
                          onClick={() => {
                            setBreakTimeLeft(breakDuration);
                            setBreakRunning(true);
                            syncControl('break', { breakDuration, breakStartedAt: Date.now(), sponsorDisplayDuration });
                          }}
                        >
                          <IoRefresh size={16} /> Reset & Restart
                        </button>
                        <button
                          className="la-btn la-btn-danger"
                          onClick={() => { setBreakRunning(false); handleModeChange('auction'); }}
                        >
                          <IoStop size={16} /> End Break
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Ad Runner */}
            <section className="la-section">
              <h2 className="la-section-title"><IoImage size={18} /> Ad Runner</h2>
              {videoSponsors.length > 0 && (
                <div className="la-subsection">
                  <h3 className="la-subsection-title">Video Ads</h3>
                  <div className="la-sponsor-list">
                    {videoSponsors.map((sponsor) => (
                      <button key={sponsor.id} className={`la-sponsor-card ${activeSponsorId === sponsor.id && currentMode === 'ad' ? 'active' : ''}`} onClick={() => runAd(sponsor.id)}>
                        {sponsor.logoUrl && <img src={sponsor.logoUrl} alt={sponsor.name} className="la-sponsor-logo" />}
                        <div className="la-sponsor-info">
                          <span className="la-sponsor-name">{sponsor.name}</span>
                          <span className="la-sponsor-tier">{sponsor.tier || 'Sponsor'}</span>
                        </div>
                        <IoPlay size={16} className="la-sponsor-play" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {logoSponsors.length > 0 && (
                <div className="la-subsection">
                  <h3 className="la-subsection-title">Logo Ads</h3>
                  <div className="la-sponsor-list">
                    {logoSponsors.map((sponsor) => (
                      <button key={sponsor.id} className={`la-sponsor-card ${activeSponsorId === sponsor.id && currentMode === 'ad' ? 'active' : ''}`} onClick={() => runAd(sponsor.id)}>
                        {sponsor.logoUrl && <img src={sponsor.logoUrl} alt={sponsor.name} className="la-sponsor-logo" />}
                        <div className="la-sponsor-info">
                          <span className="la-sponsor-name">{sponsor.name}</span>
                          <span className="la-sponsor-tier">{sponsor.tier || 'Sponsor'}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {sponsors.length === 0 && <p className="la-empty">No sponsors configured. Add sponsors in the Admin Panel.</p>}
            </section>

            {/* Quick Actions */}
            <section className="la-section">
              <h2 className="la-section-title">Quick Actions</h2>
              <div className="la-quick-actions">
                <button className="la-btn" onClick={() => handleModeChange('auction')}><IoPlay size={16} /> Resume Auction</button>
                <button className="la-btn" onClick={() => handleModeChange('standings')}><IoTrophy size={16} /> Show Standings</button>
                <button className="la-btn" onClick={() => { setBreakDuration(120); handleModeChange('break'); }}><IoPause size={16} /> Preview Break (2 min)</button>
              </div>
            </section>

            {/* Mobile Bidding Config */}
            <section className="la-section">
              <h2 className="la-section-title">📱 Mobile Bidding Config</h2>
              <div className="la-mb-config">
                <div className="la-mb-row">
                  <label>
                    Max Stats to Show:
                    <input
                      type="number"
                      value={mbMaxStats}
                      onChange={(e) => setMbMaxStats(Math.max(2, Math.min(12, Number(e.target.value) || 6)))}
                      min={2}
                      max={12}
                      className="la-input"
                    />
                  </label>
                </div>
                <div className="la-mb-row">
                  <label className="la-toggle-label">
                    <input
                      type="checkbox"
                      checked={mbEnableRaise}
                      onChange={(e) => setMbEnableRaise(e.target.checked)}
                    />
                    Enable Raise Bid Button
                  </label>
                </div>
                <div className="la-mb-row">
                  <label className="la-toggle-label">
                    <input
                      type="checkbox"
                      checked={mbEnableStop}
                      onChange={(e) => setMbEnableStop(e.target.checked)}
                    />
                    Enable Stop Bidding Button
                  </label>
                </div>
                <button
                  className={`la-btn ${savedMbConfig ? 'la-btn-success' : ''}`}
                  onClick={saveMobileBiddingConfig}
                >
                  {savedMbConfig ? <><IoCheckmark size={16} /> Saved!</> : '💾 Save Mobile Config'}
                </button>
              </div>
            </section>
          </>
        )}

        {/* ═══════════ CAMERAS TAB ═══════════ */}
        {activeTab === 'cameras' && (
          <>
            <section className="la-section">
              <h2 className="la-section-title"><IoGrid size={18} /> Camera Layout</h2>
              <div className="la-layout-grid">
                {([
                  { id: 'single' as CameraLayoutMode, label: 'Single', desc: '1 camera fullscreen', icon: '▣' },
                  { id: 'pip' as CameraLayoutMode, label: 'PiP', desc: 'Main + small overlay', icon: '◱' },
                  { id: 'split' as CameraLayoutMode, label: 'Split', desc: '2 cameras side-by-side', icon: '◫' },
                  { id: 'quad' as CameraLayoutMode, label: 'Quad', desc: '4 cameras in grid', icon: '⊞' },
                ]).map(({ id, label, desc, icon }) => (
                  <button key={id} className={`la-layout-card ${selectedLayout === id ? 'active' : ''}`} onClick={() => setSelectedLayout(id)}>
                    <span className="la-layout-icon">{icon}</span>
                    <span className="la-layout-label">{label}</span>
                    <span className="la-layout-desc">{desc}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="la-section">
              <h2 className="la-section-title"><IoVideocam size={18} /> Camera Devices</h2>
              <div className="la-device-list">
                {devices.map((device, index) => {
                  const isSelected = selectedDeviceIds.includes(device.deviceId);
                  const isPrimary = primaryDeviceId === device.deviceId;
                  return (
                    <div key={device.deviceId} className={`la-device-item ${isSelected ? 'selected' : ''}`}>
                      <div className="la-device-info">
                        <span className="la-device-name">{device.label || `Camera ${index + 1}`}</span>
                        {isPrimary && <span className="la-device-primary-badge">Primary</span>}
                      </div>
                      <div className="la-device-actions">
                        {isSelected && !isPrimary && (
                          <button className="la-btn la-btn-small" onClick={() => setPrimaryDeviceId(device.deviceId)} title="Set as primary">★</button>
                        )}
                        <button
                          className={`la-btn la-btn-small ${isSelected ? 'la-btn-danger' : 'la-btn-success'}`}
                          onClick={() => toggleDevice(device.deviceId)}
                          disabled={!isSelected && selectedDeviceIds.length >= 4}
                        >
                          {isSelected ? <><IoTrash size={14} /> Remove</> : <><IoPlay size={14} /> Add</>}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {devices.length === 0 && <p className="la-empty">No cameras detected. Click refresh to scan.</p>}
              </div>
              <div className="la-device-toolbar">
                <button className="la-btn" onClick={refreshDevices}><IoRefresh size={16} /> Refresh Devices</button>
                <button
                  className={`la-btn la-btn-success ${savedCameraConfig ? 'la-btn-saved' : ''}`}
                  onClick={saveCameraConfig}
                  disabled={selectedDeviceIds.length === 0}
                >
                  {savedCameraConfig ? <><IoCheckmark size={16} /> Saved!</> : <>Save Camera Config</>}
                </button>
              </div>
            </section>

            {selectedDeviceIds.length > 0 && (
              <section className="la-section">
                <h2 className="la-section-title">Camera Previews</h2>
                <div className={`la-preview-grid la-preview-${selectedLayout}`}>
                  {selectedDeviceIds.map((deviceId, idx) => {
                    const device = devices.find(d => d.deviceId === deviceId);
                    return (
                      <div key={deviceId} className={`la-preview-cell ${primaryDeviceId === deviceId ? 'primary' : ''}`}>
                        <video
                          ref={(el) => { if (el) previewVideoRefs.current.set(deviceId, el); }}
                          autoPlay muted playsInline
                          className="la-preview-video"
                        />
                        <div className="la-preview-label">
                          {device?.label || `Camera ${idx + 1}`}
                          {primaryDeviceId === deviceId && ' ★'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {/* ═══════════ PREVIEW TAB ═══════════ */}
        {activeTab === 'preview' && (
          <section className="la-section">
            <h2 className="la-section-title"><IoEye size={18} /> Broadcast Preview</h2>
            <p className="la-preview-hint">This shows what the /live page will display. Use the Control tab to switch modes.</p>
            <div className="la-broadcast-preview">
              <div className="la-preview-frame">
                <div className={`la-preview-layout la-preview-${selectedLayout}`}>
                  {selectedDeviceIds.length > 0 ? (
                    selectedDeviceIds.map((deviceId, _idx) => (
                      <div key={deviceId} className={`la-preview-cell ${primaryDeviceId === deviceId ? 'primary' : ''}`}>
                        <video
                          ref={(el) => { if (el) previewVideoRefs.current.set(`preview-${deviceId}`, el); }}
                          autoPlay muted playsInline
                          className="la-preview-video"
                        />
                      </div>
                    ))
                  ) : (
                    <div className="la-preview-empty">
                      <IoVideocam size={48} />
                      <p>No cameras configured</p>
                      <button className="la-btn" onClick={() => setActiveTab('cameras')}>Setup Cameras</button>
                    </div>
                  )}
                </div>
                <div className="la-preview-mode-badge">{currentMode.toUpperCase()}</div>
                {currentMode === 'break' && (
                  <div className="la-preview-overlay">
                    <div className="la-preview-overlay-text">BREAK — {formatTime(breakTimeLeft)}</div>
                  </div>
                )}
                {currentMode === 'ad' && activeSponsorId && (
                  <div className="la-preview-overlay">
                    <div className="la-preview-overlay-text">AD — {sponsors.find(s => s.id === activeSponsorId)?.name || 'Sponsor'}</div>
                  </div>
                )}
              </div>
              <div className="la-preview-toolbar">
                <span className="la-preview-info">
                  Layout: <strong>{selectedLayout}</strong> · Transition: <strong>{selectedTransition}</strong> · Cameras: <strong>{selectedDeviceIds.length}</strong>
                </span>
                <button className="la-btn la-btn-success" onClick={() => handleModeChange(currentMode)}>
                  <IoRefresh size={14} /> Push to Live
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
