import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { IoEyeOutline, IoEyeOffOutline, IoRefresh } from 'react-icons/io5';
import { ScorecardTicker } from '../../pages/ScoreOBSOverlayPage';
import {
  PREMIUM_TICKER_LIMITS,
  PREMIUM_TICKER_PART_KEYS,
  PREMIUM_TICKER_PART_LABELS,
  DEFAULT_PREMIUM_TICKER_PART,
  type PremiumTickerDesign,
  type PremiumTickerEditor,
  type PremiumTickerPartKey,
  type PremiumTickerPartTransform,
} from '../../types/premiumTicker';
import { isDefaultPremiumTickerPart, normalizePremiumTickerPart } from '../../utils/premiumTickerDesign';
import type { LiveScore, MatchLineup, MatchSetup, ScoringOverlayConfig, TickerConfig } from '../../types/scoring';
import type { Team } from '../../types';
import './PremiumTickerDesigner.css';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

/** Auction player with a usable portrait, used to fill the ticker preview. */
export interface PreviewPlayerImage {
  id: string;
  name: string;
  imageUrl: string;
  /** Background-removed PNGs suit the ticker's cut-out portraits best. */
  transparent: boolean;
}

// Player ids used by the designer's sample match (batters, bowler and the rest of the sample XI).
const SAMPLE_PLAYER_IDS = ['p1', 'p2', 'p3', 'p4', 'p5'];

