// ============================================================================
// SCORECARD DESIGNER — Canva-style drag-and-drop scorecard layout builder
// Lets an admin drop sport-specific widgets (score, team logos, timers, raid
// clock, etc.) onto a full-bleed 16:9 canvas, style each one (color, font,
// shadow, border), upload a background, and save/activate templates. The
// active template then drives BOTH the OBS Overlay and the Camera Recorder,
// so the two always render an identical scorecard.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IoAdd, IoSave, IoTrash, IoClose, IoCopyOutline, IoEyeOutline, IoEyeOffOutline,
  IoLockClosedOutline, IoLockOpenOutline, IoCloudUploadOutline, IoCheckmarkCircle,
  IoArrowBack, IoText, IoImageOutline, IoTimerOutline, IoStatsChartOutline,
} from 'react-icons/io5';
import { useTenantNavigate as useNavigate } from '../hooks/useTenantNavigate';
import { realtimeSync } from '../services/realtimeSync';
import { scorecardLayoutService } from '../services/scorecardLayoutService';
import { uploadFileToStorage } from '../services/firebaseStorageService';
import { ScorecardLayoutView } from '../components/ScorecardCanvas';
import {
  getWidgetCatalog, createWidgetInstance, createEmptyLayout, makeWidgetId,
  DEFAULT_WIDGET_STYLE, SURFACE_LABELS, SURFACE_HINTS, ANIMATION_PRESETS,
} from '../types/scorecardDesigner';
import type {
  ScorecardLayout, ScorecardWidgetInstance, WidgetCatalogEntry, WidgetKind,
  CustomWidgetDef, CustomWidgetBaseKind, ScorecardSurface, WidgetEntranceAnimation,
} from '../types/scorecardDesigner';
import type { ScorecardDataContext } from '../utils/scorecardDataBinding';
import type { SupportedGameType } from './scorerPages';
import './ScorecardDesignerPage.css';

const FONT_OPTIONS = ['Inter', 'Arial', 'Georgia', 'Poppins', 'Oswald', 'Montserrat', 'Roboto Slab'];

