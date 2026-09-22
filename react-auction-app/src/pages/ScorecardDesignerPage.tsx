// ============================================================================
// SCORECARD DESIGNER — Canva-style drag-and-drop scorecard layout builder
// Lets an admin drop sport-specific widgets (score, team logos, timers, raid
// clock, etc.) onto a full-bleed 16:9 canvas, style each one (color, font,
// shadow, border), upload a background, and save/activate templates. The
// active template then drives BOTH the OBS Overlay and the Camera Recorder,
// so the two always render an identical scorecard.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPerson, faPeopleGroup, faPersonRunning, faShieldHalved, faCircleUser, faBolt, faDragon, faHandBackFist, faBullseye } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  IoAdd, IoSave, IoTrash, IoClose, IoCopyOutline, IoEyeOutline, IoEyeOffOutline,
  IoLockClosedOutline, IoLockOpenOutline, IoCloudUploadOutline, IoCheckmarkCircle,
  IoArrowBack, IoText, IoImageOutline, IoTimerOutline, IoStatsChartOutline, IoColorWandOutline,
  IoArrowUpOutline, IoArrowDownOutline, IoChevronUpOutline, IoChevronDownOutline,
  IoLayersOutline,
} from 'react-icons/io5';
import { useTenantNavigate as useNavigate } from '../hooks/useTenantNavigate';
import { useTheme } from '../hooks/useTheme';
import { realtimeSync } from '../services/realtimeSync';
import { scorecardLayoutService } from '../services/scorecardLayoutService';
import { uploadFileToStorage } from '../services/firebaseStorageService';
import { tenantPath } from '../services/tenantPath';
import { ScorecardLayoutView } from '../components/ScorecardCanvas';
import {
  getWidgetCatalog, createWidgetInstance, createEmptyLayout, makeWidgetId,
  DEFAULT_WIDGET_STYLE, SURFACE_LABELS, SURFACE_HINTS, ANIMATION_PRESETS,
} from '../types/scorecardDesigner';
import type {
  ScorecardLayout, ScorecardWidgetInstance, WidgetCatalogEntry, WidgetKind,
  CustomWidgetDef, CustomWidgetBaseKind, ScorecardSurface, WidgetEntranceAnimation,
  ScorecardAsset, ScorecardWidgetVariant, ScorecardViewportVariant, WidgetGeometry,
} from '../types/scorecardDesigner';
import type { ScorecardDataContext } from '../utils/scorecardDataBinding';
import type { SupportedGameType } from './scorerPages';
import type { Team } from '../types';
import './ScorecardDesignerPage.css';

const FONT_OPTIONS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Nunito', 'Raleway',
  'Oswald', 'Roboto Condensed', 'Barlow Condensed', 'Bebas Neue', 'Playfair Display',
  'Merriweather', 'Source Serif 4', 'Roboto Slab', 'Space Grotesk', 'DM Sans',
  'Plus Jakarta Sans', 'Manrope', 'Arial', 'Georgia',
];

const DESIGN_VIEWPORTS = [
  { id: 'desktop-hd', label: 'Desktop HD', width: 1920, height: 1080 },
  { id: 'desktop-small', label: 'Desktop Small', width: 1600, height: 900 },
  { id: 'tablet-landscape', label: 'Tablet Landscape', width: 1280, height: 800 },
  { id: 'mobile-landscape', label: 'Mobile Landscape', width: 1280, height: 720 },
  { id: 'mobile-portrait', label: 'Mobile Portrait', width: 1080, height: 1920 },
] as const;

const PLAYER_ICON_OPTIONS = [
  { value: 'person', label: 'Person', icon: faPerson },
  { value: 'people', label: 'People', icon: faPeopleGroup },
  { value: 'kabaddi-mascot', label: 'Kabaddi mascot', icon: faDragon },
  { value: 'raider', label: 'Raider', icon: faPersonRunning },
  { value: 'defender', label: 'Defender', icon: faShieldHalved },
  { value: 'tackle', label: 'Tackle', icon: faHandBackFist },
  { value: 'raid-target', label: 'Raid target', icon: faBullseye },
  { value: 'blue-marker', label: 'Blue marker', icon: faCircleUser },
  { value: 'red-marker', label: 'Red marker', icon: faBolt },
] satisfies Array<{ value: string; label: string; icon: IconDefinition }>;

