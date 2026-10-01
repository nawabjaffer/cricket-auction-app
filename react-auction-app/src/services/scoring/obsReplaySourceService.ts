// ============================================================================
// OBS REPLAY SOURCE SERVICE
// Controls OBS Studio's "Replay Source" plugin (by Exeldro) and the built-in
// Replay Buffer via the OBS WebSocket 5.x API.
//
// The Replay Source plugin registers its actions as OBS hotkeys, so the primary
// integration path is:
//   1. User discovers hotkeys via GetHotkeyList
//   2. Admin maps buttons → hotkey names (stored in Firebase)
//   3. Dock triggers hotkeys via TriggerHotkeyByName
//
// WiFi (same-LAN) operation is supported by pointing the dock at the OBS
// computer's LAN IP instead of localhost.
// ============================================================================

import { ref, onValue, set, push, runTransaction, type Database } from 'firebase/database';
import { obsService } from '../obsService';
import type { OBSReplayButton, OBSReplayConfig, OBSButtonSeriesStep } from '../../types/scoring';

// Default preset buttons — each maps to the typical Replay Source hotkey names.
// The user can override these after running "Discover Hotkeys".
export const DEFAULT_REPLAY_BUTTONS: OBSReplayButton[] = [
  {
    id: 'play',
    label: 'Play Replay',
    icon: '▶',
    color: '#22c55e',
    action: 'hotkey_name',
    hotkeyName: '', // configured by user
    order: 0,
    enabled: true,
  },
  {
    id: 'pause',
    label: 'Pause',
    icon: '⏸',
    color: '#f59e0b',
    action: 'hotkey_name',
    hotkeyName: '',
    order: 1,
    enabled: true,
  },
  {
    id: 'slow_fwd',
    label: 'Slow Fwd',
    icon: '⏩',
    color: '#3b82f6',
    action: 'hotkey_name',
    hotkeyName: '',
    order: 2,
    enabled: true,
  },
  {
    id: 'slow_back',
    label: 'Slow Back',
    icon: '⏪',
    color: '#8b5cf6',
    action: 'hotkey_name',
    hotkeyName: '',
    order: 3,
    enabled: true,
  },
  {
    id: 'fast_fwd',
    label: 'Fast Fwd',
    icon: '⏭',
    color: '#06b6d4',
    action: 'hotkey_name',
    hotkeyName: '',
    order: 4,
    enabled: true,
  },
  {
    id: 'step_fwd',
    label: 'Step →',
    icon: '⏯',
    color: '#64748b',
    action: 'hotkey_name',
    hotkeyName: '',
    order: 5,
    enabled: true,
  },
  {
    id: 'step_back',
    label: 'Step ←',
    icon: '⏮',
    color: '#64748b',
    action: 'hotkey_name',
    hotkeyName: '',
    order: 6,
    enabled: true,
  },
  {
    id: 'replay_20s',
    label: '20s Replay',
    icon: '📹',
    color: '#ef4444',
    action: 'hotkey_name',
    hotkeyName: '',
    order: 7,
    enabled: true,
  },
  {
    id: 'drs',
    label: 'DRS',
    icon: '🔍',
    color: '#f97316',
    action: 'hotkey_name',
    hotkeyName: '',
    order: 8,
    enabled: true,
  },
];

// Firebase command written by mobile → read by dock to execute locally
export interface OBSRelayCommand {
  id: string;
  buttonId: string;
  matchId?: string;
  timestamp: number;
  consumed: boolean;
  status?: 'pending' | 'running' | 'success' | 'error';
  error?: string;
}

export interface OBSButtonExecutionResult {
  success: boolean;
  completedSteps: number;
  totalSteps: number;
  errors: string[];
  cancelled?: boolean;
}

export interface OBSButtonExecutionProgress {
  buttonId: string;
  stepIndex: number;
  totalSteps: number;
  stepLabel: string;
  status: 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface OBSButtonExecutionOptions {
  signal?: AbortSignal;
  onProgress?: (progress: OBSButtonExecutionProgress) => void;
}

class OBSReplaySourceService {
  private db: Database | null = null;
  private basePath = '';
  private relayUnsub: (() => void) | null = null;

  initialize(db: Database, basePath: string): void {
    this.db = db;
    this.basePath = basePath;
  }

  // ── Direct action execution (when the dock is on the OBS machine) ──────────