function mockContextFor(sport: SupportedGameType): ScorecardDataContext {
  const now = Date.now();
  if (sport === 'football') {
    return {
      sport: 'football',
      match: {
        id: 'mock', teamA: { id: 'a', name: 'Team A', shortName: 'TMA', logoUrl: undefined },
        teamB: { id: 'b', name: 'Team B', shortName: 'TMB', logoUrl: undefined },
        venue: 'Sample Stadium', date: new Date().toISOString(), halfDurationMin: 45,
        status: 'live', createdAt: now, updatedAt: now,
      },
      live: {
        matchId: 'mock', homeScore: 2, awayScore: 1, half: 'second_half',
        running: true, clockStartedAt: now, baseElapsedSec: 3120, addedTimeMin: 2, events: [], lastUpdated: now,
      },
      branding: {},
      players: [
        { id: 'p1', teamId: 'a', name: 'Sample Striker', photoUrl: undefined, position: 'FWD', isCaptain: true, isStarter: true, goals: 12, assists: 4, createdAt: now, updatedAt: now },
        { id: 'p2', teamId: 'a', name: 'Sample Winger', photoUrl: undefined, position: 'MID', isStarter: true, goals: 3, assists: 9, createdAt: now, updatedAt: now },
        { id: 'p3', teamId: 'b', name: 'Sample Defender', photoUrl: undefined, position: 'DEF', isStarter: true, goals: 1, assists: 1, createdAt: now, updatedAt: now },
      ],
    };
  }
  if (sport === 'kabaddi') {
    return {
      sport: 'kabaddi',
      match: {
        id: 'mock', teamA: { id: 'a', name: 'Team A', shortName: 'TMA' }, teamB: { id: 'b', name: 'Team B', shortName: 'TMB' },
        venue: 'Sample Arena', date: new Date().toISOString(), halfDurationMin: 20, status: 'live', createdAt: now, updatedAt: now,
      },
      live: {
        matchId: 'mock', teamAId: 'a', teamBId: 'b',
        teamA: { score: 24, playersOnCourt: 5, consecutiveEmptyRaids: 0, allOutsConceded: 0, allOutsInflicted: 1, totalRaidPoints: 14, totalTacklePoints: 6, totalBonusPoints: 2 },
        teamB: { score: 19, playersOnCourt: 6, consecutiveEmptyRaids: 1, allOutsConceded: 1, allOutsInflicted: 0, totalRaidPoints: 10, totalTacklePoints: 7, totalBonusPoints: 1 },
        half: 'second_half', running: true, clockStartedAt: now, baseElapsedSec: 540,
        raidingTeamId: 'a', raiderId: 'p1', raiderName: 'Sample Raider', raidNumber: 12,
        raidClockStartedAt: now, isDoOrDie: false, events: [], lastUpdated: now,
      },
      branding: {},
      players: [
        { id: 'p1', teamId: 'a', name: 'Sample Raider', photoUrl: undefined, position: 'RAIDER', isCaptain: true, isStarter: true, raidPoints: 22, createdAt: now, updatedAt: now },
        { id: 'p2', teamId: 'a', name: 'Sample All-Rounder', photoUrl: undefined, position: 'ALL_ROUNDER', isStarter: true, raidPoints: 8, tacklePoints: 5, createdAt: now, updatedAt: now },
        { id: 'p3', teamId: 'b', name: 'Sample Defender', photoUrl: undefined, position: 'DEFENDER', isStarter: true, tacklePoints: 11, createdAt: now, updatedAt: now },
      ],
    };
  }
  return {
    sport: 'cricket',
    match: {
      id: 'mock', teamA: { id: 'a', name: 'Team A' }, teamB: { id: 'b', name: 'Team B' },
      venue: 'Sample Ground', date: new Date().toISOString(), maxOvers: 20, status: 'live', createdAt: now, updatedAt: now,
      tossWonBy: 'a', tossElected: 'bat',
    },
    live: {
      matchId: 'mock', currentInnings: 1, battingTeamId: 'a', bowlingTeamId: 'b',
      runs: 128, wickets: 3, overs: 15.4, runRate: 8.16, target: undefined,
      currentBatsmen: [
        { playerId: 'p1', playerName: 'Sample Striker', runs: 42, balls: 30, fours: 4, sixes: 1, strikeRate: 140, isOnStrike: true },
        { playerId: 'p2', playerName: 'Sample Partner', runs: 18, balls: 15, fours: 2, sixes: 0, strikeRate: 120, isOnStrike: false },
      ],
      currentBowler: { playerId: 'p3', playerName: 'Sample Bowler', overs: 3.4, maidens: 0, runs: 28, wickets: 1, economy: 7.6, dots: 8 },
      lastBall: '4', lastBallRuns: 4, currentOverBalls: ['1', '4', '0', 'W', '2'], recentOvers: ['7', '4', '12', '6'],
      partnership: { runs: 36, balls: 28 }, lastUpdated: now,
      isPowerplay: false, powerplayOvers: 6, isFreehit: false,
    },
    branding: {},
    lineups: {
      teamA: {
        matchId: 'mock', teamId: 'a',
        players: [
          { playerId: 'p1', playerName: 'Sample Striker', role: 'Batter', isCaptain: true },
          { playerId: 'p2', playerName: 'Sample Partner', role: 'Batter' },
          { playerId: 'p4', playerName: 'Sample Allrounder', role: 'All-rounder' },
        ],
      },
      teamB: {
        matchId: 'mock', teamId: 'b',
        players: [
          { playerId: 'p3', playerName: 'Sample Bowler', role: 'Bowler', isCaptain: true },
          { playerId: 'p5', playerName: 'Sample Keeper', role: 'Wicket-keeper', isWicketKeeper: true },
        ],
      },
    },
    matchStats: {
      matchId: 'mock',
      highestDotBallBowler: null, highestFourScorer: null, highestSixScorer: null, highestStrikeRate: null,
      mvpLeaderboard: [
        { playerId: 'p1', playerName: 'Sample Striker', teamId: 'a', batting: 42, bowling: 0, fielding: 2, bonus: 0, total: 44 },
        { playerId: 'p3', playerName: 'Sample Bowler', teamId: 'b', batting: 0, bowling: 30, fielding: 0, bonus: 0, total: 30 },
      ],
      topRunScorers: [{ playerId: 'p1', playerName: 'Sample Striker', teamId: 'a', runs: 42, balls: 30, fours: 4, sixes: 1, strikeRate: 140 }],
      topWicketTakers: [{ playerId: 'p3', playerName: 'Sample Bowler', teamId: 'b', wickets: 1, runs: 28, overs: 3.4, economy: 7.6, dots: 8 }],
      topFours: [], topSixes: [], topStrikeRates: [], topDotBowlers: [], mvpPoints: [], lastUpdated: now,
    },
    tournamentStats: {
      orangeCap: { playerId: 'p1', playerName: 'Sample Striker', teamId: 'a', teamName: 'Team A', runs: 312, matches: 6 },
      purpleCap: { playerId: 'p3', playerName: 'Sample Bowler', teamId: 'b', teamName: 'Team B', wickets: 14, matches: 6 },
      mostSixes: null, mostFours: null, bestEconomy: null, bestStrikeRate: null, mostDotBalls: null,
      mvpLeaderboard: [
        { playerId: 'p1', playerName: 'Sample Striker', teamId: 'a', batting: 312, bowling: 0, fielding: 12, bonus: 0, total: 324 },
        { playerId: 'p3', playerName: 'Sample Bowler', teamId: 'b', batting: 0, bowling: 210, fielding: 4, bonus: 0, total: 214 },
      ],
      topRunScorers: [], topWicketTakers: [], topSixHitters: [], topFourHitters: [], topStrikeRates: [],
      lastUpdated: now,
    },
  };
}

function widgetFromCustomDef(def: CustomWidgetDef, xPct: number, yPct: number): ScorecardWidgetInstance {
  const kind: WidgetKind = def.baseKind === 'text' ? 'custom_text'
    : def.baseKind === 'image' ? 'custom_image'
    : def.baseKind === 'timer' ? 'custom_timer'
    : (def.statBindingKey ?? 'custom_text');
  return {
    id: makeWidgetId(),
    kind,
    label: def.label,
    geometry: { xPct, yPct, wPct: 16, hPct: 8, rotationDeg: 0, zIndex: 1 },
    style: { ...DEFAULT_WIDGET_STYLE },
    staticText: def.baseKind === 'text' ? (def.defaultText || def.label) : undefined,
    staticImageUrl: def.baseKind === 'image' ? def.defaultImageUrl : undefined,
    timerLabel: def.baseKind === 'timer' ? def.label : undefined,
    visible: true,
    locked: false,
  };
}

type DragMode = 'move' | 'resize';
interface DragState {
  id: string;
  target: 'widget' | 'background';
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startGeom: ScorecardWidgetInstance['geometry'] | NonNullable<ScorecardLayout['backgroundGeometry']>;
}

const BACKGROUND_ID = '__scorecard_background__';

