// ============================================================================
// TEAM AUTHENTICATION SERVICE
// Hardcoded team credentials for mobile bidding access
// ============================================================================

export interface TeamCredentials {
  teamId: string;
  teamName: string;
  username: string;
  password: string;
  primaryColor: string;
  secondaryColor: string;
}

export interface AuthSession {
  teamId: string;
  teamName: string;
  clientId: string;
  loginTime: number;
  isAuthenticated: boolean;
  primaryColor: string;
  secondaryColor: string;
}

// Hardcoded team credentials - In production, these should be in env or secure storage
export const TEAM_CREDENTIALS: TeamCredentials[] = [
  {
    teamId: 'team_1',
    teamName: 'Royal Challengers',
    username: 'royal',
    password: 'rcb2024',
    primaryColor: '#c41e3a',
    secondaryColor: '#000000',
  },
  {
    teamId: 'team_2',
    teamName: 'Super Kings',
    username: 'kings',
    password: 'csk2024',
    primaryColor: '#ffd700',
    secondaryColor: '#0066b2',
  },
  {
    teamId: 'team_3',
    teamName: 'Titans',
    username: 'titans',
    password: 'gt2024',
    primaryColor: '#1c1c1c',
    secondaryColor: '#39a9db',
  },
  {
    teamId: 'team_4',
    teamName: 'Capitals',
    username: 'capitals',
    password: 'dc2024',
    primaryColor: '#004c93',
    secondaryColor: '#ef1b23',
  },
  {
    teamId: 'team_5',
    teamName: 'Warriors',
    username: 'warriors',
    password: 'pbks2024',
    primaryColor: '#ed1b24',
    secondaryColor: '#aa8a41',
  },
  {
    teamId: 'team_6',
    teamName: 'Riders',
    username: 'riders',
    password: 'kkr2024',
    primaryColor: '#3a225d',
    secondaryColor: '#ffd700',
  },
  {
    teamId: 'team_7',
    teamName: 'Indians',
    username: 'indians',
    password: 'mi2024',
    primaryColor: '#004ba0',
    secondaryColor: '#d4af37',
  },
  {
    teamId: 'team_8',
    teamName: 'Sunrisers',
    username: 'sunrisers',
    password: 'srh2024',
    primaryColor: '#ff822a',
    secondaryColor: '#000000',
  },
];

const SESSION_STORAGE_KEY = 'auction_team_session';

/**
 * Team Authentication Service
 * Provides login/logout functionality for mobile bidding
 */
class AuthService {
  private session: AuthSession | null = null;

  constructor() {
    this.loadSession();
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Load session from storage
   */
  private loadSession(): void {
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        this.session = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('[Auth] Failed to load session:', error);
    }
  }

  /**
   * Save session to storage
   */
  private saveSession(): void {
    try {
      if (this.session) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.session));
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (error) {
      console.warn('[Auth] Failed to save session:', error);
    }
  }

  /**
   * Authenticate team with credentials
   */
  login(username: string, password: string): { success: boolean; error?: string; session?: AuthSession } {
    const credentials = TEAM_CREDENTIALS.find(
      c => c.username.toLowerCase() === username.toLowerCase() && c.password === password
    );

    if (!credentials) {
      return { success: false, error: 'Invalid credentials' };
    }

    this.session = {
      teamId: credentials.teamId,
      teamName: credentials.teamName,
      clientId: this.generateClientId(),
      loginTime: Date.now(),
      isAuthenticated: true,
      primaryColor: credentials.primaryColor,
      secondaryColor: credentials.secondaryColor,
    };

    this.saveSession();
    console.log('[Auth] Login successful:', credentials.teamName);

    return { success: true, session: { ...this.session } };
  }

  /**
   * Logout current session
   */
  logout(): void {
    this.session = null;
    this.saveSession();
    console.log('[Auth] Logged out');
  }

  /**
   * Get current session
   */
  getSession(): AuthSession | null {
    return this.session ? { ...this.session } : null;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.session?.isAuthenticated === true;
  }

  /**
   * Get team ID from session
   */
  getTeamId(): string | null {
    return this.session?.teamId || null;
  }

  /**
   * Get team name from session
   */
  getTeamName(): string | null {
    return this.session?.teamName || null;
  }

  /**
   * Get client ID from session
   */
  getClientId(): string | null {
    return this.session?.clientId || null;
  }

  /**
   * Get all team names (for display)
   */
  getTeamList(): Array<{ teamId: string; teamName: string; primaryColor: string }> {
    return TEAM_CREDENTIALS.map(c => ({
      teamId: c.teamId,
      teamName: c.teamName,
      primaryColor: c.primaryColor,
    }));
  }

  /**
   * Verify credentials match team
   */
  verifyTeam(teamId: string, username: string, password: string): boolean {
    return TEAM_CREDENTIALS.some(
      c => c.teamId === teamId && c.username === username && c.password === password
    );
  }
}

// Singleton instance
export const authService = new AuthService();
