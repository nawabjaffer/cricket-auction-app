// ============================================================================
// Typed wrappers around the Kotlin native modules (android/.../bridge).
// JSON strings cross the bridge for structured payloads so the native side can
// validate them with a single parser; every method returns a Promise.
// ============================================================================

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type EngineMode = 'studio' | 'camera';
export type EngineState =
  | 'idle' | 'prepared' | 'preview' | 'connecting' | 'live' | 'reconnecting' | 'stopping' | 'error';
export type DestinationState = 'connecting' | 'live' | 'retrying' | 'failed' | 'stopped';

export interface EngineConfig {
  video: {
    /** Always the landscape dimensions; `rotation` turns the output into portrait. */
    width: number;
    height: number;
    fps: number;
    bitrateBps: number;
    minBitrateBps: number;
    codec: 'h264' | 'h265';
    iFrameInterval: number;
    rotation: 0 | 90;
    stabilization: boolean;
    adaptive: boolean;
    facing: 'back' | 'front';
  };
  audio: {
    sampleRate: 44100 | 48000;
    stereo: boolean;
    bitrateBps: number;
    echoCanceler: boolean;
    noiseSuppressor: boolean;
  };
  overlayFps: number;
  overlayHardware: boolean;
}

export interface EngineDestination {
  id: string;
  protocol: 'rtmp' | 'srt';
  /** Full endpoint including the stream key — built just-in-time, never persisted. */
  url: string;
}

export interface OverlaySpec {
  id: string;
  kind: 'web' | 'image';
  url: string;
  enabled: boolean;
  anchor: string;
  widthPct: number;
  opacity: number;
  pageWidth: number;
  pageHeight: number;
}

export interface CameraCapability {
  id: string;
  facing: 'back' | 'front' | 'external';
  zoomMax: number;
  hasFlash: boolean;
  logicalMulti: boolean;
  physicalIds: string[];
  stabilization: string[];
  /** Output sizes the camera can feed the encoder, with the highest frame rate each supports. */
  sizes: Array<{ w: number; h: number; maxFps: number }>;
}

export interface EncoderCapability {
  name: string;
  hardware: boolean;
  maxWidth: number;
  maxHeight: number;
  maxBitrate: number;
  /** "WxH@fps" combinations probed with areSizeAndRateSupported. */
  supported: string[];
}

export interface DeviceCapabilities {
  device: { model: string; manufacturer: string; sdk: number; abis: string[] };
  cameras: CameraCapability[];
  encoders: { h264: EncoderCapability | null; h265: EncoderCapability | null };
}

export interface EngineStats {
  state: EngineState;
  bitrateKbps: number;
  targetKbps: number;
  fps: number;
  dropped: number;
  uptimeMs: number;
  zoom: number;
  torch: boolean;
  muted: boolean;
  recording: boolean;
  destinations: Array<{ id: string; kbps: number; dropped: number; state: DestinationState }>;
  clients: number;
}

