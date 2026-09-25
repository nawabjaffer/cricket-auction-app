import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { IoRefresh, IoRemoveCircleOutline, IoSave } from 'react-icons/io5';
import { ScorecardLayoutView } from '../ScorecardCanvas';
import type { PlayerImageEdit } from '../../types';
import type { Player } from '../../types';
import type { ScorecardLayout, ScorecardWidgetInstance } from '../../types/scorecardDesigner';
import type { ScorecardDataContext } from '../../utils/scorecardDataBinding';
import { auctionPersistence } from '../../services/auctionPersistence';
import { playerRegistrationService } from '../../services/playerRegistrationService';
import { DEFAULT_PHOTO_GUIDE_URL } from '../../types/playerRegistration';
import { SpotlightLayout, VibrantLayout } from '../AuctionLayouts';
import { getAuctionPlayerImageStyle, type AuctionLayoutProps, type AuctionLayoutStyle } from '../AuctionLayouts/types';
import './PlayerImageEditor.css';

const EMPTY_CONTEXT: ScorecardDataContext = { sport: 'cricket', match: null, live: null };

function createLayout(imageUrl: string, edit: PlayerImageEdit): ScorecardLayout {
  const widget: ScorecardWidgetInstance = {
    id: 'player-image-editor', kind: 'custom_image', label: 'Player image',
    geometry: { xPct: edit.xPct, yPct: edit.yPct, wPct: 72, hPct: 92, rotationDeg: edit.rotationDeg, zIndex: 1 },
    style: { backgroundColor: 'transparent', objectFit: 'contain', zoom: edit.scale, contentScale: 1, opacity: 1, padding: 0, flipX: edit.flipX, flipY: edit.flipY },
    staticImageUrl: imageUrl, visible: true, locked: false,
  };
  return {
    id: 'player-image-editor', sport: 'cricket', surface: 'scoreboard', name: 'Player image editor',
    backgroundColor: '#0f172a', widgets: [widget], createdAt: 0, updatedAt: 0,
  };
}

interface PlayerImageEditorProps {
  imageUrl: string;
  sourceBlob?: Blob;
  auctionLayout?: AuctionLayoutStyle;
  edit?: PlayerImageEdit;
  processing?: boolean;
  processingProgress?: number;
  onChange: (edit: PlayerImageEdit) => void;
  onSaveImage?: (file: File) => Promise<void>;
  onRemoveBackground?: () => void;
}

async function createEditedImageFile(imageUrl: string, sourceBlob: Blob | undefined, edit: PlayerImageEdit): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1000;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image editor is unavailable on this device.');

  const source = sourceBlob ? URL.createObjectURL(sourceBlob) : imageUrl;
  const image = new Image();
  if (!sourceBlob) image.crossOrigin = 'anonymous';
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The image could not be prepared for saving.'));
      image.src = source;
    });

    const boxWidth = canvas.width * 0.72;
    const boxHeight = canvas.height * 0.92;
    const centerX = (edit.xPct / 100) * canvas.width + boxWidth / 2;
    const centerY = (edit.yPct / 100) * canvas.height + boxHeight / 2;
    const containScale = Math.min(boxWidth / image.naturalWidth, boxHeight / image.naturalHeight) * edit.scale;
    const drawWidth = image.naturalWidth * containScale;
    const drawHeight = image.naturalHeight * containScale;

    context.save();
    context.translate(centerX, centerY);
    context.rotate((edit.rotationDeg * Math.PI) / 180);
    context.scale(edit.flipX ? -1 : 1, edit.flipY ? -1 : 1);
    context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The edited image could not be generated.');
    return new File([blob], 'edited-player.png', { type: 'image/png' });
  } finally {
    if (sourceBlob) URL.revokeObjectURL(source);
  }
}