  async executeButton(button: OBSReplayButton, options: OBSButtonExecutionOptions = {}): Promise<OBSButtonExecutionResult> {
    if (button.action === 'series') {
      return this.executeSeries(button, options);
    }
    const error = await this.executeAction(button, options.signal);
    return { success: !error, completedSteps: error ? 0 : 1, totalSteps: 1, errors: error ? [error] : [] };
  }

  /** Run each configured step in order, waiting the step delay before firing it. */
  private async executeSeries(button: OBSReplayButton, options: OBSButtonExecutionOptions): Promise<OBSButtonExecutionResult> {
    const steps = [...(button.series || [])];
    if (steps.length === 0) return { success: false, completedSteps: 0, totalSteps: 0, errors: ['This series has no steps.'] };

    let completedSteps = 0;
    const errors: string[] = [];
    for (const [index, step] of steps.entries()) {
      const stepLabel = step.label || step.action;
      if (options.signal?.aborted) {
        options.onProgress?.({ buttonId: button.id, stepIndex: index, totalSteps: steps.length, stepLabel, status: 'cancelled' });
        return { success: false, completedSteps, totalSteps: steps.length, errors: ['Cancelled by user.'], cancelled: true };
      }
      const wait = Math.max(0, Number(step.delayMs) || 0);
      if (wait > 0) {
        options.onProgress?.({ buttonId: button.id, stepIndex: index, totalSteps: steps.length, stepLabel, status: 'waiting' });
        const continued = await this.waitForDelay(wait, options.signal);
        if (!continued) {
          options.onProgress?.({ buttonId: button.id, stepIndex: index, totalSteps: steps.length, stepLabel, status: 'cancelled' });
          return { success: false, completedSteps, totalSteps: steps.length, errors: ['Cancelled by user.'], cancelled: true };
        }
      }
      options.onProgress?.({ buttonId: button.id, stepIndex: index, totalSteps: steps.length, stepLabel, status: 'running' });
      const error = await this.executeAction(step, options.signal);
      if (options.signal?.aborted) {
        options.onProgress?.({ buttonId: button.id, stepIndex: index, totalSteps: steps.length, stepLabel, status: 'cancelled' });
        return { success: false, completedSteps, totalSteps: steps.length, errors: ['Cancelled by user.'], cancelled: true };
      }
      if (error) {
        errors.push(`Step ${index + 1} (${stepLabel}): ${error}`);
        options.onProgress?.({ buttonId: button.id, stepIndex: index, totalSteps: steps.length, stepLabel, status: 'failed' });
      } else {
        completedSteps += 1;
        options.onProgress?.({ buttonId: button.id, stepIndex: index, totalSteps: steps.length, stepLabel, status: 'completed' });
      }
    }
    return { success: errors.length === 0, completedSteps, totalSteps: steps.length, errors };
  }