function previewPlayerItems(value: string): Array<{ text: string; imageUrl: string }> {
  return value.split(',').map(name => name.trim()).filter(Boolean).map(name => ({
    text: name,
    imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=334155&color=ffffff&size=96`,
  }));
}

function widgetHasLiveBinding(kind: WidgetKind): boolean {
  return !kind.startsWith('custom_') && kind !== 'team_a_score' && kind !== 'team_b_score';
}

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
  const { currentTheme } = useTheme();
  const sport = gameType;
  const [ready, setReady] = useState(false);
  const [surface, setSurface] = useState<ScorecardSurface>('scoreboard');
  const [layout, setLayoutState] = useState<ScorecardLayout>(() => createEmptyLayout(sport, 'scoreboard'));
  const [layouts, setLayouts] = useState<ScorecardLayout[]>([]);
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  const [customWidgets, setCustomWidgets] = useState<CustomWidgetDef[]>([]);
  const [assets, setAssets] = useState<ScorecardAsset[]>([]);
  const [auctionTeams, setAuctionTeams] = useState<Team[]>([]);
  const [branding, setBranding] = useState<{ tournamentLogo?: string; partnerLogo?: string; doOrDieFlagUrl?: string; superRaidFlagUrl?: string; superTackleFlagUrl?: string; allOutFlagUrl?: string; bonusPointFlagUrl?: string }>({});
  const [tenantTournamentLogo, setTenantTournamentLogo] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [propertyPickerSourceId, setPropertyPickerSourceId] = useState<string | null>(null);
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [propertyTeamSide, setPropertyTeamSide] = useState<'common' | 'team_a' | 'team_b'>('common');
  const [toast, setToast] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customForm, setCustomForm] = useState<{ label: string; baseKind: CustomWidgetBaseKind; defaultText: string; defaultImageUrl: string; statBindingKey: WidgetKind | '' }>({
    label: '', baseKind: 'text', defaultText: '', defaultImageUrl: '', statBindingKey: '',
  });
  const [previewToken, setPreviewToken] = useState(0);
  const [designViewportId, setDesignViewportId] = useState<(typeof DESIGN_VIEWPORTS)[number]['id']>('desktop-hd');

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const layoutRef = useRef(layout);
  const historyRef = useRef<{ past: ScorecardLayout[]; future: ScorecardLayout[] }>({ past: [], future: [] });
  const setLayout = useCallback((update: ScorecardLayout | ((current: ScorecardLayout) => ScorecardLayout)) => {
    setLayoutState(current => {
      const next = typeof update === 'function' ? update(current) : update;
      if (next === current) return current;
      historyRef.current.past = [...historyRef.current.past, current].slice(-100);
      historyRef.current.future = [];
      return next;
    });
  }, []);
  useEffect(() => { layoutRef.current = layout; }, [layout]);

  const undoLayout = useCallback(() => {
    setLayoutState(current => {
      const previous = historyRef.current.past.pop();
      if (!previous) return current;
      historyRef.current.future.push(current);
      return previous;
    });
  }, []);

  const redoLayout = useCallback(() => {
    setLayoutState(current => {
      const next = historyRef.current.future.pop();
      if (!next) return current;
      historyRef.current.past.push(current);
      return next;
    });
  }, []);

  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 2400); }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const modifier = e.metaKey || e.ctrlKey;
      if (!modifier) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoLayout();
        else undoLayout();
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redoLayout();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redoLayout, undoLayout]);

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
      scorecardLayoutService.subscribeAssets(sport, setAssets),
    ];
    const db = realtimeSync.getDatabase();
    if (db) {
      unsubs.push(onValue(ref(db, tenantPath('auction/teams')), snapshot => {
        const value = snapshot.val() as Team[] | Record<string, Team> | null;
        setAuctionTeams(value ? Object.values(value).filter((team): team is Team => !!team?.id) : []);
      }));
      unsubs.push(onValue(ref(db, tenantPath('auction/adminSettings')), snapshot => {
        const settings = snapshot.val() as { organizerLogo?: string } | null;
        setTenantTournamentLogo(settings?.organizerLogo || undefined);
      }));
      const brandingPaths = ['scoring/overlayConfig', 'football/overlayConfig', 'kabaddi/overlayConfig'];
      brandingPaths.forEach(path => unsubs.push(onValue(ref(db, tenantPath(path)), snapshot => {
        const value = snapshot.val() as { tournamentLogo?: string; broadcastPartnerLogo?: string; doOrDieAnimation?: { mediaUrl?: string }; superRaidAnimation?: { mediaUrl?: string }; superTackleAnimation?: { mediaUrl?: string }; allOutAnimation?: { mediaUrl?: string }; bonusAnimation?: { mediaUrl?: string } } | null;
        if (!value) return;
        setBranding(current => path === 'kabaddi/overlayConfig' ? {
          ...current,
          doOrDieFlagUrl: value.doOrDieAnimation?.mediaUrl,
          superRaidFlagUrl: value.superRaidAnimation?.mediaUrl,
          superTackleFlagUrl: value.superTackleAnimation?.mediaUrl,
          allOutFlagUrl: value.allOutAnimation?.mediaUrl,
          bonusPointFlagUrl: value.bonusAnimation?.mediaUrl,
          tournamentLogo: value.tournamentLogo || current.tournamentLogo,
          partnerLogo: value.broadcastPartnerLogo || current.partnerLogo,
        } : {
          tournamentLogo: current.tournamentLogo || value.tournamentLogo,
          partnerLogo: current.partnerLogo || value.broadcastPartnerLogo,
          doOrDieFlagUrl: current.doOrDieFlagUrl,
          superRaidFlagUrl: current.superRaidFlagUrl,
          superTackleFlagUrl: current.superTackleFlagUrl,
          allOutFlagUrl: current.allOutFlagUrl,
          bonusPointFlagUrl: current.bonusPointFlagUrl,
        });
      })));
    }
    return () => unsubs.forEach(u => u());
  }, [ready, sport, surface]);

  const mockCtx = useMemo(() => mockContextFor(sport), [sport]);
  const previewBranding = useMemo(() => ({
    tournamentLogo: tenantTournamentLogo || branding.tournamentLogo || currentTheme.seasonLogo,
    partnerLogo: branding.partnerLogo,
    doOrDieFlagUrl: branding.doOrDieFlagUrl,
    superRaidFlagUrl: branding.superRaidFlagUrl,
    superTackleFlagUrl: branding.superTackleFlagUrl,
    allOutFlagUrl: branding.allOutFlagUrl,
    bonusPointFlagUrl: branding.bonusPointFlagUrl,
  }), [branding, currentTheme.seasonLogo, tenantTournamentLogo]);
  const previewCtx = useMemo(() => ({ ...mockCtx, branding: { ...mockCtx.branding, ...previewBranding } }), [mockCtx, previewBranding]);
  const catalog = getWidgetCatalog(sport, surface);
  const selectedWidget = layout.widgets.find(w => w.id === selectedId) ?? null;
  const designViewport = DESIGN_VIEWPORTS.find(viewport => viewport.id === designViewportId) ?? DESIGN_VIEWPORTS[0];

  const viewportSnapshot = (current: ScorecardLayout): ScorecardViewportVariant => ({
    widgets: Object.fromEntries(current.widgets.map(widget => [widget.id, { ...widget.geometry }])) as Record<string, WidgetGeometry>,
    backgroundGeometry: current.backgroundGeometry ? { ...current.backgroundGeometry } : undefined,
  });

  const switchDesignViewport = (nextId: typeof designViewportId) => {
    if (nextId === designViewportId) return;
    setLayout(current => {
      const variants = { ...(current.viewportVariants ?? {}), [designViewportId]: viewportSnapshot(current) };
      const target = variants[nextId];
      return {
        ...current,
        viewportVariants: variants,
        widgets: target ? current.widgets.map(widget => ({
          ...widget,
          geometry: target.widgets[widget.id] ? { ...widget.geometry, ...target.widgets[widget.id] } : widget.geometry,
        })) : current.widgets,
        backgroundGeometry: target?.backgroundGeometry ?? current.backgroundGeometry,
      };
    });
    setDesignViewportId(nextId);
  };

  const snapshotWidgetVariant = (widget: ScorecardWidgetInstance): ScorecardWidgetVariant => ({
    geometry: { ...widget.geometry },
    style: { ...widget.style },
    staticText: widget.staticText,
    staticImageUrl: widget.staticImageUrl,
    timerLabel: widget.timerLabel,
    previewText: widget.previewText,
    previewImageUrl: widget.previewImageUrl,
    previewIcon: widget.previewIcon,
    previewItems: widget.previewItems,
  });

  const switchPropertyTeamSide = useCallback((side: 'common' | 'team_a' | 'team_b') => {
    if (!selectedWidget || !['kabaddi_do_or_die_flag', 'kabaddi_super_raid_flag', 'kabaddi_super_tackle_flag', 'kabaddi_all_out_flag', 'kabaddi_bonus_point_flag'].includes(selectedWidget.kind)) {
      setPropertyTeamSide(side);
      return;
    }
    setLayout(currentLayout => {
      const current = currentLayout.widgets.find(widget => widget.id === selectedWidget.id);
      if (!current) return currentLayout;
      const variants = { ...(current.teamVariants ?? {}) };
      const currentVariant = snapshotWidgetVariant(current);
      if (propertyTeamSide !== 'common') variants[propertyTeamSide] = currentVariant;
      if (!variants.common) variants.common = currentVariant;
      const target = variants[side] ?? variants.common ?? currentVariant;
      return {
        ...currentLayout,
        widgets: currentLayout.widgets.map(widget => widget.id === current.id ? {
          ...widget,
          ...(target ?? {}),
          previewTeamSide: side,
          teamVariants: variants,
        } : widget),
      };
    });
    setPropertyTeamSide(side);
  }, [propertyTeamSide, selectedWidget]);

  const savePropertyTeamSide = useCallback(() => {
    if (!selectedWidget) return;
    setLayout(currentLayout => ({
      ...currentLayout,
      widgets: currentLayout.widgets.map(widget => widget.id === selectedWidget.id ? {
        ...widget,
        teamVariants: { ...(widget.teamVariants ?? {}), [propertyTeamSide]: snapshotWidgetVariant(widget) },
      } : widget),
    }));
    flash(`${propertyTeamSide === 'common' ? 'Common' : propertyTeamSide === 'team_a' ? 'Team A' : 'Team B'} overlay position saved`);
  }, [flash, propertyTeamSide, selectedWidget]);

  const copyWidgetProperties = useCallback((source: ScorecardWidgetInstance, target: ScorecardWidgetInstance) => {
    if (source.id === target.id || target.locked) return;
    setLayout(l => ({
      ...l,
      widgets: l.widgets.map(widget => widget.id === target.id ? {
        ...widget,
        style: { ...source.style },
      } : widget),
    }));
    setPropertyPickerSourceId(null);
    setSelectedId(target.id);
    flash(`Properties copied from ${source.label}`);
  }, [flash]);

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

  const updateLayer = useCallback((id: string, mode: 'front' | 'back' | 'forward' | 'backward') => {
    setLayout(l => {
      const target = l.widgets.find(widget => widget.id === id);
      if (!target) return l;
      const layers = l.widgets.map(widget => widget.geometry.zIndex);
      const maxLayer = Math.max(...layers, 0);
      const minLayer = Math.min(...layers, 0);
      const delta = mode === 'front' ? maxLayer + 1 : mode === 'back' ? minLayer - 1 : mode === 'forward' ? 1 : -1;
      return {
        ...l,
        widgets: l.widgets.map(widget => widget.id === id
          ? { ...widget, geometry: { ...widget.geometry, zIndex: mode === 'front' || mode === 'back' ? delta : widget.geometry.zIndex + delta } }
          : widget),
      };
    });
  }, []);

  // Nudge the selected widget with the arrow keys. Values stay in percentages
  // so keyboard placement matches pointer dragging and live overlay output.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedWidget || selectedWidget.locked) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const step = e.shiftKey ? 1 : 0.25;
      const delta = e.key === 'ArrowLeft' ? { xPct: -step }
        : e.key === 'ArrowRight' ? { xPct: step }
        : e.key === 'ArrowUp' ? { yPct: -step }
        : e.key === 'ArrowDown' ? { yPct: step }
        : null;
      if (!delta) return;
      e.preventDefault();
      const geometry = selectedWidget.geometry;
      updateGeometry(selectedWidget.id, {
        xPct: delta.xPct ? Math.max(0, Math.min(100 - geometry.wPct, geometry.xPct + delta.xPct)) : geometry.xPct,
        yPct: delta.yPct ? Math.max(0, Math.min(100 - geometry.hPct, geometry.yPct + delta.yPct)) : geometry.yPct,
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedWidget, updateGeometry]);

  const updateStyle = useCallback((id: string, patch: Partial<ScorecardWidgetInstance['style']>) => {
    setLayout(l => ({ ...l, widgets: l.widgets.map(w => (w.id === id ? { ...w, style: { ...w.style, ...patch } } : w)) }));
  }, []);

  const removeWidget = useCallback((id: string) => {
    setLayout(l => ({ ...l, widgets: l.widgets.filter(w => w.id !== id) }));
    setSelectedId(cur => (cur === id ? null : cur));
  }, []);

  const duplicateWidget = useCallback((source: ScorecardWidgetInstance) => {
    const oppositeKind: Partial<Record<WidgetKind, WidgetKind>> = {
      team_a_logo: 'team_b_logo', team_b_logo: 'team_a_logo',
      team_a_name: 'team_b_name', team_b_name: 'team_a_name',
      team_a_score: 'team_b_score', team_b_score: 'team_a_score',
      kabaddi_team_a_players_on_mat: 'kabaddi_team_b_players_on_mat',
      kabaddi_team_b_players_on_mat: 'kabaddi_team_a_players_on_mat',
      kabaddi_team_a_players: 'kabaddi_team_b_players',
      kabaddi_team_b_players: 'kabaddi_team_a_players',
    };
    const copy: ScorecardWidgetInstance = {
      ...source,
      id: makeWidgetId(),
      kind: oppositeKind[source.kind] ?? source.kind,
      label: oppositeKind[source.kind] ? source.label.replace(/Team A|Team B/g, match => match === 'Team A' ? 'Team B' : 'Team A') : `${source.label} Copy`,
      geometry: {
        ...source.geometry,
        xPct: Math.min(100 - source.geometry.wPct, source.geometry.xPct + 4),
        yPct: Math.min(100 - source.geometry.hPct, source.geometry.yPct + 4),
      },
      style: { ...source.style },
      teamVariants: source.teamVariants ? {
        team_a: source.teamVariants.team_a ? { ...source.teamVariants.team_a, geometry: { ...source.teamVariants.team_a.geometry }, style: { ...source.teamVariants.team_a.style } } : undefined,
        team_b: source.teamVariants.team_b ? { ...source.teamVariants.team_b, geometry: { ...source.teamVariants.team_b.geometry }, style: { ...source.teamVariants.team_b.style } } : undefined,
      } : undefined,
    };
    setLayout(l => ({ ...l, widgets: [...l.widgets, copy] }));
    setSelectedId(copy.id);
    flash(`Duplicated ${source.label}`);
  }, [flash]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedWidget || selectedWidget.locked) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      e.preventDefault();
      removeWidget(selectedWidget.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [removeWidget, selectedWidget]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedWidget || selectedWidget.locked) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'd') return;
      e.preventDefault();
      duplicateWidget(selectedWidget);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [duplicateWidget, selectedWidget]);

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
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(widget.id);
    setPropertyTeamSide(widget.previewTeamSide ?? 'common');
    dragRef.current = { id: widget.id, target: 'widget', mode, startClientX: e.clientX, startClientY: e.clientY, startGeom: widget.geometry };
  }, []);

  const handleWidgetPointerDown = useCallback((widget: ScorecardWidgetInstance, e: React.PointerEvent) => {
    if (propertyPickerSourceId) {
      e.stopPropagation();
      const source = layout.widgets.find(candidate => candidate.id === propertyPickerSourceId);
      if (source) copyWidgetProperties(source, widget);
      return;
    }
    beginDrag(widget, 'move', e);
  }, [beginDrag, copyWidgetProperties, layout.widgets, propertyPickerSourceId]);

  const beginBackgroundDrag = useCallback((e: React.PointerEvent) => {
    if (!layout.backgroundImageUrl) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(BACKGROUND_ID);
    const geometry = layout.backgroundGeometry ?? { xPct: 0, yPct: 0, wPct: 100, hPct: 100, rotationDeg: 0, zoom: 1 };
    dragRef.current = { id: BACKGROUND_ID, target: 'background', mode: 'move', startClientX: e.clientX, startClientY: e.clientY, startGeom: geometry };
  }, [layout.backgroundGeometry, layout.backgroundImageUrl]);

  const beginBackgroundResize = useCallback((e: React.PointerEvent) => {
    if (!layout.backgroundImageUrl) return;
    e.preventDefault();
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
      const persistLayout = selectedWidget
        ? { ...layout, widgets: layout.widgets.map(widget => widget.id === selectedWidget.id ? { ...widget, teamVariants: { ...(widget.teamVariants ?? {}), [propertyTeamSide]: snapshotWidgetVariant(widget) } } : widget) }
        : layout;
      await scorecardLayoutService.saveLayout(sport, persistLayout);
      flash('Layout saved');
    } catch { flash('Failed to save layout'); }
  };

  const handleSetActive = async () => {
    try {
      const persistLayout = selectedWidget
        ? { ...layout, widgets: layout.widgets.map(widget => widget.id === selectedWidget.id ? { ...widget, teamVariants: { ...(widget.teamVariants ?? {}), [propertyTeamSide]: snapshotWidgetVariant(widget) } } : widget) }
        : layout;
      await scorecardLayoutService.saveLayout(sport, persistLayout);
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
    setPropertyTeamSide('common');
  };

  const handleLoad = (l: ScorecardLayout) => {
    setLayout(l);
    setSelectedId(null);
    setPropertyPickerSourceId(null);
    setPropertyTeamSide('common');
  };

  // Keep the designer canvas aligned when the active layout changes from this
  // page, another browser tab, or an overlay control surface.
  useEffect(() => {
    if (!activeLayoutId) return;
    const activeLayout = layouts.find(saved => saved.id === activeLayoutId);
    if (activeLayout && activeLayout.id !== layout.id) handleLoad(activeLayout);
  }, [activeLayoutId, layouts]);

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
      const storagePath = `media/scorecardDesigner/${sport}/${surface}/backgrounds/${Date.now()}-${makeWidgetId()}`;
      const url = await uploadFileToStorage(file, storagePath);
      await scorecardLayoutService.saveAsset(sport, { id: makeWidgetId(), name: file.name, url, storagePath, kind: 'background', createdAt: Date.now() });
      setLayout(l => ({ ...l, backgroundImageUrl: url }));
      setSelectedId(BACKGROUND_ID);
      flash('Background uploaded');
    } catch { flash('Upload failed'); }
  };

  const handleWidgetImageUpload = async (widgetId: string, file: File) => {
    try {
      const storagePath = `media/scorecardDesigner/${sport}/${surface}/widgets/${widgetId}-${Date.now()}-${makeWidgetId()}`;
      const url = await uploadFileToStorage(file, storagePath);
      await scorecardLayoutService.saveAsset(sport, { id: makeWidgetId(), name: file.name, url, storagePath, kind: file.type === 'image/gif' ? 'gif' : 'image', createdAt: Date.now() });
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

  const applyAssetToWidget = (asset: ScorecardAsset) => {
    if (selectedWidget && (selectedWidget.kind === 'custom_image' || selectedWidget.kind === 'team_a_logo' || selectedWidget.kind === 'team_b_logo')) {
      updateWidget(selectedWidget.id, { staticImageUrl: asset.url });
      return;
    }
    const instance = createWidgetInstance({ kind: 'custom_image', label: asset.name, icon: '🖼️', defaultW: 18, defaultH: 18, category: 'branding', description: 'Reusable uploaded asset' }, 40, 40);
    setLayout(l => ({ ...l, widgets: [...l.widgets, { ...instance, staticImageUrl: asset.url }] }));
    setSelectedId(instance.id);
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
          value={layouts.some(saved => saved.id === layout.id) ? layout.id : ''}
          onChange={e => { const found = layouts.find(l => l.id === e.target.value); if (found) handleLoad(found); }}
        >
          <option value="">Load saved layout…</option>
          {layouts.map(l => <option key={l.id} value={l.id}>{l.name}{l.id === activeLayoutId ? ' (active)' : ''}</option>)}
        </select>
        <div className="scd__saved-layouts">
          {layouts.map(saved => (
            <div key={saved.id} className={`scd__saved-layout ${saved.id === layout.id ? 'is-current' : ''}`}>
              <button className="scd__saved-layout-name" onClick={() => handleLoad(saved)} title="Open layout">{saved.name}</button>
              <button className="scd__saved-layout-action" onClick={() => {
                const name = window.prompt('Rename layout', saved.name)?.trim();
                if (name && name !== saved.name) void scorecardLayoutService.saveLayout(sport, { ...saved, name });
              }} title="Rename layout">Rename</button>
              <button className="scd__saved-layout-action scd__saved-layout-action--danger" onClick={() => void handleDelete(saved.id)} title="Delete layout">Delete</button>
            </div>
          ))}
        </div>
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

          <div className="scd__palette-custom-head"><h3>Saved Assets</h3></div>
          <p className="scd__hint">Reusable backgrounds, images, and GIFs.</p>
          <div className="scd__asset-list">
            {assets.map(asset => (
              <div key={asset.id} className="scd__asset-item">
                <button className="scd__asset-preview" title={`Use ${asset.name}`} onClick={() => {
                  if (asset.kind === 'background') { setLayout(l => ({ ...l, backgroundImageUrl: asset.url })); setSelectedId(BACKGROUND_ID); }
                  else applyAssetToWidget(asset);
                }}>
                  <img src={asset.url} alt="" />
                </button>
                <span title={asset.name}>{asset.name}</span>
                <button className="scd__palette-del" onClick={() => void scorecardLayoutService.deleteAsset(sport, asset.id)} title="Delete saved asset"><IoClose size={12} /></button>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Canvas ── */}
        <main className="scd__stage">
          <p className="scd__guideline-text">
            {SURFACE_HINTS[surface]}{' '}
            Preview shows sample data; live values populate automatically once this template is set Active.
          </p>
          <div className="scd__viewport-toolbar">
            <span>Preview screen</span>
            <select value={designViewportId} onChange={e => switchDesignViewport(e.target.value as typeof designViewportId)}>
              {DESIGN_VIEWPORTS.map(viewport => <option key={viewport.id} value={viewport.id}>{viewport.label} ({viewport.width}×{viewport.height})</option>)}
            </select>
            <div className="scd__layers-toggle-wrap">
              <button type="button" className={`scd__layers-toggle ${showLayersPanel ? 'is-active' : ''}`} onClick={() => setShowLayersPanel(value => !value)} title="Show layers">
                <IoLayersOutline size={14} /> Layers <span>{layout.widgets.length}</span>
              </button>
              {showLayersPanel && (
                <LayersPanel
                  layout={layout}
                  selectedId={selectedId}
                  onSelect={id => { setSelectedId(id); setShowLayersPanel(false); }}
                  onLayerChange={updateLayer}
                  onVisibilityChange={(id, visible) => updateWidget(id, { visible })}
                />
              )}
            </div>
            <small>Adjust positions here for the selected screen frame. Saved geometry remains responsive.</small>
          </div>
          <div className="scd__stage-frame">
            <div
              ref={canvasRef}
              className={`scd__stage-canvas ${designViewport.height > designViewport.width ? 'is-portrait' : ''}`}
              style={{ aspectRatio: `${designViewport.width} / ${designViewport.height}` }}
              onDragOver={e => e.preventDefault()}
              onDrop={handleCanvasDrop}
              onPointerDown={() => setSelectedId(null)}
            >
              <ScorecardLayoutView
                key={previewToken}
                layout={layout}
                ctx={previewCtx}
                selectedWidgetId={selectedId}
                interactive
                onPointerDownBackground={beginBackgroundDrag}
                onPointerDownWidget={handleWidgetPointerDown}
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
              assets={assets}
              auctionTeams={auctionTeams}
              branding={previewBranding}
              layout={layout}
              onDuplicate={duplicateWidget}
              onGeometryChange={patch => updateGeometry(selectedWidget.id, patch)}
              onStyleChange={patch => updateStyle(selectedWidget.id, patch)}
              onLayerChange={mode => updateLayer(selectedWidget.id, mode)}
              onFieldChange={patch => updateWidget(selectedWidget.id, patch)}
              onLayoutChange={patch => setLayout(l => ({ ...l, ...patch }))}
              propertyTeamSide={propertyTeamSide}
              onTeamSideChange={switchPropertyTeamSide}
              onSaveTeamSide={savePropertyTeamSide}
              propertyPickerActive={propertyPickerSourceId !== null}
              onStartPropertyPicker={() => setPropertyPickerSourceId(selectedWidget.id)}
              onCancelPropertyPicker={() => setPropertyPickerSourceId(null)}
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

function LayersPanel({ layout, selectedId, onSelect, onLayerChange, onVisibilityChange }: Readonly<{
  layout: ScorecardLayout;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLayerChange: (id: string, mode: 'front' | 'back' | 'forward' | 'backward') => void;
  onVisibilityChange: (id: string, visible: boolean) => void;
}>) {
  return (
    <div className="scd__layers-panel">
      <div className="scd__layers-head">
        <div><h3>Layers</h3><p>Live widgets and design order</p></div>
        <span>{layout.widgets.length}</span>
      </div>
      {layout.backgroundImageUrl && (
        <button type="button" className={`scd__layer-row ${selectedId === BACKGROUND_ID ? 'is-selected' : ''}`} onClick={() => onSelect(BACKGROUND_ID)}>
          <span className="scd__layer-index">BG</span><span className="scd__layer-name">Background image</span><span className="scd__layer-meta">Canvas</span>
        </button>
      )}
      {[...layout.widgets].sort((a, b) => b.geometry.zIndex - a.geometry.zIndex).map((widget, index) => (
        <div key={widget.id} className={`scd__layer-row ${selectedId === widget.id ? 'is-selected' : ''}`}>
          <button type="button" className="scd__layer-main" onClick={() => onSelect(widget.id)}>
            <span className="scd__layer-index">{index + 1}</span>
            <span className="scd__layer-name">{widget.label}</span>
            <span className={`scd__layer-meta ${widgetHasLiveBinding(widget.kind) ? 'is-live' : ''}`}>
              {widgetHasLiveBinding(widget.kind) ? 'LIVE' : 'DESIGN'}{widget.locked ? ' · LOCKED' : ''}
            </span>
          </button>
          <div className="scd__layer-row-actions">
            <button type="button" title={widget.visible ? 'Hide widget' : 'Show widget'} onClick={() => onVisibilityChange(widget.id, !widget.visible)}>
              {widget.visible ? <IoEyeOutline size={11} /> : <IoEyeOffOutline size={11} />}
            </button>
            <button type="button" title="Bring to front" onClick={() => onLayerChange(widget.id, 'front')}><IoArrowUpOutline size={11} /></button>
            <button type="button" title="Bring forward" onClick={() => onLayerChange(widget.id, 'forward')}><IoChevronUpOutline size={11} /></button>
            <button type="button" title="Send backward" onClick={() => onLayerChange(widget.id, 'backward')}><IoChevronDownOutline size={11} /></button>
            <button type="button" title="Send to back" onClick={() => onLayerChange(widget.id, 'back')}><IoArrowDownOutline size={11} /></button>
          </div>
        </div>
      ))}
      {layout.widgets.length === 0 && !layout.backgroundImageUrl && <p className="scd__hint">No layers yet.</p>}
    </div>
  );
}

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

function PropertiesPanel({ widget, assets, auctionTeams, branding, layout, propertyPickerActive, propertyTeamSide, onStartPropertyPicker, onCancelPropertyPicker, onTeamSideChange, onSaveTeamSide, onGeometryChange, onStyleChange, onLayerChange, onFieldChange, onLayoutChange, onDuplicate, onRemove, onImageUpload, onPreviewAnimation }: Readonly<{
  widget: ScorecardWidgetInstance;
  assets: ScorecardAsset[];
  auctionTeams: Team[];
  branding: { tournamentLogo?: string; partnerLogo?: string; doOrDieFlagUrl?: string; superRaidFlagUrl?: string; superTackleFlagUrl?: string; allOutFlagUrl?: string; bonusPointFlagUrl?: string };
  layout: ScorecardLayout;
  propertyPickerActive: boolean;
  propertyTeamSide: 'common' | 'team_a' | 'team_b';
  onStartPropertyPicker: () => void;
  onCancelPropertyPicker: () => void;
  onTeamSideChange: (side: 'common' | 'team_a' | 'team_b') => void;
  onSaveTeamSide: () => void;
  onGeometryChange: (patch: Partial<ScorecardWidgetInstance['geometry']>) => void;
  onStyleChange: (patch: Partial<ScorecardWidgetInstance['style']>) => void;
  onLayerChange: (mode: 'front' | 'back' | 'forward' | 'backward') => void;
  onFieldChange: (patch: Partial<ScorecardWidgetInstance>) => void;
  onLayoutChange: (patch: Partial<ScorecardLayout>) => void;
  onDuplicate: (widget: ScorecardWidgetInstance) => void;
  onRemove: () => void;
  onImageUpload: (file: File) => void;
  onPreviewAnimation: () => void;
}>) {
  const { geometry, style } = widget;
  const isImageKind = widget.kind === 'team_a_logo' || widget.kind === 'team_b_logo'
    || widget.kind === 'custom_image' || widget.kind === 'tournament_logo' || widget.kind === 'partner_logo' || widget.kind === 'live_badge';

  return (
    <div className="scd__props-body">
      <div className="scd__props-head">
        <strong>{widget.label}</strong>
        <div className="scd__props-toggles">
          <button title="Duplicate widget (Cmd/Ctrl+D)" onClick={() => onDuplicate(widget)}><IoCopyOutline size={15} /></button>
          <button
            title={propertyPickerActive ? 'Cancel property picker' : 'Pick properties from this widget'}
            className={propertyPickerActive ? 'is-active' : undefined}
            onClick={propertyPickerActive ? onCancelPropertyPicker : onStartPropertyPicker}
          >
            <IoColorWandOutline size={15} />
          </button>
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
      <div className="scd__layer-controls" aria-label="Layer order">
        <span>Layer order</span>
        <button type="button" title="Bring to front" onClick={() => onLayerChange('front')}><IoArrowUpOutline size={14} /></button>
        <button type="button" title="Bring forward" onClick={() => onLayerChange('forward')}><IoChevronUpOutline size={14} /></button>
        <button type="button" title="Send backward" onClick={() => onLayerChange('backward')}><IoChevronDownOutline size={14} /></button>
        <button type="button" title="Send to back" onClick={() => onLayerChange('back')}><IoArrowDownOutline size={14} /></button>
      </div>

      {(widget.kind === 'team_a_name' || widget.kind === 'team_b_name') && (
        <label className="scd__field">
          <span>{widget.kind === 'team_a_name' ? 'Team A preview name' : 'Team B preview name'}</span>
          <select value={widget.previewText ?? ''} onChange={e => onFieldChange({ previewText: e.target.value || undefined })}>
            <option value="">Use sample/live name</option>
            {auctionTeams.map(team => <option key={team.id} value={team.name}>{team.name}</option>)}
          </select>
        </label>
      )}

      {widget.kind === 'match_venue' && (
        <label className="scd__field">
          <span>Venue preview</span>
          <input value={widget.previewText ?? ''} onChange={e => onFieldChange({ previewText: e.target.value || undefined })} placeholder="Sample Stadium" />
        </label>
      )}

      {(widget.kind === 'team_a_score' || widget.kind === 'team_b_score' || widget.kind === 'cricket_score'
        || widget.kind === 'football_score' || widget.kind === 'kabaddi_score' || widget.kind === 'kabaddi_players_on_mat'
        || widget.kind === 'kabaddi_team_a_players_on_mat' || widget.kind === 'kabaddi_team_b_players_on_mat') && (
        <label className="scd__field">
          <span>Score preview</span>
          <input
            value={widget.previewText ?? ''}
            onChange={e => onFieldChange({ previewText: e.target.value || undefined })}
            placeholder={widget.kind === 'cricket_score' ? '0/0' : '0 - 0'}
          />
        </label>
      )}

      {(widget.kind === 'kabaddi_players_on_mat' || widget.kind === 'kabaddi_team_a_players_on_mat' || widget.kind === 'kabaddi_team_b_players_on_mat') && (
        <div className="scd__field">
          <span>Player count icon</span>
          <div className="scd__fa-icon-picker">
            <button type="button" className={!widget.previewIcon ? 'is-selected' : ''} onClick={() => onFieldChange({ previewIcon: undefined })} title="No icon">-</button>
            {PLAYER_ICON_OPTIONS.map(icon => (
              <button
                key={icon.value}
                type="button"
                className={widget.previewIcon === icon.value ? 'is-selected' : ''}
                onClick={() => onFieldChange({ previewIcon: icon.value, previewText: widget.previewText || '5' })}
                title={icon.label}
                aria-label={icon.label}
              >
                <FontAwesomeIcon icon={icon.icon} />
              </button>
            ))}
          </div>
          <label className="scd__field">
            <span>Icon size ({Math.round(style.iconSize ?? style.fontSize ?? 28)} px)</span>
            <input type="range" min={10} max={96} step={1} value={style.iconSize ?? style.fontSize ?? 28} onChange={e => onStyleChange({ iconSize: Number(e.target.value) })} />
          </label>
          <label className="scd__field">
            <span>Icon gap ({style.iconGap ?? 6} px)</span>
            <input type="range" min={-32} max={48} step={1} value={style.iconGap ?? 6} onChange={e => onStyleChange({ iconGap: Number(e.target.value) })} />
          </label>
        </div>
      )}

      {(isImageKind
        || widget.kind === 'kabaddi_players_on_mat'
        || widget.kind === 'kabaddi_team_a_players_on_mat'
        || widget.kind === 'kabaddi_team_b_players_on_mat'
        || widget.kind === 'kabaddi_do_or_die_flag'
        || widget.kind === 'kabaddi_super_raid_flag'
        || widget.kind === 'kabaddi_super_tackle_flag'
        || widget.kind === 'kabaddi_all_out_flag'
        || widget.kind === 'kabaddi_bonus_point_flag') && (
        <div className="scd__field">
          <span>Flip icon / image</span>
          <div className="scd__flip-controls">
            <label><input type="checkbox" checked={!!style.flipX} onChange={e => onStyleChange({ flipX: e.target.checked })} /> Horizontal</label>
            <label><input type="checkbox" checked={!!style.flipY} onChange={e => onStyleChange({ flipY: e.target.checked })} /> Vertical</label>
          </div>
        </div>
      )}

      {(widget.kind === 'kabaddi_team_a_players' || widget.kind === 'kabaddi_team_b_players') && (
        <div className="scd__field">
          <span>Preview player list</span>
          <input
            value={(widget.previewItems ?? []).map(item => item.text).join(', ')}
            onChange={e => onFieldChange({ previewItems: previewPlayerItems(e.target.value) })}
            placeholder="Arjun, Ravi, Sameer"
          />
          <small className="scd__hint">Comma-separated dummy names with sample player images.</small>
        </div>
      )}

      {(widget.kind === 'tournament_logo' || widget.kind === 'partner_logo') && (
        <label className="scd__field">
          <span>{widget.kind === 'tournament_logo' ? 'Tournament logo preview' : 'Partner logo preview'}</span>
          <select value={widget.previewImageUrl ?? (widget.kind === 'tournament_logo' ? branding.tournamentLogo ?? '' : branding.partnerLogo ?? '')} onChange={e => onFieldChange({ previewImageUrl: e.target.value || undefined })}>
            <option value="">Use live branding</option>
            {widget.kind === 'tournament_logo' && branding.tournamentLogo && <option value={branding.tournamentLogo}>Firebase tournament logo</option>}
            {widget.kind === 'partner_logo' && branding.partnerLogo && <option value={branding.partnerLogo}>Firebase broadcasting logo</option>}
            {assets.filter(asset => asset.kind === 'image' || asset.kind === 'gif').map(asset => (
              <option key={asset.id} value={asset.url}>{asset.name}</option>
            ))}
          </select>
          {widget.kind === 'partner_logo' && (
            <label className="scd__checkbox-field">
              <input type="checkbox" checked={!!layout.freezePartnerLogo} onChange={e => onLayoutChange({ freezePartnerLogo: e.target.checked, frozenPartnerLogoUrl: e.target.checked ? (widget.previewImageUrl || branding.partnerLogo) : undefined })} />
              Freeze this broadcasting logo for every overlay using this layout
            </label>
          )}
        </label>
      )}

      {(widget.kind === 'kabaddi_do_or_die_flag' || widget.kind === 'kabaddi_super_raid_flag' || widget.kind === 'kabaddi_super_tackle_flag' || widget.kind === 'kabaddi_all_out_flag' || widget.kind === 'kabaddi_bonus_point_flag') && (() => {
        const flagConfig = widget.kind === 'kabaddi_do_or_die_flag'
          ? { label: 'Do-or-Die', url: branding.doOrDieFlagUrl }
          : widget.kind === 'kabaddi_super_raid_flag'
            ? { label: 'Super Raid', url: branding.superRaidFlagUrl }
            : widget.kind === 'kabaddi_super_tackle_flag'
              ? { label: 'Super Tackle', url: branding.superTackleFlagUrl }
              : widget.kind === 'kabaddi_all_out_flag'
                ? { label: 'All Out', url: branding.allOutFlagUrl }
                : { label: 'Bonus Point', url: branding.bonusPointFlagUrl };
        return (
          <label className="scd__field">
            <span>Team overlay position</span>
            <select value={propertyTeamSide} onChange={e => onTeamSideChange(e.target.value as 'common' | 'team_a' | 'team_b')}>
              <option value="common">Common</option>
              <option value="team_a">Team A</option>
              <option value="team_b">Team B</option>
            </select>
            <button type="button" className="scd__btn scd__btn--sm" onClick={onSaveTeamSide}>Save Team Position</button>
            <span>{flagConfig.label} overlay preview</span>
            <select value={widget.previewTeamSide ?? 'common'} onChange={e => onFieldChange({ previewTeamSide: e.target.value as 'common' | 'team_a' | 'team_b' })}>
              <option value="common">Common overlay position</option>
              <option value="team_a">Team A overlay position</option>
              <option value="team_b">Team B overlay position</option>
            </select>
            <select value={widget.previewImageUrl ?? flagConfig.url ?? ''} onChange={e => onFieldChange({ previewImageUrl: e.target.value || undefined })}>
              <option value="">Use scorer-admin flag</option>
              {flagConfig.url && <option value={flagConfig.url}>Firebase scorer-admin {flagConfig.label} media</option>}
              {assets.filter(asset => asset.kind === 'image' || asset.kind === 'gif').map(asset => <option key={asset.id} value={asset.url}>{asset.name}</option>)}
            </select>
          </label>
        );
      })()}

      {widget.kind === 'custom_text' && (
        <label className="scd__field"><span>Text</span><input value={widget.staticText ?? ''} onChange={e => onFieldChange({ staticText: e.target.value })} /></label>
      )}
      {widget.kind === 'custom_timer' && (
        <label className="scd__field"><span>Label prefix</span><input value={widget.timerLabel ?? ''} onChange={e => onFieldChange({ timerLabel: e.target.value })} /></label>
      )}
      {(widget.kind === 'custom_image' || widget.kind === 'team_a_logo' || widget.kind === 'team_b_logo' || widget.kind === 'live_badge') && (
        <div className="scd__field">
          <span>{widget.kind === 'team_a_logo' ? 'Team A Logo' : widget.kind === 'team_b_logo' ? 'Team B Logo' : widget.kind === 'live_badge' ? 'Live Badge GIF / Image' : 'Image'}</span>
          {(widget.kind === 'team_a_logo' || widget.kind === 'team_b_logo') && (
            <select
              value={widget.staticImageUrl ?? ''}
              onChange={e => onFieldChange({ staticImageUrl: e.target.value || undefined })}
            >
              <option value="">Use live team logo</option>
              {auctionTeams.map(team => {
                const logoUrl = team.brandLogoUrl || team.logoUrl;
                return logoUrl ? <option key={team.id} value={logoUrl}>{team.name}</option> : null;
              })}
            </select>
          )}
          {widget.kind === 'live_badge' && (
            <select value={widget.staticImageUrl ?? ''} onChange={e => onFieldChange({ staticImageUrl: e.target.value || undefined })}>
              <option value="">Blinking LIVE text</option>
              {assets.filter(asset => asset.kind === 'gif' || asset.kind === 'image').map(asset => <option key={asset.id} value={asset.url}>{asset.name}</option>)}
            </select>
          )}
          {assets.filter(asset => asset.kind === 'image' || asset.kind === 'gif').length > 0 && (
            <div className="scd__logo-picker">
              {assets.filter(asset => asset.kind === 'image' || asset.kind === 'gif').map(asset => (
                <button
                  key={asset.id}
                  type="button"
                  className={`scd__logo-choice ${widget.staticImageUrl === asset.url ? 'is-selected' : ''}`}
                  title={`Use ${asset.name}`}
                  onClick={() => onFieldChange({ staticImageUrl: asset.url })}
                >
                  <img src={asset.url} alt={asset.name} />
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={widget.staticImageUrl ?? ''} onChange={e => onFieldChange({ staticImageUrl: e.target.value })} placeholder="https://…" style={{ flex: 1 }} />
            <label className="scd__btn scd__btn--sm" style={{ margin: 0, cursor: 'pointer' }}>
              {widget.kind === 'live_badge' ? 'Upload GIF' : 'Upload logo'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) onImageUpload(e.target.files[0]); }} />
            </label>
          </div>
          {widget.staticImageUrl && (
            <button type="button" className="scd__btn scd__btn--sm" onClick={() => onFieldChange({ staticImageUrl: undefined })}>
              {widget.kind === 'live_badge' ? 'Use blinking LIVE text' : 'Use live team logo'}
            </button>
          )}
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

      <label className="scd__field">
        <span>Content scale ({(style.contentScale ?? 1).toFixed(2)}×)</span>
        <input type="range" min={0.25} max={3} step={0.05} value={style.contentScale ?? 1} onChange={e => onStyleChange({ contentScale: Number(e.target.value) })} />
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
