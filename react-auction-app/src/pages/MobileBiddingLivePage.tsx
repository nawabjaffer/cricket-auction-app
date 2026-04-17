// ============================================================================
// MOBILE BIDDING LIVE PAGE - Redesigned
// Real-time mobile interface for teams to raise bids
// Uses Firebase Realtime Database for cross-device synchronization
// Responsive: mobile / tablet / desktop
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GiCricketBat } from 'react-icons/gi';
import { IoWifi, IoWifiOutline, IoSwapVertical, IoRefresh, IoPeople, IoChevronDown } from 'react-icons/io5';
import { authService } from '../services';
import type { AuthSession } from '../services';
import { auctionPersistence, type SponsorRecord } from '../services/auctionPersistence';
import { realtimeSync } from '../services/realtimeSync';
import { useRealtimeMobileSync } from '../hooks/useRealtimeSync';
import { useMotionSensor } from '../hooks/useMotionSensor';
import { TeamLogo } from '../components/TeamLogo/TeamLogo';
import { PlayerImage } from '../components/PlayerImage/PlayerImage';
import { getRoleBasedStats, getRoleLabel, getRoleBadgeClass } from '../utils/playerStats';
import '../components/MobileBidding/MobileBidding.css';

interface BidFeedback {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timestamp: number;
}

type LoginScreen = 'access' | 'scout';

