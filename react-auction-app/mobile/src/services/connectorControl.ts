import { StudioNetwork } from '../native';
import { isValidRtspUrl, type StudioCameraLink } from '../shared/studioProfile';

export interface ConnectorState { zoom: number; minZoom: number; maxZoom: number; torch: boolean; flash: boolean }

export async function controlConnector(camera: StudioCameraLink, action: 'status' | 'flip' | 'torch' | 'zoom', value = 0): Promise<ConnectorState> {
  if (!isValidRtspUrl(camera.url) || !camera.control) throw new Error('Scan this connector QR to pair its camera controls.');
  const raw = JSON.parse(await StudioNetwork.sendConnectorCommand(camera.url, camera.control.port, camera.control.token, action, value)) as Record<string, unknown>;
  const zoom = Number(raw.zoom), minZoom = Number(raw.minZoom), maxZoom = Number(raw.maxZoom);
  if (![zoom, minZoom, maxZoom].every(Number.isFinite) || minZoom < 0.1 || maxZoom < minZoom || maxZoom > 1000) throw new Error('The connector returned invalid camera details.');
  return { zoom: Math.min(maxZoom, Math.max(minZoom, zoom)), minZoom, maxZoom, torch: raw.torch === true, flash: raw.flash === true };
}