interface StudioEngineNative {
  getCapabilities(): Promise<string>;
  prepare(configJson: string, mode: EngineMode): Promise<void>;
  release(): Promise<void>;
  startStream(destinationsJson: string): Promise<void>;
  stopStream(): Promise<void>;
  startCameraServer(port: number): Promise<string>;
  stopCameraServer(): Promise<void>;
  startRecording(name: string): Promise<string>;
  stopRecording(): Promise<void>;
  setVideoBitrate(bitrateBps: number): Promise<void>;
  requestKeyframe(): Promise<void>;
  switchCamera(): Promise<void>;
  selectCamera(id: string): Promise<void>;
  setZoom(level: number): Promise<void>;
  setTorch(enabled: boolean): Promise<boolean>;
  setExposure(level: number): Promise<void>;
  setExposureLock(locked: boolean): Promise<void>;
  setAutoFocus(enabled: boolean): Promise<void>;
  setStabilization(enabled: boolean): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  setMicVolume(volume: number): Promise<void>;
  setAudioInput(deviceId: number): Promise<boolean>;
  setOverlays(specsJson: string): Promise<void>;
  setOverlayOptions(fps: number, hardware: boolean): Promise<void>;
  reloadOverlays(): Promise<void>;
  selectLocalSource(): Promise<void>;
  selectPeerSource(url: string): Promise<void>;
  getZoomRange(): Promise<{ min: number; max: number }>;
  getExposureRange(): Promise<{ min: number; max: number; step: number }>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export interface BluetoothAudioInput {
  id: number;
  type: string;
  name: string;
  address: string;
  bluetooth: boolean;
}

export interface BluetoothDevice {
  address: string;
  name: string;
  /** audio | remote | phone | wearable | peripheral | other */
  kind: string;
  bonded: boolean;
  connected: boolean;
  rssi?: number;
}

interface StudioBluetoothNative {
  getState(): Promise<{ supported: boolean; enabled: boolean; connectGranted: boolean; scanGranted: boolean }>;
  listAudioInputs(): Promise<BluetoothAudioInput[]>;
  listBondedDevices(): Promise<BluetoothDevice[]>;
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  readBattery(address: string): Promise<number>;
  setRemoteKeyCapture(enabled: boolean): Promise<void>;
  openBluetoothSettings(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export interface NetworkAddress { iface: string; ip: string; kind: 'wifi' | 'ethernet' | 'hotspot' | 'cellular' | 'other' }

export interface NetworkSnapshot {
  connected: boolean;
  type: 'wifi' | 'cellular' | 'ethernet' | 'other' | 'none';
  metered: boolean;
  validated: boolean;
  addresses: NetworkAddress[];
}

export interface LanService { name: string; host: string; port: number; attrs: Record<string, string> }

interface StudioNetworkNative {
  getSnapshot(): Promise<NetworkSnapshot>;
  startMonitor(): Promise<void>;
  stopMonitor(): Promise<void>;
  registerService(name: string, port: number, attrsJson: string): Promise<string>;
  unregisterService(): Promise<void>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export interface BatterySnapshot { level: number; charging: boolean; temperatureC: number }

interface StudioSystemNative {
  getAppInfo(): Promise<{ versionName: string; versionCode: number; packageName: string; sdk: number; model: string }>;
  getBattery(): Promise<BatterySnapshot>;
  getThermalStatus(): Promise<number>;
  getFreeStorageMb(): Promise<number>;
  setKeepScreenOn(enabled: boolean): Promise<void>;
  copyText(text: string): Promise<void>;
  openAppSettings(): Promise<void>;
  startService(title: string, text: string): Promise<void>;
  stopService(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

interface StudioSecureNative {
  getItem(key: string, secure: boolean): Promise<string | null>;
  setItem(key: string, value: string, secure: boolean): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

interface StudioAuthNative {
  authorizeGoogle(scopes: string[]): Promise<{ accessToken: string; grantedScopes: string[] }>;
  clearGoogleToken(accessToken: string): Promise<void>;
}

interface StudioScannerNative {
  scanQr(): Promise<string>;
}

const unavailable = (name: string) => () => Promise.reject(new Error(`${name} is only available in the Android app`));

function load<T>(name: string): T {
  const module = (NativeModules as Record<string, unknown>)[name];
  if (module) return module as T;
  return new Proxy({}, {
    get: (_target, property) => (property === 'addListener' || property === 'removeListeners' ? () => undefined : unavailable(`${name}.${String(property)}`)),
  }) as T;
}

export const StudioEngine = load<StudioEngineNative>('NjsStudioEngine');
export const StudioBluetooth = load<StudioBluetoothNative>('NjsStudioBluetooth');
export const StudioNetwork = load<StudioNetworkNative>('NjsStudioNetwork');
export const StudioSystem = load<StudioSystemNative>('NjsStudioSystem');
export const StudioSecure = load<StudioSecureNative>('NjsStudioSecure');
export const StudioAuth = load<StudioAuthNative>('NjsStudioAuth');
export const StudioScanner = load<StudioScannerNative>('NjsStudioScanner');

export const isAndroid = Platform.OS === 'android';

// ── Events ───────────────────────────────────────────────────────────────────

export interface RemoteKeyEvent { keyCode: number; key: string; action: 'down' | 'up'; repeat: number }

export interface StudioEventMap {
  'studio.state': { state: EngineState; mode: EngineMode | 'none'; message?: string };
  'studio.destination': { id: string; state: DestinationState; reason?: string; attempt?: number };
  'studio.stats': EngineStats;
  'studio.error': { code: string; message: string; fatal: boolean };
  'studio.source': { source: 'local' | 'peer'; url?: string; state: 'ok' | 'failed'; reason?: string };
  'studio.record': { state: 'started' | 'stopped' | 'error'; path?: string; message?: string };
  'studio.remoteKey': RemoteKeyEvent;
  'studio.bluetooth': { type: 'acl' | 'scan' | 'audio'; [key: string]: unknown };
  'studio.network': NetworkSnapshot;
  'studio.lan': { type: 'found' | 'lost'; service: LanService };
  'studio.thermal': { status: number };
}

let emitter: NativeEventEmitter | null = null;

function getEmitter(): NativeEventEmitter {
  emitter ??= new NativeEventEmitter((NativeModules as Record<string, never>).NjsStudioEngine);
  return emitter;
}

export function onStudioEvent<K extends keyof StudioEventMap>(name: K, handler: (payload: StudioEventMap[K]) => void): () => void {
  const subscription = getEmitter().addListener(name, handler as (payload: unknown) => void);
  return () => subscription.remove();
}
