// ============================================================================
// CAMERA MANAGER SERVICE - V3 Multi-Camera Management
// Handles multiple camera sources, layouts, and stream management
// ============================================================================

import type { 
  CameraSource, 
  CameraConfig, 
  CameraLayout, 
  CameraPosition 
} from '../types/streaming';
import { DEFAULT_CAMERA_CONFIG } from '../types/streaming';

type CameraEventCallback = (cameras: CameraSource[]) => void;

class CameraManagerService {
  private config: CameraConfig = { ...DEFAULT_CAMERA_CONFIG };
  private listeners: Set<CameraEventCallback> = new Set();
  private deviceListeners: Set<(devices: MediaDeviceInfo[]) => void> = new Set();
  private availableDevices: MediaDeviceInfo[] = [];

  constructor() {
    // Listen for device changes
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        this.refreshDevices();
      });
    }
  }

  /**
   * Subscribe to camera changes
   */
  subscribe(callback: CameraEventCallback): () => void {
    this.listeners.add(callback);
    callback(this.config.sources);
    return () => this.listeners.delete(callback);
  }

  /**
   * Subscribe to device list changes
   */
  subscribeToDevices(callback: (devices: MediaDeviceInfo[]) => void): () => void {
    this.deviceListeners.add(callback);
    callback(this.availableDevices);
    return () => this.deviceListeners.delete(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb(this.config.sources));
  }

  private notifyDeviceListeners() {
    this.deviceListeners.forEach(cb => cb(this.availableDevices));
  }

  /**
   * Initialize camera manager
   */
  async initialize(maxCameras: number = 4): Promise<void> {
    this.config.maxSources = maxCameras;
    await this.refreshDevices();
    console.log('[CameraManager] Initialized with max cameras:', maxCameras);
  }

  /**
   * Refresh available camera devices
   */
  async refreshDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      console.warn('[CameraManager] MediaDevices API not supported');
      return [];
    }

    try {
      // Request permission first to get device labels
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach(track => track.stop());
      } catch {
        // Permission denied or no camera, continue anyway
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableDevices = devices.filter(d => d.kind === 'videoinput');
      this.notifyDeviceListeners();
      
      console.log('[CameraManager] Found devices:', this.availableDevices.length);
      return this.availableDevices;
    } catch (error) {
      console.error('[CameraManager] Failed to enumerate devices:', error);
      return [];
    }
  }

  /**
   * Get available devices
   */
  getAvailableDevices(): MediaDeviceInfo[] {
    return this.availableDevices;
  }

  /**
   * Add a camera source
   */
  async addCamera(deviceId: string, position?: CameraPosition): Promise<CameraSource | null> {
    if (this.config.sources.length >= this.config.maxSources) {
      console.warn('[CameraManager] Maximum cameras reached:', this.config.maxSources);
      return null;
    }

    // Check if device already added
    if (this.config.sources.some(s => s.deviceId === deviceId)) {
      console.warn('[CameraManager] Device already added:', deviceId);
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      const device = this.availableDevices.find(d => d.deviceId === deviceId);
      const sourceIndex = this.config.sources.length;
      
      const source: CameraSource = {
        id: `camera-${Date.now()}`,
        deviceId,
        label: device?.label || `Camera ${sourceIndex + 1}`,
        stream,
        isActive: sourceIndex === 0, // First camera is active by default
        position: position || this.getDefaultPosition(sourceIndex),
        zIndex: 10 - sourceIndex,
      };

      this.config.sources.push(source);
      
      // Set as primary if first camera
      if (sourceIndex === 0) {
        this.config.primaryCamera = source.id;
      }

      this.notifyListeners();
      console.log('[CameraManager] Added camera:', source.label);
      return source;
    } catch (error) {
      console.error('[CameraManager] Failed to add camera:', error);
      return null;
    }
  }

  /**
   * Get default position for camera based on index
   */
  private getDefaultPosition(index: number): CameraPosition {
    const positions: CameraPosition[] = ['fullscreen', 'pip-top-right', 'pip-bottom-right', 'pip-bottom-left'];
    return positions[index] || 'pip-top-left';
  }

  /**
   * Remove a camera source
   */
  removeCamera(cameraId: string): boolean {
    const index = this.config.sources.findIndex(s => s.id === cameraId);
    if (index === -1) return false;

    const source = this.config.sources[index];
    
    // Stop the stream
    if (source.stream) {
      source.stream.getTracks().forEach(track => track.stop());
    }

    this.config.sources.splice(index, 1);

    // Update primary camera if removed
    if (this.config.primaryCamera === cameraId) {
      this.config.primaryCamera = this.config.sources[0]?.id || null;
      if (this.config.sources[0]) {
        this.config.sources[0].isActive = true;
      }
    }

    this.notifyListeners();
    console.log('[CameraManager] Removed camera:', source.label);
    return true;
  }

  /**
   * Switch active camera (by index 1-4)
   */
  switchCamera(index: number): boolean {
    if (index < 1 || index > this.config.sources.length) {
      console.warn('[CameraManager] Invalid camera index:', index);
      return false;
    }

    const targetSource = this.config.sources[index - 1];
    if (!targetSource) return false;

    // Deactivate all cameras
    this.config.sources.forEach(s => {
      s.isActive = false;
      s.position = this.getDefaultPosition(this.config.sources.indexOf(s));
    });

    // Activate selected camera
    targetSource.isActive = true;
    targetSource.position = 'fullscreen';
    targetSource.zIndex = 100;
    this.config.primaryCamera = targetSource.id;

    this.notifyListeners();
    console.log('[CameraManager] Switched to camera:', targetSource.label);
    return true;
  }

  /**
   * Set camera layout
   */
  setLayout(layout: CameraLayout): void {
    this.config.layout = layout;
    
    // Update positions based on layout
    this.config.sources.forEach((source, index) => {
      switch (layout) {
        case 'single':
          source.position = index === 0 ? 'fullscreen' : 'pip-top-right';
          source.isActive = index === 0;
          break;
        case 'pip':
          source.position = index === 0 ? 'fullscreen' : `pip-top-right`;
          source.isActive = true;
          break;
        case 'split':
          source.position = index < 2 ? `grid-${index + 1}` as CameraPosition : 'pip-bottom-right';
          source.isActive = index < 2;
          break;
        case 'quad':
          source.position = `grid-${index + 1}` as CameraPosition;
          source.isActive = index < 4;
          break;
      }
    });

    this.notifyListeners();
    console.log('[CameraManager] Layout changed to:', layout);
  }

  /**
   * Get current configuration
   */
  getConfig(): CameraConfig {
    return { ...this.config };
  }

  /**
   * Get active camera
   */
  getActiveCamera(): CameraSource | null {
    return this.config.sources.find(s => s.isActive) || null;
  }

  /**
   * Get primary camera stream
   */
  getPrimaryStream(): MediaStream | null {
    const primary = this.config.sources.find(s => s.id === this.config.primaryCamera);
    return primary?.stream || null;
  }

  /**
   * Stop all cameras
   */
  stopAll(): void {
    this.config.sources.forEach(source => {
      if (source.stream) {
        source.stream.getTracks().forEach(track => track.stop());
      }
    });
    this.config.sources = [];
    this.config.primaryCamera = null;
    this.notifyListeners();
    console.log('[CameraManager] All cameras stopped');
  }

  /**
   * Get camera by index (1-based)
   */
  getCameraByIndex(index: number): CameraSource | null {
    return this.config.sources[index - 1] || null;
  }

  /**
   * Update camera position
   */
  setCameraPosition(cameraId: string, position: CameraPosition): void {
    const source = this.config.sources.find(s => s.id === cameraId);
    if (source) {
      source.position = position;
      this.notifyListeners();
    }
  }
}

export const cameraManager = new CameraManagerService();
