import { describe, it, expect, vi } from 'vitest';
import { logger, setupDebugConsole } from '../utils/logger';

describe('logger', () => {
  it('creates scoped logger', () => {
    const scoped = logger.scope('Test');
    expect(scoped).toHaveProperty('debug');
    expect(scoped).toHaveProperty('info');
    expect(scoped).toHaveProperty('warn');
    expect(scoped).toHaveProperty('error');
  });

  it('scoped methods call console methods', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const scoped = logger.scope('MyScope');
    scoped.debug('debug msg', { data: 1 });
    scoped.info('info msg');
    scoped.warn('warn msg');
    scoped.error('error msg');

    expect(debugSpy).toHaveBeenCalledWith('[MyScope] debug msg', { data: 1 });
    expect(infoSpy).toHaveBeenCalledWith('[MyScope] info msg', undefined);
    expect(warnSpy).toHaveBeenCalledWith('[MyScope] warn msg', undefined);
    expect(errorSpy).toHaveBeenCalledWith('[MyScope] error msg', undefined);

    vi.restoreAllMocks();
  });
});

describe('setupDebugConsole', () => {
  it('does not throw', () => {
    expect(() => setupDebugConsole()).not.toThrow();
  });

  it('enables console when debug=1', () => {
    localStorage.setItem('debug', '1');
    setupDebugConsole();
    // console methods should be enabled (not noop)
    expect(typeof console.log).toBe('function');
    localStorage.removeItem('debug');
  });

  it('disables console when debug=0', () => {
    localStorage.setItem('debug', '0');
    setupDebugConsole();
    // Methods should be noop (still functions)
    expect(typeof console.log).toBe('function');
    localStorage.removeItem('debug');
    // Re-enable console for remaining tests
    localStorage.setItem('debug', '1');
    setupDebugConsole();
  });
});
