// Settings may contain credential-bearing ingest URLs, so encrypt them alongside stream keys.
import { StudioSecure } from '../native';
import { log } from './logger';

export const storage = {
  async getJson<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await StudioSecure.getItem(key, true);
      if (raw) return JSON.parse(raw) as T;
      const legacy = await StudioSecure.getItem(key, false);
      if (!legacy) return fallback;
      const value = JSON.parse(legacy) as T;
      await StudioSecure.setItem(key, legacy, true);
      return value;
    } catch (error) {
      log.warn('storage', `read ${key} failed: ${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
  },

  async setJson(key: string, value: unknown): Promise<void> {
    await StudioSecure.setItem(key, JSON.stringify(value), true);
  },

  async remove(key: string): Promise<void> {
    await StudioSecure.removeItem(key);
  },
};

export const secrets = {
  get: (key: string): Promise<string | null> => StudioSecure.getItem(key, true),
  set: (key: string, value: string): Promise<void> => StudioSecure.setItem(key, value, true),
  remove: (key: string): Promise<void> => StudioSecure.removeItem(key),
  async has(key: string): Promise<boolean> {
    return Boolean(await StudioSecure.getItem(key, true));
  },
};

export const keyName = {
  streamKey: (destinationId: string) => `streamKey:${destinationId}`,
  googleLinked: 'google:linked',
};
