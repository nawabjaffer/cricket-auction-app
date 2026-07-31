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

import { ref, onValue, set, push, type Database } from 'firebase/database';
import { obsService } from '../obsService';
import type { OBSReplayButton, OBSReplayConfig } from '../../types/scoring';

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
  timestamp: number;
  consumed: boolean;
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

  async executeButton(button: OBSReplayButton): Promise<boolean> {
    switch (button.action) {
      case 'hotkey_name':
        if (!button.hotkeyName) return false;
        return obsService.triggerHotkeyByName(button.hotkeyName);

      case 'hotkey_sequence':
        if (!button.keySequence?.keyId) return false;
        return obsService.triggerHotkeyByKeySequence(
          button.keySequence.keyId,
          button.keySequence.shift,
          button.keySequence.ctrl,
          button.keySequence.alt,
        );

      case 'scene_switch':
        if (!button.sceneName) return false;
        return obsService.setScene(button.sceneName);

      case 'replay_buffer_save':
        await obsService.request('SaveReplayBuffer');
        return true;

      case 'replay_buffer_start':
        await obsService.request('StartReplayBuffer');
        return true;

      case 'replay_buffer_stop':
        await obsService.request('StopReplayBuffer');
        return true;

      default:
        return false;
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
  async sendRelayCommand(matchId: string, buttonId: string): Promise<void> {
    if (!this.db) return;
    const commandsPath = `${this.basePath}/matches/${matchId}/obsRelayCommands`;
    const newRef = push(ref(this.db, commandsPath));
    const command: OBSRelayCommand = {
      id: newRef.key ?? `cmd_${Date.now()}`,
      buttonId,
      timestamp: Date.now(),
      consumed: false,
    };
    await set(newRef, command);
  }

  /**
   * Listen for relay commands and execute them locally.
   * The OBS dock (running on the OBS computer) calls this to process commands.
   */
  watchRelayCommands(matchId: string, config: OBSReplayConfig): void {
    if (!this.db) return;
    this.stopRelayWatch();

    const commandsPath = `${this.basePath}/matches/${matchId}/obsRelayCommands`;
    this.relayUnsub = onValue(ref(this.db, commandsPath), (snap) => {
      if (!snap.exists()) return;
      snap.forEach((child) => {
        const cmd = child.val() as OBSRelayCommand;
        if (cmd.consumed) return;
        // Mark as consumed immediately to prevent double-execution
        set(ref(this.db!, `${commandsPath}/${child.key}/consumed`), true);
        const button = config.buttons.find(b => b.id === cmd.buttonId);
        if (button && button.enabled) {
          this.executeButton(button).catch((err) =>
            console.error('[OBSRelay] executeButton failed:', err),
          );
        }
      });
    });
  }

  stopRelayWatch(): void {
    this.relayUnsub?.();
    this.relayUnsub = null;
  }
}

export const obsReplaySourceService = new OBSReplaySourceService();