export default function ScorecardDesignerPage({ gameType = 'cricket' }: Readonly<{ gameType?: SupportedGameType }>) {
  const navigate = useNavigate();
  const sport = gameType;
  const [ready, setReady] = useState(false);
  const [surface, setSurface] = useState<ScorecardSurface>('scoreboard');
  const [layout, setLayout] = useState<ScorecardLayout>(() => createEmptyLayout(sport, 'scoreboard'));
  const [layouts, setLayouts] = useState<ScorecardLayout[]>([]);
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  const [customWidgets, setCustomWidgets] = useState<CustomWidgetDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customForm, setCustomForm] = useState<{ label: string; baseKind: CustomWidgetBaseKind; defaultText: string; defaultImageUrl: string; statBindingKey: WidgetKind | '' }>({
    label: '', baseKind: 'text', defaultText: '', defaultImageUrl: '', statBindingKey: '',
  });
  const [previewToken, setPreviewToken] = useState(0);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const layoutRef = useRef(layout);
  useEffect(() => { layoutRef.current = layout; }, [layout]);

  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 2400); }, []);

  // ── Init ──
  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const init = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) throw new Error('no db');
        scorecardLayoutService.initialize(db);
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) retry = setTimeout(() => void init(), 800);
      }
    };
    void init();
    return () => { cancelled = true; if (retry) clearTimeout(retry); };
  }, []);

  // Switching surfaces starts from a clean canvas for that surface — its own
  // saved templates load via the "Load saved layout" dropdown below.
  useEffect(() => {
    setLayout(createEmptyLayout(sport, surface));
    setSelectedId(null);
  }, [sport, surface]);

  useEffect(() => {
    if (!ready) return;
    const unsubs = [
      scorecardLayoutService.subscribeLayouts(sport, setLayouts, surface),
      scorecardLayoutService.subscribeActiveLayoutId(sport, setActiveLayoutId, surface),
      scorecardLayoutService.subscribeCustomWidgets(sport, setCustomWidgets),
    ];
    return () => unsubs.forEach(u => u());
  }, [ready, sport, surface]);

  const mockCtx = useMemo(() => mockContextFor(sport), [sport]);
  const catalog = getWidgetCatalog(sport, surface);
  const selectedWidget = layout.widgets.find(w => w.id === selectedId) ?? null;

  // ── Widget CRUD ──
  const addWidgetFromCatalog = useCallback((entry: WidgetCatalogEntry, xPct: number, yPct: number) => {
    const instance = createWidgetInstance(entry, Math.max(0, xPct - entry.defaultW / 2), Math.max(0, yPct - entry.defaultH / 2));
    setLayout(l => ({ ...l, widgets: [...l.widgets, instance] }));
    setSelectedId(instance.id);
  }, []);

  const addWidgetFromCustom = useCallback((def: CustomWidgetDef, xPct: number, yPct: number) => {
    const instance = widgetFromCustomDef(def, Math.max(0, xPct - 8), Math.max(0, yPct - 4));
    setLayout(l => ({ ...l, widgets: [...l.widgets, instance] }));
    setSelectedId(instance.id);
  }, []);

  const updateWidget = useCallback((id: string, patch: Partial<ScorecardWidgetInstance>) => {
    setLayout(l => ({ ...l, widgets: l.widgets.map(w => (w.id === id ? { ...w, ...patch } : w)) }));
  }, []);

  const updateGeometry = useCallback((id: string, patch: Partial<ScorecardWidgetInstance['geometry']>) => {
    setLayout(l => ({ ...l, widgets: l.widgets.map(w => (w.id === id ? { ...w, geometry: { ...w.geometry, ...patch } } : w)) }));
  }, []);

  const updateStyle = useCallback((id: string, patch: Partial<ScorecardWidgetInstance['style']>) => {
    setLayout(l => ({ ...l, widgets: l.widgets.map(w => (w.id === id ? { ...w, style: { ...w.style, ...patch } } : w)) }));
  }, []);

  const removeWidget = useCallback((id: string) => {
    setLayout(l => ({ ...l, widgets: l.widgets.filter(w => w.id !== id) }));
    setSelectedId(cur => (cur === id ? null : cur));
  }, []);

  // ── Drag & drop from palette ──
  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const payload = JSON.parse(raw) as { source: 'catalog' | 'custom'; kind?: WidgetKind; customId?: string };
      if (payload.source === 'catalog' && payload.kind) {
        const entry = catalog.find(c => c.kind === payload.kind);
        if (entry) addWidgetFromCatalog(entry, xPct, yPct);
      } else if (payload.source === 'custom' && payload.customId) {
        const def = customWidgets.find(w => w.id === payload.customId);
        if (def) addWidgetFromCustom(def, xPct, yPct);
      }
    } catch { /* ignore malformed drop payloads */ }
  }, [catalog, customWidgets, addWidgetFromCatalog, addWidgetFromCustom]);

  // ── Drag existing widget to move/resize ──
  const beginDrag = useCallback((widget: ScorecardWidgetInstance, mode: DragMode, e: React.PointerEvent) => {
    if (widget.locked) return;
    e.stopPropagation();
    setSelectedId(widget.id);
    dragRef.current = { id: widget.id, target: 'widget', mode, startClientX: e.clientX, startClientY: e.clientY, startGeom: widget.geometry };
  }, []);

  const beginBackgroundDrag = useCallback((e: React.PointerEvent) => {
    if (!layout.backgroundImageUrl) return;
    e.stopPropagation();
    setSelectedId(BACKGROUND_ID);
    const geometry = layout.backgroundGeometry ?? { xPct: 0, yPct: 0, wPct: 100, hPct: 100, rotationDeg: 0, zoom: 1 };
    dragRef.current = { id: BACKGROUND_ID, target: 'background', mode: 'move', startClientX: e.clientX, startClientY: e.clientY, startGeom: geometry };
  }, [layout.backgroundGeometry, layout.backgroundImageUrl]);

  const beginBackgroundResize = useCallback((e: React.PointerEvent) => {
    if (!layout.backgroundImageUrl) return;
    e.stopPropagation();
    setSelectedId(BACKGROUND_ID);
    const geometry = layout.backgroundGeometry ?? { xPct: 0, yPct: 0, wPct: 100, hPct: 100, rotationDeg: 0, zoom: 1 };
    dragRef.current = { id: BACKGROUND_ID, target: 'background', mode: 'resize', startClientX: e.clientX, startClientY: e.clientY, startGeom: geometry };
  }, [layout.backgroundGeometry, layout.backgroundImageUrl]);

  const updateBackgroundGeometry = useCallback((patch: Partial<NonNullable<ScorecardLayout['backgroundGeometry']>>) => {
    setLayout(l => {
      const current = l.backgroundGeometry ?? { xPct: 0, yPct: 0, wPct: 100, hPct: 100, rotationDeg: 0, zoom: 1 };
      const next = { ...current, ...patch };
      next.wPct = Math.max(1, Math.min(100, next.wPct));
      next.hPct = Math.max(1, Math.min(100, next.hPct));
      next.xPct = Math.max(0, Math.min(100 - next.wPct, next.xPct));
      next.yPct = Math.max(0, Math.min(100 - next.hPct, next.yPct));
      next.zoom = Math.max(0.1, Math.min(3, next.zoom));
      return { ...l, backgroundGeometry: next };
    });
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!drag || !rect) return;
      const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
      const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;
      if (drag.target === 'background') {
        updateBackgroundGeometry(drag.mode === 'move' ? {
          xPct: Math.max(0, Math.min(100 - drag.startGeom.wPct, drag.startGeom.xPct + dxPct)),
          yPct: Math.max(0, Math.min(100 - drag.startGeom.hPct, drag.startGeom.yPct + dyPct)),
        } : {
          wPct: Math.max(1, Math.min(100 - drag.startGeom.xPct, drag.startGeom.wPct + dxPct)),
          hPct: Math.max(1, Math.min(100 - drag.startGeom.yPct, drag.startGeom.hPct + dyPct)),
        });
        return;
      }
      if (drag.mode === 'move') {
        updateGeometry(drag.id, {
          xPct: Math.max(0, Math.min(100 - drag.startGeom.wPct, drag.startGeom.xPct + dxPct)),
          yPct: Math.max(0, Math.min(100 - drag.startGeom.hPct, drag.startGeom.yPct + dyPct)),
        });
      } else {
        updateGeometry(drag.id, {
          wPct: Math.max(3, Math.min(100 - drag.startGeom.xPct, drag.startGeom.wPct + dxPct)),
          hPct: Math.max(3, Math.min(100 - drag.startGeom.yPct, drag.startGeom.hPct + dyPct)),
        });
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [updateBackgroundGeometry, updateGeometry]);

  // ── Layout persistence ──
  const handleSave = async () => {
    try {
      await scorecardLayoutService.saveLayout(sport, layout);
      flash('Layout saved');
    } catch { flash('Failed to save layout'); }
  };

  const handleSetActive = async () => {
    try {
      await scorecardLayoutService.saveLayout(sport, layout);
      await scorecardLayoutService.setActiveLayout(sport, layout.id, surface);
      flash('Set as active — now live in OBS Overlay & Camera Recorder');
    } catch { flash('Failed to activate layout'); }
  };

  const handleClearActive = async () => {
    try {
      await scorecardLayoutService.setActiveLayout(sport, null, surface);
      flash('Cleared active layout — sports fall back to the built-in design');
    } catch { flash('Failed to clear'); }
  };

  const handleNew = () => {
    setLayout(createEmptyLayout(sport, surface));
    setSelectedId(null);
  };

  const handleLoad = (l: ScorecardLayout) => {
    setLayout(l);
    setSelectedId(null);
  };

  const handleDuplicate = () => {
    const now = Date.now();
    setLayout(l => ({ ...l, id: `layout_${now}_${Math.random().toString(36).slice(2, 8)}`, name: `${l.name} (copy)`, createdAt: now, updatedAt: now }));
    flash('Duplicated — save to keep it');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this layout?')) return;
    try {
      await scorecardLayoutService.deleteLayout(sport, id, surface);
      if (layout.id === id) handleNew();
      flash('Deleted');
    } catch { flash('Failed to delete'); }
  };

  const handleBackgroundUpload = async (file: File) => {
    try {
      const url = await uploadFileToStorage(file, `media/scorecardDesigner/${sport}/${surface}/backgrounds/${Date.now()}`);
      setLayout(l => ({ ...l, backgroundImageUrl: url }));
      setSelectedId(BACKGROUND_ID);
      flash('Background uploaded');
    } catch { flash('Upload failed'); }
  };

  const handleWidgetImageUpload = async (widgetId: string, file: File) => {
    try {
      const url = await uploadFileToStorage(file, `media/scorecardDesigner/${sport}/${surface}/widgets/${widgetId}-${Date.now()}`);
      updateWidget(widgetId, { staticImageUrl: url });
      flash('Image uploaded');
    } catch { flash('Upload failed'); }
  };

  const handleCreateCustomWidget = async () => {
    if (!customForm.label.trim()) { flash('Give the widget a label'); return; }
    const def: CustomWidgetDef = {
      id: makeWidgetId(),
      sport,
      label: customForm.label.trim(),
      baseKind: customForm.baseKind,
      defaultText: customForm.baseKind === 'text' ? customForm.defaultText : undefined,
      defaultImageUrl: customForm.baseKind === 'image' ? customForm.defaultImageUrl : undefined,
      statBindingKey: customForm.baseKind === 'stat' ? (customForm.statBindingKey || undefined) : undefined,
      createdAt: Date.now(),
    };
    try {
      await scorecardLayoutService.saveCustomWidget(sport, def);
      flash('Custom widget created — find it in the palette below');
      setShowCustomModal(false);
      setCustomForm({ label: '', baseKind: 'text', defaultText: '', defaultImageUrl: '', statBindingKey: '' });
    } catch { flash('Failed to create widget'); }
  };

  if (!ready) {
    return <div className="scd scd--loading"><div className="scd__spinner" /><p>Connecting…</p></div>;
  }

  const isActive = activeLayoutId === layout.id;

  return (
    <div className="scd">
      <header className="scd__bar">
        <button className="scd__icon-btn" onClick={() => navigate(`/${sport}/scorer/admin`)} title="Back to Admin"><IoArrowBack size={18} /></button>
        <input
          className="scd__name-input"
          value={layout.name}
          onChange={e => setLayout(l => ({ ...l, name: e.target.value }))}
          placeholder="Layout name"
        />
        {isActive && <span className="scd__active-badge"><IoCheckmarkCircle size={13} /> ACTIVE</span>}
        <select
          className="scd__load-select"
          value=""
          onChange={e => { const found = layouts.find(l => l.id === e.target.value); if (found) handleLoad(found); }}
        >
          <option value="">Load saved layout…</option>
          {layouts.map(l => <option key={l.id} value={l.id}>{l.name}{l.id === activeLayoutId ? ' (active)' : ''}</option>)}
        </select>
        <div className="scd__bar-actions">
          <button className="scd__btn" onClick={handleNew}><IoAdd size={15} /> New</button>
          <button className="scd__btn" onClick={handleDuplicate}><IoCopyOutline size={15} /> Duplicate</button>
          <button className="scd__btn" onClick={handleSave}><IoSave size={15} /> Save</button>
          <button className="scd__btn scd__btn--primary" onClick={handleSetActive}>
            <IoCheckmarkCircle size={15} /> Set Active
          </button>
          {isActive && <button className="scd__btn scd__btn--danger" onClick={handleClearActive}>Clear Active</button>}
          <button className="scd__btn scd__btn--danger" onClick={() => handleDelete(layout.id)}><IoTrash size={15} /></button>
        </div>
      </header>

      <nav className="scd__surface-tabs">
        {(Object.keys(SURFACE_LABELS) as ScorecardSurface[]).map(s => (
          <button
            key={s}
            className={`scd__surface-tab ${surface === s ? 'is-active' : ''}`}
            onClick={() => setSurface(s)}
          >
            {SURFACE_LABELS[s]}
          </button>
        ))}
      </nav>

      {toast && <div className="scd__toast">{toast}</div>}

      <div className="scd__body">
        {/* ── Widget palette ── */}
        <aside className="scd__palette">
          <h3>Widgets for {sport}</h3>
          <p className="scd__hint">Drag a widget onto the canvas to place it.</p>
          <div className="scd__palette-grid">
            {catalog.map(entry => (
              <div
                key={entry.kind}
                className="scd__palette-item"
                draggable
                onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({ source: 'catalog', kind: entry.kind }))}
                onClick={() => addWidgetFromCatalog(entry, 40, 40)}
                title={entry.description}
              >
                <span className="scd__palette-icon">{entry.icon}</span>
                <span className="scd__palette-label">{entry.label}</span>
              </div>
            ))}
          </div>

          <div className="scd__palette-custom-head">
            <h3>Custom Widgets</h3>
            <button className="scd__btn scd__btn--sm" onClick={() => setShowCustomModal(true)}><IoAdd size={13} /> Create</button>
          </div>
          {customWidgets.length === 0 ? (
            <p className="scd__hint">No custom widgets yet — create a text, image, timer, or stat widget.</p>
          ) : (
            <div className="scd__palette-grid">
              {customWidgets.map(def => (
                <div
                  key={def.id}
                  className="scd__palette-item"
                  draggable
                  onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({ source: 'custom', customId: def.id }))}
                  onClick={() => addWidgetFromCustom(def, 40, 40)}
                  title={`Custom ${def.baseKind} widget`}
                >
                  <span className="scd__palette-icon">
                    {def.baseKind === 'text' && <IoText size={16} />}
                    {def.baseKind === 'image' && <IoImageOutline size={16} />}
                    {def.baseKind === 'timer' && <IoTimerOutline size={16} />}
                    {def.baseKind === 'stat' && <IoStatsChartOutline size={16} />}
                  </span>
                  <span className="scd__palette-label">{def.label}</span>
                  <button
                    className="scd__palette-del"
                    onClick={(e) => { e.stopPropagation(); void scorecardLayoutService.deleteCustomWidget(sport, def.id); }}
                    title="Delete custom widget"
                  >
                    <IoClose size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* ── Canvas ── */}
        <main className="scd__stage">
          <p className="scd__guideline-text">
            {SURFACE_HINTS[surface]}{' '}
            Preview shows sample data; live values populate automatically once this template is set Active.
          </p>
          <div className="scd__stage-frame">
            <div
              ref={canvasRef}
              className="scd__stage-canvas"
              onDragOver={e => e.preventDefault()}
              onDrop={handleCanvasDrop}
              onPointerDown={() => setSelectedId(null)}
            >
              <ScorecardLayoutView
                key={previewToken}
                layout={layout}
                ctx={mockCtx}
                selectedWidgetId={selectedId}
                interactive
                onPointerDownBackground={beginBackgroundDrag}
                onPointerDownWidget={(w, e) => beginDrag(w, 'move', e)}
                renderBackgroundOverlay={selectedId === BACKGROUND_ID && layout.backgroundImageUrl ? (
                  <div
                    className="scd__background-selection"
                    style={{
                      left: `${(layout.backgroundGeometry ?? { xPct: 0 }).xPct}%`,
                      top: `${(layout.backgroundGeometry ?? { yPct: 0 }).yPct}%`,
                      width: `${(layout.backgroundGeometry ?? { wPct: 100 }).wPct}%`,
                      height: `${(layout.backgroundGeometry ?? { hPct: 100 }).hPct}%`,
                      transform: `rotate(${(layout.backgroundGeometry ?? { rotationDeg: 0 }).rotationDeg}deg) scale(${(layout.backgroundGeometry ?? { zoom: 1 }).zoom})`,
                    }}
                  >
                    <span className="scd__resize-handle" onPointerDown={beginBackgroundResize} />
                  </div>
                ) : null}
                renderWidgetOverlay={(w) => (selectedId === w.id ? (
                  <span
                    className="scd__resize-handle"
                    onPointerDown={(e) => beginDrag(w, 'resize', e)}
                  />
                ) : null)}
              />
              {surface === 'scoreboard' ? (
                <div className="scd__guideline-band" style={{ top: '80%', height: '20%' }}>
                  <span>Recommended scorecard band (10–20% height)</span>
                </div>
              ) : (
                <div className="scd__guideline-fullscreen">
                  <span>Full-screen (100% width × 100% height), centered overlay</span>
                </div>
              )}
            </div>
          </div>
          <div className="scd__stage-actions">
            <label className="scd__btn scd__btn--sm">
              <IoCloudUploadOutline size={13} /> Upload Background
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) void handleBackgroundUpload(e.target.files[0]); }} />
            </label>
            {layout.backgroundImageUrl && (
              <button className="scd__btn scd__btn--sm" onClick={() => setLayout(l => ({ ...l, backgroundImageUrl: undefined }))}>
                <IoClose size={13} /> Remove Background
              </button>
            )}
          </div>
        </main>

        {/* ── Properties ── */}
        <aside className="scd__props">
          <h3>Properties</h3>
          {selectedId === BACKGROUND_ID && layout.backgroundImageUrl ? (
            <BackgroundPropertiesPanel
              geometry={layout.backgroundGeometry}
              onChange={updateBackgroundGeometry}
            />
          ) : !selectedWidget ? (
            <p className="scd__hint">Select a widget on the canvas to edit its style.</p>
          ) : (
            <PropertiesPanel
              widget={selectedWidget}
              onGeometryChange={patch => updateGeometry(selectedWidget.id, patch)}
              onStyleChange={patch => updateStyle(selectedWidget.id, patch)}
              onFieldChange={patch => updateWidget(selectedWidget.id, patch)}
              onRemove={() => removeWidget(selectedWidget.id)}
              onImageUpload={file => void handleWidgetImageUpload(selectedWidget.id, file)}
              onPreviewAnimation={() => setPreviewToken(t => t + 1)}
            />
          )}
        </aside>
      </div>

      {showCustomModal && (
        <div className="scd__modal" onClick={e => { if (e.target === e.currentTarget) setShowCustomModal(false); }}>
          <div className="scd__modal-card">
            <div className="scd__modal-head">
              <h3>Create Custom Widget</h3>
              <button onClick={() => setShowCustomModal(false)}><IoClose size={18} /></button>
            </div>
            <div className="scd__modal-body">
              <label className="scd__field">
                <span>Label</span>
                <input value={customForm.label} onChange={e => setCustomForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Sponsor Banner" />
              </label>
              <label className="scd__field">
                <span>Type</span>
                <select value={customForm.baseKind} onChange={e => setCustomForm(f => ({ ...f, baseKind: e.target.value as CustomWidgetBaseKind }))}>
                  <option value="text">Text</option>
                  <option value="image">Image</option>
                  <option value="timer">Timer</option>
                  <option value="stat">Live Stat (bind to existing data)</option>
                </select>
              </label>
              {customForm.baseKind === 'text' && (
                <label className="scd__field">
                  <span>Default text</span>
                  <input value={customForm.defaultText} onChange={e => setCustomForm(f => ({ ...f, defaultText: e.target.value }))} />
                </label>
              )}
              {customForm.baseKind === 'image' && (
                <label className="scd__field">
                  <span>Default image URL</span>
                  <input value={customForm.defaultImageUrl} onChange={e => setCustomForm(f => ({ ...f, defaultImageUrl: e.target.value }))} placeholder="https://…" />
                </label>
              )}
              {customForm.baseKind === 'stat' && (
                <label className="scd__field">
                  <span>Bind to</span>
                  <select value={customForm.statBindingKey} onChange={e => setCustomForm(f => ({ ...f, statBindingKey: e.target.value as WidgetKind }))}>
                    <option value="">Select a data field…</option>
                    {catalog.filter(c => c.category === 'score' || c.category === 'timer' || c.category === 'player').map(c => (
                      <option key={c.kind} value={c.kind}>{c.label}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="scd__modal-foot">
              <button className="scd__btn scd__btn--primary" onClick={handleCreateCustomWidget}><IoSave size={15} /> Create</button>
              <button className="scd__btn" onClick={() => setShowCustomModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Properties Panel ─────────────────────────────────────────────────────────

function BackgroundPropertiesPanel({ geometry, onChange }: Readonly<{
  geometry: ScorecardLayout['backgroundGeometry'];
  onChange: (patch: Partial<NonNullable<ScorecardLayout['backgroundGeometry']>>) => void;
}>) {
  const current = geometry ?? { xPct: 0, yPct: 0, wPct: 100, hPct: 100, rotationDeg: 0, zoom: 1 };
  return (
    <div className="scd__props-body">
      <div className="scd__props-head"><strong>Background Image</strong></div>
      <p className="scd__hint">Drag the image on the canvas or edit its percentage placement. These values are used by the live overlay and camera output.</p>
      <div className="scd__prop-grid">
        <label className="scd__field scd__field--sm"><span>X %</span><input type="number" min={0} max={100} value={Math.round(current.xPct)} onChange={e => onChange({ xPct: Number(e.target.value) || 0 })} /></label>
        <label className="scd__field scd__field--sm"><span>Y %</span><input type="number" min={0} max={100} value={Math.round(current.yPct)} onChange={e => onChange({ yPct: Number(e.target.value) || 0 })} /></label>
        <label className="scd__field scd__field--sm"><span>Width %</span><input type="number" min={1} max={100} value={Math.round(current.wPct)} onChange={e => onChange({ wPct: Number(e.target.value) || 1 })} /></label>
        <label className="scd__field scd__field--sm"><span>Height %</span><input type="number" min={1} max={100} value={Math.round(current.hPct)} onChange={e => onChange({ hPct: Number(e.target.value) || 1 })} /></label>
        <label className="scd__field scd__field--sm"><span>Rotate°</span><input type="number" value={current.rotationDeg} onChange={e => onChange({ rotationDeg: Number(e.target.value) || 0 })} /></label>
      </div>
      <label className="scd__field">
        <span>Zoom ({current.zoom.toFixed(2)}×)</span>
        <input type="range" min={0.1} max={3} step={0.05} value={current.zoom} onChange={e => onChange({ zoom: Number(e.target.value) })} />
      </label>
    </div>
  );
}

function PropertiesPanel({ widget, onGeometryChange, onStyleChange, onFieldChange, onRemove, onImageUpload, onPreviewAnimation }: Readonly<{
  widget: ScorecardWidgetInstance;
  onGeometryChange: (patch: Partial<ScorecardWidgetInstance['geometry']>) => void;
  onStyleChange: (patch: Partial<ScorecardWidgetInstance['style']>) => void;
  onFieldChange: (patch: Partial<ScorecardWidgetInstance>) => void;
  onRemove: () => void;
  onImageUpload: (file: File) => void;
  onPreviewAnimation: () => void;
}>) {
  const { geometry, style } = widget;
  const isImageKind = widget.kind === 'team_a_logo' || widget.kind === 'team_b_logo'
    || widget.kind === 'custom_image' || widget.kind === 'tournament_logo' || widget.kind === 'partner_logo';

  return (
    <div className="scd__props-body">
      <div className="scd__props-head">
        <strong>{widget.label}</strong>
        <div className="scd__props-toggles">
          <button title={widget.visible ? 'Hide' : 'Show'} onClick={() => onFieldChange({ visible: !widget.visible })}>
            {widget.visible ? <IoEyeOutline size={15} /> : <IoEyeOffOutline size={15} />}
          </button>
          <button title={widget.locked ? 'Unlock' : 'Lock'} onClick={() => onFieldChange({ locked: !widget.locked })}>
            {widget.locked ? <IoLockClosedOutline size={15} /> : <IoLockOpenOutline size={15} />}
          </button>
          <button title="Delete" onClick={onRemove}><IoTrash size={15} /></button>
        </div>
      </div>

      <div className="scd__prop-grid">
        <label className="scd__field scd__field--sm"><span>X %</span><input type="number" value={Math.round(geometry.xPct)} onChange={e => onGeometryChange({ xPct: Number(e.target.value) || 0 })} /></label>
        <label className="scd__field scd__field--sm"><span>Y %</span><input type="number" value={Math.round(geometry.yPct)} onChange={e => onGeometryChange({ yPct: Number(e.target.value) || 0 })} /></label>
        <label className="scd__field scd__field--sm"><span>W %</span><input type="number" value={Math.round(geometry.wPct)} onChange={e => onGeometryChange({ wPct: Number(e.target.value) || 1 })} /></label>
        <label className="scd__field scd__field--sm"><span>H %</span><input type="number" value={Math.round(geometry.hPct)} onChange={e => onGeometryChange({ hPct: Number(e.target.value) || 1 })} /></label>
        <label className="scd__field scd__field--sm"><span>Rotate°</span><input type="number" value={geometry.rotationDeg} onChange={e => onGeometryChange({ rotationDeg: Number(e.target.value) || 0 })} /></label>
        <label className="scd__field scd__field--sm"><span>Layer</span><input type="number" value={geometry.zIndex} onChange={e => onGeometryChange({ zIndex: Number(e.target.value) || 0 })} /></label>
      </div>

      {widget.kind === 'custom_text' && (
        <label className="scd__field"><span>Text</span><input value={widget.staticText ?? ''} onChange={e => onFieldChange({ staticText: e.target.value })} /></label>
      )}
      {widget.kind === 'custom_timer' && (
        <label className="scd__field"><span>Label prefix</span><input value={widget.timerLabel ?? ''} onChange={e => onFieldChange({ timerLabel: e.target.value })} /></label>
      )}
      {widget.kind === 'custom_image' && (
        <div className="scd__field">
          <span>Image</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={widget.staticImageUrl ?? ''} onChange={e => onFieldChange({ staticImageUrl: e.target.value })} placeholder="https://…" style={{ flex: 1 }} />
            <label className="scd__btn scd__btn--sm" style={{ margin: 0, cursor: 'pointer' }}>
              Upload
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) onImageUpload(e.target.files[0]); }} />
            </label>
          </div>
        </div>
      )}

      {!isImageKind && (
        <>
          <label className="scd__field"><span>Text color</span><input type="color" value={style.color ?? '#ffffff'} onChange={e => onStyleChange({ color: e.target.value })} /></label>
          <label className="scd__field">
            <span>Font family</span>
            <select value={style.fontFamily ?? 'Inter'} onChange={e => onStyleChange({ fontFamily: e.target.value })}>
              {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <div className="scd__prop-grid">
            <label className="scd__field scd__field--sm"><span>Size</span><input type="number" value={style.fontSize ?? 22} onChange={e => onStyleChange({ fontSize: Number(e.target.value) || 12 })} /></label>
            <label className="scd__field scd__field--sm">
              <span>Weight</span>
              <select value={style.fontWeight ?? 700} onChange={e => onStyleChange({ fontWeight: Number(e.target.value) })}>
                {[400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <label className="scd__field scd__field--sm">
              <span>Align</span>
              <select value={style.textAlign ?? 'center'} onChange={e => onStyleChange({ textAlign: e.target.value as 'left' | 'center' | 'right' })}>
                <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
              </select>
            </label>
            <label className="scd__field scd__field--sm">
              <span>Case</span>
              <select value={style.textTransform ?? 'none'} onChange={e => onStyleChange({ textTransform: e.target.value as 'none' | 'uppercase' | 'capitalize' })}>
                <option value="none">None</option><option value="uppercase">UPPER</option><option value="capitalize">Capitalize</option>
              </select>
            </label>
          </div>
          <label className="scd__field">
            <span>Text shadow</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={!!style.textShadowEnabled} onChange={e => onStyleChange({ textShadowEnabled: e.target.checked })} />
              <input type="color" value={style.textShadowColor ?? '#000000'} onChange={e => onStyleChange({ textShadowColor: e.target.value })} disabled={!style.textShadowEnabled} />
              <input type="number" value={style.textShadowBlur ?? 6} onChange={e => onStyleChange({ textShadowBlur: Number(e.target.value) || 0 })} disabled={!style.textShadowEnabled} style={{ width: 60 }} />
            </div>
          </label>
        </>
      )}

      {isImageKind && (
        <label className="scd__field">
          <span>Image fit</span>
          <select value={style.objectFit ?? 'contain'} onChange={e => onStyleChange({ objectFit: e.target.value as 'cover' | 'contain' })}>
            <option value="contain">Contain</option><option value="cover">Cover</option>
          </select>
        </label>
      )}

      <label className="scd__field"><span>Background color</span><input type="color" value={(style.backgroundColor ?? '#0a0a0a').startsWith('rgba') ? '#0a0a0a' : (style.backgroundColor ?? '#0a0a0a')} onChange={e => onStyleChange({ backgroundColor: e.target.value })} /></label>

      <div className="scd__prop-grid">
        <label className="scd__field scd__field--sm"><span>Radius</span><input type="number" value={style.borderRadius ?? 0} onChange={e => onStyleChange({ borderRadius: Number(e.target.value) || 0 })} /></label>
        <label className="scd__field scd__field--sm"><span>Border W</span><input type="number" value={style.borderWidth ?? 0} onChange={e => onStyleChange({ borderWidth: Number(e.target.value) || 0 })} /></label>
        <label className="scd__field scd__field--sm"><span>Border color</span><input type="color" value={style.borderColor ?? '#ffffff'} onChange={e => onStyleChange({ borderColor: e.target.value })} /></label>
        <label className="scd__field scd__field--sm"><span>Padding</span><input type="number" value={style.padding ?? 0} onChange={e => onStyleChange({ padding: Number(e.target.value) || 0 })} /></label>
      </div>

      <label className="scd__field">
        <span>Opacity ({Math.round((style.opacity ?? 1) * 100)}%)</span>
        <input type="range" min={0} max={1} step={0.05} value={style.opacity ?? 1} onChange={e => onStyleChange({ opacity: Number(e.target.value) })} />
      </label>

      <label className="scd__field">
        <span>Box shadow</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={!!style.boxShadowEnabled} onChange={e => onStyleChange({ boxShadowEnabled: e.target.checked })} />
          <input type="color" value={style.boxShadowColor ?? '#000000'} onChange={e => onStyleChange({ boxShadowColor: e.target.value })} disabled={!style.boxShadowEnabled} />
          <input type="number" value={style.boxShadowBlur ?? 12} onChange={e => onStyleChange({ boxShadowBlur: Number(e.target.value) || 0 })} disabled={!style.boxShadowEnabled} style={{ width: 60 }} />
        </div>
      </label>

      <div className="scd__props-section-head">
        <span>Zoom &amp; Animation</span>
        <button className="scd__btn scd__btn--sm" onClick={onPreviewAnimation} title="Replay the entrance animation for this template">
          ▶ Preview
        </button>
      </div>

      <label className="scd__field">
        <span>Zoom ({(style.zoom ?? 1).toFixed(2)}×)</span>
        <input type="range" min={0.1} max={3} step={0.05} value={style.zoom ?? 1} onChange={e => onStyleChange({ zoom: Number(e.target.value) })} />
      </label>

      <div className="scd__prop-grid">
        <label className="scd__field scd__field--sm">
          <span>Entrance</span>
          <select
            value={style.entranceAnimation ?? 'none'}
            onChange={e => onStyleChange({ entranceAnimation: e.target.value as WidgetEntranceAnimation })}
          >
            {ANIMATION_PRESETS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </label>
        <label className="scd__field scd__field--sm">
          <span>Duration ms</span>
          <input type="number" min={0} step={50} value={style.animationDurationMs ?? 500} onChange={e => onStyleChange({ animationDurationMs: Number(e.target.value) || 0 })} />
        </label>
        <label className="scd__field scd__field--sm">
          <span>Delay ms</span>
          <input type="number" min={0} step={50} value={style.animationDelayMs ?? 0} onChange={e => onStyleChange({ animationDelayMs: Number(e.target.value) || 0 })} />
        </label>
      </div>
    </div>
  );
}
