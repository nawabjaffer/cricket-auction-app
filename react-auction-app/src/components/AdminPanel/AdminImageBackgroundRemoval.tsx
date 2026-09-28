import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IoClose, IoPlay, IoRefresh } from 'react-icons/io5';
import type { Player } from '../../types';
import { processPlayerImage } from '../../services/playerBackgroundRemovalService';
import { ensureMediaInStorage } from '../../services/firebaseStorageService';

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

function isBackgroundRemoved(player: Player): boolean {
  return player.isBackgroundRemoved === true
    || (player.imageProcessingStatus === 'complete' && Boolean(player.processedImageUrl));
}

function createRows(players: Player[]): Record<string, RemovalRow> {
  return Object.fromEntries(players.map(player => [player.id, {
      state: isBackgroundRemoved(player) ? 'done' : player.imageUrl ? 'not-started' : 'skipped',
      progress: isBackgroundRemoved(player) ? 100 : 0,
      message: player.imageUrl ? undefined : 'No image available',
    } satisfies RemovalRow]));
}

export default function AdminImageBackgroundRemoval({ players, isOpen, onClose, onBulkSave }: Props) {
  const [rows, setRows] = useState<Record<string, RemovalRow>>({});
  const [running, setRunning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<string[]>([]);
  const initializedWhileOpen = useRef(false);
  const selectionAnchorId = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      initializedWhileOpen.current = false;
      selectionAnchorId.current = null;
      return;
    }
    if (initializedWhileOpen.current) return;
    initializedWhileOpen.current = true;
    const initialRows = createRows(players);
    const initialSelection = players
      .filter(player => initialRows[player.id]?.state === 'not-started')
      .map(player => player.id);
    setRows(initialRows);
    setSelectedIds(new Set(initialSelection));
    setLogs([`${new Date().toLocaleTimeString()} Ready: ${initialSelection.length} unprocessed images available.`]);
  }, [isOpen, players]);

  const appendLog = (message: string, isError = false) => {
    const line = `${new Date().toLocaleTimeString()} ${isError ? 'ERROR ' : ''}${message}`;
    setLogs(current => [...current.slice(-99), line]);
  };

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

  const selectablePlayers = players.filter(player => {
    const row = rows[player.id];
    return Boolean(player.imageUrl)
      && !isBackgroundRemoved(player)
      && (row?.state === 'not-started' || row?.state === 'error');
  });
  const selectedCount = selectablePlayers.filter(player => selectedIds.has(player.id)).length;
  const allSelectableSelected = selectablePlayers.length > 0 && selectedCount === selectablePlayers.length;

  const toggleSelected = (playerId: string, checked: boolean, shiftKey: boolean) => {
    const playerIndex = selectablePlayers.findIndex(player => player.id === playerId);
    const anchorIndex = selectionAnchorId.current
      ? selectablePlayers.findIndex(player => player.id === selectionAnchorId.current)
      : -1;

    if (shiftKey && playerIndex >= 0 && anchorIndex >= 0) {
      const rangeStart = Math.min(playerIndex, anchorIndex);
      const rangeEnd = Math.max(playerIndex, anchorIndex);
      const rangeIds = selectablePlayers.slice(rangeStart, rangeEnd + 1).map(player => player.id);
      setSelectedIds(current => {
        const next = new Set(current);
        rangeIds.forEach(id => checked ? next.add(id) : next.delete(id));
        return next;
      });
      return;
    }

    selectionAnchorId.current = playerId;
    setSelectedIds(current => {
      const next = new Set(current);
      if (checked) next.add(playerId);
      else next.delete(playerId);
      return next;
    });
  };

  const startProcessing = async () => {
    if (running) return;
    const queue = players.filter(player => {
      const row = rows[player.id];
      return selectedIds.has(player.id)
        && player.imageUrl
        && !isBackgroundRemoved(player)
        && (row?.state === 'not-started' || row?.state === 'error');
    });
    if (queue.length === 0) return;

    setRunning(true);
    appendLog(`Starting background removal for ${queue.length} selected player images, one at a time.`);
    const updatedById = new Map<string, Player>();
    for (const player of queue) {
      appendLog(`Preparing ${player.name}.`);
      updateRow(player.id, { state: 'processing', progress: 1, message: 'Preparing image...' });
      let failureStage = 'image source preparation';
      try {
        const source = player.imageUrl || player.originalImageUrl || '';
        const storageSource = await ensureMediaInStorage(source, `media/players/${player.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
        appendLog(`${player.name}: image source ready.`);
        failureStage = 'background removal or processed-image upload';
        const processedUrl = await processPlayerImage({
          playerId: player.id,
          playerName: player.name,
          sourceUrl: storageSource,
          onStatus: status => {
            const labels = {
              queued: 'Ready for sequential processing',
              'loading-model': 'Loading the background-removal model',
              processing: 'Removing the background',
              uploading: 'Uploading the transparent image',
              complete: 'Processing complete',
            };
            appendLog(`${player.name}: ${labels[status]}.`);
            updateRow(player.id, { state: 'processing' });
          },
          onProgress: (message, progress) => {
            updateRow(player.id, { state: 'processing', progress: progress ?? 1, message });
            if (message.startsWith('Retrying')) appendLog(`${player.name}: ${message}`);
          },
        });
        updatedById.set(player.id, {
          ...player,
          imageUrl: processedUrl,
          originalImageUrl: source,
          processedImageUrl: processedUrl,
          isBackgroundRemoved: true,
          imageProcessingStatus: 'complete',
          imageProcessingError: undefined,
        });
        updateRow(player.id, { state: 'done', progress: 100, message: 'Background removed and saved' });
        appendLog(`Background removed for ${player.name}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Background removal failed';
        updateRow(player.id, { state: 'error', message });
        appendLog(`${player.name} failed during ${failureStage}: ${message}`, true);
      }
    }
    if (updatedById.size > 0) {
      const updatedPlayers = players.map(player => updatedById.get(player.id) ?? player);
      try {
        appendLog(`Saving ${updatedById.size} processed player images.`);
        await onBulkSave(updatedPlayers);
        appendLog('Processed images saved to the player list.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not save processed images';
        updatedById.forEach((_player, playerId) => updateRow(playerId, { state: 'error', message }));
        appendLog(message, true);
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
            <p>Select raw player images to process. Images already marked as background-removed are skipped.</p>
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

        <div className="admin-background-removal-modal__logs" role="log" aria-live="polite" aria-label="Background removal logs">
          {logs.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)}
        </div>

        <div className="admin-background-removal-modal__selection">
          <label>
            <input
              type="checkbox"
              checked={allSelectableSelected}
              disabled={running || selectablePlayers.length === 0}
              onChange={event => {
                selectionAnchorId.current = null;
                setSelectedIds(event.target.checked ? new Set(selectablePlayers.map(player => player.id)) : new Set());
              }}
            />
            Select all eligible
          </label>
          <span>{selectedCount} selected</span>
        </div>

        <div className="admin-background-removal-modal__legend">
          <span className="is-pending">Orange: raw / not started</span>
          <span className="is-processing">Blue: processing</span>
          <span className="is-done">Green: complete</span>
        </div>

        <div className="admin-background-removal-modal__list">
          {players.map(player => {
            const row = rows[player.id] ?? { state: 'not-started' as const, progress: 0 };
            const isSelectable = selectablePlayers.some(item => item.id === player.id);
            return (
              <div
                key={player.id}
                className={`admin-background-removal-row admin-background-removal-row--${row.state}${selectedIds.has(player.id) ? ' admin-background-removal-row--selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(player.id)}
                  disabled={running || !isSelectable}
                  onChange={event => toggleSelected(player.id, event.target.checked, event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey)}
                  aria-label={`Select ${player.name} for background removal`}
                />
                <div className="admin-background-removal-row__image">
                  {player.imageUrl ? <img src={player.imageUrl} alt="" /> : <span>No image</span>}
                </div>
                <div className="admin-background-removal-row__details">
                  <strong>{player.name}</strong>
                  <small>{row.progress}%</small>
                  <div className="admin-background-removal-row__track"><div className="admin-background-removal-row__bar" style={{ width: `${row.progress}%` }} /></div>
                </div>
              </div>
            );
          })}
          {players.length === 0 && <div className="admin-empty-state">No players found.</div>}
        </div>

        <div className="admin-background-removal-modal__actions">
          <button className="admin-btn admin-btn-ghost" onClick={onClose} disabled={running}>Close</button>
          <button className="admin-btn admin-btn-primary" onClick={() => void startProcessing()} disabled={running || selectedCount === 0}>
            {running ? <><IoRefresh className="admin-background-removal-modal__spin" /> Processing...</> : <><IoPlay /> Start background removal</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
