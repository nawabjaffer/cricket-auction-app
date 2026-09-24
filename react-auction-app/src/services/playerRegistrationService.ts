import { get, ref, set, type Database } from 'firebase/database';
import { realtimeSync } from './realtimeSync';
import { getActiveTenant, tenantPath } from './tenantPath';
import type { Player } from '../types';
import type { PlayerRegistration, PlayerRegistrationConfig } from '../types/playerRegistration';

const CONFIG_PATH = 'auction/playerRegistrationConfig';
const REGISTRATIONS_PATH = 'auction/playerRegistrations';
const ADMIN_PLAYERS_PATH = 'auction/adminPlayers';
const TOKENS_PATH = 'auction/playerRegistrationTokens';

function cleanRecord<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

export function buildAuctionPlayerFromRegistration(registration: PlayerRegistration): Player {
  const role = registration.data?.role || 'Player';
  const place = registration.data?.place || '';
  return cleanRecord({
    id: registration.id,
    name: registration.name,
    imageUrl: registration.photoUrl || '',
    role,
    place,
    age: null,
    matches: '',
    runs: '',
    wickets: '',
    battingBestFigures: '',
    bowlingBestFigures: '',
    basePrice: 0,
    phone: registration.phone || '',
    dateOfBirth: registration.dateOfBirth || '',
    referencePlayerId: undefined,
    customStats: {},
    originalImageUrl: registration.photoUrl || '',
    processedImageUrl: registration.photoUrl || '',
    imageEdit: registration.imageEdit,
    imageProcessingStatus: 'complete',
  }) as Player;
}

class PlayerRegistrationService {
  private async getDb(): Promise<Database> {
    await realtimeSync.ensureInitialized();
    const db = realtimeSync.getDatabase();
    if (!db) throw new Error('Database not initialized');
    return db;
  }

  async getConfig(): Promise<PlayerRegistrationConfig | null> {
    const db = await this.getDb();
    const snapshot = await get(ref(db, tenantPath(CONFIG_PATH)));
    return snapshot.exists() ? snapshot.val() as PlayerRegistrationConfig : null;
  }

  async saveConfig(config: PlayerRegistrationConfig): Promise<void> {
    const db = await this.getDb();
    await set(ref(db, tenantPath(CONFIG_PATH)), cleanRecord({ ...config, updatedAt: Date.now() }));
  }

  async findDuplicate(input: Pick<PlayerRegistration, 'name' | 'phone' | 'dateOfBirth'>): Promise<PlayerRegistration | null> {
    const db = await this.getDb();
    const name = input.name.trim().toLocaleLowerCase();
    const phone = input.phone.replace(/\D/g, '');
    const dob = input.dateOfBirth.trim();
    const registrationSnapshot = await get(ref(db, tenantPath(REGISTRATIONS_PATH)));
    const registrations = registrationSnapshot.exists()
      ? Object.values(registrationSnapshot.val() as Record<string, PlayerRegistration>)
      : [];
    const playersSnapshot = await get(ref(db, tenantPath('auction/adminPlayers')));
    const players = playersSnapshot.exists() ? Object.values(playersSnapshot.val() as Record<string, { name?: string; phone?: string; dateOfBirth?: string }>) : [];
    const matchingRegistration = registrations.find(item =>
      item.name.trim().toLocaleLowerCase() === name
      && item.phone.replace(/\D/g, '') === phone
      && item.dateOfBirth.trim() === dob,
    );
    if (matchingRegistration) return matchingRegistration;
    const matchingPlayer = players.find(item =>
      (item.name ?? '').trim().toLocaleLowerCase() === name
      && (item.phone ?? '').replace(/\D/g, '') === phone
      && (item.dateOfBirth ?? '').trim() === dob,
    );
    return matchingPlayer ? {
      id: 'existing-player', tenantId: getActiveTenant(), name: matchingPlayer.name ?? input.name,
      phone: matchingPlayer.phone ?? input.phone, dateOfBirth: matchingPlayer.dateOfBirth ?? input.dateOfBirth,
      photoUrl: '', data: {}, paymentStatus: 'not_required', status: 'approved', createdAt: 0, updatedAt: 0,
    } : null;
  }

  async issueAccessToken(paymentReference?: string): Promise<string> {
    const db = await this.getDb();
    const token = crypto.randomUUID();
    await set(ref(db, `${tenantPath(TOKENS_PATH)}/${token}`), {
      token, paymentReference: paymentReference ?? '', status: 'active', createdAt: Date.now(),
    });
    return token;
  }

  async consumeAccessToken(token: string): Promise<boolean> {
    if (!token) return false;
    const db = await this.getDb();
    const tokenRef = ref(db, `${tenantPath(TOKENS_PATH)}/${token}`);
    const snapshot = await get(tokenRef);
    if (!snapshot.exists() || snapshot.val()?.status !== 'active') return false;
    await set(tokenRef, { ...snapshot.val(), status: 'consumed', consumedAt: Date.now() });
    return true;
  }

  async saveRegistration(input: Omit<PlayerRegistration, 'tenantId' | 'createdAt' | 'updatedAt'>): Promise<PlayerRegistration> {
    const db = await this.getDb();
    const now = Date.now();
    const registration: PlayerRegistration = cleanRecord({
      ...input,
      tenantId: getActiveTenant(),
      createdAt: now,
      updatedAt: now,
    });

    const registrationRef = ref(db, `${tenantPath(REGISTRATIONS_PATH)}/${registration.id}`);
    await set(registrationRef, registration);

    const adminPlayersRef = ref(db, tenantPath(ADMIN_PLAYERS_PATH));
    const existingSnapshot = await get(adminPlayersRef);
    const existingPlayers = existingSnapshot.exists()
      ? Object.values(existingSnapshot.val() as Record<string, Player>)
      : [];

    const nextPlayer = buildAuctionPlayerFromRegistration(registration);
    const nextPlayers = existingPlayers.filter((player) => player.id !== registration.id);
    nextPlayers.push(nextPlayer);
    await set(adminPlayersRef, nextPlayers);

    return registration;
  }

  async syncRegistrationToAuctionRoster(registrationId: string): Promise<void> {
    const db = await this.getDb();
    const registrationRef = ref(db, `${tenantPath(REGISTRATIONS_PATH)}/${registrationId}`);
    const snapshot = await get(registrationRef);
    if (!snapshot.exists()) return;

    const registration = snapshot.val() as PlayerRegistration;
    const adminPlayersRef = ref(db, tenantPath(ADMIN_PLAYERS_PATH));
    const existingSnapshot = await get(adminPlayersRef);
    const existingPlayers = existingSnapshot.exists()
      ? Object.values(existingSnapshot.val() as Record<string, Player>)
      : [];

    const nextPlayers = existingPlayers.filter((player) => player.id !== registrationId);
    nextPlayers.push(buildAuctionPlayerFromRegistration(registration));
    await set(adminPlayersRef, nextPlayers);
  }
}

export const playerRegistrationService = new PlayerRegistrationService();