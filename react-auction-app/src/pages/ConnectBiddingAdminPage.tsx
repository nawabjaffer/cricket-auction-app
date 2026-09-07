  // ============================================================================
  // CONNECT BIDDING ADMIN PAGE
  // Admin-only interface for raising bids on behalf of teams.
  // Mirrors the team login page design with team cards, budgets, stats,
  // plus raise-bid and pass controls for each team.
  // Accessible at /connect-bidding-admin and /:tenantSlug/connect-bidding-admin
  // ============================================================================

  import { useState, useCallback, useEffect, useMemo } from 'react';
  import { motion, AnimatePresence } from 'framer-motion';
  import { ref, onValue } from 'firebase/database';
  import { IoClose, IoShieldCheckmark, IoPeople, IoShield, IoArrowUp, IoArrowDown, IoSearch, IoArrowUndo, IoCheckmarkCircle, IoCloseCircle, IoSwapVertical, IoTv, IoStatsChart, IoTrophy, IoRadioButtonOn } from 'react-icons/io5';
  import { GiCricketBat } from 'react-icons/gi';
  import { useRealtimeMobileSync } from '../hooks/useRealtimeSync';
  import { useAdminAuth } from '../hooks/useAdminAuth';
  import { useFeatureFlags } from '../hooks/useFeatureFlags';
  import { authService, type AuthSession } from '../services/auth';
  import { realtimeSync } from '../services/realtimeSync';
  import { auctionPersistence, type AdminSettings } from '../services/auctionPersistence';
  import { tenantPath } from '../services/tenantPath';
  import { TeamLogo } from '../components/TeamLogo/TeamLogo';
  import { PlayerImage } from '../components/PlayerImage/PlayerImage';
  import { getRoleLabel, getRoleBadgeClass } from '../utils/playerStats';
  import { auctionRules } from '../services/auctionRules';
  import { useCurrencySuffix } from '../store';
  import '../components/MobileBidding/MobileBidding.css';

  interface BidFeedback {
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
    timestamp: number;
  }

  export default function ConnectBiddingAdminPage() {
    const currencySuffix = useCurrencySuffix();

    // Admin login (for admin-only access)
    const { isAuthenticated, login: adminLogin, logout: adminLogout, loading: authLoading, error: authError } = useAdminAuth();
    const [email, setEmail] = useState('');
    // Super admin mode (skip team login, control all teams)
    const [superAdminMode, setSuperAdminMode] = useState(false);
    // Lightweight username/password quick-access for Super Admin Mode, configured
    // in Admin Panel — lets a trusted helper skip the email-based admin login
    // entirely on mobile.
    const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
    const [quickSuperAdminUnlocked, setQuickSuperAdminUnlocked] = useState(false);
    const [quickSAUsername, setQuickSAUsername] = useState('');
    const [quickSAPassword, setQuickSAPassword] = useState('');
    const [quickSAError, setQuickSAError] = useState('');
    // Super Admin unified control bar: undo/sold/unsold + jump-to-player search
    const [jumpIdInput, setJumpIdInput] = useState('');
    const [adminCmdBusy, setAdminCmdBusy] = useState(false);
    // Seating-arrangement customization for the Super Admin team grid
    const [customizeOrderMode, setCustomizeOrderMode] = useState(false);
    const [orderedTeamIds, setOrderedTeamIds] = useState<string[]>([]);
    const [isSavingOrder, setIsSavingOrder] = useState(false);
    // Team login (for team selection)
    const [teamSession, setTeamSession] = useState<AuthSession | null>(authService.getSession());
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [feedback, setFeedback] = useState<BidFeedback | null>(null);
    const [busyTeamId, setBusyTeamId] = useState<string | null>(null);
    // Broadcast/overlay controls (drives the OBS overlay from mobile)
    const [broadcastMode, setBroadcastMode] = useState<string>('auction');
    const [marqueeEnabled, setMarqueeEnabled] = useState(true);
    const [broadcastTeamId, setBroadcastTeamId] = useState<string>('');
    const [broadcastBusy, setBroadcastBusy] = useState(false);

    const { isEnabled } = useFeatureFlags();
    const superAdminEnabled = isEnabled('super-admin-bidding');

    const {
      currentPlayer,
      currentBid,
      selectedTeam,
      bidHistory,
      teams,
      auctionActive,
      isConnected,
      lastUpdate,
      submitBid,
      submitAdminCommand,
    } = useRealtimeMobileSync();

    // Build runtime credentials from live team data (same as MobileBiddingLivePage)
    const runtimeCredentials = useMemo(() => {
      return teams.map((team, index) => {
        const normalized = team.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const derivedUname = normalized || `team${index + 1}`;
        const uname = ((team as any).authUsername?.trim() || derivedUname).toLowerCase();
        const pass = ((team as any).authPassword?.trim() || `${derivedUname}123`);
        return {
          teamId: team.id,
          teamName: team.name,
          username: uname,
          password: pass,
          primaryColor: team.primaryColor || '#3b82f6',
          secondaryColor: team.secondaryColor || '#1e40af',
          logoUrl: team.logoUrl || '',
        };
      });
    }, [teams]);

    useEffect(() => {
      if (runtimeCredentials.length > 0) {
        authService.setTeamCredentials(runtimeCredentials);
      }
    }, [runtimeCredentials]);

    // Clear feedback after delay
    useEffect(() => {
      if (!feedback) return;
      const timer = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(timer);
    }, [feedback]);

    // Live subscription to admin settings — needed for Super Admin quick-login
    // credentials and the saved team seating order.
    useEffect(() => {
      let cancelled = false;
      let unsub: (() => void) | null = null;
      (async () => {
        try {
          await realtimeSync.ensureInitialized();
          const db = realtimeSync.getDatabase();
          if (!db || cancelled) return;
          auctionPersistence.initialize(db);
          const settingsRef = ref(db, tenantPath('auction/adminSettings'));
          unsub = onValue(settingsRef, (snap) => {
            if (cancelled) return;
            if (snap.exists()) setAdminSettings(snap.val() as AdminSettings);
          });
        } catch { /* ignore — quick access simply stays unavailable */ }
      })();
      return () => { cancelled = true; unsub?.(); };
    }, []);

    // Super Admin quick login — validated against Admin Panel-configured credentials
    const handleSuperAdminQuickLogin = useCallback(() => {
      const validUser = adminSettings?.superAdminUsername?.trim();
      const validPass = adminSettings?.superAdminPassword;
      if (!validUser || !validPass) {
        setQuickSAError('Super Admin access hasn\u2019t been set up yet. Configure a username/password in Admin Panel first.');
        return;
      }
      if (quickSAUsername.trim().toLowerCase() === validUser.toLowerCase() && quickSAPassword === validPass) {
        setQuickSAError('');
        setQuickSuperAdminUnlocked(true);
        setSuperAdminMode(true);
      } else {
        setQuickSAError('Invalid super admin username or password');
      }
    }, [adminSettings, quickSAUsername, quickSAPassword]);

    const handleExitOrLogout = useCallback(() => {
      if (quickSuperAdminUnlocked) {
        setQuickSuperAdminUnlocked(false);
        setSuperAdminMode(false);
        setQuickSAUsername('');
        setQuickSAPassword('');
      } else {
        adminLogout();
      }
    }, [quickSuperAdminUnlocked, adminLogout]);

    // Unified remote control bar: undo / mark sold / mark unsold
    const handleAdminCommand = useCallback(async (type: 'sold' | 'unsold' | 'undo') => {
      if (adminCmdBusy) return;
      setAdminCmdBusy(true);
      try {
        const ok = await submitAdminCommand(type);
        const labels: Record<typeof type, string> = { sold: 'Marked sold', unsold: 'Marked unsold', undo: 'Undo sent' } as const;
        setFeedback({ type: ok ? 'success' : 'error', message: ok ? labels[type] : 'Command failed — try again', timestamp: Date.now() });
      } catch {
        setFeedback({ type: 'error', message: 'Network error', timestamp: Date.now() });
      } finally {
        setAdminCmdBusy(false);
      }
    }, [adminCmdBusy, submitAdminCommand]);

    // Jump-to-player search — input is normalized to uppercase as the admin types
    const handleJumpToPlayer = useCallback(async () => {
      const id = jumpIdInput.trim().toUpperCase();
      if (!id || adminCmdBusy) return;
      setAdminCmdBusy(true);
      try {
        const ok = await submitAdminCommand('jumpToPlayer', id);
        setFeedback({ type: ok ? 'success' : 'error', message: ok ? `Jumping to player ${id}` : 'Command failed — try again', timestamp: Date.now() });
        if (ok) setJumpIdInput('');
      } catch {
        setFeedback({ type: 'error', message: 'Network error', timestamp: Date.now() });
      } finally {
        setAdminCmdBusy(false);
      }
    }, [jumpIdInput, adminCmdBusy, submitAdminCommand]);

    // Effective team seating order: saved order first, then any newer teams appended
    const orderedTeams = useMemo(() => {
      const savedOrder = adminSettings?.superAdminTeamOrder;
      if (!savedOrder?.length) return teams;
      const byId = new Map(teams.map(t => [t.id, t] as const));
      const ordered = savedOrder.map(id => byId.get(id)).filter((t): t is typeof teams[number] => !!t);
      const remaining = teams.filter(t => !savedOrder.includes(t.id));
      return [...ordered, ...remaining];
    }, [teams, adminSettings?.superAdminTeamOrder]);

    const beginCustomizeOrder = useCallback(() => {
      setOrderedTeamIds(orderedTeams.map(t => t.id));
      setCustomizeOrderMode(true);
    }, [orderedTeams]);

    const moveTeamOrder = useCallback((teamId: string, direction: -1 | 1) => {
      setOrderedTeamIds((current) => {
        const index = current.indexOf(teamId);
        const targetIndex = index + direction;
        if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
        const next = [...current];
        [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
        return next;
      });
    }, []);

    const saveTeamOrder = useCallback(async () => {
      setIsSavingOrder(true);
      try {
        await auctionPersistence.updateSuperAdminTeamOrder(orderedTeamIds);
        setFeedback({ type: 'success', message: 'Seating order saved', timestamp: Date.now() });
        setCustomizeOrderMode(false);
      } catch {
        setFeedback({ type: 'error', message: 'Failed to save order', timestamp: Date.now() });
      } finally {
        setIsSavingOrder(false);
      }
    }, [orderedTeamIds]);


    // Admin login handler
    const handleAdminLogin = useCallback(async () => {
      if (!email.trim()) return;
      try {
        await adminLogin(email.trim());
      } catch {}
    }, [email, adminLogin]);

    // Team login handler (accepts event or credential object)
    const handleTeamLogin = useCallback((arg?: React.FormEvent | any) => {
      if (arg && typeof arg.preventDefault === 'function') arg.preventDefault();
      setLoginError('');
      setIsLoading(true);

      let result;
      if (arg && arg.teamId) {
        // clicked credential card
        result = authService.login(arg.username, arg.password);
      } else {
        result = authService.login(username, password);
      }

      if (result.success && result.session) {
        setTeamSession(result.session);
        setUsername('');
        setPassword('');
      } else {
        setLoginError(result.error || 'Invalid credentials');
      }
      setIsLoading(false);
    }, [username, password]);

    // Team logout
    const handleTeamLogout = useCallback(() => {
      authService.logout();
      setTeamSession(null);
    }, []);

    const handleRaiseBid = useCallback(async (teamId: string, teamName: string) => {
      if (!currentPlayer || !isConnected || busyTeamId) return;
      setBusyTeamId(teamId);
      const newBid = currentBid + 100;
      try {
        const ok = await submitBid(teamId, newBid, 'raise');
        if (ok) {
          setFeedback({ type: 'success', message: `Bid ₹${newBid}L placed for ${teamName}`, timestamp: Date.now() });
        } else {
          setFeedback({ type: 'error', message: `Bid failed for ${teamName}`, timestamp: Date.now() });
        }
      } catch {
        setFeedback({ type: 'error', message: 'Network error', timestamp: Date.now() });
      } finally {
        setBusyTeamId(null);
      }
    }, [currentPlayer, currentBid, isConnected, submitBid, busyTeamId]);

    const handlePass = useCallback(async (teamId: string, teamName: string) => {
      if (!currentPlayer || !isConnected || busyTeamId) return;
      setBusyTeamId(teamId);
      try {
        const ok = await submitBid(teamId, currentBid, 'stop');
        if (ok) {
          setFeedback({ type: 'info', message: `${teamName} passed`, timestamp: Date.now() });
        }
      } catch {
        setFeedback({ type: 'error', message: 'Network error', timestamp: Date.now() });
      } finally {
        setBusyTeamId(null);
      }
    }, [currentPlayer, currentBid, isConnected, submitBid, busyTeamId]);

    const formatLakhs = (v: number) => `₹${Number.isFinite(v) ? v.toFixed(1) : '0.0'}${currencySuffix}`;

    // ── Broadcast/overlay controls: reflect current mode + push new modes to OBS ──
    useEffect(() => {
      const unsubRequest = realtimeSync.subscribeOverlayRequest((req) => {
        if (!req) return;
        setBroadcastMode(req.mode ?? 'auction');
        if (req.teamId) setBroadcastTeamId(req.teamId);
      });
      const unsubMarquee = realtimeSync.subscribeOverlayMarquee((m) => {
        if (m) setMarqueeEnabled(m.enabled);
      });
      return () => { unsubRequest(); unsubMarquee(); };
    }, []);

    const pushBroadcast = useCallback(async (
      mode: 'auction' | 'standings' | 'teamSquad' | 'topPicks',
      teamId?: string,
    ) => {
      setBroadcastBusy(true);
      setBroadcastMode(mode);
      try {
        await realtimeSync.setOverlayRequest({
          mode,
          teamId: (mode === 'standings' || mode === 'teamSquad') ? (teamId ?? null) : null,
          lastUpdate: Date.now(),
        });
        const labels: Record<typeof mode, string> = {
          auction: 'Back to live auction',
          standings: 'Showing team stats',
          teamSquad: 'Showing team squad',
          topPicks: 'Showing top picks',
        };
        setFeedback({ type: 'success', message: labels[mode], timestamp: Date.now() });
      } catch {
        setFeedback({ type: 'error', message: 'Overlay control failed', timestamp: Date.now() });
      } finally {
        setBroadcastBusy(false);
      }
    }, []);

    const toggleMarquee = useCallback(async () => {
      const next = !marqueeEnabled;
      setMarqueeEnabled(next);
      try {
        await realtimeSync.setOverlayMarquee({ enabled: next, lastUpdate: Date.now() });
        setFeedback({ type: 'info', message: next ? 'Marquee on' : 'Marquee off', timestamp: Date.now() });
      } catch {
        setMarqueeEnabled(!next);
      }
    }, [marqueeEnabled]);

    const formattedTime = useMemo(() => {
      if (!lastUpdate) return 'Never';
      return new Date(lastUpdate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, [lastUpdate]);

    const loggedInTeam = useMemo(
      () => teams.find((t) => t.id === teamSession?.teamId) || teams.find((t) => t.name === teamSession?.teamName) || null,
      [teams, teamSession],
    );
    const lastBidTeamId = bidHistory[bidHistory.length - 1]?.teamId;

    const themePrimary = '#e4be75';
    const themeSecondary = '#24467c';

    // ─── Admin Login Screen ───
    if (!isAuthenticated && !quickSuperAdminUnlocked) {
      return (
        <div className="cb-login-page" style={{ '--cb-primary': themePrimary, '--cb-secondary': themeSecondary } as React.CSSProperties}>
          <div className="cb-login-bg" />
          <div className="cb-login-scroll">
            <motion.div className="cb-login-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <div className="cb-login-brand">
                <motion.div className="cb-login-icon" initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}>
                  <IoShieldCheckmark size={44} color="#fff" />
                </motion.div>
                <h1>Bid Controller</h1>
                <p>Admin access to raise bids on behalf of teams</p>
              </div>
              <div className={`cb-status-pill ${isConnected ? 'live' : ''}`}>
                <span className="cb-status-dot" />
                <span>{isConnected ? 'Auction Live' : 'Waiting for auction...'}</span>
                {teams.length > 0 && <span className="cb-team-count">{teams.length} teams</span>}
              </div>
              {authError && <div className="cb-error">{authError}</div>}
              <form className="cb-login-form cb-login-form--strict" onSubmit={e => { e.preventDefault(); handleAdminLogin(); }}>
                <div className="cb-field">
                  <label htmlFor="admin-email" className="cb-field-label">Admin Email</label>
                  <input
                    type="email" id="admin-email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    disabled={authLoading} autoComplete="email"
                  />
                </div>
                <motion.button type="submit" className="cb-login-btn" disabled={authLoading || !email.trim()} whileTap={{ scale: 0.98 }}>
                  {authLoading ? <span className="cb-spinner" /> : 'Sign In'}
                </motion.button>
                <div className="cb-login-hint">Use your tournament admin email.</div>
              </form>

              <div className="cb-quick-sa-divider"><span>OR</span></div>

              <form className="cb-login-form cb-login-form--strict" onSubmit={e => { e.preventDefault(); handleSuperAdminQuickLogin(); }}>
                <div className="cb-field">
                  <label htmlFor="quick-sa-username" className="cb-field-label">Super Admin Username</label>
                  <input
                    type="text" id="quick-sa-username" value={quickSAUsername}
                    onChange={e => setQuickSAUsername(e.target.value)}
                    placeholder="Quick access username"
                    autoComplete="username"
                  />
                </div>
                <div className="cb-field">
                  <label htmlFor="quick-sa-password" className="cb-field-label">Super Admin Password</label>
                  <input
                    type="password" id="quick-sa-password" value={quickSAPassword}
                    onChange={e => setQuickSAPassword(e.target.value)}
                    placeholder="Quick access password"
                    autoComplete="current-password"
                  />
                </div>
                {quickSAError && <div className="cb-error">{quickSAError}</div>}
                <motion.button
                  type="submit"
                  className="cb-login-btn"
                  disabled={!quickSAUsername.trim() || !quickSAPassword}
                  whileTap={{ scale: 0.98 }}
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}
                >
                  <IoShield size={16} style={{ marginRight: 6 }} /> Super Admin Quick Access
                </motion.button>
                <div className="cb-login-hint">For trusted helpers controlling bidding from a phone — no email required.</div>
              </form>
              <div className="cb-login-footer"><p>powered by <b>NJS Creative Labs</b></p></div>
            </motion.div>
          </div>
        </div>
      );
    }

    // ─── Team Login Screen ───
    if (!teamSession && !superAdminMode) {
      return (
        <div className="cb-login-page" style={{ '--cb-primary': themePrimary, '--cb-secondary': themeSecondary } as React.CSSProperties}>
          <div className="cb-login-bg" />
          <div className="cb-login-scroll">
            <motion.div className="cb-login-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              {/* Super Admin Mode Button */}
              {superAdminEnabled && (
                <motion.button
                  type="button"
                  className="cb-login-btn"
                  onClick={() => setSuperAdminMode(true)}
                  whileTap={{ scale: 0.98 }}
                  style={{ marginBottom: '1rem', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <IoShield size={18} /> Super Admin — Control All Teams
                </motion.button>
              )}
              <div className="cb-login-brand">
                <motion.div className="cb-login-icon" initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}>
                  <GiCricketBat size={44} color="#fff" />
                </motion.div>
                <h1>Team Login</h1>
                <p>Select your team and enter password</p>
              </div>
              <div className={`cb-status-pill ${isConnected ? 'live' : ''}`}>
                <span className="cb-status-dot" />
                <span>{isConnected ? 'Auction Live' : 'Waiting for auction...'}</span>
                {teams.length > 0 && <span className="cb-team-count">{teams.length} teams</span>}
              </div>
              {/* Team cards — quick login when runtime credentials are available */}
              {runtimeCredentials.length > 0 && (
                <div className="cb-team-card-grid">
                  {runtimeCredentials.map((cred) => (
                    <motion.button
                      key={cred.teamId}
                      type="button"
                      className={`cb-team-card-btn`}
                      onClick={() => handleTeamLogin(cred)}
                      style={{ '--card-bg': cred.primaryColor, '--card-bg2': cred.secondaryColor } as React.CSSProperties}
                      whileTap={{ scale: 0.96 }}
                      disabled={isLoading}
                    >
                      {cred.logoUrl ? (
                        <TeamLogo logoUrl={cred.logoUrl} teamName={cred.teamName} size="sm" className="cb-team-card-logo" />
                      ) : (
                        <div className="cb-team-card-initials">{cred.teamName.slice(0, 2).toUpperCase()}</div>
                      )}
                      <span className="cb-team-card-name">{cred.teamName}</span>
                      <span className="cb-team-card-username">@{cred.username}</span>
                    </motion.button>
                  ))}
                </div>
              )}

              <form className="cb-login-form cb-login-form--strict" onSubmit={handleTeamLogin}>
                <div className="cb-field">
                  <label htmlFor="cb-username" className="cb-field-label">Team Username</label>
                  <input
                    type="text" id="cb-username" value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    placeholder="e.g. royal"
                    disabled={isLoading} autoComplete="username" autoCapitalize="none"
                  />
                </div>
                <div className="cb-field">
                  <label htmlFor="cb-password" className="cb-field-label">Password</label>
                  <input
                    type="password" id="cb-password" value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter team password"
                    disabled={isLoading} autoComplete="current-password"
                  />
                </div>
                <motion.button type="submit" className="cb-login-btn" disabled={isLoading || !username || !password} whileTap={{ scale: 0.98 }}>
                  {isLoading ? <span className="cb-spinner" /> : 'Sign In'}
                </motion.button>
                {loginError && <div className="cb-error">{loginError}</div>}
                <div className="cb-login-hint">Credentials are provided by the tournament organizer.</div>
              </form>
              <div className="cb-login-footer"><p>powered by <b>NJS Creative Labs</b></p></div>
            </motion.div>
          </div>
        </div>
      );
    }

    // ─── Super Admin Interface (all teams at once) ───
    if (superAdminMode) {
      return (
        <div className="cb-login-page" style={{ '--cb-primary': themePrimary, '--cb-secondary': themeSecondary } as React.CSSProperties}>
          <div className="cb-login-bg" />
          <div className="cb-login-scroll">
            {/* Header bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IoShield size={20} color="#a78bfa" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#a78bfa' }}>Super Admin</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`cb-status-pill ${isConnected ? 'live' : ''}`} style={{ margin: 0, padding: '0.25rem 0.75rem', fontSize: '0.7rem' }}>
                  <span className="cb-status-dot" />
                  {isConnected ? formattedTime : 'Offline'}
                </span>
                <motion.button className="cb-icon-btn" onClick={() => setSuperAdminMode(false)} whileTap={{ scale: 0.9 }} title="Exit Super Admin" style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IoClose size={16} />
                </motion.button>
                <motion.button className="cb-icon-btn" onClick={handleExitOrLogout} whileTap={{ scale: 0.9 }} title="Logout" style={{ background: 'rgba(239,68,68,0.2)', borderRadius: 8, width: 32, height: 32, border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IoClose size={16} />
                </motion.button>
              </div>
            </div>

            {/* Current Player Card */}
            <motion.div className="cb-login-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              {currentPlayer ? (
                <div className="cb-scout-live-highlight" style={{ margin: '0 -1rem', padding: '0.75rem 1rem' }}>
                  <span className="cb-scout-live-badge"><span className="cb-live-pulse" /> Now Bidding</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <div style={{ width: 60, height: 60, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
                      <PlayerImage imageUrl={currentPlayer.imageUrl || ''} playerName={currentPlayer.name} size="md" className="cb-player-img" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{currentPlayer.name}</h2>
                      <span className={`cb-role-badge ${getRoleBadgeClass(currentPlayer.role)}`} style={{ marginTop: 4 }}>{getRoleLabel(currentPlayer.role)}</span>
                      <div className="cb-scout-price-row" style={{ marginTop: 6 }}>
                        <div><span>Base</span><strong>{formatLakhs(currentPlayer.basePrice)}</strong></div>
                        <div><span>Current Bid</span><strong style={{ color: '#fbbf24', fontSize: '1.1rem' }}>{formatLakhs(currentBid)}</strong></div>
                      </div>
                    </div>
                  </div>
                  {selectedTeam && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '0.4rem 0.7rem', background: 'rgba(255,255,255,0.08)', borderRadius: 8 }}>
                      {selectedTeam.logoUrl && <TeamLogo logoUrl={selectedTeam.logoUrl} teamName={selectedTeam.name} size="sm" />}
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{selectedTeam.name} is leading</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', background: 'rgba(251,191,36,0.25)', color: '#fbbf24', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>LEADING</span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem 0', opacity: 0.5 }}>
                  <GiCricketBat size={40} color="rgba(255,255,255,0.3)" />
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>Waiting for next player...</p>
                </div>
              )}
            </motion.div>

            {/* Unified Admin Controls — undo / sold / unsold / jump-to-player */}
            <motion.div className="cb-login-card cb-admin-controls-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }} style={{ marginTop: '0.75rem' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <IoShield size={16} /> Admin Controls
              </h3>
              <div className="cb-admin-cmd-row">
                <motion.button
                  type="button"
                  className="cb-admin-cmd-btn cb-admin-cmd-btn--undo"
                  whileTap={{ scale: 0.95 }}
                  disabled={adminCmdBusy || !isConnected}
                  onClick={() => handleAdminCommand('undo')}
                >
                  <IoArrowUndo size={18} /> Undo
                </motion.button>
                <motion.button
                  type="button"
                  className="cb-admin-cmd-btn cb-admin-cmd-btn--sold"
                  whileTap={{ scale: 0.95 }}
                  disabled={adminCmdBusy || !isConnected || !currentPlayer || !selectedTeam}
                  onClick={() => handleAdminCommand('sold')}
                >
                  <IoCheckmarkCircle size={18} /> Sold
                </motion.button>
                <motion.button
                  type="button"
                  className="cb-admin-cmd-btn cb-admin-cmd-btn--unsold"
                  whileTap={{ scale: 0.95 }}
                  disabled={adminCmdBusy || !isConnected || !currentPlayer}
                  onClick={() => handleAdminCommand('unsold')}
                >
                  <IoCloseCircle size={18} /> Unsold
                </motion.button>
              </div>
              <div className="cb-admin-search-row">
                <div className="cb-admin-search-field">
                  <IoSearch size={16} />
                  <input
                    type="text"
                    value={jumpIdInput}
                    onChange={(e) => setJumpIdInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleJumpToPlayer(); }}
                    placeholder="ENTER PLAYER ID"
                    className="cb-admin-search-input"
                    autoCapitalize="characters"
                  />
                </div>
                <motion.button
                  type="button"
                  className="cb-admin-cmd-btn cb-admin-cmd-btn--go"
                  whileTap={{ scale: 0.95 }}
                  disabled={adminCmdBusy || !isConnected || !jumpIdInput.trim()}
                  onClick={handleJumpToPlayer}
                >
                  Go
                </motion.button>
              </div>
            </motion.div>

            {/* Broadcast / Overlay Controls — drives the OBS live overlay */}
            <motion.div className="cb-login-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.07 }} style={{ marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IoTv size={16} /> Live Overlay Controls
                </h3>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: broadcastMode === 'auction' ? '#94a3b8' : '#4ade80' }}>
                  {broadcastMode === 'auction' ? 'Auction Live' : `Showing: ${broadcastMode}`}
                </span>
              </div>

              {/* Team picker for stats / squad views */}
              <select
                value={broadcastTeamId}
                onChange={(e) => setBroadcastTeamId(e.target.value)}
                className="cb-broadcast-select"
                style={{ width: '100%', padding: '0.6rem 0.75rem', marginBottom: '0.6rem', borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.85rem' }}
              >
                <option value="">Select a team (for Stats / Squad)…</option>
                {teams.map((t) => <option key={t.id} value={t.id} style={{ color: '#111' }}>{t.name}</option>)}
              </select>

              <div className="cb-broadcast-grid">
                <motion.button type="button" className="cb-broadcast-btn cb-broadcast-btn--stats"
                  whileTap={{ scale: 0.95 }} disabled={broadcastBusy || !isConnected || !broadcastTeamId}
                  onClick={() => pushBroadcast('standings', broadcastTeamId)}>
                  <IoStatsChart size={18} /> Team Stats
                </motion.button>
                <motion.button type="button" className="cb-broadcast-btn cb-broadcast-btn--squad"
                  whileTap={{ scale: 0.95 }} disabled={broadcastBusy || !isConnected || !broadcastTeamId}
                  onClick={() => pushBroadcast('teamSquad', broadcastTeamId)}>
                  <IoPeople size={18} /> Squad View
                </motion.button>
                <motion.button type="button" className="cb-broadcast-btn cb-broadcast-btn--top"
                  whileTap={{ scale: 0.95 }} disabled={broadcastBusy || !isConnected}
                  onClick={() => pushBroadcast('topPicks')}>
                  <IoTrophy size={18} /> Top Picks
                </motion.button>
                <motion.button type="button" className="cb-broadcast-btn cb-broadcast-btn--live"
                  whileTap={{ scale: 0.95 }} disabled={broadcastBusy || !isConnected}
                  onClick={() => pushBroadcast('auction')}>
                  <IoRadioButtonOn size={18} /> Back to Live
                </motion.button>
              </div>

              <button type="button" onClick={toggleMarquee} disabled={!isConnected}
                className={`cb-broadcast-marquee-toggle ${marqueeEnabled ? 'is-on' : ''}`}>
                <span>Bottom Marquee (purse · picks)</span>
                <span className="cb-broadcast-switch" aria-hidden><span className="cb-broadcast-switch__dot" /></span>
              </button>
            </motion.div>

            {/* All Teams Grid */}
            <motion.div className="cb-login-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} style={{ marginTop: '0.75rem' }}>
              <div style={{ marginBottom: '0.9rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <IoPeople size={16} /> All Teams — Bid Controls
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.74rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                    {customizeOrderMode ? 'Use the arrows to arrange teams by seating position, then save.' : 'Tap a team logo to raise the bid instantly.'}
                  </p>
                </div>
                {customizeOrderMode ? (
                  <motion.button
                    type="button"
                    className="cb-admin-cmd-btn cb-admin-cmd-btn--go"
                    whileTap={{ scale: 0.95 }}
                    disabled={isSavingOrder}
                    onClick={saveTeamOrder}
                    style={{ flexShrink: 0 }}
                  >
                    {isSavingOrder ? '...' : 'Save Order'}
                  </motion.button>
                ) : (
                  <motion.button
                    type="button"
                    className="cb-icon-btn"
                    whileTap={{ scale: 0.9 }}
                    title="Customize seating order"
                    onClick={beginCustomizeOrder}
                    style={{ background: 'rgba(139,92,246,0.2)', borderRadius: 8, width: 32, height: 32, border: 'none', color: '#a78bfa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <IoSwapVertical size={16} />
                  </motion.button>
                )}
              </div>

              {currentPlayer && (
                <div className="cb-bid-context" aria-live="polite">
                  <div className="cb-bid-context__player">
                    <PlayerImage imageUrl={currentPlayer.imageUrl || ''} playerName={currentPlayer.name} size="sm" className="cb-player-img" />
                    <span><strong>{currentPlayer.name}</strong><small>Current player</small></span>
                  </div>
                  <div className="cb-bid-context__leader">
                    {selectedTeam?.logoUrl && <TeamLogo logoUrl={selectedTeam.logoUrl} teamName={selectedTeam.name} size="sm" />}
                    <span><strong>{selectedTeam?.name || 'No bids yet'}</strong><small>{selectedTeam ? `Leading at ${formatLakhs(currentBid)} Max Bidding Allowed ${auctionRules.calculateMaxBid(selectedTeam)}` : `Opening at ${formatLakhs(currentBid)}`}</small>
                    <small>{selectedTeam ? `Max Bidding Allowed ${auctionRules.calculateMaxBid(selectedTeam)}` : ""}</small></span>
                  </div>
                </div>
              )}

              <div className="cb-team-card-grid cb-team-bid-grid">
                {(customizeOrderMode ? orderedTeamIds.map(id => orderedTeams.find(t => t.id === id)).filter((t): t is typeof orderedTeams[number] => !!t) : orderedTeams).map((team, index, arr) => {
                  const isLeading = selectedTeam?.id === team.id;
                  const canRaiseBid = !!currentPlayer && isConnected && auctionActive && !busyTeamId;
                  const maxBid = currentPlayer ? auctionRules.calculateMaxBid(team) : 0;
                  const nextBid = currentBid + 100;
                  const blockedByTurn = !!lastBidTeamId && lastBidTeamId === team.id;
                  const blockedByRules = !!currentPlayer && !auctionRules.validateBid(team, nextBid, currentPlayer.basePrice, currentPlayer.age).valid;
                  const isBlocked = !customizeOrderMode && (blockedByTurn || blockedByRules);
                  return (
                    <motion.button
                      key={team.id}
                      type="button"
                      className={`cb-team-card-btn cb-team-bid-card ${isLeading ? 'active' : ''}`}
                      style={{
                        '--card-bg': team.primaryColor || '#3b82f6',
                        '--card-bg2': team.secondaryColor || '#1e40af',
                        position: 'relative',
                      } as React.CSSProperties}
                      whileTap={{ scale: canRaiseBid && !customizeOrderMode ? 0.96 : 1 }}
                      disabled={(!canRaiseBid || isBlocked) && !customizeOrderMode}
                      onClick={() => { if (!customizeOrderMode) handleRaiseBid(team.id, team.name); }}
                      aria-label={`Raise bid for ${team.name}`}
                    >
                      {isBlocked && <span className="cb-team-bid-blocked" title={blockedByTurn ? 'The leading team must wait for another bid' : 'This team cannot afford or accept the next bid'} aria-label="Team cannot bid">&#8856;</span>}
                      {isLeading && !customizeOrderMode && (
                        <span className="cb-team-bid-badge">LEADING</span>
                      )}
                      <div className="cb-team-bid-logo-wrap">
                        {team.logoUrl ? (
                          <TeamLogo logoUrl={team.logoUrl} teamName={team.name} size="sm" className="cb-team-card-logo cb-team-bid-logo" />
                        ) : (
                          <div className="cb-team-card-initials cb-team-bid-initials">{team.name.slice(0, 2).toUpperCase()}</div>
                        )}
                      </div>
                      <span className="cb-team-card-name cb-team-bid-name">{team.name}</span>
                      {!customizeOrderMode && <span className="cb-team-bid-max">Max {formatLakhs(maxBid)}</span>}
                      {customizeOrderMode ? (
                        <div className="cb-team-reorder-controls" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="cb-reorder-btn" disabled={index === 0} onClick={() => moveTeamOrder(team.id, -1)} aria-label={`Move ${team.name} earlier`}>
                            <IoArrowUp size={14} />
                          </button>
                          <button type="button" className="cb-reorder-btn" disabled={index === arr.length - 1} onClick={() => moveTeamOrder(team.id, 1)} aria-label={`Move ${team.name} later`}>
                            <IoArrowDown size={14} />
                          </button>
                        </div>
                      ) : (
                        <span className="cb-team-bid-hint">
                          {isBlocked ? (blockedByTurn ? 'Waiting for another team' : 'Cannot bid') : (busyTeamId === team.id ? 'Placing bid...' : 'Tap logo to raise bid')}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>

            <div className="cb-login-footer" style={{ textAlign: 'center', padding: '1rem 0 2rem' }}>
              <p style={{ margin: 0, opacity: 0.5, fontSize: '0.75rem' }}>powered by <b>NJS Creative Labs</b></p>
            </div>
          </div>

          {/* Feedback toast */}
          <AnimatePresence>
            {feedback && (
              <motion.div
                className={`cb-toast cb-toast-${feedback.type}`}
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
              >
                {feedback.message}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    // ─── Main Admin Bidding Interface (after team login) ───
    return (
      <div className="cb-login-page" style={{ '--cb-primary': themePrimary, '--cb-secondary': themeSecondary } as React.CSSProperties}>
        <div className="cb-login-bg" />
        <div className="cb-login-scroll">
          {/* Team session bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', marginRight: 12 }}>Team: {teamSession?.teamName ?? 'Unknown Team'}</span>
            <motion.button className="cb-icon-btn" onClick={handleTeamLogout} whileTap={{ scale: 0.9 }} title="Logout Team" style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IoClose size={16} />
            </motion.button>
          </div>

          {/* Live Player Card */}
          <motion.div className="cb-login-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            {/* Header bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IoShieldCheckmark size={22} color="#fbbf24" />
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>Bid Controller</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`cb-status-pill ${isConnected ? 'live' : ''}`} style={{ margin: 0, padding: '0.25rem 0.75rem', fontSize: '0.7rem' }}>
                  <span className="cb-status-dot" />
                  {isConnected ? formattedTime : 'Offline'}
                </span>
                <motion.button className="cb-icon-btn" onClick={() => adminLogout()} whileTap={{ scale: 0.9 }} title="Logout" style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IoClose size={16} />
                </motion.button>
              </div>
            </div>

            {/* Current player being auctioned */}
            {currentPlayer ? (
              <>
                <div className="cb-scout-live-highlight" style={{ margin: '0 -1rem', padding: '0.75rem 1rem' }}>
                  <span className="cb-scout-live-badge"><span className="cb-live-pulse" /> Now Bidding</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <div style={{ width: 60, height: 60, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
                      <PlayerImage imageUrl={currentPlayer.imageUrl || ''} playerName={currentPlayer.name} size="md" className="cb-player-img" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{currentPlayer.name}</h2>
                      <span className={`cb-role-badge ${getRoleBadgeClass(currentPlayer.role)}`} style={{ marginTop: 4 }}>{getRoleLabel(currentPlayer.role)}</span>
                      <div className="cb-scout-price-row" style={{ marginTop: 6 }}>
                        <div><span>Base</span><strong>{formatLakhs(currentPlayer.basePrice)}</strong></div>
                        <div><span>Current Bid</span><strong style={{ color: '#fbbf24', fontSize: '1.1rem' }}>{formatLakhs(currentBid)}</strong></div>
                      </div>
                    </div>
                  </div>
                  {selectedTeam && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '0.4rem 0.7rem', background: 'rgba(255,255,255,0.08)', borderRadius: 8 }}>
                      {loggedInTeam && selectedTeam.id === loggedInTeam.id ? (
                        <>
                          {selectedTeam.logoUrl && <TeamLogo logoUrl={selectedTeam.logoUrl} teamName={selectedTeam.name} size="sm" />}
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>You are leading</span>
                          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', background: 'rgba(251,191,36,0.25)', color: '#fbbf24', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>LEADING</span>
                        </>
                      ) : (
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Another team is leading</span>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem 0', opacity: 0.5 }}>
                <GiCricketBat size={40} color="rgba(255,255,255,0.3)" />
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>Waiting for next player...</p>
              </div>
            )}
          </motion.div>

          {/* Team Cards Grid — with Raise Bid buttons */}
          <motion.div className="cb-login-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} style={{ marginTop: '0.75rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IoPeople size={16} /> Your Team Bid Controls
            </h3>

            <div className="cb-team-card-grid">
              {loggedInTeam ? (
                (() => {
                  const team = loggedInTeam;
                  const isLeading = selectedTeam?.id === team.id;
                  const purseUsedPct = team.allocatedAmount
                    ? Math.round(((team.allocatedAmount - team.remainingPurse) / team.allocatedAmount) * 100)
                    : 0;
                  return (
                    <div
                      key={team.id}
                      className={`cb-team-card-btn ${isLeading ? 'active' : ''}`}
                      style={{ '--card-bg': team.primaryColor || '#3b82f6', '--card-bg2': team.secondaryColor || '#1e40af', cursor: 'default', position: 'relative' } as React.CSSProperties}
                    >
                      {isLeading && (
                        <span style={{ position: 'absolute', top: 6, right: 8, fontSize: '0.55rem', background: 'rgba(251,191,36,0.9)', color: '#000', padding: '1px 6px', borderRadius: 4, fontWeight: 800, letterSpacing: 0.5 }}>LEADING</span>
                      )}
                      {team.logoUrl ? (
                        <TeamLogo logoUrl={team.logoUrl} teamName={team.name} size="sm" className="cb-team-card-logo" />
                      ) : (
                        <div className="cb-team-card-initials">{team.name.slice(0, 2).toUpperCase()}</div>
                      )}
                      <span className="cb-team-card-name">{team.name}</span>
                      <span className="cb-team-card-meta">
                        {team.playersBought || 0}/{team.totalPlayerThreshold || 25} players
                      </span>
                      <span className="cb-team-card-meta" style={{ fontSize: '0.65rem' }}>
                        {formatLakhs(team.remainingPurse)} left &middot; {purseUsedPct}% used
                      </span>

                      <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 6 }}>
                        <motion.button
                          whileTap={{ scale: 0.92 }}
                          disabled={!currentPlayer || !isConnected || !auctionActive || !!busyTeamId}
                          onClick={(e) => { e.stopPropagation(); handleRaiseBid(team.id, team.name); }}
                          style={{
                            flex: 1,
                            padding: '0.5rem 0',
                            borderRadius: 8,
                            border: 'none',
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: '#fff',
                            fontWeight: 800,
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            opacity: (!currentPlayer || !auctionActive) ? 0.4 : 1,
                            letterSpacing: 0.5,
                          }}
                        >
                          {busyTeamId === team.id ? '...' : `RAISE +₹100${currencySuffix}`}
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.92 }}
                          disabled={!currentPlayer || !isConnected || !isLeading || !!busyTeamId}
                          onClick={(e) => { e.stopPropagation(); handlePass(team.id, team.name); }}
                          style={{
                            padding: '0.5rem 0.7rem',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.25)',
                            background: 'transparent',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            opacity: !isLeading ? 0.3 : 1,
                          }}
                        >
                          PASS
                        </motion.button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="cb-empty-state" style={{ width: '100%' }}>
                  <p style={{ margin: 0 }}>Logged in team not found in live auction data.</p>
                </div>
              )}
            </div>
          </motion.div>

          <div className="cb-login-footer" style={{ textAlign: 'center', padding: '1rem 0 2rem' }}>
            <p style={{ margin: 0, opacity: 0.5, fontSize: '0.75rem' }}>powered by <b>NJS Creative Labs</b></p>
          </div>
        </div>

        {/* Feedback toast */}
        <AnimatePresence>
          {feedback && (
            <motion.div
              className={`cb-toast cb-toast-${feedback.type}`}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
            >
              {feedback.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
