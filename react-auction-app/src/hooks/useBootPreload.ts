// ============================================================================
// USE BOOT PRELOAD
// Fetches admin players + teams + sponsors, resolves every media URL to its
// Firebase Storage CDN equivalent, and persists each blob into IndexedDB so
// subsequent renders are instant and offline-capable. Reports accurate
// progress (loaded/total, percentage) while running.
// ============================================================================

import { useEffect, useState, useRef } from 'react';
import { getCachedStorageUrl, resolveImageAsync } from '../services/firebaseStorageService';
import { auctionPersistence, type SponsorRecord } from '../services/auctionPersistence';
import type { Player, Team } from '../types';

export interface BootPreloadState {
  done: boolean;
  loaded: number;
  total: number;
  progress: number; // 0..1
  phase: 'idle' | 'collecting' | 'resolving' | 'caching' | 'done';
}

const BOOT_TIMEOUT_MS = 30_000;
const PER_ITEM_TIMEOUT = 8_000;
const MAX_CONCURRENT = 6;

// Flag persisted for the browser tab's lifetime so that navigating to /live
// (or any other route that remounts <App />) and back does not trigger a
// second full preload cycle — the media is already warm in IndexedDB / HTTP
// cache from the first boot.
const SESSION_FLAG = 'bootPreloadDone_v1';
const PERSIST_FLAG = 'bootPreloadDone_persist_v1';

function hasSessionFlag(persist: boolean): boolean {
  try {
    if (persist && typeof localStorage !== 'undefined' && localStorage.getItem(PERSIST_FLAG) === '1') return true;
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_FLAG) === '1';
  } catch { return false; }
}
function setSessionFlag(persist: boolean) {
  try { sessionStorage?.setItem(SESSION_FLAG, '1'); } catch { /* ignore */ }
  if (persist) {
    try { localStorage?.setItem(PERSIST_FLAG, '1'); } catch { /* ignore */ }
  }
}

/** Clear the persistent preload flag so next boot re-caches everything */
export function clearPreloadCache() {
  try { sessionStorage?.removeItem(SESSION_FLAG); } catch { /* ignore */ }
  try { localStorage?.removeItem(PERSIST_FLAG); } catch { /* ignore */ }
}

type MediaItem = { originalUrl: string; storagePath: string };

async function collectMediaItems(): Promise<MediaItem[]> {
  const items: MediaItem[] = [];
  const seen = new Set<string>();

  const [adminPlayers, teams, sponsors] = await Promise.all([
    auctionPersistence.getAdminPlayers().catch(() => null as Player[] | null),
    auctionPersistence.getTeams().catch(() => null as Team[] | null),
    auctionPersistence.getSponsors().catch(() => [] as SponsorRecord[]),
  ]);

  const pushUnique = (url: string | undefined, storagePath: string) => {
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    items.push({ originalUrl: trimmed, storagePath });
  };

  for (const p of adminPlayers ?? []) {
    pushUnique(p.imageUrl, `media/players/${(p.id ?? p.name ?? 'unknown')}`);
  }
  for (const t of teams ?? []) {
    pushUnique(t.logoUrl, `media/teams/${(t.id ?? t.name ?? 'unknown')}`);
  }
  for (const s of sponsors ?? []) {
    pushUnique(s.logoUrl, `media/sponsors/${(s.id ?? s.name ?? 'unknown')}`);
  }
  return items;
}

async function resolveToStorageWithTimeout(item: MediaItem, timeoutMs: number): Promise<string> {
  const cached = getCachedStorageUrl(item.originalUrl);
  if (cached) return cached;
  if (item.originalUrl.includes('firebasestorage')) return item.originalUrl;
  return new Promise<string>((resolve) => {
    let settled = false;
    const to = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(item.originalUrl);
    }, timeoutMs);
    resolveImageAsync(item.originalUrl, item.storagePath, (url) => {
      if (settled) return;
      settled = true;
      clearTimeout(to);
      resolve(url);
    });
  });
}

// Warm the browser's HTTP image cache without CORS by decoding an <img>.
function preloadImage(url: string, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!url) return resolve();
    const img = new Image();
    let settled = false;
    const done = () => { if (settled) return; settled = true; resolve(); };
    const to = setTimeout(done, timeoutMs);
    img.onload = () => { clearTimeout(to); done(); };
    img.onerror = () => { clearTimeout(to); done(); };
    try { img.decoding = 'async'; } catch { /* ignore */ }
    img.src = url;
  });
}

export function useBootPreload(enabled: boolean, persist = false): BootPreloadState {
  const [state, setState] = useState<BootPreloadState>(() => (
    hasSessionFlag(persist)
      ? { done: true, loaded: 0, total: 0, progress: 1, phase: 'done' }
      : { done: false, loaded: 0, total: 0, progress: 0, phase: 'idle' }
  ));
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (startedRef.current) return;
    if (hasSessionFlag(persist)) {
      startedRef.current = true;
      setState({ done: true, loaded: 0, total: 0, progress: 1, phase: 'done' });
      return;
    }
    startedRef.current = true;

    let cancelled = false;
    const hardTimeout = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      setSessionFlag(persist);
      setState((s) => ({ ...s, done: true, phase: 'done' }));
    }, BOOT_TIMEOUT_MS);

    (async () => {
      setState((s) => ({ ...s, phase: 'collecting' }));
      const items = await collectMediaItems();
      const total = items.length;
      if (total === 0) {
        clearTimeout(hardTimeout);
        setSessionFlag(persist);
        setState({ done: true, loaded: 0, total: 0, progress: 1, phase: 'done' });
        return;
      }

      setState({ done: false, loaded: 0, total, progress: 0, phase: 'resolving' });

      let loaded = 0;
      let cursor = 0;

      const worker = async () => {
        while (!cancelled && cursor < items.length) {
          const idx = cursor++;
          const item = items[idx];
          try {
            const storageUrl = await resolveToStorageWithTimeout(item, PER_ITEM_TIMEOUT);
            // Warm the browser's HTTP cache via <img> — no CORS required.
            await preloadImage(storageUrl, PER_ITEM_TIMEOUT);
          } catch { /* swallow — never block boot */ }
          loaded += 1;
          if (!cancelled) {
            setState({
              done: false,
              loaded,
              total,
              progress: loaded / total,
              phase: 'caching',
            });
          }
        }
      };

      const workers = Array.from({ length: Math.min(MAX_CONCURRENT, total) }, () => worker());
      await Promise.all(workers);

      if (!cancelled) {
        clearTimeout(hardTimeout);
        setSessionFlag(persist);
        setState({ done: true, loaded, total, progress: 1, phase: 'done' });
      }
    })().catch(() => {
      if (!cancelled) {
        clearTimeout(hardTimeout);
        setSessionFlag(persist);
        setState((s) => ({ ...s, done: true, phase: 'done' }));
      }
    });

    return () => { cancelled = true; clearTimeout(hardTimeout); };
  }, [enabled]);

  return state;
}
