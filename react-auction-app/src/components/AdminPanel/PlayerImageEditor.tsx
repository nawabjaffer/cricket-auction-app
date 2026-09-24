import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { IoRefresh, IoRemoveCircleOutline, IoSave } from 'react-icons/io5';
import { ScorecardLayoutView } from '../ScorecardCanvas';
import type { PlayerImageEdit } from '../../types';
import type { ScorecardLayout, ScorecardWidgetInstance } from '../../types/scorecardDesigner';
import type { ScorecardDataContext } from '../../utils/scorecardDataBinding';
import { playerRegistrationService } from '../../services/playerRegistrationService';
import { DEFAULT_PHOTO_GUIDE_URL } from '../../types/playerRegistration';
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
  edit?: PlayerImageEdit;
  processing?: boolean;
  processingProgress?: number;
  onChange: (edit: PlayerImageEdit) => void;
  onSaveImage?: (file: File) => Promise<void>;
  onRemoveBackground: () => void;
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

export function PlayerImageEditor({ imageUrl, sourceBlob, edit, processing, processingProgress = 0, onChange, onSaveImage, onRemoveBackground }: Readonly<PlayerImageEditorProps>) {
  const [guideUrl, setGuideUrl] = useState(DEFAULT_PHOTO_GUIDE_URL);
  const [savingImage, setSavingImage] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<{
    type: 'move' | 'scale' | 'rotate';
    pointerId: number;
    startX: number;
    startY: number;
    startScale: number;
    startRotation: number;
    startAngle: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  const value = useMemo<PlayerImageEdit>(() => ({
    xPct: edit?.xPct ?? 14, yPct: edit?.yPct ?? 4, scale: edit?.scale ?? 1, rotationDeg: edit?.rotationDeg ?? 0, flipX: edit?.flipX ?? false, flipY: edit?.flipY ?? false,
  }), [edit]);
  const layout = useMemo(() => createLayout(imageUrl, value), [imageUrl, value]);

  useEffect(() => {
    let active = true;
    playerRegistrationService.getConfig().then(config => {
      if (active) setGuideUrl(config?.photoGuideUrl || DEFAULT_PHOTO_GUIDE_URL);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const update = (next: Partial<PlayerImageEdit>) => onChange({ ...value, ...next });

  const stopInteraction = (event?: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (interaction && event?.currentTarget.hasPointerCapture(interaction.pointerId)) {
      event.currentTarget.releasePointerCapture(interaction.pointerId);
    }
    interactionRef.current = null;
  };

  const startInteraction = (type: 'move' | 'scale' | 'rotate', event: ReactPointerEvent<HTMLElement>) => {
    if (processing || !canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const boxWidth = canvasRect.width * 0.72;
    const boxHeight = canvasRect.height * 0.92;
    const centerX = canvasRect.left + (value.xPct / 100) * canvasRect.width + boxWidth / 2;
    const centerY = canvasRect.top + (value.yPct / 100) * canvasRect.height + boxHeight / 2;
    interactionRef.current = {
      type,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScale: value.scale,
      startRotation: value.rotationDeg,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI),
      centerX,
      centerY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    const canvas = canvasRef.current;
    if (!interaction || !canvas || interaction.pointerId !== event.pointerId) return;
    const canvasRect = canvas.getBoundingClientRect();
    if (interaction.type === 'move') {
      update({
        xPct: Math.max(-20, Math.min(70, value.xPct + ((event.clientX - interaction.startX) / canvasRect.width) * 100)),
        yPct: Math.max(-20, Math.min(70, value.yPct + ((event.clientY - interaction.startY) / canvasRect.height) * 100)),
      });
      return;
    }
    if (interaction.type === 'scale') {
      const currentDistance = Math.hypot(event.clientX - interaction.centerX, event.clientY - interaction.centerY);
      const startDistance = Math.hypot(interaction.startX - interaction.centerX, interaction.startY - interaction.centerY);
      const nextScale = interaction.startScale * (currentDistance / Math.max(1, startDistance));
      update({ scale: Math.max(0.5, Math.min(2.5, Number(nextScale.toFixed(2)))) });
      return;
    }
    const currentAngle = Math.atan2(event.clientY - interaction.centerY, event.clientX - interaction.centerX) * (180 / Math.PI);
    update({ rotationDeg: Math.round(interaction.startRotation + currentAngle - interaction.startAngle) });
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

  return (
    <div className="player-image-editor">
      <div className="player-image-editor__canvas">
        <div ref={canvasRef} className="player-image-editor__surface" onPointerMove={continueInteraction} onPointerUp={stopInteraction} onPointerCancel={stopInteraction}>
          <ScorecardLayoutView
            layout={layout}
            ctx={EMPTY_CONTEXT}
            renderBackgroundOverlay={guideUrl ? <img className="player-image-editor__guide" src={guideUrl} alt="Portrait placement guide" /> : null}
          />
          <div
            className="player-image-editor__selection"
            style={{ left: `${value.xPct}%`, top: `${value.yPct}%`, transform: `rotate(${value.rotationDeg}deg)` }}
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
        </div>
        {processing && <div className="player-image-editor__progress" role="status" aria-live="polite"><div className="player-image-editor__progress-label">Removing background {processingProgress}%</div><div className="player-image-editor__progress-track"><div className="player-image-editor__progress-bar" style={{ width: `${Math.max(4, Math.min(100, processingProgress))}%` }} /></div></div>}
      </div>
      <div className="player-image-editor__controls">
        <div className="player-image-editor__hint"><strong>Direct manipulation</strong><span>Drag inside the box to position. Pull a corner to scale. Use the rotate handle above the box to turn the image.</span></div>
        <div className="player-image-editor__readout"><span>Scale <strong>{value.scale.toFixed(2)}x</strong></span><span>Rotation <strong>{value.rotationDeg}°</strong></span></div>
        <label className="player-image-editor__toggle"><span>Flip horizontal</span><input type="checkbox" checked={Boolean(value.flipX)} onChange={e => update({ flipX: e.target.checked })} /></label>
        <label className="player-image-editor__toggle"><span>Flip vertical</span><input type="checkbox" checked={Boolean(value.flipY)} onChange={e => update({ flipY: e.target.checked })} /></label>
      </div>
      <div className="player-image-editor__actions">
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => onChange({ xPct: 14, yPct: 4, scale: 1, rotationDeg: 0, flipX: false, flipY: false })}><IoRefresh size={15} /> Reset</button>
        {onSaveImage && <button type="button" className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => void saveEditedImage()} disabled={savingImage || processing}><IoSave size={15} /> {savingImage ? 'Saving image...' : 'Save edited image'}</button>}
        <button type="button" className="admin-btn admin-btn-warning admin-btn-sm" onClick={onRemoveBackground} disabled={processing}><IoRemoveCircleOutline size={15} /> {processing ? 'Processing...' : 'Remove Background'}</button>
      </div>
    </div>
  );
}