// ============================================================================
// STORAGE MANAGER — Admin component for managing Firebase Storage objects
// Features: Browse, search, filter, identify unused/stale objects, bulk delete
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoTrash, IoRefresh, IoSearch, IoClose, IoWarning, IoCheckmarkCircle, IoCloudUpload, IoFolderOpen, IoImage, IoVideocam, IoDocument } from 'react-icons/io5';
import {
  listStorageObjects,
  deleteStorageObjects,
  getImageIndexEntries,
  clearStaleImageIndex,
  uploadFileToStorage,
  type StorageObject,
} from '../../services';
import { useAuctionStore } from '../../store/auctionStore';

type ViewMode = 'all' | 'images' | 'videos' | 'unused';
type SortMode = 'name' | 'size' | 'date';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function getFileIcon(contentType: string) {
  if (contentType.startsWith('image/')) return <IoImage />;
  if (contentType.startsWith('video/')) return <IoVideocam />;
  return <IoDocument />;
}

export function StorageManager() {
  const [objects, setObjects] = useState<StorageObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ success: number; failed: number } | null>(null);
  const [usedUrls, setUsedUrls] = useState<Set<string>>(new Set());
  const [clearingStale, setClearingStale] = useState(false);
  const [staleCleared, setStaleCleared] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFolder, setUploadFolder] = useState('images/sponsors');

  const { originalPlayers, teams } = useAuctionStore();

  // Collect all URLs currently in use by the system
  const collectUsedUrls = useCallback(() => {
    const urls = new Set<string>();
    // Player images
    originalPlayers.forEach(p => {
      if (p.imageUrl?.includes('firebasestorage')) urls.add(p.imageUrl);
    });
    // Team logos
    teams.forEach(t => {
      if (t.logoUrl?.includes('firebasestorage')) urls.add(t.logoUrl);
      if (t.brandLogoUrl?.includes('firebasestorage')) urls.add(t.brandLogoUrl);
    });
    return urls;
  }, [originalPlayers, teams]);

  const loadObjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, indexEntries] = await Promise.all([
        listStorageObjects(''),
        getImageIndexEntries(),
      ]);
      setObjects(items);
      // URLs referenced in the image index are considered "in use"
      const indexUrls = new Set(Object.values(indexEntries));
      const systemUrls = collectUsedUrls();
      setUsedUrls(new Set([...indexUrls, ...systemUrls]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load storage objects');
    } finally {
      setLoading(false);
    }
  }, [collectUsedUrls]);

  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  const unusedObjects = useMemo(() => {
    return objects.filter(obj => !usedUrls.has(obj.downloadUrl));
  }, [objects, usedUrls]);

  const filteredObjects = useMemo(() => {
    let items: StorageObject[];
    if (viewMode === 'unused') items = unusedObjects;
    else if (viewMode === 'images') items = objects.filter(o => o.contentType.startsWith('image/'));
    else if (viewMode === 'videos') items = objects.filter(o => o.contentType.startsWith('video/'));
    else items = objects;

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(o => o.name.toLowerCase().includes(q) || o.fullPath.toLowerCase().includes(q));
    }

    // Sort
    items = [...items].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'size') return b.size - a.size;
      return new Date(b.updated).getTime() - new Date(a.updated).getTime();
    });

    return items;
  }, [objects, unusedObjects, viewMode, search, sortMode]);

  const totalSize = useMemo(() => objects.reduce((sum, o) => sum + o.size, 0), [objects]);
  const unusedSize = useMemo(() => unusedObjects.reduce((sum, o) => sum + o.size, 0), [unusedObjects]);

  const toggleSelect = (fullPath: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(fullPath)) next.delete(fullPath);
      else next.add(fullPath);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filteredObjects.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredObjects.map(o => o.fullPath)));
    }
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    setDeleteResult(null);
    try {
      const paths = Array.from(selected);
      const failed = await deleteStorageObjects(paths);
      setDeleteResult({ success: paths.length - failed.length, failed: failed.length });
      setSelected(new Set());
      // Refresh list
      await loadObjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleClearStale = async () => {
    setClearingStale(true);
    setStaleCleared(null);
    try {
      const activeUrls = new Set(objects.map(o => o.downloadUrl));
      const count = await clearStaleImageIndex(activeUrls);
      setStaleCleared(count);
      // Refresh used URLs
      await loadObjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear stale data');
    } finally {
      setClearingStale(false);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const safeName = file.name.replaceAll(/[^a-zA-Z0-9._-]/g, '-');
        const path = `${uploadFolder}/${safeName}`;
        await uploadFileToStorage(file, path);
      }
      await loadObjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const getEmptyMessage = () => {
    if (search) return 'No objects match your search';
    if (viewMode === 'unused') return 'No unused objects found — storage is clean!';
    return 'No objects in storage';
  };

  return (
    <div className="storage-manager">
      {/* Stats bar */}
      <div className="storage-stats-bar">
        <div className="storage-stat">
          <span className="storage-stat-label">Total Objects</span>
          <span className="storage-stat-value">{objects.length}</span>
        </div>
        <div className="storage-stat">
          <span className="storage-stat-label">Total Size</span>
          <span className="storage-stat-value">{formatFileSize(totalSize)}</span>
        </div>
        <div className="storage-stat storage-stat--warning">
          <span className="storage-stat-label">Unused</span>
          <span className="storage-stat-value">{unusedObjects.length} ({formatFileSize(unusedSize)})</span>
        </div>
        <button className="storage-refresh-btn" onClick={loadObjects} disabled={loading} title="Refresh">
          <IoRefresh className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Toolbar */}
      <div className="storage-toolbar">
        <div className="storage-search-box">
          <IoSearch />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file name or path..."
          />
          {search && (
            <button className="storage-search-clear" onClick={() => setSearch('')}>
              <IoClose />
            </button>
          )}
        </div>

        <div className="storage-view-tabs">
          {(['all', 'images', 'videos', 'unused'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              className={`storage-view-tab ${viewMode === mode ? 'active' : ''}`}
              onClick={() => setViewMode(mode)}
            >
              {mode === 'all' && <IoFolderOpen />}
              {mode === 'images' && <IoImage />}
              {mode === 'videos' && <IoVideocam />}
              {mode === 'unused' && <IoWarning />}
              <span>{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
              {mode === 'unused' && unusedObjects.length > 0 && (
                <span className="storage-badge">{unusedObjects.length}</span>
              )}
            </button>
          ))}
        </div>

        <select
          className="storage-sort-select"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
        >
          <option value="date">Sort: Newest first</option>
          <option value="name">Sort: Name A-Z</option>
          <option value="size">Sort: Largest first</option>
        </select>
      </div>

      {/* Upload section */}
      <div className="storage-upload-bar">
        <div className="storage-upload-folder">
          <label htmlFor="storage-upload-folder-select">Upload to:</label>
          <select id="storage-upload-folder-select" value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)}>
            <option value="images/sponsors">images/sponsors</option>
            <option value="images/players">images/players</option>
            <option value="images/teams">images/teams</option>
            <option value="images/misc">images/misc</option>
            <option value="videos">videos</option>
          </select>
        </div>
        <label className="storage-upload-btn">
          <IoCloudUpload /> {uploading ? 'Uploading...' : 'Upload Files'}
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(e) => handleUpload(e.target.files)}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {/* Action bar */}
      {(selected.size > 0 || unusedObjects.length > 0) && (
        <div className="storage-action-bar">
          {selected.size > 0 && (
            <div className="storage-action-group">
              <span className="storage-selected-count">{selected.size} selected</span>
              {confirmDelete ? (
                <div className="storage-confirm-group">
                  <span className="storage-confirm-text">Are you sure? This cannot be undone.</span>
                  <button className="storage-confirm-yes" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                  <button className="storage-confirm-no" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="storage-delete-btn"
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleting}
                >
                  <IoTrash /> Delete Selected
                </button>
              )}
            </div>
          )}

          {unusedObjects.length > 0 && selected.size === 0 && (
            <button
              className="storage-select-unused-btn"
              onClick={() => setSelected(new Set(unusedObjects.map(o => o.fullPath)))}
            >
              <IoWarning /> Select All Unused ({unusedObjects.length})
            </button>
          )}

          <button
            className="storage-clear-stale-btn"
            onClick={handleClearStale}
            disabled={clearingStale}
            title="Remove stale RTDB image index entries that point to deleted files"
          >
            {clearingStale ? 'Clearing...' : 'Clear Stale Index'}
          </button>
        </div>
      )}

      {/* Feedback messages */}
      <AnimatePresence>
        {deleteResult && (
          <motion.div
            className="storage-feedback storage-feedback--success"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <IoCheckmarkCircle /> Deleted {deleteResult.success} object{deleteResult.success === 1 ? '' : 's'}
            {deleteResult.failed > 0 && ` (${deleteResult.failed} failed)`}
          </motion.div>
        )}
        {staleCleared !== null && (
          <motion.div
            className="storage-feedback storage-feedback--info"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <IoCheckmarkCircle /> Cleared {staleCleared} stale index {staleCleared === 1 ? 'entry' : 'entries'}
          </motion.div>
        )}
        {error && (
          <motion.div
            className="storage-feedback storage-feedback--error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <IoWarning /> {error}
            <button onClick={() => setError(null)}><IoClose /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Object list */}
      {loading && objects.length === 0 && (
        <div className="storage-loading">
          <div className="storage-spinner" />
          <span>Loading storage objects...</span>
        </div>
      )}

      {!loading && filteredObjects.length === 0 && (
        <div className="storage-empty">
          <IoFolderOpen />
          <span>{getEmptyMessage()}</span>
        </div>
      )}

      {filteredObjects.length > 0 && (
        <>
          <div className="storage-list-header">
            <label className="storage-select-all">
              <input
                type="checkbox"
                checked={selected.size === filteredObjects.length && filteredObjects.length > 0}
                onChange={selectAll}
              />
              Select all ({filteredObjects.length})
            </label>
          </div>

          <div className="storage-grid">
            {filteredObjects.map((obj) => {
              const isSelected = selected.has(obj.fullPath);
              const isUnused = !usedUrls.has(obj.downloadUrl);
              const isImage = obj.contentType.startsWith('image/');

              return (
                <motion.div
                  key={obj.fullPath}
                  className={`storage-card ${isSelected ? 'selected' : ''} ${isUnused ? 'unused' : ''}`}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <div className="storage-card-select">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(obj.fullPath)}
                    />
                  </div>

                  <div className="storage-card-preview">
                    {isImage ? (
                      <img src={obj.downloadUrl} alt={obj.name} loading="lazy" />
                    ) : (
                      <div className="storage-card-icon">{getFileIcon(obj.contentType)}</div>
                    )}
                    {isUnused && (
                      <span className="storage-unused-badge" title="Not referenced by any player, team, or sponsor">
                        <IoWarning /> Unused
                      </span>
                    )}
                  </div>

                  <div className="storage-card-info">
                    <div className="storage-card-name" title={obj.fullPath}>{obj.name}</div>
                    <div className="storage-card-path">{obj.fullPath}</div>
                    <div className="storage-card-meta">
                      <span>{formatFileSize(obj.size)}</span>
                      <span>{formatDate(obj.updated)}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
