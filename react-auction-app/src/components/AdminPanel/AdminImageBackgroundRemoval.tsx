import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IoClose, IoPlay, IoRefresh } from 'react-icons/io5';
import type { Player } from '../../types';
import { processPlayerImage } from '../../services/playerBackgroundRemovalService';
import { resolveMediaToStorage } from '../../services/firebaseStorageService';

interface Props {
  players: Player[];
  isOpen: boolean;
  onClose: () => void;
  onBulkSave: (updatedPlayers: Player[]) => Promise<void>;
}

type RemovalState = 'not-started' | 'processing' | 'done' | 'error' | 'skipped';

interface RemovalRow {
  state: RemovalState;
  progress: number;
  message?: string;
}

function createRows(players: Player[]): Record<string, RemovalRow> {
  return Object.fromEntries(players.map(player => [player.id, {
      state: player.imageProcessingStatus === 'complete' && player.processedImageUrl ? 'done' : player.imageUrl ? 'not-started' : 'skipped',
      progress: player.imageProcessingStatus === 'complete' && player.processedImageUrl ? 100 : 0,
      message: player.imageUrl ? undefined : 'No image available',
    } satisfies RemovalRow]));
}

export default function AdminImageBackgroundRemoval({ players, isOpen, onClose, onBulkSave }: Props) {
  const [rows, setRows] = useState<Record<string, RemovalRow>>({});
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (isOpen) setRows(createRows(players));
  }, [isOpen, players]);

  const updateRow = (playerId: string, patch: Partial<RemovalRow>) => {
    setRows(current => ({ ...current, [playerId]: { ...current[playerId], ...patch } }));
  };

  const counts = useMemo(() => {
    const values = Object.values(rows);
    return {
      total: values.length,
      done: values.filter(row => row.state === 'done').length,
      processing: values.filter(row => row.state === 'processing').length,
      pending: values.filter(row => row.state === 'not-started').length,
      errors: values.filter(row => row.state === 'error').length,
    };
  }, [rows]);

  const startProcessing = async () => {
    if (running) return;
    const queue = players.filter(player => {
      const row = rows[player.id];
      return player.imageUrl && row?.state !== 'done' && row?.state !== 'skipped';
    });
    if (queue.length === 0) return;

    setRunning(true);
    const updatedById = new Map<string, Player>();
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < queue.length) {
        const player = queue[nextIndex++];
        updateRow(player.id, { state: 'processing', progress: 1, message: 'Preparing image...' });
        try {
          const source = player.originalImageUrl || player.imageUrl;
          const storageSource = await resolveMediaToStorage(source, `media/players/${player.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
          const processedUrl = await processPlayerImage({
            playerId: player.id,
            playerName: player.name,
            sourceUrl: storageSource,
            onStatus: status => updateRow(player.id, {
              state: 'processing',
              message: status === 'loading-model' ? 'Loading background-removal model...' : status === 'uploading' ? 'Uploading transparent image...' : 'Removing background...',
            }),
            onProgress: (message, progress) => updateRow(player.id, {
              state: 'processing',
              progress: progress ?? 1,
              message,
            }),
          });
          updatedById.set(player.id, {
            ...player,
            imageUrl: processedUrl,
            originalImageUrl: source,
            processedImageUrl: processedUrl,
            imageProcessingStatus: 'complete',
            imageProcessingError: undefined,
          });
          updateRow(player.id, { state: 'done', progress: 100, message: 'Background removed and saved' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Background removal failed';
          updateRow(player.id, { state: 'error', message });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, () => worker()));
    if (updatedById.size > 0) {
      const updatedPlayers = players.map(player => updatedById.get(player.id) ?? player);
      try {
        await onBulkSave(updatedPlayers);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not save processed images';
        updatedById.forEach((_player, playerId) => updateRow(playerId, { state: 'error', message }));
      }
    }
    setRunning(false);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="admin-edit-modal-backdrop" onClick={running ? undefined : onClose}>
      <div className="admin-edit-modal admin-edit-modal--wide admin-background-removal-modal" onClick={event => event.stopPropagation()}>
        <div className="admin-background-removal-modal__header">
          <div>
            <h3>Bulk Background Removal</h3>
            <p>Process every player image in parallel. Completed images are saved to the auction roster automatically.</p>
          </div>
          <button className="admin-btn admin-btn-ghost" onClick={onClose} disabled={running} aria-label="Close"><IoClose /></button>
        </div>

        <div className="admin-background-removal-modal__summary">
          <span>{counts.total} images</span>
          <span className="is-done">{counts.done} done</span>
          <span className="is-processing">{counts.processing} processing</span>
          <span className="is-pending">{counts.pending} not started</span>
          {counts.errors > 0 && <span className="is-error">{counts.errors} failed</span>}
        </div>

        <div className="admin-background-removal-modal__legend">
          <span className="is-pending">Orange: raw / not started</span>
          <span className="is-processing">Blue: processing</span>
          <span className="is-done">Green: complete</span>
        </div>

        <div className="admin-background-removal-modal__list">
          {players.map(player => {
            const row = rows[player.id] ?? { state: 'not-started' as const, progress: 0 };
            return (
              <div key={player.id} className={`admin-background-removal-row admin-background-removal-row--${row.state}`}>
                <div className="admin-background-removal-row__image">
                  {player.imageUrl ? <img src={player.imageUrl} alt="" /> : <span>No image</span>}
                </div>
                <div className="admin-background-removal-row__details">
                  <strong>{player.name}</strong>
                  <small>{row.message || (row.state === 'done' ? 'Background removed' : 'Waiting to start')}</small>
                  <div className="admin-background-removal-row__track"><div className="admin-background-removal-row__bar" style={{ width: `${row.progress}%` }} /></div>
                </div>
                <span className="admin-background-removal-row__percent">{row.state === 'skipped' ? 'Skipped' : `${row.progress}%`}</span>
              </div>
            );
          })}
          {players.length === 0 && <div className="admin-empty-state">No players found.</div>}
        </div>

        <div className="admin-background-removal-modal__actions">
          <button className="admin-btn admin-btn-ghost" onClick={onClose} disabled={running}>Close</button>
          <button className="admin-btn admin-btn-primary" onClick={() => void startProcessing()} disabled={running || counts.pending === 0}>
            {running ? <><IoRefresh className="admin-background-removal-modal__spin" /> Processing...</> : <><IoPlay /> Start background removal</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
