import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IoClose, IoCloudUpload } from 'react-icons/io5';
import type { Player } from '../../types';
import { uploadFileToStorage } from '../../services';

interface Props {
  players: Player[];
  page: number;
  pageSize: number;
  isOpen: boolean;
  onClose: () => void;
  onBulkSave: (updatedPlayers: Player[]) => Promise<void>;
}

export default function AdminImageBulkUpload({ players, page, pageSize, isOpen, onClose, onBulkSave }: Props) {
  const [fileMap, setFileMap] = useState<Record<string, File | null>>({});
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Record<string, 'pending' | 'uploading' | 'done' | 'error' | undefined>>({});

  useEffect(() => {
    if (isOpen) console.debug('[AdminImageBulkUpload] opened, page', page, 'pageSize', pageSize);
    if (!isOpen) {
      // clear previews when closed
      Object.values(previewMap).forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
      setFileMap({});
      setPreviewMap({});
      setProgress({});
    }
  }, [isOpen]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return players.slice(start, start + pageSize);
  }, [players, page, pageSize]);

  const handleFileChange = (playerId: string, file?: File | null) => {
    setFileMap((prev) => ({ ...prev, [playerId]: file ?? null }));
    setProgress((prev) => ({ ...prev, [playerId]: file ? 'pending' : undefined }));
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewMap((p) => ({ ...p, [playerId]: url }));
    } else {
      setPreviewMap((p) => { const next = { ...p }; delete next[playerId]; return next; });
    }
  };

  async function uploadSelected() {
    setUploading(true);
    const uploadedMap: Record<string, string> = {};
    for (const p of pageItems) {
      const file = fileMap[p.id];
      if (!file) continue;
      try {
        setProgress((prev) => ({ ...prev, [p.id]: 'uploading' }));
        const storagePath = `images/players/${p.id}`;
        const storageUrl = await uploadFileToStorage(file, storagePath);
        uploadedMap[p.id] = storageUrl;
        setProgress((prev) => ({ ...prev, [p.id]: 'done' }));
      } catch (err) {
        setProgress((prev) => ({ ...prev, [p.id]: 'error' }));
      }
    }
    // Build updated players list
    if (Object.keys(uploadedMap).length > 0) {
      const updatedPlayers = players.map((pl) => ({ ...(pl as Player), imageUrl: uploadedMap[pl.id] ?? pl.imageUrl }));
      try {
        await onBulkSave(updatedPlayers);
      } catch (e) {
        // bubble up error; but keep UI responsive
      }
    }
    setUploading(false);
  }

  if (!isOpen) return null;

  const modal = (
    <div className="admin-edit-modal-backdrop" onClick={onClose}>
      <div className="admin-edit-modal admin-edit-modal--wide" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Bulk Upload Player Images</h3>
          <button className="admin-btn admin-btn-ghost" onClick={onClose}><IoClose /></button>
        </div>

        <p style={{ color: '#6b7280' }}>Upload images inline for the current page (rows shown below). Choose files for each player — files are uploaded to Firebase Storage when you click <strong>Upload Selected</strong>. After upload completes, press <strong>Bulk Save</strong> to persist image URLs to the database.</p>

        <div style={{ maxHeight: '50vh', overflow: 'auto', marginTop: '0.5rem' }}>
          {pageItems.map((p) => (
            <div key={p.id} className="admin-compact-item" style={{ alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1 }}>
                <div style={{ width: 56, height: 56, borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {previewMap[p.id] ? (
                    <img src={previewMap[p.id]} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    p.imageUrl ? <img src={p.imageUrl} alt="current" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#9ca3af' }}>No Image</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#000' }}>
                    <div>
                      <strong>{p?.name}</strong>
                      {typeof p?.age === 'number' && <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#6b7280' }}>Age: {p?.age}</span>}
                    </div>
                    <small style={{ color: '#6b7280' }}>{p.id}</small>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="file" accept="image/*" onChange={(e) => handleFileChange(p.id, e.target.files?.[0] ?? null)} />
                    <span style={{ color: '#6b7280' }}>{progress[p.id] === 'uploading' ? 'Uploading…' : progress[p.id] === 'done' ? 'Uploaded' : progress[p.id] === 'error' ? 'Error' : ''}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1rem' }}>
          <button className="admin-btn admin-btn-ghost" onClick={onClose} disabled={uploading}>Cancel</button>
          <button className="admin-btn admin-btn-secondary" onClick={uploadSelected} disabled={uploading}>
            <IoCloudUpload style={{ marginRight: 6 }} /> Upload Selected
          </button>
        </div>
      </div>
    </div>
  );

  // Render in a portal so modal overlays regardless of parent stacking context
  return createPortal(modal, document.body);
}