  private waitForDelay(delayMs: number, signal?: AbortSignal): Promise<boolean> {
    return new Promise(resolve => {
      if (signal?.aborted) { resolve(false); return; }
      const finish = (continued: boolean) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        resolve(continued);
      };
      const abort = () => finish(false);
      const timer = setTimeout(() => finish(true), delayMs);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  private async executeAction(step: OBSReplayButton | OBSButtonSeriesStep, signal?: AbortSignal): Promise<string | null> {
    try {
      if (signal?.aborted) return 'Cancelled by user.';
      switch (step.action) {
        case 'hotkey_name':
          if (!step.hotkeyName) return 'Select an OBS hotkey first.';
          if (!await obsService.triggerHotkeyByName(step.hotkeyName)) return `OBS did not trigger hotkey "${step.hotkeyName}".`;
          return null;

        case 'hotkey_sequence':
          if (!step.keySequence?.keyId) return 'Enter an OBS key ID first (for example OBS_KEY_F1).';
          if (!await obsService.triggerHotkeyByKeySequence(
            step.keySequence.keyId,
            step.keySequence.shift,
            step.keySequence.ctrl,
            step.keySequence.alt,
          )) return `OBS did not trigger key sequence "${step.keySequence.keyId}".`;
          return null;

        case 'scene_switch':
          if (!step.sceneName?.trim()) return 'Select an OBS scene first.';
          await obsService.request('SetCurrentProgramScene', { sceneName: step.sceneName.trim() });
          return null;

        case 'replay_buffer_save':
          await obsService.request('SaveReplayBuffer');
          return null;

        case 'replay_buffer_start':
          await obsService.request('StartReplayBuffer');
          return null;

        case 'replay_buffer_stop':
          await obsService.request('StopReplayBuffer');
          return null;

        case 'media_input_action':
          if (!step.inputName?.trim()) return 'Select an OBS media source first.';
          await obsService.request('TriggerMediaInputAction', {
            inputName: step.inputName.trim(),
            mediaAction: step.mediaAction || 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE',
          });
          return null;

        default:
          return `Unsupported OBS action: ${step.action}.`;
      }
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  /** Fetch all hotkeys from OBS (includes Replay Source plugin hotkeys). */
  async discoverHotkeys(): Promise<string[]> {
    return obsService.getHotkeyList();
  }

  /** Switch to the configured replay scene. */
  async switchToReplayScene(sceneName: string): Promise<boolean> {
    return obsService.setScene(sceneName);
  }

  // ── Firebase relay: mobile writes a command, dock executes it ─────────────

  /**
   * Write a relay command to Firebase.
   * Mobile uses this when it cannot connect directly to OBS WebSocket.
   */
  async sendRelayCommand(matchId: string, buttonId: string): Promise<string> {
    if (!this.db) throw new Error('OBS relay is not initialized');
    const commandsPath = `${this.basePath}/obsRelayCommands`;
    const newRef = push(ref(this.db, commandsPath));
    if (!newRef.key) throw new Error('Could not create OBS relay command');
    const command: OBSRelayCommand = {
      id: newRef.key,
      buttonId,
      matchId,
      timestamp: Date.now(),
      consumed: false,
      status: 'pending',
    };
    await set(newRef, command);
    return newRef.key;
  }

  waitForRelayResult(_matchId: string, commandId: string, timeoutMs = 120_000): Promise<{ success: boolean; error?: string }> {
    if (!this.db) return Promise.resolve({ success: false, error: 'OBS relay is not initialized' });
    const commandRef = ref(this.db, `${this.basePath}/obsRelayCommands/${commandId}`);
    return new Promise(resolve => {
      let settled = false;
      let unsubscribe = () => {};
      const timer = setTimeout(() => finish({ success: false, error: 'OBS dock did not respond in time' }), timeoutMs);
      const finish = (result: { success: boolean; error?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(result);
      };
      unsubscribe = onValue(commandRef, snapshot => {
        const command = snapshot.val() as OBSRelayCommand | null;
        if (command?.status === 'success') finish({ success: true });
        if (command?.status === 'error') finish({ success: false, error: command.error || 'OBS action failed' });
      }, error => finish({ success: false, error: error.message }));
    });
  }

  /**
   * Listen for relay commands and execute them locally.
   * The OBS dock (running on the OBS computer) calls this to process commands.
   */
  watchRelayCommands(matchId: string | null, config: OBSReplayConfig): void {
    if (!this.db) return;
    this.stopRelayWatch();

    const commandsPath = `${this.basePath}/obsRelayCommands`;
    this.relayUnsub = onValue(ref(this.db, commandsPath), (snap) => {
      if (!snap.exists()) return;
      snap.forEach((child) => {
        const cmd = child.val() as OBSRelayCommand;
        if (matchId && cmd.matchId && cmd.matchId !== matchId) return;
        if (!cmd.timestamp || Date.now() - cmd.timestamp > 120_000) return;
        if (cmd.consumed || cmd.status === 'running' || cmd.status === 'success' || cmd.status === 'error') return;
        const commandRef = ref(this.db!, `${commandsPath}/${child.key}`);
        void runTransaction(commandRef, current => {
          if (!current || current.consumed || current.status === 'running' || current.status === 'success' || current.status === 'error') return;
          return { ...current, consumed: true, status: 'running' };
        }).then(async claim => {
          if (!claim.committed) return;
          const claimed = claim.snapshot.val() as OBSRelayCommand;
          const button = config.buttons.find(b => b.id === claimed.buttonId && b.enabled);
          let result: OBSButtonExecutionResult;
          if (button) {
            result = await this.executeButton(button);
          } else {
            result = { success: false, completedSteps: 0, totalSteps: 0, errors: ['Configured button was not found or is disabled on the OBS dock.'] };
          }
          await set(commandRef, {
            ...claimed,
            status: result.success ? 'success' : 'error',
            error: result.errors.join(' · ') || null,
            completedSteps: result.completedSteps,
            totalSteps: result.totalSteps,
          });
        }).catch(error => console.error('[OBSRelay] Command claim or execution failed:', error));
      });
    });
  }

  stopRelayWatch(): void {
    this.relayUnsub?.();
    this.relayUnsub = null;
  }
}

export const obsReplaySourceService = new OBSReplaySourceService();
