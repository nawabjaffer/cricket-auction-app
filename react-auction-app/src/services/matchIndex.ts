import { get, onValue, ref, update, type Database } from 'firebase/database';

interface SetupRecord { createdAt: number }

/**
 * Keeps an id-only `matchIndex` next to `matches` so lists read each match's small `setup`
 * node instead of downloading whole match trees (ball-by-ball events, stats, lineups).
 */
export class MatchIndex<T extends SetupRecord> {
  private readonly ready = new Map<string, Promise<void>>();

  private readonly getDb: () => Database;
  private readonly getBasePath: () => string;

  constructor(getDb: () => Database, getBasePath: () => string) {
    this.getDb = getDb;
    this.getBasePath = getBasePath;
  }

  private ensure(): Promise<void> {
    const basePath = this.getBasePath();
    let pending = this.ready.get(basePath);
    if (!pending) {
      pending = this.backfill(basePath).catch((error) => {
        this.ready.delete(basePath);
        throw error;
      });
      this.ready.set(basePath, pending);
    }
    return pending;
  }

  // One-time full read for tenants that predate the index; a flag prevents repeating it.
  private async backfill(basePath: string): Promise<void> {
    const db = this.getDb();
    if ((await get(ref(db, `${basePath}/meta/matchIndexReady`))).val() === true) return;
    const legacy = await get(ref(db, `${basePath}/matches`));
    const patch: Record<string, unknown> = { 'meta/matchIndexReady': true };
    if (legacy.exists()) Object.keys(legacy.val()).forEach((id) => { patch[`matchIndex/${id}`] = true; });
    await update(ref(db, basePath), patch);
  }

  async save(id: string, setup: T): Promise<void> {
    await this.ensure();
    await update(ref(this.getDb(), this.getBasePath()), {
      [`matches/${id}/setup`]: setup,
      [`matchIndex/${id}`]: true,
    });
  }

  async remove(id: string): Promise<void> {
    await update(ref(this.getDb(), this.getBasePath()), {
      [`matches/${id}`]: null,
      [`matchIndex/${id}`]: null,
    });
  }

  async list(): Promise<T[]> {
    await this.ensure();
    const db = this.getDb();
    const basePath = this.getBasePath();
    const index = await get(ref(db, `${basePath}/matchIndex`));
    if (!index.exists()) return [];
    const setups: Array<T | null> = await Promise.all(
      Object.keys(index.val()).map(async (id): Promise<T | null> => (await get(ref(db, `${basePath}/matches/${id}/setup`))).val()),
    );
    return setups.filter((setup): setup is T => !!setup).sort((a, b) => b.createdAt - a.createdAt);
  }

  subscribe(callback: (matches: T[]) => void): () => void {
    const db = this.getDb();
    const basePath = this.getBasePath();
    const setups = new Map<string, T>();
    const setupListeners = new Map<string, () => void>();
    let stopIndex: (() => void) | undefined;
    let disposed = false;
    let emitQueued = false;

    const emit = () => {
      if (emitQueued) return;
      emitQueued = true;
      queueMicrotask(() => {
        emitQueued = false;
        if (!disposed) callback([...setups.values()].sort((a, b) => b.createdAt - a.createdAt));
      });
    };

    void this.ensure().then(() => {
      if (disposed) return;
      stopIndex = onValue(ref(db, `${basePath}/matchIndex`), (snapshot) => {
        const ids = new Set(snapshot.exists() ? Object.keys(snapshot.val()) : []);
        for (const [id, stop] of setupListeners) {
          if (ids.has(id)) continue;
          stop();
          setupListeners.delete(id);
          setups.delete(id);
        }
        for (const id of ids) {
          if (setupListeners.has(id)) continue;
          setupListeners.set(id, onValue(ref(db, `${basePath}/matches/${id}/setup`), (setupSnap) => {
            if (setupSnap.exists()) setups.set(id, setupSnap.val() as T);
            else setups.delete(id);
            emit();
          }));
        }
        emit();
      });
    });

    return () => {
      disposed = true;
      stopIndex?.();
      setupListeners.forEach((stop) => stop());
      setupListeners.clear();
    };
  }
}
