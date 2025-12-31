// ============================================================================
// AUDIO SERVICE - Sound Effects Management
// Handles all audio playback for the auction
// ============================================================================

import { activeConfig } from '../config';

type AudioType = 'sold' | 'unsold' | 'coinShake' | 'bid' | 'start' | 'end';

interface AudioInstance {
  element: HTMLAudioElement;
  isLoaded: boolean;
}

/**
 * Audio Service for Managing Sound Effects
 * Preloads audio and provides playback controls
 */
class AudioService {
  private audioPool = new Map<AudioType, AudioInstance>();
  private isMuted = false;
  private volume = 1.0;

  private get audioConfig() {
    return activeConfig.audio;
  }

  /**
   * Initialize audio service and preload sounds
   */
  initialize(): void {
    const files = this.audioConfig.files;
    const audioFiles: Record<AudioType, string> = {
      sold: files.sold,
      unsold: files.unsold,
      coinShake: files.coinShake,
      bid: '',
      start: '',
      end: '',
    };

    Object.entries(audioFiles).forEach(([type, path]) => {
      if (path) {
        this.preloadAudio(type as AudioType, path);
      }
    });

    console.log('[AudioService] Initialized with', this.audioPool.size, 'audio files');
  }

  /**
   * Preload an audio file
   */
  private preloadAudio(type: AudioType, path: string): void {
    try {
      const audio = new Audio(path);
      audio.preload = 'auto';
      
      const instance: AudioInstance = {
        element: audio,
        isLoaded: false,
      };

      audio.addEventListener('canplaythrough', () => {
        instance.isLoaded = true;
        console.log(`[AudioService] ${type} audio loaded`);
      });

      audio.addEventListener('error', (e) => {
        console.warn(`[AudioService] Failed to load ${type} audio:`, e);
      });

      this.audioPool.set(type, instance);
    } catch (error) {
      console.error(`[AudioService] Error preloading ${type}:`, error);
    }
  }

  /**
   * Play an audio file
   */
  async play(type: AudioType): Promise<void> {
    if (this.isMuted) return;

    const instance = this.audioPool.get(type);
    if (!instance) {
      console.warn(`[AudioService] Audio type ${type} not found`);
      return;
    }

    try {
      // Reset to beginning if already playing
      instance.element.currentTime = 0;
      instance.element.volume = this.volume;
      await instance.element.play();
    } catch (error) {
      // Audio play can fail due to browser autoplay policies
      console.warn(`[AudioService] Failed to play ${type}:`, error);
    }
  }

  /**
   * Play sold sound effect
   */
  async playSold(): Promise<void> {
    await this.play('sold');
  }

  /**
   * Play unsold sound effect
   */
  async playUnsold(): Promise<void> {
    await this.play('unsold');
  }

  /**
   * Play coin shake sound effect (for random selection)
   */
  async playCoinShake(): Promise<void> {
    await this.play('coinShake');
  }

  /**
   * Play bid sound effect
   */
  async playBid(): Promise<void> {
    await this.play('bid');
  }

  /**
   * Stop all audio
   */
  stopAll(): void {
    this.audioPool.forEach((instance) => {
      instance.element.pause();
      instance.element.currentTime = 0;
    });
  }

  /**
   * Stop specific audio
   */
  stop(type: AudioType): void {
    const instance = this.audioPool.get(type);
    if (instance) {
      instance.element.pause();
      instance.element.currentTime = 0;
    }
  }

  /**
   * Set mute state
   */
  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.stopAll();
    }
  }

  /**
   * Toggle mute state
   */
  toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /**
   * Get mute state
   */
  getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Set volume (0.0 - 1.0)
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.audioPool.forEach((instance) => {
      instance.element.volume = this.volume;
    });
  }

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopAll();
    this.audioPool.clear();
  }
}

export const audioService = new AudioService();
