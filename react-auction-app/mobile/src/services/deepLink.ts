// Deep links (njslive://pair…, njslive://camera…) and QR payloads → validated pairing actions.
import { Linking } from 'react-native';
import {
  isStudioGameType, normalizeOrigin, parseCameraLink, parsePairingLink,
  type StudioCameraLink, type StudioPairing,
} from '../shared/studioProfile';
import { resolveTenant, type TenantInfo } from './tournament';
import { useSettings } from '../store/settingsStore';
import { useStudio } from '../store/studioStore';

export type IncomingLink =
  | { kind: 'pair'; pairing: StudioPairing }
  | { kind: 'camera'; camera: StudioCameraLink }
  | { kind: 'unknown' };

export function classifyLink(url: string): IncomingLink {
  const pairing = parsePairingLink(url);
  if (pairing) return { kind: 'pair', pairing };
  const camera = parseCameraLink(url);
  if (camera) return { kind: 'camera', camera };
  return { kind: 'unknown' };
}

export class PairingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PairingError';
  }
}

export async function validatePairing(pairing: StudioPairing): Promise<{ tenant: TenantInfo; pairing: StudioPairing }> {
  const origin = normalizeOrigin(pairing.origin);
  if (!origin) throw new PairingError('The pairing link has an invalid server address.');
  const tenant = await resolveTenant(pairing.tenantId || pairing.slug);
  if (!tenant) throw new PairingError('That tournament was not found.');
  if (!tenant.isActive) throw new PairingError('That tournament is deactivated.');
  if (!isStudioGameType(pairing.game) || !tenant.sports.includes(pairing.game)) {
    throw new PairingError(`${pairing.game} is not enabled for ${tenant.name}.`);
  }
  return { tenant, pairing: { origin, tenantId: tenant.id, slug: tenant.slug, game: pairing.game, matchId: pairing.matchId } };
}

/** Validates the pairing against the tournament registry and stores it. */
export async function applyPairing(pairing: StudioPairing): Promise<TenantInfo> {
  const { tenant, pairing: resolved } = await validatePairing(pairing);
  const settings = useSettings.getState();
  settings.patch({ origin: resolved.origin });
  settings.setPairing({ tenantId: tenant.id, slug: tenant.slug, game: resolved.game, matchId: resolved.matchId });
  useStudio.getState().patch({ tenant, profile: null, matches: [], activeMatchId: null });
  return tenant;
}

export function subscribeIncomingLinks(onLink: (url: string) => void): () => void {
  void Linking.getInitialURL().then(url => { if (url) onLink(url); }).catch(() => undefined);
  const subscription = Linking.addEventListener('url', event => onLink(event.url));
  return () => subscription.remove();
}
