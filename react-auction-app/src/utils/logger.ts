/*
  Debug logger setup
  - Default: enabled now for testing
  - Toggle by setting localStorage 'debug' to '1' (on) or '0' (off)
*/

type ConsoleMethod = (...args: unknown[]) => void;

type ConsoleSnapshot = {
  log: ConsoleMethod;
  info: ConsoleMethod;
  warn: ConsoleMethod;
  error: ConsoleMethod;
  debug: ConsoleMethod;
};

const noop: ConsoleMethod = () => {};

const originalConsole: ConsoleSnapshot = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

const resolveInitialDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;

  const stored = window.localStorage.getItem('debug');
  if (stored === '1') return true;
  if (stored === '0') return false;

  // Enabled now for testing by default
  window.localStorage.setItem('debug', '1');
  return true;
};

const applyConsoleMode = (enabled: boolean) => {
  if (enabled) {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.debug = originalConsole.debug;
    return;
  }

  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
  console.debug = noop;
};

// Logger wrapper for structured logging
class LoggerWrapper {
  scope(name: string) {
    return {
      debug: (message: string, data?: unknown) => console.debug(`[${name}] ${message}`, data),
      info: (message: string, data?: unknown) => console.info(`[${name}] ${message}`, data),
      warn: (message: string, data?: unknown) => console.warn(`[${name}] ${message}`, data),
      error: (message: string, data?: unknown) => console.error(`[${name}] ${message}`, data),
    };
  }
}

export const logger = new LoggerWrapper();

export const setupDebugConsole = () => {
  applyConsoleMode(resolveInitialDebugEnabled());
};