export function MobileBiddingLivePage() {
  const [session, setSession] = useState<AuthSession | null>(authService.getSession());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<BidFeedback | null>(null);
  const [bidCount, setBidCount] = useState(0);
  const [lastSoldPlayer, setLastSoldPlayer] = useState<{name: string; amount: number; winnerTeam: string} | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const lastPlayerIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const {
    currentPlayer,
    currentBid,
    selectedTeam,
    teams,
    auctionActive: _auctionActive,
    isConnected,
    lastUpdate,
    lastSessionReset,
    submitBid,
    mobileBiddingConfig,
  } = useRealtimeMobileSync();

  // Build credentials from live team data
  const runtimeCredentials = useMemo(() => {
    return teams.map((team, index) => {
      const normalized = team.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
      const uname = normalized || `team${index + 1}`;
      return {
        teamId: team.id,
        teamName: team.name,
        username: uname,
        password: `${uname}123`,
        primaryColor: team.primaryColor || '#3b82f6',
        secondaryColor: team.secondaryColor || '#1e40af',
      };
    });
  }, [teams]);

  const [showCredentialsHint, setShowCredentialsHint] = useState(false);
  const [loginScreen, setLoginScreen] = useState<LoginScreen>('access');
  const [previewTeamId, setPreviewTeamId] = useState<string | null>(null);
  const [showTeamMenu, setShowTeamMenu] = useState(false);
  const [selectedMenuTeam, setSelectedMenuTeam] = useState<string | null>(null);
  const [_sponsors, setSponsors] = useState<SponsorRecord[]>([]);
  const [showWinCelebration, setShowWinCelebration] = useState(false);
  const [winCelebrationData, setWinCelebrationData] = useState<{ player: string; amount: number } | null>(null);
  const lastCelebrationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (runtimeCredentials.length > 0) {
      authService.setTeamCredentials(runtimeCredentials);
    }
  }, [runtimeCredentials]);

  useEffect(() => {
    if (runtimeCredentials.length > 0 && !previewTeamId) {
      setPreviewTeamId(runtimeCredentials[0].teamId);
    }
  }, [runtimeCredentials, previewTeamId]);

  useEffect(() => {
    let isMounted = true;
    const loadSponsors = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) return;
        auctionPersistence.initialize(db);
        const records = await auctionPersistence.getSponsors();
        if (isMounted) setSponsors(records.slice(0, 6));
      } catch {
        if (isMounted) setSponsors([]);
      }
    };
    loadSponsors();
    return () => { isMounted = false; };
  }, []);

  // Auto-reconnect with exponential backoff
  useEffect(() => {
    if (isConnected) {
      setReconnectAttempts(0);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    if (!session) return;

    const attempt = reconnectAttempts;
    const delay = Math.min(1000 * Math.pow(1.5, attempt), 15000);

    reconnectTimeoutRef.current = window.setTimeout(() => {
      setReconnectAttempts(prev => prev + 1);
      setFeedback({ type: 'info', message: `Reconnecting... (attempt ${attempt + 1})`, timestamp: Date.now() });
    }, delay);

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [isConnected, reconnectAttempts, session]);

  // Handle session reset from desktop
  useEffect(() => {
    if (lastSessionReset > 0 && session) {
      const sessionStartTime = (session as { timestamp?: number }).timestamp || session.loginTime || 0;
      if (lastSessionReset > sessionStartTime) {
        authService.logout();
        setSession(null);
        setFeedback({ type: 'warning', message: 'Session reset by admin. Please login again.', timestamp: Date.now() });
      }
    }
  }, [lastSessionReset, session]);

  // Detect my team from session
  const myTeam = useMemo(() => {
    if (!session) return null;
    return teams.find(t => t.id === session.teamId) || null;
  }, [session, teams]);

  const isMyBid = selectedTeam?.id === myTeam?.id;

  // Track sold player
  useEffect(() => {
    if (currentPlayer) {
      lastPlayerIdRef.current = currentPlayer.id;
      setLastSoldPlayer(null);
    } else if (lastPlayerIdRef.current && selectedTeam && currentBid > 0) {
      const celebKey = `${lastPlayerIdRef.current}-${currentBid}`;
      if (celebKey !== lastCelebrationKeyRef.current) {
        lastCelebrationKeyRef.current = celebKey;
        setLastSoldPlayer({ name: lastPlayerIdRef.current, amount: currentBid, winnerTeam: selectedTeam.name });
        if (selectedTeam.id === myTeam?.id) {
          setShowWinCelebration(true);
          setWinCelebrationData({ player: lastPlayerIdRef.current, amount: currentBid });
          setTimeout(() => setShowWinCelebration(false), 5000);
        }
      }
    }
  }, [currentPlayer, selectedTeam, currentBid, myTeam]);

  // Motion sensor bidding
  const handleMotionBid = useCallback(() => {
    if (!myTeam || !currentPlayer || !isConnected) return;
    const newBid = currentBid + 100;
    submitBid(myTeam.id, newBid, 'raise');
    setBidCount(prev => prev + 1);
    setFeedback({ type: 'success', message: `Gesture bid: ₹${newBid}L`, timestamp: Date.now() });
  }, [myTeam, currentPlayer, currentBid, isConnected, submitBid]);

  const { isActive: motionActive, isSupported: motionSupported } = useMotionSensor({
    enabled: motionEnabled && !!session,
    onMotionDetected: handleMotionBid,
    cooldown: 2000,
  });

  const handleToggleMotionSensor = useCallback(() => {
    setMotionEnabled(prev => !prev);
    setFeedback({ type: 'info', message: motionEnabled ? 'Gesture bidding disabled' : 'Gesture bidding enabled', timestamp: Date.now() });
  }, [motionEnabled]);

  // Login
  const handleLogin = useCallback(async () => {
    if (!username || !password) { setLoginError('Enter username and password'); return; }
    setIsLoading(true);
    setLoginError('');
    try {
      const result = await authService.login(username, password);
      if (result.success && result.session) {
        setSession(result.session);
        setFeedback({ type: 'success', message: `Welcome, ${result.session.teamName}!`, timestamp: Date.now() });
      } else {
        setLoginError(result.error || 'Login failed');
      }
    } catch {
      setLoginError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [username, password]);

  const handleLogout = useCallback(() => {
    authService.logout();
    setSession(null);
    setBidCount(0);
    setLastSoldPlayer(null);
  }, []);

  // Bid handlers
  const handleRaiseBid = useCallback(async () => {
    if (!myTeam || !currentPlayer || !isConnected) return;
    const newBid = currentBid + 100;
    const success = await submitBid(myTeam.id, newBid, 'raise');
    if (success) {
      setBidCount(prev => prev + 1);
      setFeedback({ type: 'success', message: `Bid placed: ₹${newBid}L`, timestamp: Date.now() });
    }
  }, [myTeam, currentPlayer, currentBid, isConnected, submitBid]);

  const handleStopBidding = useCallback(async () => {
    if (!myTeam || !isMyBid) return;
    const success = await submitBid(myTeam.id, currentBid, 'stop');
    if (success) {
      setFeedback({ type: 'info', message: 'Stopped bidding', timestamp: Date.now() });
    }
  }, [myTeam, isMyBid, currentBid, submitBid]);

  const handleManualRefresh = useCallback(() => {
    setFeedback({ type: 'info', message: 'Refreshing connection...', timestamp: Date.now() });
    setReconnectAttempts(prev => prev + 1);
  }, []);

  // Clear feedback after delay
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const formattedTime = useMemo(() => {
    if (!lastUpdate) return 'Never';
    const date = new Date(lastUpdate);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastUpdate]);

  const maxAffordableBid = useMemo(() => {
    if (!myTeam) return 0;
    return Math.floor((myTeam.remainingPurse || 0) / 100) * 100;
  }, [myTeam]);

  const formatLakhs = (value: number) => `₹${Number.isFinite(value) ? value.toFixed(1) : '0.0'}L`;

  // Role-based stats for current player
  const playerStats = useMemo(() => {
    if (!currentPlayer) return [];
    return getRoleBasedStats(currentPlayer, mobileBiddingConfig.maxStatsToShow);
  }, [currentPlayer, mobileBiddingConfig.maxStatsToShow]);

  // ═══════════════ LOGIN SCREEN ═══════════════
  if (!session) {
    const previewTeam = runtimeCredentials.find((team) => team.teamId === previewTeamId) || runtimeCredentials[0];
    const themePrimary = previewTeam?.primaryColor || '#e4be75';
    const themeSecondary = previewTeam?.secondaryColor || '#24467c';

    return (
      <div
        className="cb-login-page"
        style={{ '--cb-primary': themePrimary, '--cb-secondary': themeSecondary } as React.CSSProperties}
      >
        <div className="cb-login-bg" />

        <motion.div
          className={`cb-login-card ${loginScreen === 'scout' ? 'scout-mode' : ''}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Tab Nav */}
          <div className="cb-login-tabs" role="tablist">
            <button
              className={`cb-login-tab ${loginScreen === 'access' ? 'active' : ''}`}
              onClick={() => setLoginScreen('access')}
              role="tab" aria-selected={loginScreen === 'access'}
            >Team Access</button>
            <button
              className={`cb-login-tab ${loginScreen === 'scout' ? 'active' : ''}`}
              onClick={() => setLoginScreen('scout')}
              role="tab" aria-selected={loginScreen === 'scout'}
            >Player Scout</button>
          </div>

          {/* Team theme chips */}
          {runtimeCredentials.length > 0 && (
            <div className="cb-team-chips">
              {runtimeCredentials.slice(0, 8).map((cred) => (
                <button
                  key={cred.teamId}
                  type="button"
                  className={`cb-team-chip ${previewTeam?.teamId === cred.teamId ? 'active' : ''}`}
                  onClick={() => { setPreviewTeamId(cred.teamId); setUsername(cred.username); setPassword(cred.password); }}
                  style={{ '--chip-bg': cred.primaryColor } as React.CSSProperties}
                  title={cred.teamName}
                >
                  {cred.teamName.slice(0, 2).toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {loginScreen === 'access' ? (
            <>
              <div className="cb-login-brand">
                <motion.div className="cb-login-icon" initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}>
                  <GiCricketBat size={48} color="#fff" />
                </motion.div>
                <h1>Team Bidding</h1>
                <p>Live Auction Access</p>
              </div>

              <div className={`cb-status-pill ${isConnected ? 'live' : ''}`}>
                <span className="cb-status-dot" />
                <span>{isConnected ? 'Auction Live' : 'Waiting for auction...'}</span>
                {teams.length > 0 && <span className="cb-team-count">{teams.length} teams</span>}
              </div>

              <form className="cb-login-form" onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
                <div className="cb-field">
                  <label htmlFor="cb-username">Team Username</label>
                  <input
                    type="text" id="cb-username" value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    placeholder="e.g., royalchallengers"
                    disabled={isLoading} autoComplete="username" autoCapitalize="none"
                  />
                </div>
                <div className="cb-field">
                  <label htmlFor="cb-password">Password</label>
                  <input
                    type="password" id="cb-password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your team password"
                    disabled={isLoading} autoComplete="current-password"
                  />
                </div>

                {loginError && (
                  <motion.div className="cb-error" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                    {loginError}
                  </motion.div>
                )}

                <motion.button
                  type="submit" className="cb-login-btn"
                  disabled={isLoading || !username || !password}
                  whileTap={{ scale: 0.98 }}
                >
                  {isLoading ? <span className="cb-spinner" /> : 'Login to Bid'}
                </motion.button>
              </form>

              {/* Credentials help */}
              <div className="cb-help-section">
                <button type="button" className="cb-help-toggle" onClick={() => setShowCredentialsHint(!showCredentialsHint)}>
                  {showCredentialsHint ? 'Hide Help' : 'Need Help?'}
                </button>
                <AnimatePresence>
                  {showCredentialsHint && (
                    <motion.div className="cb-help-panel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      <p><strong>Username:</strong> team name (lowercase, no spaces)</p>
                      <p><strong>Password:</strong> username + "123"</p>
                      {teams.length > 0 && (
                        <div className="cb-teams-grid">
                          {runtimeCredentials.slice(0, 6).map((cred, idx) => (
                            <button
                              key={cred.teamId || idx} type="button" className="cb-team-fill"
                              onClick={() => { setUsername(cred.username); setPassword(cred.password); setPreviewTeamId(cred.teamId); }}
                              style={{ borderColor: cred.primaryColor } as React.CSSProperties}
                            >
                              <span>{cred.teamName}</span>
                              <small>Tap to fill</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            /* ── Scout Screen ── */
            <div className="cb-scout">
              <div className="cb-scout-header">
                <span className="cb-scout-brand">CRICKET ARENA</span>
                <button type="button" className="cb-scout-login-cta" onClick={() => setLoginScreen('access')}>Go to Login</button>
              </div>

              {currentPlayer ? (
                <div className="cb-scout-player">
                  <div className="cb-scout-player-header">
                    <h2>{currentPlayer.name}</h2>
                    <span className={`cb-role-badge ${getRoleBadgeClass(currentPlayer.role)}`}>{getRoleLabel(currentPlayer.role)}</span>
                  </div>
                  <div className="cb-scout-price-row">
                    <div><span>Base Price</span><strong>{formatLakhs(currentPlayer.basePrice || 0)}</strong></div>
                    <div><span>Current Bid</span><strong>{formatLakhs(currentBid)}</strong></div>
                  </div>
                  <div className="cb-scout-stats-grid">
                    {getRoleBasedStats(currentPlayer, 6).map((stat) => (
                      <div key={stat.label} className={`cb-scout-stat ${stat.category}`}>
                        <span className="cb-stat-label">{stat.label}</span>
                        <strong className="cb-stat-value">{stat.value || '--'}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="cb-scout-empty">
                  <GiCricketBat size={40} color="rgba(255,255,255,0.3)" />
                  <p>No active listing. Player stats will appear here once a lot is activated.</p>
                </div>
              )}

              {/* Auction snapshot */}
              <div className="cb-scout-snapshot">
                <div className="cb-snap-item"><span>Teams</span><strong>{teams.length}</strong></div>
                <div className="cb-snap-item"><span>Slots Filled</span><strong>{teams.reduce((s, t) => s + (t.playersBought || 0), 0)}</strong></div>
                <div className="cb-snap-item"><span>Avg Purse</span><strong>{formatLakhs(teams.length > 0 ? teams.reduce((s, t) => s + t.remainingPurse, 0) / teams.length : 0)}</strong></div>
              </div>
            </div>
          )}

          <div className="cb-login-footer">
            <p>powered by <b>NJS Creative Labs</b></p>
          </div>
        </motion.div>
      </div>
    );
  }

  // ═══════════════ MAIN BIDDING INTERFACE ═══════════════
  const teamPrimary = session.primaryColor || myTeam?.primaryColor || '#3b82f6';
  const teamSecondary = session.secondaryColor || myTeam?.secondaryColor || '#1e40af';

  return (
    <div
      className="cb-main"
      style={{ '--cb-primary': teamPrimary, '--cb-secondary': teamSecondary } as React.CSSProperties}
    >
      {/* Win Celebration Overlay */}
      <AnimatePresence>
        {showWinCelebration && winCelebrationData && (
          <motion.div className="cb-celebration" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="cb-celebration-bg" />
            <motion.div className="cb-celebration-card" initial={{ y: 30, scale: 0.9 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}>
              <div className="cb-celebration-emoji">🎉</div>
              <h2>Congratulations!</h2>
              <p>You won <strong>{winCelebrationData.player}</strong></p>
              <div className="cb-celebration-amount">{formatLakhs(winCelebrationData.amount)}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <header className="cb-header">
        <div className="cb-header-left">
          {myTeam?.logoUrl && <TeamLogo logoUrl={myTeam.logoUrl} teamName={session.teamName} size="sm" />}
          <div className="cb-header-team">
            <span className="cb-team-name">{session.teamName}</span>
            <span className="cb-bid-count">{bidCount} bids</span>
          </div>
        </div>
        <div className="cb-header-right">
          <motion.button className="cb-icon-btn" onClick={handleManualRefresh} whileTap={{ scale: 0.9 }} title="Refresh">
            <IoRefresh size={18} />
          </motion.button>
          {motionSupported && (
            <motion.button
              className={`cb-icon-btn ${motionActive ? 'active' : ''}`}
              onClick={handleToggleMotionSensor} whileTap={{ scale: 0.9 }}
              title={motionActive ? 'Gesture active' : 'Enable gesture'}
            >
              <IoSwapVertical size={18} />
            </motion.button>
          )}
          <motion.button className="cb-icon-btn" onClick={() => setShowTeamMenu(true)} whileTap={{ scale: 0.9 }} title="Teams">
            <IoPeople size={18} />
          </motion.button>
          <button className="cb-logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* ── Connection bar ── */}
      <div className={`cb-conn-bar ${isConnected ? 'live' : 'off'}`}>
        {isConnected ? <IoWifi size={14} /> : <IoWifiOutline size={14} />}
        <span>{isConnected ? 'Connected' : 'Reconnecting...'}</span>
        <span className="cb-conn-time">{formattedTime}</span>
      </div>

      {/* ── Motion indicator ── */}
      <AnimatePresence>
        {motionActive && (
          <motion.div className="cb-motion-bar" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <IoSwapVertical size={14} />
            <span>Gesture bidding active — Raise phone to bid</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content area ── */}
      <div className="cb-content">
        {/* Team budget bar */}
        {myTeam && (
          <div className="cb-budget-strip">
            <div className="cb-budget-item">
              <span>Budget</span>
              <strong>{formatLakhs(myTeam.remainingPurse)}</strong>
            </div>
            <div className="cb-budget-divider" />
            <div className="cb-budget-item">
              <span>Players</span>
              <strong>{myTeam.playersBought || 0}/{myTeam.totalPlayerThreshold || 25}</strong>
            </div>
            <div className="cb-budget-divider" />
            <div className="cb-budget-item">
              <span>Max Bid</span>
              <strong>{formatLakhs(maxAffordableBid)}</strong>
            </div>
          </div>
        )}

        {/* Player card */}
        {currentPlayer ? (
          <motion.div
            className="cb-player-card"
            key={currentPlayer.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Player image + basic info */}
            <div className="cb-player-top">
              <div className="cb-player-image-wrap">
                <PlayerImage
                  imageUrl={currentPlayer.imageUrl || ''}
                  playerName={currentPlayer.name}
                  size="lg"
                  className="cb-player-img"
                />
              </div>
              <div className="cb-player-info">
                <h2 className="cb-player-name">{currentPlayer.name}</h2>
                <span className={`cb-role-badge ${getRoleBadgeClass(currentPlayer.role)}`}>
                  {getRoleLabel(currentPlayer.role)}
                </span>
                <div className="cb-price-row">
                  <div className="cb-price-item">
                    <span>Base</span>
                    <strong>{formatLakhs(currentPlayer.basePrice)}</strong>
                  </div>
                  {currentPlayer.age && (
                    <div className="cb-price-item">
                      <span>Age</span>
                      <strong>{currentPlayer.age}</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Role-based stats grid */}
            <div className="cb-stats-grid">
              {playerStats.map((stat) => (
                <div key={stat.label} className={`cb-stat-tile ${stat.category}`}>
                  <span className="cb-stat-label">{stat.label}</span>
                  <strong className="cb-stat-value">{stat.value || '--'}</strong>
                </div>
              ))}
            </div>

            {/* Current bid section */}
            <div className="cb-bid-section">
              <div className="cb-current-bid">
                <span className="cb-bid-label">Current Bid</span>
                <motion.span
                  className="cb-bid-amount"
                  key={currentBid}
                  initial={{ scale: 1.15 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  {formatLakhs(currentBid)}
                </motion.span>
              </div>
              {selectedTeam && (
                <div className={`cb-leading-team ${isMyBid ? 'mine' : ''}`}>
                  {selectedTeam.logoUrl && <TeamLogo logoUrl={selectedTeam.logoUrl} teamName={selectedTeam.name} size="sm" />}
                  <span>{selectedTeam.name}</span>
                  {isMyBid && <span className="cb-my-bid-badge">YOUR BID</span>}
                </div>
              )}
            </div>
          </motion.div>
        ) : lastSoldPlayer ? (
          /* ── Sold / Waiting state ── */
          <motion.div
            className={`cb-sold-card ${lastSoldPlayer.winnerTeam === session.teamName ? 'won' : 'lost'}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {lastSoldPlayer.winnerTeam === session.teamName ? (
              <>
                <div className="cb-sold-emoji">🎉</div>
                <h2>Congratulations!</h2>
                <p>You won <strong>{lastSoldPlayer.name}</strong></p>
                <div className="cb-sold-amount">{formatLakhs(lastSoldPlayer.amount)}</div>
              </>
            ) : (
              <>
                <div className="cb-sold-emoji">🎯</div>
                <h2>Better Player Ahead</h2>
                <p><strong>{lastSoldPlayer.winnerTeam}</strong> won {lastSoldPlayer.name}</p>
                <p className="cb-motivation">Stay patient, bid smart, and win the right lot.</p>
              </>
            )}
            <p className="cb-waiting-hint">Waiting for next player...</p>
          </motion.div>
        ) : (
          /* ── No player ── */
          <div className="cb-empty-state">
            <GiCricketBat size={56} color="rgba(255,255,255,0.25)" />
            <p>Waiting for next player...</p>
            <p className="cb-empty-hint">The auction master will start the bidding</p>
          </div>
        )}
      </div>

      {/* ── Action Buttons ── */}
      <div className="cb-actions">
        {mobileBiddingConfig.enableRaiseBid && (
          <motion.button
            className="cb-action-btn raise"
            onClick={handleRaiseBid}
            disabled={!currentPlayer || !isConnected}
            whileTap={{ scale: 0.95 }}
          >
            <span className="cb-action-icon">⬆️</span>
            <span className="cb-action-label">RAISE BID</span>
            <span className="cb-action-sub">+₹100L</span>
          </motion.button>
        )}
        {mobileBiddingConfig.enableStopBidding && (
          <motion.button
            className="cb-action-btn stop"
            onClick={handleStopBidding}
            disabled={!currentPlayer || !isMyBid}
            whileTap={{ scale: 0.95 }}
          >
            <span className="cb-action-icon">✋</span>
            <span className="cb-action-label">STOP</span>
          </motion.button>
        )}
      </div>

      {/* ── Feedback toast ── */}
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

      {/* ── Team Menu Modal ── */}
      <AnimatePresence>
        {showTeamMenu && (
          <motion.div className="cb-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTeamMenu(false)}>
            <motion.div
              className="cb-modal"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="cb-modal-header">
                <h3>Auction Teams</h3>
                <button className="cb-modal-close" onClick={() => setShowTeamMenu(false)}>✕</button>
              </div>
              <div className="cb-modal-body">
                {runtimeCredentials.map((cred) => (
                  <div key={cred.teamId} className={`cb-modal-team ${selectedMenuTeam === cred.teamId ? 'expanded' : ''}`}>
                    <button
                      className="cb-modal-team-btn"
                      onClick={() => setSelectedMenuTeam(selectedMenuTeam === cred.teamId ? null : cred.teamId)}
                      style={{ borderLeftColor: cred.primaryColor }}
                    >
                      <span className="cb-modal-team-name">{cred.teamName}</span>
                      <span className={`cb-modal-team-status ${myTeam?.id === cred.teamId ? 'connected' : ''}`}>
                        {myTeam?.id === cred.teamId ? '✓ You' : ''}
                      </span>
                      <IoChevronDown size={14} className={`cb-chevron ${selectedMenuTeam === cred.teamId ? 'open' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {selectedMenuTeam === cred.teamId && (
                        <motion.div
                          className="cb-modal-team-details"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                        >
                          <div className="cb-cred-row"><span>User:</span><code>{cred.username}</code></div>
                          <div className="cb-cred-row"><span>Pass:</span><code>{cred.password}</code></div>
                          <button
                            className="cb-copy-btn"
                            onClick={() => {
                              navigator.clipboard.writeText(`Username: ${cred.username}\nPassword: ${cred.password}`);
                              setFeedback({ type: 'success', message: 'Credentials copied!', timestamp: Date.now() });
                            }}
                          >Copy Credentials</button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MobileBiddingLivePage;