export function PlayerImageEditor({ imageUrl, sourceBlob, auctionLayout, edit, processing, processingProgress = 0, onChange, onSaveImage, onRemoveBackground }: Readonly<PlayerImageEditorProps>) {
  const [guideUrl, setGuideUrl] = useState(DEFAULT_PHOTO_GUIDE_URL);
  const [previewLayout, setPreviewLayout] = useState<AuctionLayoutStyle>(auctionLayout ?? 'classic');
  const [placementMode, setPlacementMode] = useState<'canvas' | 'auction'>('canvas');
  const [savingImage, setSavingImage] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<{
    type: 'move' | 'scale' | 'rotate';
    pointerId: number;
    startX: number;
    startY: number;
    startXPct: number;
    startYPct: number;
    startScale: number;
    startRotation: number;
    startAngle: number;
    centerX: number;
    centerY: number;
    positionFactor: number;
  } | null>(null);
  const latestPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const value = useMemo<PlayerImageEdit>(() => ({
    xPct: edit?.xPct ?? 14, yPct: edit?.yPct ?? 4, scale: edit?.scale ?? 1, rotationDeg: edit?.rotationDeg ?? 0, flipX: edit?.flipX ?? false, flipY: edit?.flipY ?? false,
  }), [edit]);
  const layout = useMemo(() => createLayout(imageUrl, value), [imageUrl, value]);
  const previewPlayer = useMemo<Player>(() => ({
    id: 'preview-player', name: 'Player Preview', imageUrl, role: 'Player', age: null,
    matches: '', runs: '', wickets: '', battingBestFigures: '', bowlingBestFigures: '', basePrice: 0,
    imageEdit: value,
  }), [imageUrl, value]);
  const auctionPreviewProps: AuctionLayoutProps = {
    currentPlayer: previewPlayer,
    playerImageSrc: imageUrl,
    playerPlaceholderSrc: imageUrl,
    statRows: [
      { label: 'Role', value: 'Player', category: 'identity' },
      { label: 'Matches', value: '-', category: 'stats' },
      { label: 'Runs', value: '-', category: 'stats' },
      { label: 'Wickets', value: '-', category: 'stats' },
    ],
    currentBid: 0,
    selectedTeam: null,
    maxBidForTeam: 0,
    currencySuffix: '',
    organizerName: 'Auction Preview',
    organizerLogo: '',
    currentRound: 1,
    accentColor: '#f59e0b',
    primaryColor: '#1d4ed8',
    secondaryColor: '#0f172a',
    titleSponsor: null,
    sponsors: [],
    playerCounts: { available: 0, sold: 0, unsold: 0 },
    teamCount: 0,
  };

  useEffect(() => {
    let active = true;
    playerRegistrationService.getConfig().then(config => {
      if (active) setGuideUrl(config?.photoGuideUrl || DEFAULT_PHOTO_GUIDE_URL);
    }).catch(() => {});
    if (!auctionLayout) {
      auctionPersistence.getAdminSettings().then(settings => {
        if (active && settings?.auctionLayout) setPreviewLayout(settings.auctionLayout);
      }).catch(() => {});
    }
    return () => {
      active = false;
      if (pointerFrameRef.current !== null) cancelAnimationFrame(pointerFrameRef.current);
    };
  }, [auctionLayout]);

  useEffect(() => {
    if (auctionLayout) setPreviewLayout(auctionLayout);
  }, [auctionLayout]);

  const update = (next: Partial<PlayerImageEdit>) => onChange({ ...value, ...next });

  const getPlacementGeometry = () => placementMode === 'auction'
    ? { leftPct: 52 + value.xPct / 4, topPct: 6 + value.yPct / 4, widthPct: 44, heightPct: 88, positionFactor: 4 }
    : { leftPct: value.xPct, topPct: value.yPct, widthPct: 72, heightPct: 92, positionFactor: 1 };

  const stopInteraction = (event?: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (pointerFrameRef.current !== null) cancelAnimationFrame(pointerFrameRef.current);
    if (interaction && event?.currentTarget.hasPointerCapture(interaction.pointerId)) {
      event.currentTarget.releasePointerCapture(interaction.pointerId);
    }
    interactionRef.current = null;
    latestPointerRef.current = null;
    pointerFrameRef.current = null;
  };

  const startInteraction = (type: 'move' | 'scale' | 'rotate', event: ReactPointerEvent<HTMLElement>) => {
    if (processing || !canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    canvasRef.current.focus();
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const geometry = getPlacementGeometry();
    const boxWidth = canvasRect.width * (geometry.widthPct / 100);
    const boxHeight = canvasRect.height * (geometry.heightPct / 100);
    const centerX = canvasRect.left + (geometry.leftPct / 100) * canvasRect.width + boxWidth / 2;
    const centerY = canvasRect.top + (geometry.topPct / 100) * canvasRect.height + boxHeight / 2;
    interactionRef.current = {
      type,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startXPct: value.xPct,
      startYPct: value.yPct,
      startScale: value.scale,
      startRotation: value.rotationDeg,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI),
      centerX,
      centerY,
      positionFactor: geometry.positionFactor,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    latestPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
    if (pointerFrameRef.current !== null) return;
    pointerFrameRef.current = requestAnimationFrame(() => {
      pointerFrameRef.current = null;
      const activeInteraction = interactionRef.current;
      const pointer = latestPointerRef.current;
      const canvas = canvasRef.current;
      if (!activeInteraction || !pointer || !canvas) return;
      applyInteraction(activeInteraction, pointer.clientX, pointer.clientY, canvas);
    });
  };

  const applyInteraction = (interaction: NonNullable<typeof interactionRef.current>, clientX: number, clientY: number, canvas: HTMLDivElement) => {
    const canvasRect = canvas.getBoundingClientRect();
    if (interaction.type === 'move') {
      update({
        xPct: Math.max(-20, Math.min(70, interaction.startXPct + ((clientX - interaction.startX) / canvasRect.width) * 100 * interaction.positionFactor)),
        yPct: Math.max(-20, Math.min(70, interaction.startYPct + ((clientY - interaction.startY) / canvasRect.height) * 100 * interaction.positionFactor)),
      });
      return;
    }
    if (interaction.type === 'scale') {
      const currentDistance = Math.hypot(clientX - interaction.centerX, clientY - interaction.centerY);
      const startDistance = Math.hypot(interaction.startX - interaction.centerX, interaction.startY - interaction.centerY);
      const nextScale = interaction.startScale * (currentDistance / Math.max(1, startDistance));
      update({ scale: Math.max(0.5, Math.min(5, Number(nextScale.toFixed(2)))) });
      return;
    }
    const currentAngle = Math.atan2(clientY - interaction.centerY, clientX - interaction.centerX) * (180 / Math.PI);
    update({ rotationDeg: Math.round(interaction.startRotation + currentAngle - interaction.startAngle) });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    const step = event.shiftKey ? 5 : 1;
    if (event.key === 'ArrowLeft') update({ xPct: Math.max(-20, value.xPct - step) });
    else if (event.key === 'ArrowRight') update({ xPct: Math.min(70, value.xPct + step) });
    else if (event.key === 'ArrowUp') update({ yPct: Math.max(-20, value.yPct - step) });
    else if (event.key === 'ArrowDown') update({ yPct: Math.min(70, value.yPct + step) });
    else if (event.key === '+' || event.key === '=') update({ scale: Math.min(5, Number((value.scale + 0.05).toFixed(2))) });
    else if (event.key === '-') update({ scale: Math.max(0.5, Number((value.scale - 0.05).toFixed(2))) });
    else if (event.key === '[') update({ rotationDeg: value.rotationDeg - 5 });
    else if (event.key === ']') update({ rotationDeg: value.rotationDeg + 5 });
    else if (event.key.toLowerCase() === 'p') update({ flipX: !value.flipX });
    else return;
    event.preventDefault();
  };

  const saveEditedImage = async () => {
    if (!onSaveImage || savingImage || processing) return;
    setSavingImage(true);
    try {
      await onSaveImage(await createEditedImageFile(imageUrl, sourceBlob, value));
      onChange({ xPct: 14, yPct: 4, scale: 1, rotationDeg: 0, flipX: false, flipY: false });
    } finally {
      setSavingImage(false);
    }
  };

  const placementGeometry = getPlacementGeometry();
  const selectionStyle = {
    left: `${placementGeometry.leftPct}%`,
    top: `${placementGeometry.topPct}%`,
    width: `${placementGeometry.widthPct}%`,
    height: `${placementGeometry.heightPct}%`,
    transform: `rotate(${value.rotationDeg}deg)`,
  };

  const selectionOverlay = (
    <div
      className={`player-image-editor__selection${placementMode === 'auction' ? ' player-image-editor__selection--auction' : ''}`}
      style={selectionStyle}
      onPointerDown={event => startInteraction('move', event)}
      role="application"
      aria-label="Drag to position player image"
    >
      <span className="player-image-editor__selection-label">Drag image</span>
      {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map(corner => (
        <button key={corner} type="button" className={`player-image-editor__handle player-image-editor__handle--${corner}`} onPointerDown={event => startInteraction('scale', event)} aria-label={`Scale from ${corner}`} />
      ))}
      <button type="button" className="player-image-editor__rotate" onPointerDown={event => startInteraction('rotate', event)} aria-label="Rotate player image"><IoRefresh size={14} /></button>
    </div>
  );

  return (
    <div className="player-image-editor">
      <div className="player-image-editor__mode" role="radiogroup" aria-label="Image placement surface">
        <span>Placement surface</span>
        <label><input type="radio" name="player-image-placement" checked={placementMode === 'canvas'} onChange={() => setPlacementMode('canvas')} /> Guide canvas</label>
        <label><input type="radio" name="player-image-placement" checked={placementMode === 'auction'} onChange={() => setPlacementMode('auction')} /> Auction screen preview</label>
      </div>
      <div className={`player-image-editor__canvas${placementMode === 'auction' ? ' player-image-editor__canvas--auction' : ''}`}>
        <div ref={canvasRef} className="player-image-editor__surface" tabIndex={0} onKeyDown={handleKeyDown} onPointerDown={event => event.currentTarget.focus()} onPointerMove={continueInteraction} onPointerUp={stopInteraction} onPointerCancel={stopInteraction}>
          {placementMode === 'canvas' ? <>
            <ScorecardLayoutView
              layout={layout}
              ctx={EMPTY_CONTEXT}
              renderBackgroundOverlay={guideUrl ? <img className="player-image-editor__guide" src={guideUrl} alt="Portrait placement guide" /> : null}
            />
            {selectionOverlay}
          </> : <>
            {previewLayout === 'spotlight' && <SpotlightLayout {...auctionPreviewProps} />}
            {previewLayout === 'vibrant' && <VibrantLayout {...auctionPreviewProps} />}
            {previewLayout === 'classic' && <>
              <div className="player-image-editor__classic-preview-copy"><strong>PLAYER AUCTION</strong><span>Player Preview</span><small>Role · Base Price · Statistics</small></div>
              <div className="player-image-editor__classic-preview-player"><div className="player-image-editor__classic-preview-image"><img src={imageUrl} alt="Player placement preview" style={getAuctionPlayerImageStyle(previewPlayer)} /></div></div>
            </>}
            {selectionOverlay}
            <span className="player-image-editor__auction-preview-badge">{previewLayout} auction screen</span>
          </>}
        </div>
        {processing && <div className="player-image-editor__progress" role="status" aria-live="polite"><div className="player-image-editor__progress-label">Removing background {processingProgress}%</div><div className="player-image-editor__progress-track"><div className="player-image-editor__progress-bar" style={{ width: `${Math.max(4, Math.min(100, processingProgress))}%` }} /></div></div>}
      </div>
      {placementMode === 'auction' && <div className="player-image-editor__auction-preview-header">
        <div><strong>Live auction placement preview</strong><span>Drag the player directly in the final 16:9 output area.</span></div>
        <div className="player-image-editor__auction-layout-tabs" role="tablist" aria-label="Auction preview layout">
          {(['classic', 'spotlight', 'vibrant'] as const).map(layoutStyle => (
            <button key={layoutStyle} type="button" className={previewLayout === layoutStyle ? 'is-active' : ''} onClick={() => setPreviewLayout(layoutStyle)}>{layoutStyle}</button>
          ))}
        </div>
      </div>}
      <div className="player-image-editor__controls">
        <div className="player-image-editor__hint"><strong>Direct manipulation</strong><span>Drag inside the box to position. Pull a corner to scale. Use the rotate handle above the box to turn the image. Keyboard: <kbd>Arrow keys</kbd> position, <kbd>+</kbd>/<kbd>-</kbd> scale, <kbd>[</kbd>/<kbd>]</kbd> rotate, <kbd>P</kbd> flip.</span></div>
        <div className="player-image-editor__readout"><span>Scale <strong>{value.scale.toFixed(2)}x</strong></span><span>Rotation <strong>{value.rotationDeg}°</strong></span></div>
        <div className="player-image-editor__flip-controls">
          <label className="player-image-editor__toggle"><span>Flip horizontal</span><input type="checkbox" checked={Boolean(value.flipX)} onChange={e => update({ flipX: e.target.checked })} /></label>
          <label className="player-image-editor__toggle"><span>Flip vertical</span><input type="checkbox" checked={Boolean(value.flipY)} onChange={e => update({ flipY: e.target.checked })} /></label>
        </div>
      </div>
      <div className="player-image-editor__actions">
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => onChange({ xPct: 14, yPct: 4, scale: 1, rotationDeg: 0, flipX: false, flipY: false })}><IoRefresh size={15} /> Reset</button>
        {onSaveImage && <button type="button" className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => void saveEditedImage()} disabled={savingImage || processing}><IoSave size={15} /> {savingImage ? 'Saving image...' : 'Save edited image'}</button>}
        {onRemoveBackground && <button type="button" className="admin-btn admin-btn-warning admin-btn-sm" onClick={onRemoveBackground} disabled={processing}><IoRemoveCircleOutline size={15} /> {processing ? 'Processing...' : 'Remove Background'}</button>}
      </div>
    </div>
  );
}