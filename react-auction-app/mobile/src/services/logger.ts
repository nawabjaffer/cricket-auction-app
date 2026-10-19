// Small in-memory ring buffer so operators can read recent events on the Diagnostics screen.
import { LOG_LIMIT } from '../config';

export type LogLevel = 'info' | 'warn' | 'error';
export interface LogEntry { at: number; level: LogLevel; tag: string; message: string }

const entries: LogEntry[] = [];
const listeners = new Set<() => void>();

function push(level: LogLevel, tag: string, message: unknown): void {
  const text = message instanceof Error ? message.message : typeof message === 'string' ? message : JSON.stringify(message);
  entries.push({ at: Date.now(), level, tag, message: text });
  if (entries.length > LOG_LIMIT) entries.splice(0, entries.length - LOG_LIMIT);
  listeners.forEach(listener => listener());
  if (__DEV__) console[level === 'info' ? 'log' : level](`[${tag}] ${text}`);
}

export const log = {
  info: (tag: string, message: unknown) => push('info', tag, message),
  warn: (tag: string, message: unknown) => push('warn', tag, message),
  error: (tag: string, message: unknown) => push('error', tag, message),
};

export function getLogs(): readonly LogEntry[] {
  return entries;
}

export function subscribeLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Never log stream keys or tokens: replace the last path segment of an ingest URL. */
export function redactEndpoint(url: string): string {
  return url.replace(/(rtmps?:\/\/[^/]+\/[^/]+\/)[^/?#]+/i, '$1••••').replace(/(streamid=)[^&]+/i, '$1••••').replace(/(passphrase=)[^&]+/i, '$1••••');
}