const SILHOUETTE_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 160'><circle cx='60' cy='48' r='28' fill='#cbd5e1'/><path d='M8 160c0-36 22-58 52-58s52 22 52 58z' fill='#cbd5e1'/></svg>",
)}`;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Assigns real, randomly chosen player photos to the sample players (a neutral silhouette when none exist). */
function pickSampleImages(players: PreviewPlayerImage[], seed: number): Record<string, string> {
  const withImage = players.filter(player => player.imageUrl);
  const transparent = withImage.filter(player => player.transparent);
  const pool = [...(transparent.length >= SAMPLE_PLAYER_IDS.length ? transparent : withImage)];
  const random = seededRandom(seed);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return Object.fromEntries(SAMPLE_PLAYER_IDS.map((id, index) => [id, pool.length ? pool[index % pool.length].imageUrl : SILHOUETTE_IMAGE]));
}

interface Props {
  design: PremiumTickerDesign;
  onChange: (design: PremiumTickerDesign) => void;
  previewMode: 'sample' | 'live';
  onPreviewModeChange: (mode: 'sample' | 'live') => void;
  match: MatchSetup | null;
  live: LiveScore | null;
  lineups: { teamA: MatchLineup | null; teamB: MatchLineup | null };
  tickerConfig?: TickerConfig;
  /** Tournament teams the sample preview can be switched to. */
  teams?: Team[];
  /** Auction players whose portraits fill the live and sample previews. */
  players?: PreviewPlayerImage[];
}

interface DragState {
  part: PremiumTickerPartKey;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
}

function ControlRow({ label, value, min, max, step, unit, onChange }: Readonly<{
  label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (value: number) => void;
}>) {
  return (
    <label className="ptd__control">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
      <span className="ptd__control-number">
        <input type="number" min={min} max={max} step={step} value={value} onChange={e => { if (e.target.value !== '') onChange(Number(e.target.value)); }} />
        {unit && <em>{unit}</em>}
      </span>
    </label>
  );
}

export default function PremiumTickerDesigner({ design, onChange, previewMode, onPreviewModeChange, match, live, lineups, tickerConfig, teams = [], players = [] }: Readonly<Props>) {
  const [selected, setSelected] = useState<PremiumTickerPartKey>('score');
  const [stageScale, setStageScale] = useState(0.5);
  const [sampleBattingTeamId, setSampleBattingTeamId] = useState('');
  const [sampleBowlingTeamId, setSampleBowlingTeamId] = useState('');
  const [shuffleSeed, setShuffleSeed] = useState(() => Date.now() % 2147483647);
  const stageHostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const designRef = useRef(design);
  const scaleRef = useRef(stageScale);
  useEffect(() => {
    designRef.current = design;
    scaleRef.current = stageScale;
  });

  useEffect(() => {
    const host = stageHostRef.current;
    if (!host) return undefined;
    const update = () => setStageScale(Math.max(0.2, host.clientWidth / STAGE_WIDTH));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const updatePart = useCallback((key: PremiumTickerPartKey, patch: Partial<PremiumTickerPartTransform>) => {
    const current = designRef.current;
    onChange({ ...current, parts: { ...current.parts, [key]: normalizePremiumTickerPart({ ...current.parts[key], ...patch }) } });
  }, [onChange]);

  const handlePointerDown = useCallback((part: PremiumTickerPartKey, event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setSelected(part);
    const current = designRef.current.parts[part];
    dragRef.current = { part, startClientX: event.clientX, startClientY: event.clientY, startX: current.x, startY: current.y };
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      let dx = (event.clientX - drag.startClientX) / scaleRef.current;
      let dy = (event.clientY - drag.startClientY) / scaleRef.current;
      if (drag.part !== 'ticker') {
        // Children live inside the (possibly rotated/scaled) bar, so convert the pointer delta into its space.
        const bar = designRef.current.parts.ticker;
        const rad = (-bar.rotation * Math.PI) / 180;
        const bx = dx / bar.scale;
        const by = dy / bar.scale;
        dx = bx * Math.cos(rad) - by * Math.sin(rad);
        dy = bx * Math.sin(rad) + by * Math.cos(rad);
      }
      updatePart(drag.part, { x: drag.startX + dx, y: drag.startY + dy });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [updatePart]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      const step = event.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      const part = designRef.current.parts[selected];
      updatePart(selected, { x: part.x + move[0], y: part.y + move[1] });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, updatePart]);

  const editor = useMemo<PremiumTickerEditor>(() => ({ selectedPart: selected, onPointerDown: handlePointerDown }), [selected, handlePointerDown]);

  const sampleMode = previewMode === 'sample';
  // Sample data always bats as team A and bowls as team B; the pickers swap in real team names and logos.
  const previewMatch = useMemo(() => {
    if (!match || !sampleMode) return match;
    const batting = teams.find(team => team.id === sampleBattingTeamId);
    const bowling = teams.find(team => team.id === sampleBowlingTeamId);
    if (!batting && !bowling) return match;
    return {
      ...match,
      teamA: batting ? { ...match.teamA, name: batting.name, logoUrl: batting.logoUrl } : match.teamA,
      teamB: bowling ? { ...match.teamB, name: bowling.name, logoUrl: bowling.logoUrl } : match.teamB,
    };
  }, [match, sampleMode, teams, sampleBattingTeamId, sampleBowlingTeamId]);
  const sampleImages = useMemo(() => pickSampleImages(players, shuffleSeed), [players, shuffleSeed]);
  const liveImages = useMemo(
    () => Object.fromEntries(players.filter(player => player.imageUrl).map(player => [player.id, player.imageUrl])),
    [players],
  );
  const previewLive = live;
  const previewLineups = lineups;
  const previewConfig = useMemo(() => ({
    showLiveBadge: false,
    liveQuestions: [],
    tickerConfig: { ...tickerConfig, mode: 'html' as const, design: 'premium' as const, position: tickerConfig?.position ?? 'bottom' },
  } as unknown as ScoringOverlayConfig), [tickerConfig]);

  const part = design.parts[selected];
  const changedCount = PREMIUM_TICKER_PART_KEYS.filter(key => !isDefaultPremiumTickerPart(design.parts[key])).length;
  const canRender = !!previewMatch && !!previewLive;

  return (
    <div className="ptd">
      <aside className="ptd__panel">
        <div>
          <h2>Premium Ticker</h2>
          <p className="scd__hint">Select a part on the preview (or here), then drag it, use arrow keys, or set exact values. Changes apply to the <code>score-ticker--premium</code> OBS overlay after saving.</p>
        </div>

        <section className="ptd__parts" aria-label="Ticker parts">
          {PREMIUM_TICKER_PART_KEYS.map(key => {
            const transform = design.parts[key];
            return (
              <div key={key} className={`ptd__part ${selected === key ? 'is-selected' : ''}`}>
                <button type="button" className="ptd__part-main" onClick={() => setSelected(key)}>
                  <span>{PREMIUM_TICKER_PART_LABELS[key]}</span>
                  {!isDefaultPremiumTickerPart(transform) && <i className="ptd__dot" title="Modified" />}
                </button>
                <button
                  type="button"
                  className="ptd__icon-btn"
                  title={transform.visible ? 'Hide part' : 'Show part'}
                  onClick={() => updatePart(key, { visible: !transform.visible })}
                >
                  {transform.visible ? <IoEyeOutline size={15} /> : <IoEyeOffOutline size={15} />}
                </button>
              </div>
            );
          })}
        </section>

        <section className="ptd__props">
          <header>
            <h3>{PREMIUM_TICKER_PART_LABELS[selected]}</h3>
            <button type="button" className="scd__btn scd__btn--sm" onClick={() => updatePart(selected, { ...DEFAULT_PREMIUM_TICKER_PART })}>
              <IoRefresh size={13} /> Reset part
            </button>
          </header>
          <ControlRow label="Position X" value={part.x} min={-PREMIUM_TICKER_LIMITS.offset} max={PREMIUM_TICKER_LIMITS.offset} step={1} unit="px" onChange={x => updatePart(selected, { x })} />
          <ControlRow label="Position Y" value={part.y} min={-PREMIUM_TICKER_LIMITS.offset} max={PREMIUM_TICKER_LIMITS.offset} step={1} unit="px" onChange={y => updatePart(selected, { y })} />
          <ControlRow label="Rotation" value={part.rotation} min={-PREMIUM_TICKER_LIMITS.rotation} max={PREMIUM_TICKER_LIMITS.rotation} step={0.5} unit="deg" onChange={rotation => updatePart(selected, { rotation })} />
          <ControlRow label="Scale" value={part.scale} min={PREMIUM_TICKER_LIMITS.minScale} max={PREMIUM_TICKER_LIMITS.maxScale} step={0.05} unit="×" onChange={scale => updatePart(selected, { scale })} />
          <label className="scd__checkbox-field">
            <input type="checkbox" checked={part.visible} onChange={e => updatePart(selected, { visible: e.target.checked })} /> Visible on stream
          </label>
        </section>
        <small className="scd__hint">{changedCount} of {PREMIUM_TICKER_PART_KEYS.length} parts customised. Arrow keys nudge 1px, Shift+arrows 10px.</small>
      </aside>

      <main className="ptd__preview">
        <div className="scd__squad-preview-toolbar">
          <span>{previewMatch ? `${previewMatch.teamA.name} vs ${previewMatch.teamB.name}` : 'No active match'}{sampleMode ? ' · sample' : ''}</span>
          <div className="scd__squad-preview-tabs" role="group" aria-label="Premium ticker preview data">
            <button type="button" className={sampleMode ? 'is-active' : ''} aria-pressed={sampleMode} onClick={() => onPreviewModeChange('sample')}>Sample</button>
            <button type="button" className={sampleMode ? '' : 'is-active'} aria-pressed={!sampleMode} onClick={() => onPreviewModeChange('live')}>Live match</button>
          </div>
        </div>
        {sampleMode && (
          <div className="ptd__sample-controls">
            <label>
              <span>Batting team</span>
              <select value={sampleBattingTeamId} onChange={event => setSampleBattingTeamId(event.target.value)}>
                <option value="">Sample team</option>
                {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <label>
              <span>Bowling team</span>
              <select value={sampleBowlingTeamId} onChange={event => setSampleBowlingTeamId(event.target.value)}>
                <option value="">Sample team</option>
                {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="scd__btn scd__btn--sm"
              onClick={() => setShuffleSeed(seed => (seed + 7919) % 2147483647)}
              disabled={players.length === 0}
              title={players.length === 0 ? 'No auction player photos found' : 'Pick different random player photos'}
            >
              <IoRefresh size={13} /> Shuffle photos
            </button>
          </div>
        )}
        <div className="ptd__stage-host" ref={stageHostRef}>
          <div className="ptd__stage-frame" style={{ width: STAGE_WIDTH * stageScale, height: STAGE_HEIGHT * stageScale }}>
            <div className="score-obs ptd__stage" style={{ transform: `scale(${stageScale})` }}>
              {canRender ? (
                <ScorecardTicker
                  key={previewMatch.id}
                  live={previewLive}
                  match={previewMatch}
                  battingTeam={live?.battingTeamId === previewMatch.teamB.id ? previewMatch.teamB.name : previewMatch.teamA.name}
                  bowlingTeam={live?.bowlingTeamId === previewMatch.teamA.id ? previewMatch.teamA.name : previewMatch.teamB.name}
                  config={previewConfig}
                  lineups={previewLineups}
                  playerImages={sampleMode ? sampleImages : liveImages}
                  premiumDesign={design}
                  editor={editor}
                />
              ) : (
                <p className="ptd__empty">No live match is active. Switch to Sample to design the ticker.</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
