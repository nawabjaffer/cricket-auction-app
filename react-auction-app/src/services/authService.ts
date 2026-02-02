import { ref, get, set, update } from 'firebase/database';
import { realtimeSync } from './realtimeSync';

export interface AdminAccount {
  email: string;
  name: string;
  role: 'admin' | 'super-admin';
  createdAt: number;
  lastLogin?: number;
  isActive: boolean;
}

export interface AdminSession {
  email: string;
  token: string;
  expiresAt: number;
  isAuthenticated: boolean;
}

const ADMIN_ACCOUNTS_PATH = 'admin/accounts';
// const ADMIN_SESSIONS_PATH = 'admin/sessions'; // Reserved for future use
const SESSION_STORAGE_KEY = 'adminSession';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_ADMIN_EMAIL = 'nawabsalahudeen@gmail.com';
const DEFAULT_ADMIN_NAME = 'Nawab Salahudeen';

class AuthService {
  private static instance: AuthService;
  private db: any;
  private currentSession: AdminSession | null = null;

  private constructor() {
    this.initializeDB();
    this.loadSessionFromStorage();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private initializeDB() {
    try {
      this.db = realtimeSync.getDatabase();
      if (!this.db) {
        console.warn('[AuthService] Database not initialized yet');
      }
    } catch (error) {
      console.error('[AuthService] Failed to get database:', error);
    }
  }

  private async ensureDbReady(): Promise<void> {
    if (!this.db) {
      await realtimeSync.ensureInitialized();
      this.initializeDB();
    }
    if (!this.db) {
      throw new Error('Database not initialized. Please refresh and try again.');
    }
  }

  private loadSessionFromStorage() {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const session = JSON.parse(stored);
        if (session.expiresAt > Date.now()) {
          this.currentSession = session;
        } else {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error('[AuthService] Error loading session:', error);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }

  private saveSessionToStorage(session: AdminSession) {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (error) {
      console.error('[AuthService] Error saving session:', error);
    }
  }

  /**
   * Add a new admin account
   */
  async addAdminAccount(
    email: string,
    name: string,
    role: 'admin' | 'super-admin' = 'admin'
  ): Promise<void> {
    await this.ensureDbReady();

    const emailKey = email.replace(/[.#$[\]]/g, '_');
    const account: AdminAccount = {
      email,
      name,
      role,
      createdAt: Date.now(),
      isActive: true
    };

    try {
      await set(ref(this.db, `${ADMIN_ACCOUNTS_PATH}/${emailKey}`), account);
      console.log(`[AuthService] Added admin account: ${email}`);
    } catch (error) {
      console.error('[AuthService] Error adding admin account:', error);
      throw error;
    }
  }

  /**
   * Verify admin email and create session
   */
  async login(email: string): Promise<AdminSession> {
    await this.ensureDbReady();

    const emailKey = email.replace(/[.#$[\]]/g, '_');

    try {
      // Check if account exists
      let snapshot = await get(ref(this.db, `${ADMIN_ACCOUNTS_PATH}/${emailKey}`));

      if (!snapshot.exists() && email.toLowerCase() === DEFAULT_ADMIN_EMAIL.toLowerCase()) {
        await this.addAdminAccount(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_NAME, 'super-admin');
        snapshot = await get(ref(this.db, `${ADMIN_ACCOUNTS_PATH}/${emailKey}`));
      }

      if (!snapshot.exists()) {
        throw new Error('Admin account not found');
      }

      const account = snapshot.val() as AdminAccount;

      if (!account.isActive) {
        throw new Error('Admin account is inactive');
      }

      // Create session token
      const token = this.generateToken();
      const expiresAt = Date.now() + SESSION_DURATION;

      const session: AdminSession = {
        email,
        token,
        expiresAt,
        isAuthenticated: true
      };

      // Update last login timestamp
      await update(ref(this.db, `${ADMIN_ACCOUNTS_PATH}/${emailKey}`), {
        lastLogin: Date.now()
      });

      // Save session
      this.currentSession = session;
      this.saveSessionToStorage(session);

      console.log(`[AuthService] Login successful for: ${email}`);
      return session;
    } catch (error) {
      console.error('[AuthService] Login failed:', error);
      throw error;
    }
  }

  /**
   * Logout current admin session
   */
  async logout(): Promise<void> {
    this.currentSession = null;
    localStorage.removeItem(SESSION_STORAGE_KEY);
    console.log('[AuthService] Logout successful');
  }

  /**
   * Get current session
   */
  getCurrentSession(): AdminSession | null {
    // Check if session expired
    if (this.currentSession && this.currentSession.expiresAt < Date.now()) {
      this.currentSession = null;
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return this.currentSession;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.getCurrentSession()?.isAuthenticated ?? false;
  }

  /**
   * Get all admin accounts
   */
  async getAllAdminAccounts(): Promise<AdminAccount[]> {
    await this.ensureDbReady();

    try {
      const snapshot = await get(ref(this.db, ADMIN_ACCOUNTS_PATH));
      if (!snapshot.exists()) {
        return [];
      }

      const accounts: AdminAccount[] = [];
      snapshot.forEach((childSnapshot) => {
        accounts.push(childSnapshot.val());
      });

      return accounts;
    } catch (error) {
      console.error('[AuthService] Error getting admin accounts:', error);
      throw error;
    }
  }

  /**
   * Update admin account status
   */
  async updateAdminAccount(
    email: string,
    updates: Partial<AdminAccount>
  ): Promise<void> {
    await this.ensureDbReady();

    const emailKey = email.replace(/[.#$[\]]/g, '_');

    try {
      await update(ref(this.db, `${ADMIN_ACCOUNTS_PATH}/${emailKey}`), updates);
      console.log(`[AuthService] Updated admin account: ${email}`);
    } catch (error) {
      console.error('[AuthService] Error updating admin account:', error);
      throw error;
    }
  }

  /**
   * Deactivate admin account
   */
  async deactivateAdminAccount(email: string): Promise<void> {
    await this.updateAdminAccount(email, { isActive: false });
  }

  /**
   * Generate session token
   */
  private generateToken(): string {
    return `admin_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Validate session token
   */
  validateToken(token: string): boolean {
    return this.currentSession?.token === token && this.isAuthenticated();
  }

  /**
   * Extend session expiry
   */
  extendSession(): void {
    if (this.currentSession) {
      this.currentSession.expiresAt = Date.now() + SESSION_DURATION;
      this.saveSessionToStorage(this.currentSession);
    }
  }

  /**
   * Get time until session expires (in milliseconds)
   */
  getTimeUntilExpiry(): number {
    if (!this.currentSession) return 0;
    return Math.max(0, this.currentSession.expiresAt - Date.now());
  }
}

export const authService = AuthService.getInstance();
