// ============================================================================
// MOBILE BIDDING LIVE PAGE
// Real-time mobile interface for teams to raise bids
// Uses Firebase Realtime Database for cross-device synchronization
// Optimized for /live page connectivity with enhanced sync features
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GiCricketBat } from 'react-icons/gi';
import { IoWifi, IoWifiOutline, IoSwapVertical, IoRefresh, IoPeople } from 'react-icons/io5';
import { authService } from '../services';
import type { AuthSession } from '../services';
import { auctionPersistence, type SponsorRecord } from '../services/auctionPersistence';
import { realtimeSync } from '../services/realtimeSync';
import { useRealtimeMobileSync } from '../hooks/useRealtimeSync';
import { useMotionSensor } from '../hooks/useMotionSensor';
import { TeamLogo } from '../components/TeamLogo/TeamLogo';
import { PlayerImage } from '../components/PlayerImage/PlayerImage';
import '../components/MobileBidding/MobileBidding.css';

interface BidFeedback {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timestamp: number;
}

type LoginScreen = 'access' | 'scout';
type LiveOverlayTab = 'budget' | 'player' | 'epl';

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
  
  // Use Firebase Realtime Database for cross-device sync
  const {
    currentPlayer,
    currentBid,
    selectedTeam,
    teams,
    auctionActive: _auctionActive, // Used for future features
    isConnected,
    lastUpdate,
    lastSessionReset,
    submitBid,
  } = useRealtimeMobileSync();

  // Build simple credentials from live team data
  // Username: team name lowercase (e.g., "royalchallengers")
  // Password: simple pattern "team123" (teamname + 123)
  const runtimeCredentials = useMemo(() => {
    return teams.map((team, index) => {
      const normalized = team.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
      const username = normalized || `team${index + 1}`;
      // Simple memorable password: username + 123
      const password = `${username}123`;
      return {
        teamId: team.id,
        teamName: team.name,
        username,
        password,
        primaryColor: team.primaryColor || '#3b82f6',
        secondaryColor: team.secondaryColor || '#1e40af',
      };
    });
  }, [teams]);

  // State to show credentials hint
  const [showCredentialsHint, setShowCredentialsHint] = useState(false);
  const [loginScreen, setLoginScreen] = useState<LoginScreen>('access');
  const [previewTeamId, setPreviewTeamId] = useState<string | null>(null);
  
  // State to show team credentials modal during bidding
  const [showTeamMenu, setShowTeamMenu] = useState(false);
  const [selectedMenuTeam, setSelectedMenuTeam] = useState<string | null>(null);
  const [liveOverlayTab, setLiveOverlayTab] = useState<LiveOverlayTab>('budget');
  const [sponsors, setSponsors] = useState<SponsorRecord[]>([]);
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
        if (isMounted) {
          setSponsors(records.slice(0, 6));
        }
      } catch {
        if (isMounted) {
          setSponsors([]);
        }
      }
    };

    loadSponsors();

    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-reconnect logic for live connectivity
  useEffect(() => {
    if (!isConnected && session) {
      // Clear any existing timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Schedule reconnect attempt
      reconnectTimeoutRef.current = window.setTimeout(() => {
        setReconnectAttempts(prev => prev + 1);
        setFeedback({
          type: 'info',
          message: `Reconnecting to auction... (attempt ${reconnectAttempts + 1})`,
          timestamp: Date.now(),
        });
      }, 3000);
    } else if (isConnected && reconnectAttempts > 0) {
      setReconnectAttempts(0);
      setFeedback({
        type: 'success',
        message: 'Reconnected to auction!',
        timestamp: Date.now(),
      });
    }
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [isConnected, session, reconnectAttempts]);

  // Handle session reset from desktop
  useEffect(() => {
    if (lastSessionReset <= 0) return;

    authService.logout();
    setSession(null);
    setUsername('');
    setPassword('');
    setBidCount(0);
    setLoginError('Session reset by admin. Please login again.');
  }, [lastSessionReset]);

  // Find the team object for the logged-in user
  const myTeam = useMemo(() => teams.find(t => 
    t.name.toLowerCase().includes(session?.teamName?.toLowerCase() || '') ||
    t.id === session?.teamId
  ), [teams, session?.teamName, session?.teamId]);

  // Check if it's my team's turn
  const isMyBid = selectedTeam?.id === myTeam?.id || selectedTeam?.name === session?.teamName;

  // Detect when player is sold (player changes from existing to null)
  useEffect(() => {
    if (lastPlayerIdRef.current && !currentPlayer && selectedTeam) {
      const playerName = lastPlayerIdRef.current;
      setLastSoldPlayer({
        name: playerName,
        amount: currentBid,
        winnerTeam: selectedTeam.name,
      });
    } else if (currentPlayer) {
      setLastSoldPlayer(null);
      lastPlayerIdRef.current = currentPlayer.name;
    }
  }, [currentPlayer, currentBid, selectedTeam]);

  // Clear the celebration as soon as a new lot starts so the next player view is visible.
  useEffect(() => {
    if (currentPlayer) {
      setShowWinCelebration(false);
      setWinCelebrationData(null);
    }
  }, [currentPlayer]);

  useEffect(() => {
    if (!session || !myTeam || !selectedTeam || currentPlayer) return;
    if (selectedTeam.id !== myTeam.id && selectedTeam.name !== session.teamName) return;

    const celebrationKey = `${selectedTeam.id}-${currentBid}-${lastUpdate}`;
    if (lastCelebrationKeyRef.current === celebrationKey) return;

    const playerName = lastSoldPlayer?.name || lastPlayerIdRef.current || 'Winning Player';

    setWinCelebrationData({
      player: playerName,
      amount: currentBid,
    });
    setShowWinCelebration(true);
    lastCelebrationKeyRef.current = celebrationKey;

    const timer = window.setTimeout(() => {
      setShowWinCelebration(false);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [session, myTeam, selectedTeam, currentBid, lastUpdate, lastSoldPlayer]);

  // Handle login
  const handleLogin = useCallback(async () => {
    setIsLoading(true);
    setLoginError('');

    await new Promise(resolve => setTimeout(resolve, 500));

    const result = authService.login(username, password);

    if (result.success && result.session) {
      setSession(result.session);
      setLoginError('');
      console.log('[MobileBiddingLive] Login successful:', result.session.teamName);
    } else {
      setLoginError(result.error || 'Invalid credentials');
    }

    setIsLoading(false);
  }, [username, password]);

  // Motion sensor hook
  const { isSupported: motionSupported, isActive: motionActive, toggleMotionSensor } = useMotionSensor({
    enabled: motionEnabled && session !== null,
    cooldown: 600,
    onMotionDetected: (motion) => {
      if (motion === 'raise') {
        console.log('[MobileBiddingLive] 🎯 Motion detected - raising bid');
        setTimeout(() => {
          if (currentPlayer && isConnected) {
            handleRaiseBid();
          }
        }, 100);
      }
    },
  });

  // Toggle motion sensor with permission handling
  const handleToggleMotionSensor = useCallback(async () => {
    if (!motionSupported) {
      setFeedback({
        type: 'error',
        message: 'Motion sensor not supported on this device',
        timestamp: Date.now(),
      });
      return;
    }

    const success = await toggleMotionSensor();
    if (success) {
      setMotionEnabled(!motionEnabled);
      setFeedback({
        type: 'success',
        message: motionEnabled ? 'Gesture bidding disabled' : 'Gesture bidding enabled - raise your phone to bid!',
        timestamp: Date.now(),
      });
    } else {
      setFeedback({
        type: 'error',
        message: 'Motion sensor permission denied. Please enable in settings.',
        timestamp: Date.now(),
      });
    }
  }, [motionSupported, toggleMotionSensor, motionEnabled]);

  // Handle logout
  const handleLogout = useCallback(() => {
    authService.logout();
    setSession(null);
    setUsername('');
    setPassword('');
    setBidCount(0);
  }, []);

  // Handle raise bid
  const handleRaiseBid = useCallback(async () => {
    if (!myTeam) {
      setFeedback({
        type: 'error',
        message: 'Team not found - please re-login',
        timestamp: Date.now(),
      });
      return;
    }
    
    if (!currentPlayer) {
      setFeedback({
        type: 'warning',
        message: 'No active player',
        timestamp: Date.now(),
      });
      return;
    }

    if (!isConnected) {
      setFeedback({
        type: 'error',
        message: 'Not connected to auction',
        timestamp: Date.now(),
      });
      return;
    }

    const newBid = currentBid + 100;
    const success = await submitBid(myTeam.id, newBid, 'raise');

    if (success) {
      setBidCount(prev => prev + 1);
      setFeedback({
        type: 'success',
        message: `Bid raised to ₹${newBid}L`,
        timestamp: Date.now(),
      });
    } else {
      setFeedback({
        type: 'error',
        message: 'Failed to submit bid. Try again.',
        timestamp: Date.now(),
      });
    }
  }, [myTeam, currentPlayer, currentBid, isConnected, submitBid]);

  // Handle stop bidding
  const handleStopBidding = useCallback(async () => {
    if (!myTeam || !isMyBid) return;

    const success = await submitBid(myTeam.id, currentBid, 'stop');

    if (success) {
      setFeedback({
        type: 'info',
        message: 'Stopped bidding',
        timestamp: Date.now(),
      });
    }
  }, [myTeam, isMyBid, currentBid, submitBid]);

  // Manual refresh handler
  const handleManualRefresh = useCallback(() => {
    setFeedback({
      type: 'info',
      message: 'Refreshing connection...',
      timestamp: Date.now(),
    });
    // Trigger a state update that will cause reconnect
    setReconnectAttempts(prev => prev + 1);
  }, []);

  // Clear feedback after delay
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  // Format time for display
  const formattedTime = useMemo(() => {
    if (!lastUpdate) return 'Never';
    const date = new Date(lastUpdate);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastUpdate]);

  const maxAffordableBid = useMemo(() => {
    if (!myTeam) return 0;
    return Math.floor((myTeam.remainingPurse || 0) / 100) * 100;
  }, [myTeam]);

  const liveTopPurseTeams = useMemo(() => {
    return [...teams]
      .filter((team) => Number.isFinite(team.remainingPurse))
      .sort((a, b) => b.remainingPurse - a.remainingPurse)
      .slice(0, 4);
  }, [teams]);

  const averagePurse = useMemo(() => {
    if (teams.length === 0) return 0;
    const total = teams.reduce((sum, team) => sum + (team.remainingPurse || 0), 0);
    return total / teams.length;
  }, [teams]);

  const filledSlots = useMemo(() => {
    return teams.reduce((sum, team) => sum + (team.playersBought || 0), 0);
  }, [teams]);

  const totalSlots = useMemo(() => {
    return teams.reduce((sum, team) => sum + (team.totalPlayerThreshold || 0), 0);
  }, [teams]);

  const auctionProgress = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;
  const bidVsBase = currentPlayer?.basePrice ? (currentBid / currentPlayer.basePrice).toFixed(2) : '--';
  const motivationQuotes = [
    'Better bid for getting the best player.',
    'The next player can still change your auction.',
    'Stay patient, bid smart, and win the right lot.',
    'Great squads are built by timing, not only by price.',
  ];

  // Show login form if not authenticated
  if (!session) {
    const previewTeam = runtimeCredentials.find((team) => team.teamId === previewTeamId) || runtimeCredentials[0];
    const themePrimary = previewTeam?.primaryColor || '#e4be75';
    const themeSecondary = previewTeam?.secondaryColor || '#24467c';

    const scoutPlayerName = currentPlayer?.name || 'No Listing for Auction';
    const scoutPlayerRole = currentPlayer?.role || 'Awaiting auction lot activation';
    const scoutCurrentBid = currentBid > 0 ? currentBid : 0;
    const scoutBasePrice = currentPlayer?.basePrice || 0;

    const scoutMatches = (currentPlayer?.matches || '').trim() || '--';
    const scoutRuns = (currentPlayer?.runs || '').trim() || '--';
    const scoutWickets = (currentPlayer?.wickets || '').trim() || '--';

    const totalTeams = teams.length;
    const validThresholdTeams = teams.filter((team) => (team.totalPlayerThreshold || 0) > 0);
    const totalSlots = validThresholdTeams.reduce((sum, team) => sum + (team.totalPlayerThreshold || 0), 0);
    const filledSlots = teams.reduce((sum, team) => sum + (team.playersBought || 0), 0);
    const progressPct = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

    const purseTeams = teams.filter((team) => Number.isFinite(team.remainingPurse));
    const richestTeam = purseTeams.length > 0
      ? [...purseTeams].sort((a, b) => b.remainingPurse - a.remainingPurse)[0]
      : null;
    const avgPurse = purseTeams.length > 0
      ? purseTeams.reduce((sum, team) => sum + team.remainingPurse, 0) / purseTeams.length
      : 0;

    const historyRows = [...teams]
      .sort((a, b) => (b.playersBought || 0) - (a.playersBought || 0))
      .slice(0, 3);

    const formatLakhs = (value: number) => `₹${Number.isFinite(value) ? value.toFixed(1) : '0.0'}L`;

    return (
      <div
        className="mobile-bidding-login-page"
        style={{
          '--theme-primary': themePrimary,
          '--theme-secondary': themeSecondary,
          '--theme-primary-soft': `${themePrimary}22`,
        } as React.CSSProperties}
      >
        {/* Background gradient overlay */}
        <div className="login-bg-overlay" />
        
        {/* Main login container */}
        <motion.div 
          className={`login-container-modern ${loginScreen === 'scout' ? 'scout-layout' : ''}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="login-screen-nav" role="tablist" aria-label="Team login screens">
            <button
              type="button"
              className={`login-screen-tab ${loginScreen === 'access' ? 'active' : ''}`}
              onClick={() => setLoginScreen('access')}
              role="tab"
              aria-selected={loginScreen === 'access'}
            >
              Team Access
            </button>
            <button
              type="button"
              className={`login-screen-tab ${loginScreen === 'scout' ? 'active' : ''}`}
              onClick={() => setLoginScreen('scout')}
              role="tab"
              aria-selected={loginScreen === 'scout'}
            >
              Player Scout
            </button>
          </div>

          {runtimeCredentials.length > 0 && (
            <div className="team-theme-strip" aria-label="Team theme selector">
              {runtimeCredentials.slice(0, 8).map((cred) => (
                <button
                  key={cred.teamId}
                  type="button"
                  className={`team-theme-chip ${previewTeam?.teamId === cred.teamId ? 'active' : ''}`}
                  onClick={() => {
                    setPreviewTeamId(cred.teamId);
                    setUsername(cred.username);
                    setPassword(cred.password);
                  }}
                  style={{
                    '--chip-color': cred.primaryColor,
                  } as React.CSSProperties}
                  title={cred.teamName}
                >
                  {cred.teamName.slice(0, 2).toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {loginScreen === 'access' ? (
            <>
              {/* Logo/Brand Section */}
              <div className="login-brand">
                <motion.div 
                  className="login-logo-container"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                >
                  <GiCricketBat size={56} color="#fff" />
                </motion.div>
                <h1 className="login-title-modern">Team Bidding</h1>
                <p className="login-subtitle-modern">Live Auction Access</p>
              </div>

              {/* Connection Status Banner */}
              <motion.div 
                className={`login-status-banner ${isConnected ? 'connected' : 'waiting'}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <span className="status-dot" />
                <span>{isConnected ? 'Auction Live' : 'Waiting for auction...'}</span>
                {teams.length > 0 && <span className="team-count">{teams.length} teams</span>}
              </motion.div>

              {/* Login Form */}
              <form 
                className="login-form-modern" 
                onSubmit={(e) => { e.preventDefault(); handleLogin(); }}
              >
                <div className="form-field">
                  <label htmlFor="username">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                    Team Username
                  </label>
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    placeholder="e.g., royalchallengers"
                    disabled={isLoading}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="password">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                    </svg>
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your team password"
                    disabled={isLoading}
                    autoComplete="current-password"
                  />
                </div>

                {loginError && (
                  <motion.div 
                    className="login-error-modern"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    {loginError}
                  </motion.div>
                )}

                <motion.button
                  type="submit"
                  className="login-button-modern"
                  disabled={isLoading || !username || !password}
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ scale: 1.02 }}
                >
                  {isLoading ? (
                    <span className="loading-spinner" />
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z"/>
                      </svg>
                      Login to Bid
                    </>
                  )}
                </motion.button>
              </form>

              {/* Credentials Help Section */}
              <div className="login-help-section">
                <motion.button
                  type="button"
                  className="credentials-hint-toggle"
                  onClick={() => setShowCredentialsHint(!showCredentialsHint)}
                  whileTap={{ scale: 0.98 }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>
                  </svg>
                  {showCredentialsHint ? 'Hide Login Help' : 'Need Help Logging In?'}
                </motion.button>

                <AnimatePresence>
                  {showCredentialsHint && (
                    <motion.div
                      className="credentials-hint-panel"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="hint-header">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                        </svg>
                        How to Login
                      </div>
                      <div className="hint-content">
                        <p><strong>Username:</strong> Your team name (lowercase, no spaces)</p>
                        <p><strong>Password:</strong> Your username + "123"</p>
                        <div className="hint-example">
                          <span className="example-label">Example:</span>
                          <div className="example-row">
                            <span className="example-field">Username:</span>
                            <code>royalchallengers</code>
                          </div>
                          <div className="example-row">
                            <span className="example-field">Password:</span>
                            <code>royalchallengers123</code>
                          </div>
                        </div>
                      </div>
                      
                      {/* Show available teams if connected */}
                      {teams.length > 0 && (
                        <div className="available-teams">
                          <div className="teams-header">Available Teams:</div>
                          <div className="teams-list">
                            {runtimeCredentials.slice(0, 6).map((cred, idx) => (
                              <button
                                key={cred.teamId || idx}
                                type="button"
                                className="team-quick-fill"
                                onClick={() => {
                                  setUsername(cred.username);
                                  setPassword(cred.password);
                                  setPreviewTeamId(cred.teamId);
                                }}
                                style={{ 
                                  borderColor: cred.primaryColor,
                                  '--team-color': cred.primaryColor 
                                } as React.CSSProperties}
                              >
                                <span className="team-name">{cred.teamName}</span>
                                <span className="tap-hint">Tap to fill</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <motion.div
              className="scout-screen"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div className="scout-topbar">
                <div className="scout-brand">CRICKET ARENA</div>
                <button
                  type="button"
                  className="scout-login-cta"
                  onClick={() => setLoginScreen('access')}
                >
                  Go to Login
                </button>
              </div>

              <div className="scout-nav-links" role="navigation" aria-label="Scout navigation">
                <button type="button" className="scout-link">Lobby</button>
                <button type="button" className="scout-link active">Stats</button>
                <button type="button" className="scout-link">Squads</button>
                <button type="button" className="scout-link">Board</button>
              </div>

              <div className="scout-main-grid">
                <div className="scout-hero-card">
                  <p className="scout-tag">{currentPlayer ? 'Live Prospect' : 'No Active Listing'}</p>
                  <h2>{scoutPlayerName}</h2>
                  <p className="scout-role">{scoutPlayerRole}</p>
                  {currentPlayer ? (
                    <div className="scout-price-row">
                      <div>
                        <span>Base Price</span>
                        <strong>{formatLakhs(scoutBasePrice)}</strong>
                      </div>
                      <div>
                        <span>Current Bid</span>
                        <strong>{formatLakhs(scoutCurrentBid)}</strong>
                      </div>
                    </div>
                  ) : (
                    <p className="scout-empty-note">No listing for auction right now. Once the auctioneer pushes a player lot, stats will appear here automatically.</p>
                  )}
                </div>

                <div className="scout-side-panel">
                  <article className="scout-summary-card">
                    <span>Teams in Auction</span>
                    <strong>{totalTeams}</strong>
                  </article>
                  <article className="scout-summary-card">
                    <span>Slots Filled</span>
                    <strong>{filledSlots}{totalSlots > 0 ? ` / ${totalSlots}` : ''}</strong>
                  </article>
                  <article className="scout-summary-card featured">
                    <span>Progress</span>
                    <strong>{progressPct}%</strong>
                  </article>
                </div>
              </div>

              <div className="scout-stats-grid">
                <article className="scout-stat-tile">
                  <span>Total Matches</span>
                  <strong>{scoutMatches}</strong>
                </article>
                <article className="scout-stat-tile featured">
                  <span>Total Runs</span>
                  <strong>{scoutRuns}</strong>
                </article>
                <article className="scout-stat-tile">
                  <span>Wickets</span>
                  <strong>{scoutWickets}</strong>
                </article>
                <article className="scout-stat-tile">
                  <span>Avg Purse</span>
                  <strong>{formatLakhs(avgPurse)}</strong>
                </article>
              </div>

              {!currentPlayer && sponsors.length > 0 && (
                <div className="scout-sponsors-card">
                  <div className="scout-history-head">
                    <h3>Digital Sponsors</h3>
                    <span>Live Showcase</span>
                  </div>
                  <div className="scout-sponsor-list">
                    {sponsors.map((sponsor) => (
                      <div key={sponsor.id} className="scout-sponsor-item">
                        <span>{sponsor.name}</span>
                        {sponsor.tier && <small>{sponsor.tier}</small>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="scout-history-card">
                <div className="scout-history-head">
                  <h3>Top Teams Snapshot</h3>
                  <span>{richestTeam ? `${richestTeam.name} leads purse` : 'Awaiting team updates'}</span>
                </div>
                <ul className="scout-history-list">
                  {historyRows.length > 0 ? historyRows.map((team) => (
                    <li key={team.id}>
                      <span>{team.playersBought || 0} picks</span>
                      <span>{team.name}</span>
                      <strong>{formatLakhs(team.remainingPurse || 0)}</strong>
                    </li>
                  )) : (
                    <li>
                      <span>0 picks</span>
                      <span>No teams synced yet</span>
                      <strong>{formatLakhs(0)}</strong>
                    </li>
                  )}
                </ul>
              </div>

              <div className="scout-bottom-nav">
                <button type="button">Auction</button>
                <button type="button" className="active">Stats</button>
                <button type="button">Squad</button>
                <button type="button">Rank</button>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Footer */}
        <div className="login-footer">
          <p>powered by <b>NJS Creative Labs</b></p>
        </div>
      </div>
    );
  }

  // Main bidding interface
  return (
    <div
      className="mobile-bidding-container"
      style={{
        background: `linear-gradient(135deg, ${session.primaryColor} 0%, ${session.secondaryColor} 100%)`,
      }}
    >
      <AnimatePresence>
        {showWinCelebration && winCelebrationData && (
          <motion.div
            className="win-celebration-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="win-celebration-backdrop" aria-hidden="true" />
            <div className="fireworks-layer" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, index) => (
                <motion.span
                  key={`fw-${index}`}
                  className="firework-dot"
                  style={{
                    '--x': `${Math.cos((index / 18) * Math.PI * 2) * (80 + (index % 3) * 25)}px`,
                    '--y': `${Math.sin((index / 18) * Math.PI * 2) * (80 + (index % 4) * 20)}px`,
                  } as React.CSSProperties}
                  initial={{ opacity: 0, scale: 0.2 }}
                  animate={{ opacity: [0, 1, 0], x: 'var(--x)', y: 'var(--y)', scale: [0.2, 1, 0.5] }}
                  transition={{ duration: 1.1, delay: (index % 6) * 0.06, repeat: 2 }}
                />
              ))}
            </div>
            <motion.div
              className="win-celebration-card"
              initial={{ y: 24, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 14, scale: 0.95 }}
            >
              <h2>Congratulations!</h2>
              <p>You won <strong>{winCelebrationData.player}</strong></p>
              <div className="win-celebration-amount">₹{winCelebrationData.amount}L</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bidding-header">
        <div className="team-info">
          <div className="team-badge-container">
            {myTeam?.logoUrl && (
              <TeamLogo 
                logoUrl={myTeam.logoUrl} 
                teamName={session.teamName}
                size="sm"
              />
            )}
            <span className="team-badge">{session.teamName}</span>
          </div>
          <span className="bid-count">{bidCount} bids placed</span>
        </div>
        <div className="header-actions">
          {/* Manual Refresh Button */}
          <motion.button
            className="refresh-button"
            onClick={handleManualRefresh}
            whileTap={{ scale: 0.95 }}
            title="Refresh connection"
          >
            <IoRefresh size={20} />
          </motion.button>
          {/* Motion Sensor Toggle Button */}
          {motionSupported && (
            <motion.button
              className={`motion-sensor-button ${motionActive ? 'active' : ''}`}
              onClick={handleToggleMotionSensor}
              whileTap={{ scale: 0.95 }}
              title={motionActive ? 'Gesture bidding active' : 'Enable gesture bidding'}
            >
              <IoSwapVertical size={20} />
            </motion.button>
          )}
          {/* Team Menu Button */}
          <motion.button
            className="team-menu-button"
            onClick={() => setShowTeamMenu(true)}
            whileTap={{ scale: 0.95 }}
            title="View team credentials"
          >
            <IoPeople size={20} />
          </motion.button>
          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Motion Sensor Indicator */}
      <AnimatePresence>
        {motionActive && (
          <motion.div
            className="motion-sensor-indicator"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="indicator-content">
              <motion.div
                className="motion-pulse"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <IoSwapVertical size={16} />
              </motion.div>
              <span className="indicator-text">Gesture bidding enabled - Raise your phone to bid</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connection Status - Enhanced for live view */}
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? (
          <>
            <IoWifi size={16} />
            <span>Connected to Live</span>
          </>
        ) : (
          <>
            <IoWifiOutline size={16} />
            <span>Connecting to Live...</span>
          </>
        )}
        <span className="last-update">Updated: {formattedTime}</span>
      </div>

      <section className="auction-overlay-dock" aria-label="Live auction overlays">
        <div className="auction-overlay-tabs" role="tablist" aria-label="Auction insights tabs">
          <button
            type="button"
            role="tab"
            aria-selected={liveOverlayTab === 'budget'}
            className={`overlay-tab-button ${liveOverlayTab === 'budget' ? 'active' : ''}`}
            onClick={() => setLiveOverlayTab('budget')}
          >
            Team Budget
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={liveOverlayTab === 'player'}
            className={`overlay-tab-button ${liveOverlayTab === 'player' ? 'active' : ''}`}
            onClick={() => setLiveOverlayTab('player')}
          >
            Player Stats
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={liveOverlayTab === 'epl'}
            className={`overlay-tab-button ${liveOverlayTab === 'epl' ? 'active' : ''}`}
            onClick={() => setLiveOverlayTab('epl')}
          >
            EPL Insights
          </button>
        </div>

        <AnimatePresence mode="wait">
          {liveOverlayTab === 'budget' && (
            <motion.div
              key="overlay-budget"
              className="auction-overlay-panel"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="overlay-panel-grid">
                <article className="overlay-metric-card">
                  <span>My Purse</span>
                  <strong>₹{myTeam?.remainingPurse?.toFixed(1) || '0.0'}L</strong>
                </article>
                <article className="overlay-metric-card">
                  <span>Max Raise Potential</span>
                  <strong>₹{maxAffordableBid}L</strong>
                </article>
                <article className="overlay-metric-card">
                  <span>Roster Progress</span>
                  <strong>{myTeam?.playersBought || 0}/{myTeam?.totalPlayerThreshold || 25}</strong>
                </article>
              </div>
            </motion.div>
          )}

          {liveOverlayTab === 'player' && (
            <motion.div
              key="overlay-player"
              className="auction-overlay-panel"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {currentPlayer ? (
                <div className="overlay-panel-grid">
                  <article className="overlay-metric-card">
                    <span>Base Price</span>
                    <strong>₹{currentPlayer.basePrice || 0}L</strong>
                  </article>
                  <article className="overlay-metric-card">
                    <span>Current / Base</span>
                    <strong>{bidVsBase}x</strong>
                  </article>
                  <article className="overlay-metric-card">
                    <span>Matches</span>
                    <strong>{currentPlayer.matches || '--'}</strong>
                  </article>
                  <article className="overlay-metric-card">
                    <span>Runs</span>
                    <strong>{currentPlayer.runs || '--'}</strong>
                  </article>
                  <article className="overlay-metric-card">
                    <span>Wickets</span>
                    <strong>{currentPlayer.wickets || '--'}</strong>
                  </article>
                  <article className="overlay-metric-card">
                    <span>Role</span>
                    <strong>{currentPlayer.role || '--'}</strong>
                  </article>
                </div>
              ) : (
                <div className="overlay-empty-state">
                  <p className="overlay-note">No listing for auction. Start the next lot to see player analytics.</p>
                  {sponsors.length > 0 && (
                    <div className="overlay-sponsor-strip">
                      {sponsors.slice(0, 3).map((sponsor) => (
                        <span key={sponsor.id}>{sponsor.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {liveOverlayTab === 'epl' && (
            <motion.div
              key="overlay-epl"
              className="auction-overlay-panel"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="overlay-panel-grid">
                <article className="overlay-metric-card">
                  <span>Auction Progress</span>
                  <strong>{auctionProgress}%</strong>
                </article>
                <article className="overlay-metric-card">
                  <span>Avg Team Purse</span>
                  <strong>₹{averagePurse.toFixed(1)}L</strong>
                </article>
                <article className="overlay-metric-card">
                  <span>Current Highest Live Bid</span>
                  <strong>₹{currentBid || 0}L</strong>
                </article>
              </div>
              <div className="overlay-history-list">
                {liveTopPurseTeams.length > 0 ? liveTopPurseTeams.map((team) => (
                  <div key={team.id} className="overlay-history-row">
                    <span>{team.name}</span>
                    <span>{team.playersBought || 0} picks</span>
                    <strong>₹{team.remainingPurse?.toFixed(1) || '0.0'}L</strong>
                  </div>
                )) : (
                  <p className="overlay-note">Team analytics not synced yet.</p>
                )}
              </div>
              <p className="overlay-note">Historical last-year EPL dataset is not yet synced in this mobile feed; this tab shows current-season live insights.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Current Player Info */}
      <div className="player-info-card">
        {currentPlayer ? (
          <>
            <div className="player-image-container">
              <PlayerImage 
                imageUrl={currentPlayer.imageUrl || ''} 
                playerName={currentPlayer.name}
                size="lg"
                className={currentPlayer.imageUrl ? 'mobile-player-image' : 'player-placeholder'}
              />
            </div>
            <h2 className="player-name">{currentPlayer.name}</h2>
            <p className="player-role">{currentPlayer.role}</p>
            <div className="current-bid-display">
              <span className="bid-label">Current Bid</span>
              <span className="bid-amount">₹{currentBid}L</span>
            </div>
            {selectedTeam && (
              <div className={`leading-team ${isMyBid ? 'is-my-bid' : ''}`}>
                <div className="leading-team-info">
                  {selectedTeam.logoUrl && (
                    <TeamLogo 
                      logoUrl={selectedTeam.logoUrl} 
                      teamName={selectedTeam.name}
                      size="sm"
                    />
                  )}
                  <span>Leading: {selectedTeam.name}</span>
                </div>
                {isMyBid && <span className="my-bid-badge">YOUR BID</span>}
              </div>
            )}
          </>
        ) : lastSoldPlayer ? (
          <div className={`sold-message ${lastSoldPlayer.winnerTeam === session?.teamName ? 'won' : 'lost'}`}>
            {lastSoldPlayer.winnerTeam === session?.teamName ? (
              <>
                <motion.div
                  className="celebration-icon"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', duration: 0.6 }}
                >
                  🎉
                </motion.div>
                <motion.h2
                  className="sold-title congrats"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  Congratulations!
                </motion.h2>
                <motion.p
                  className="sold-subtitle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  You won the bid for <strong>{lastSoldPlayer.name}</strong>
                </motion.p>
                <motion.div
                  className="sold-amount"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5, type: 'spring' }}
                >
                  ₹{lastSoldPlayer.amount}L
                </motion.div>
              </>
            ) : (
              <>
                <motion.div
                  className="motivation-icon"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  🎯
                </motion.div>
                <motion.h2
                  className="sold-title motivation"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  Better Player Ahead
                </motion.h2>
                <motion.p
                  className="sold-subtitle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <strong>{lastSoldPlayer.winnerTeam}</strong> won the bid for {lastSoldPlayer.name}
                </motion.p>
                <motion.p
                  className="motivation-text"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  {motivationQuotes[Math.abs(Math.floor(lastSoldPlayer.amount + currentBid)) % motivationQuotes.length]}
                </motion.p>
              </>
            )}
            <motion.p
              className="waiting-hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              Waiting for next player...
            </motion.p>
          </div>
        ) : (
          <div className="no-player">
            <GiCricketBat size={64} color="rgba(255,255,255,0.3)" />
            <p>Waiting for next player...</p>
            <p className="hint">The auction master will start the bidding</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <motion.button
          className="bid-button raise-bid"
          onClick={handleRaiseBid}
          disabled={!currentPlayer || !isConnected}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
        >
          <span className="button-icon">⬆️</span>
          <span className="button-text">RAISE BID</span>
          <span className="button-amount">+₹100L</span>
        </motion.button>

        <motion.button
          className="bid-button stop-bid"
          onClick={handleStopBidding}
          disabled={!currentPlayer || !isMyBid}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
        >
          <span className="button-icon">✋</span>
          <span className="button-text">STOP BIDDING</span>
        </motion.button>
      </div>

      {/* Feedback Toast */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            className={`feedback-toast feedback-${feedback.type}`}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
          >
            {feedback.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Team Stats */}
      {myTeam && (
        <div className="team-stats">
          <div className="stat-item">
            <span className="stat-label">Budget</span>
            <span className="stat-value">₹{myTeam.remainingPurse?.toFixed(1) || '0'}L</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Players</span>
            <span className="stat-value">{myTeam.playersBought || 0}/{myTeam.totalPlayerThreshold || 25}</span>
          </div>
        </div>
      )}

      {/* Team Menu Modal - Show credentials and info during bidding */}
      <AnimatePresence>
        {showTeamMenu && (
          <motion.div
            className="team-menu-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowTeamMenu(false)}
          >
            <motion.div
              className="team-menu-modal"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="menu-header">
                <h3>Auction Teams & Credentials</h3>
                <button className="menu-close" onClick={() => setShowTeamMenu(false)}>✕</button>
              </div>

              <div className="teams-menu-list">
                {runtimeCredentials.map((cred) => (
                  <motion.div
                    key={cred.teamId}
                    className={`team-menu-item ${selectedMenuTeam === cred.teamId ? 'selected' : ''}`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <button
                      className="team-menu-select"
                      onClick={() => setSelectedMenuTeam(cred.teamId)}
                      style={{ borderColor: cred.primaryColor }}
                    >
                      <span className="team-menu-name">{cred.teamName}</span>
                      <span className={`team-connection-status ${myTeam?.id === cred.teamId ? 'connected' : ''}`}>
                        {myTeam?.id === cred.teamId ? '✓ Connected' : 'Available'}
                      </span>
                    </button>

                    {/* Expandable credentials section */}
                    <AnimatePresence>
                      {selectedMenuTeam === cred.teamId && (
                        <motion.div
                          className="team-menu-details"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <div className="credential-row">
                            <span className="credential-label">Username:</span>
                            <code className="credential-value">{cred.username}</code>
                          </div>
                          <div className="credential-row">
                            <span className="credential-label">Password:</span>
                            <code className="credential-value">{cred.password}</code>
                          </div>
                          <div className="credential-row">
                            <span className="credential-label">Team ID:</span>
                            <code className="credential-value">{cred.teamId}</code>
                          </div>
                          <motion.button
                            className="copy-credentials-btn"
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              const text = `Username: ${cred.username}\nPassword: ${cred.password}`;
                              navigator.clipboard.writeText(text);
                              setFeedback({
                                type: 'success',
                                message: 'Credentials copied!',
                                timestamp: Date.now(),
                              });
                            }}
                          >
                            📋 Copy Credentials
                          </motion.button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>

              <div className="menu-footer">
                <p className="menu-info">
                  📱 Share these credentials with your team members to let them bid from other devices.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MobileBiddingLivePage;
