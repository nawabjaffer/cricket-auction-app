// ============================================================================
// FIELD PLACEMENT EDITOR — Drag-to-position fielders on a circular ground
// Used from ScoreUpdatePage or ScoringAdminPage
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { scoringService } from '../../services/scoring';
import type { FieldPlacement } from '../../types/scoring';
import { DEFAULT_FIELD_PLACEMENTS } from '../../types/scoring';
import './FieldPlacementEditor.css';

interface Props {
  matchId: string;
  onClose?: () => void;
}

export default function FieldPlacementEditor({ matchId, onClose }: Props) {
  const [placements, setPlacements] = useState<FieldPlacement[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingPlacement, setEditingPlacement] = useState<FieldPlacement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const groundRef = useRef<HTMLDivElement>(null);

  // Load placements for match
  useEffect(() => {
    const load = async () => {
      const saved = await scoringService.getFieldPlacements(matchId);
      // Merge defaults with saved
      const all = [...DEFAULT_FIELD_PLACEMENTS.filter(d => !saved.find(s => s.id === d.id)), ...saved];
      setPlacements(all);
      const active = await scoringService.getActiveFieldPlacement(matchId);
      if (active) {
        setActiveId(active);
        const found = all.find(p => p.id === active);
        if (found) setEditingPlacement(found);
      } else {
        // Auto-activate first default placement if none is set
        const defaultPlacement = all.find(p => p.isDefault) || all[0];
        if (defaultPlacement) {
          await scoringService.saveFieldPlacement(matchId, defaultPlacement);
          await scoringService.setActiveFieldPlacement(matchId, defaultPlacement.id);
          setActiveId(defaultPlacement.id);
          setEditingPlacement(defaultPlacement);
        }
      }
    };
    load();
  }, [matchId]);

  const handleSelectPlacement = useCallback((placement: FieldPlacement) => {
    setEditingPlacement({ ...placement, positions: placement.positions.map(p => ({ ...p })) });
  }, []);

  const handleActivate = useCallback(async () => {
    if (!editingPlacement) return;
    // Save and activate
    await scoringService.saveFieldPlacement(matchId, editingPlacement);
    await scoringService.setActiveFieldPlacement(matchId, editingPlacement.id);
    setActiveId(editingPlacement.id);
    setPlacements(prev => prev.map(p => p.id === editingPlacement.id ? editingPlacement : p));
  }, [matchId, editingPlacement]);

  const handleDeactivate = useCallback(async () => {
    await scoringService.setActiveFieldPlacement(matchId, null);
    setActiveId(null);
  }, [matchId]);

  const handleDragStart = useCallback((posId: string) => {
    setDraggingId(posId);
  }, []);

  const handleDragMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!draggingId || !editingPlacement || !groundRef.current) return;
    const rect = groundRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));

    setEditingPlacement(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        positions: prev.positions.map(p => p.id === draggingId ? { ...p, x, y } : p),
      };
    });
  }, [draggingId, editingPlacement]);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
  }, []);

  const handleAddFielder = useCallback(() => {
    if (!editingPlacement) return;
    const id = `fielder-${Date.now()}`;
    setEditingPlacement(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        positions: [...prev.positions, { id, label: 'Fielder', x: 50, y: 50 }],
      };
    });
  }, [editingPlacement]);

  const handleRemoveFielder = useCallback((posId: string) => {
    setEditingPlacement(prev => {
      if (!prev) return prev;
      return { ...prev, positions: prev.positions.filter(p => p.id !== posId) };
    });
  }, []);

  const handleRenameFielder = useCallback((posId: string, label: string) => {
    setEditingPlacement(prev => {
      if (!prev) return prev;
      return { ...prev, positions: prev.positions.map(p => p.id === posId ? { ...p, label } : p) };
    });
  }, []);

  const handleCreateNew = useCallback(() => {
    if (!newName.trim()) return;
    const placement: FieldPlacement = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      positions: DEFAULT_FIELD_PLACEMENTS[0].positions.map(p => ({ ...p })),
    };
    setPlacements(prev => [...prev, placement]);
    setEditingPlacement(placement);
    setNewName('');
  }, [newName]);

  const handleSave = useCallback(async () => {
    if (!editingPlacement) return;
    await scoringService.saveFieldPlacement(matchId, editingPlacement);
    setPlacements(prev => prev.map(p => p.id === editingPlacement.id ? editingPlacement : p));
  }, [matchId, editingPlacement]);

  return (
    <div className="field-editor">
      <div className="field-editor__header">
        <h3>Field Placement</h3>
        {onClose && <button className="field-editor__close" onClick={onClose}>✕</button>}
      </div>

      {/* Preset selector */}
      <div className="field-editor__presets">
        {placements.map(p => (
          <button
            key={p.id}
            className={`field-editor__preset-btn ${editingPlacement?.id === p.id ? 'active' : ''} ${activeId === p.id ? 'live' : ''}`}
            onClick={() => handleSelectPlacement(p)}
          >
            {p.name}
            {activeId === p.id && <span className="field-editor__live-badge">LIVE</span>}
          </button>
        ))}
      </div>

      {/* Create new */}
      <div className="field-editor__create">
        <input
          type="text"
          placeholder="New placement name..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreateNew()}
        />
        <button onClick={handleCreateNew} disabled={!newName.trim()}>+ Add</button>
      </div>

      {/* Ground visualization */}
      {editingPlacement && (
        <>
          <div
            className="field-editor__ground"
            ref={groundRef}
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
            onTouchMove={handleDragMove}
            onTouchEnd={handleDragEnd}
          >
            {/* Pitch strip */}
            <div className="field-editor__pitch" />
            {/* 30-yard circle */}
            <div className="field-editor__inner-circle" />

            {/* Fielder dots */}
            {editingPlacement.positions.map(pos => (
              <div
                key={pos.id}
                className={`field-editor__fielder ${draggingId === pos.id ? 'dragging' : ''}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                onMouseDown={() => handleDragStart(pos.id)}
                onTouchStart={() => handleDragStart(pos.id)}
                title={pos.label}
              >
                <div className="field-editor__fielder-dot" />
                <span className="field-editor__fielder-label">{pos.label}</span>
              </div>
            ))}
          </div>

          {/* Fielder list for editing labels */}
          <div className="field-editor__list">
            {editingPlacement.positions.map(pos => (
              <div key={pos.id} className="field-editor__list-item">
                <input
                  type="text"
                  value={pos.label}
                  onChange={e => handleRenameFielder(pos.id, e.target.value)}
                />
                <button className="field-editor__remove-btn" onClick={() => handleRemoveFielder(pos.id)}>✕</button>
              </div>
            ))}
            {editingPlacement.positions.length < 11 && (
              <button className="field-editor__add-fielder" onClick={handleAddFielder}>+ Add Fielder</button>
            )}
          </div>

          {/* Action buttons */}
          <div className="field-editor__actions">
            <button className="field-editor__save-btn" onClick={handleSave}>Save</button>
            {activeId === editingPlacement.id ? (
              <button className="field-editor__deactivate-btn" onClick={handleDeactivate}>Hide from OBS</button>
            ) : (
              <button className="field-editor__activate-btn" onClick={handleActivate}>Show on OBS</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
