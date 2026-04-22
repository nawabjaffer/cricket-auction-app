// ============================================================================
// MOBILE BIDDING LIVE PAGE - Redesigned
// Real-time mobile interface for teams to raise bids
// Uses Firebase Realtime Database for cross-device synchronization
// Responsive: mobile / tablet / desktop
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GiCricketBat } from 'react-icons/gi';
import { IoSwapVertical, IoRefresh, IoPeople, IoChevronDown, IoSearch, IoClose, IoFlash, IoPersonCircle, IoList, IoTrophy, IoWallet, IoStatsChart, IoEllipsisHorizontal } from 'react-icons/io5';
import { authService } from '../services';
import type { AuthSession } from '../services';
import { auctionPersistence, type SponsorRecord } from '../services/auctionPersistence';
import { realtimeSync } from '../services/realtimeSync';
import { onValue, ref } from 'firebase/database';
import { tenantPath } from '../services/tenantPath';
import { useRealtimeMobileSync } from '../hooks/useRealtimeSync';
import { useMotionSensor } from '../hooks/useMotionSensor';
import { TeamLogo } from '../components/TeamLogo/TeamLogo';
import { PlayerImage } from '../components/PlayerImage/PlayerImage';
import { getRoleBasedStats, getRoleLabel, getRoleBadgeClass } from '../utils/playerStats';
import { parseRoleDetails, getRoleBadgeColor } from '../utils/roleFormatter';
import type { Player } from '../types';
import '../components/MobileBidding/MobileBidding.css';

interface BidFeedback {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timestamp: number;
}

type LoginScreen = 'access' | 'scout';
type MainTab = 'live' | 'myteam' | 'players';
type StatsView = 'batting' | 'bowling';

interface ExpandedPlayerStats {
  player: Player;
  statsView: StatsView;
}

const TAB_CONFIG: { key: MainTab; label: string; icon: typeof IoFlash }[] = [
  { key: 'live', label: 'Live', icon: IoFlash },
  { key: 'myteam', label: 'My Team', icon: IoPersonCircle },
  { key: 'players', label: 'Players', icon: IoList },
];

export function MobileBiddingLivePage() {
  const [session, setSession] = useState<AuthSession | null>(authService.getSession());
  const [username, setUsername] = useState('');
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
        logoUrl: team.logoUrl || '',
      };
    });
  }, [teams]);

  const [loginScreen, setLoginScreen] = useState<LoginScreen>('access');
  const [previewTeamId, setPreviewTeamId] = useState<string | null>(null);
  const [showTeamMenu, setShowTeamMenu] = useState(false);
  const [selectedMenuTeam, setSelectedMenuTeam] = useState<string | null>(null);
  const [_sponsors, setSponsors] = useState<SponsorRecord[]>([]);
  const [showWinCelebration, setShowWinCelebration] = useState(false);
  const [winCelebrationData, setWinCelebrationData] = useState<{ player: string; amount: number } | null>(null);
  const lastCelebrationKeyRef = useRef<string | null>(null);

  // New tab & data states
  const [activeTab, setActiveTab] = useState<MainTab>('live');
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [soldRecords, setSoldRecords] = useState<{ id: string; teamName: string; soldAmount: number }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [expandedPlayer, setExpandedPlayer] = useState<ExpandedPlayerStats | null>(null);
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const [showTopBuysCarousel, setShowTopBuysCarousel] = useState(false);
  const [topBuysIndex, setTopBuysIndex] = useState(0);
  const [scoutSearch, setScoutSearch] = useState('');
  const [scoutRoleFilter, setScoutRoleFilter] = useState<string>('all');

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

  // Real-time subscription for players & sold records (Scout / My Team / Players tabs)
  useEffect(() => {
    let cancelled = false;
    let unsubPlayers: (() => void) | null = null;
    let unsubSold: (() => void) | null = null;

    const setup = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db || cancelled) return;
        auctionPersistence.initialize(db);

        // Subscribe to admin players — live updates
        const playersRef = ref(db, tenantPath('auction/adminPlayers'));
        unsubPlayers = onValue(playersRef, (snap) => {
          if (cancelled) return;
          if (snap.exists()) {
            const raw = snap.val();
            const arr: unknown[] = Array.isArray(raw) ? raw : Object.values(raw ?? {});
            const players = arr.filter(
              (p): p is Player => p != null && typeof p === 'object' && 'id' in (p as Record<string, unknown>)
            );
            setAllPlayers(players);
          }
          if (!playersLoaded) setPlayersLoaded(true);
        });

        // Subscribe to sold players — live updates
        const soldRef = ref(db, tenantPath('auction/soldPlayers'));
        unsubSold = onValue(soldRef, (snap) => {
          if (cancelled) return;
          if (snap.exists()) {
            const data = snap.val();
            const records = (Object.values(data) as Array<{ id: string; teamName: string; soldAmount: number }>)
              .map(s => ({ id: s.id, teamName: s.teamName, soldAmount: s.soldAmount }));
            setSoldRecords(records);
          } else {
            setSoldRecords([]);
          }
        });
      } catch {
        // Silently fallback — mark as loaded so UI doesn't stay in loading state
        if (!cancelled && !playersLoaded) setPlayersLoaded(true);
      }
    };

    setup();
    return () => {
      cancelled = true;
      unsubPlayers?.();
      unsubSold?.();
    };
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

  // Username-only team login (password auto-resolved from credentials)
  const handleTeamLogin = useCallback(async (cred: typeof runtimeCredentials[0]) => {
    setIsLoading(true);
    setLoginError('');
    setPreviewTeamId(cred.teamId);
    try {
      const result = await authService.login(cred.username, cred.password);
      if (result.success && result.session) {
        setSession(result.session);
        setFeedback({ type: 'success', message: `Welcome, ${result.session.teamName}!`, timestamp: Date.now() });
      } else {
        setLoginError(result.error || 'Login failed');
      }
    } catch {
      setLoginError('Connection error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Login by username only — auto-resolve password from credentials
  const handleLogin = useCallback(async () => {
    if (!username) { setLoginError('Enter team username'); return; }
    const matchingCred = runtimeCredentials.find(c => c.username.toLowerCase() === username.toLowerCase());
    if (!matchingCred) { setLoginError('Team not found. Check the username.'); return; }
    setIsLoading(true);
    setLoginError('');
    try {
      const result = await authService.login(matchingCred.username, matchingCred.password);
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
  }, [username, runtimeCredentials]);

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

  // My team's acquired squad
  const mySquad = useMemo(() => {
    if (!session || allPlayers.length === 0) return [];
    return soldRecords
      .filter(s => s.teamName === session.teamName)
      .map(s => {
        const player = allPlayers.find(p => p.id === s.id);
        return player ? { ...player, soldAmount: s.soldAmount } : null;
      })
      .filter(Boolean) as (Player & { soldAmount: number })[];
  }, [session, allPlayers, soldRecords]);

  const spentAmount = useMemo(() => mySquad.reduce((sum, p) => sum + p.soldAmount, 0), [mySquad]);

  // Budget usage percentage
  const budgetPct = useMemo(() => {
    if (!myTeam) return 0;
    const total = myTeam.allocatedAmount || (myTeam.remainingPurse + spentAmount);
    return total > 0 ? Math.round((spentAmount / total) * 100) : 0;
  }, [myTeam, spentAmount]);

  // ── Team Analytics (for My Team tab) ──
  const myTeamRoleBalance = useMemo(() => {
    const roleCount = { batting: 0, bowling: 0, fielding: 0 };
    mySquad.forEach((player) => {
      const r = (player.role || '').toLowerCase().trim();
      if (r.includes('bat')) roleCount.batting += 1;
      if (r.includes('bowl')) roleCount.bowling += 1;
      if (r.includes('all')) { roleCount.batting += 1; roleCount.bowling += 1; }
      if (r.includes('wicket')) roleCount.fielding += 2;
      else roleCount.fielding += 1;
    });
    const total = Math.max(roleCount.batting + roleCount.bowling + roleCount.fielding, 1);
    return {
      batting: Math.round((roleCount.batting / total) * 100),
      bowling: Math.round((roleCount.bowling / total) * 100),
      fielding: Math.round((roleCount.fielding / total) * 100),
    };
  }, [mySquad]);

  const myTeamTopPicks = useMemo(
    () => [...mySquad].sort((a, b) => b.soldAmount - a.soldAmount).slice(0, 3),
    [mySquad],
  );

  const myTeamMaxBid = useMemo(() => {
    if (!myTeam) return 0;
    const slotsLeft = (myTeam.totalPlayerThreshold || 25) - (myTeam.playersBought || 0);
    if (slotsLeft <= 0) return 0;
    // Reserve 0.5L per remaining slot (except current)
    const reserved = Math.max(slotsLeft - 1, 0) * 0.5;
    return Math.max((myTeam.remainingPurse || 0) - reserved, 0);
  }, [myTeam]);

  const myTeamBudgetStatus = useMemo(() => {
    if (!myTeam) return 'safe' as const;
    const pct = budgetPct;
    if (pct >= 85) return 'danger' as const;
    if (pct >= 65) return 'warning' as const;
    return 'safe' as const;
  }, [myTeam, budgetPct]);

  // Filtered player list for search
  const filteredPlayers = useMemo(() => {
    if (allPlayers.length === 0) return [];
    let filtered = allPlayers;
    if (roleFilter !== 'all') {
      filtered = filtered.filter(p => (p.role || '').toLowerCase().includes(roleFilter.toLowerCase()));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [allPlayers, searchQuery, roleFilter]);

  // Unique roles for filter
  const availableRoles = useMemo(() => {
    const roles = new Set(allPlayers.map(p => getRoleLabel(p.role)));
    return ['all', ...Array.from(roles)];
  }, [allPlayers]);

  // Top 3 buys across all teams (sorted by amount desc)
  const topBuys = useMemo(() => {
    if (allPlayers.length === 0 || soldRecords.length === 0) return [];
    return [...soldRecords]
      .sort((a, b) => b.soldAmount - a.soldAmount)
      .slice(0, 3)
      .map(s => {
        const player = allPlayers.find(p => p.id === s.id);
        const team = teams.find(t => t.name === s.teamName);
        const cred = runtimeCredentials.find(c => c.teamId === team?.id);
        return {
          ...s,
          player,
          team,
          primaryColor: cred?.primaryColor || team?.primaryColor || '#3b82f6',
          secondaryColor: cred?.secondaryColor || team?.secondaryColor || '#1e40af',
          logoUrl: team?.logoUrl || cred?.logoUrl || '',
        };
      });
  }, [allPlayers, soldRecords, teams, runtimeCredentials]);

  // Available (unsold) players for scout view
  const availablePlayers = useMemo(() => {
    const soldIds = new Set(soldRecords.map(s => s.id));
    let available = allPlayers.filter(p => !soldIds.has(p.id));
    if (scoutRoleFilter !== 'all') {
      available = available.filter(p => getRoleLabel(p.role).toLowerCase() === scoutRoleFilter.toLowerCase());
    }
    if (scoutSearch.trim()) {
      const q = scoutSearch.toLowerCase();
      available = available.filter(p => p.name.toLowerCase().includes(q));
    }
    return available;
  }, [allPlayers, soldRecords, scoutRoleFilter, scoutSearch]);

  // Keyboard shortcut: "n" to open top buys carousel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'n' || e.key === 'N') {
        if (topBuys.length > 0) {
          setShowTopBuysCarousel(prev => !prev);
          setTopBuysIndex(0);
          
        }
      }
      // Left/right arrow to navigate carousel
      if (showTopBuysCarousel) {
        if (e.key === 'ArrowRight') setTopBuysIndex(prev => Math.min(prev + 1, topBuys.length - 1));
        if (e.key === 'ArrowLeft') setTopBuysIndex(prev => Math.max(prev - 1, 0));
        if (e.key === 'Escape') { setShowTopBuysCarousel(false);  }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [topBuys.length, showTopBuysCarousel]);

  // Render full batting + bowling stats panel for a player
  const renderFullStatsPanel = (player: Player, statsView: StatsView, setView: (v: StatsView) => void) => {
    const bs = player.battingStats;
    const bw = player.bowlingStats;

    return (
      <div className="cb-stats-panel">
        <div className="cb-stats-toggle">
          <button className={`cb-stats-toggle-btn ${statsView === 'batting' ? 'active' : ''}`} onClick={() => setView('batting')}>
            Batting
          </button>
          <button className={`cb-stats-toggle-btn ${statsView === 'bowling' ? 'active' : ''}`} onClick={() => setView('bowling')}>
            Bowling
          </button>
        </div>

        {statsView === 'batting' ? (
          <div className="cb-stats-table">
            {[
              ['Matches', bs?.matches || player.matches || '--'],
              ['Innings', bs?.innings || '--'],
              ['Not Out', bs?.notOut || '--'],
              ['Runs', bs?.runs || player.runs || '--'],
              ['Highest Score', bs?.highestScore || '--'],
              ['Average', bs?.average || '--'],
              ['Strike Rate', bs?.strikeRate || '--'],
              ['30s', bs?.thirties || '--'],
              ['50s', bs?.fifties || '--'],
              ['100s', bs?.hundreds || '--'],
              ['4s', bs?.fours || '--'],
              ['6s', bs?.sixes || '--'],
              ['Best', player.battingBestFigures || '--'],
            ].map(([label, value]) => (
              <div key={label} className="cb-stats-row">
                <span className="cb-stats-row-label">{label}</span>
                <span className="cb-stats-row-value">{value}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="cb-stats-table">
            {[
              ['Matches', bw?.matches || player.matches || '--'],
              ['Innings', bw?.innings || '--'],
              ['Overs', bw?.overs || '--'],
              ['Maidens', bw?.maidens || '--'],
              ['Runs', bw?.runs || '--'],
              ['Wickets', bw?.wickets || player.wickets || '--'],
              ['Best Bowling', bw?.bestBowling || player.bowlingBestFigures || '--'],
              ['3W Hauls', bw?.threeWickets || '--'],
              ['5W Hauls', bw?.fiveWickets || '--'],
              ['Economy', bw?.economy || '--'],
              ['Strike Rate', bw?.strikeRate || '--'],
              ['Average', bw?.average || '--'],
            ].map(([label, value]) => (
              <div key={label} className="cb-stats-row">
                <span className="cb-stats-row-label">{label}</span>
                <span className="cb-stats-row-value">{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════ LOGIN SCREEN ═══════════════
  if (!session) {
    const previewTeam = runtimeCredentials.find((team) => team.teamId === previewTeamId) || runtimeCredentials[0];
    const themePrimary = previewTeam?.primaryColor || '#e4be75';
    const themeSecondary = previewTeam?.secondaryColor || '#24467c';

    // Compute auction-wide stats for login dashboard
    const totalPlayersSold = teams.reduce((s, t) => s + (t.playersBought || 0), 0);
    const totalMoneySpent = teams.reduce((s, t) => s + ((t.allocatedAmount || 0) - t.remainingPurse), 0);
    const topBuyTeam = [...teams].sort((a, b) => (b.highestBid || 0) - (a.highestBid || 0))[0];
    const teamsByPlayers = [...teams].sort((a, b) => (b.playersBought || 0) - (a.playersBought || 0));

    return (
      <div
        className="cb-login-page"
        style={{ '--cb-primary': themePrimary, '--cb-secondary': themeSecondary } as React.CSSProperties}
      >
        <div className="cb-login-bg" />

        <div className="cb-login-scroll">
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

            {loginScreen === 'access' ? (
              <>
                <div className="cb-login-brand">
                  <motion.div className="cb-login-icon" initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}>
                    <GiCricketBat size={44} color="#fff" />
                  </motion.div>
                  <h1>Auction Bidding</h1>
                  <p>Select your team to join</p>
                </div>

                <div className={`cb-status-pill ${isConnected ? 'live' : ''}`}>
                  <span className="cb-status-dot" />
                  <span>{isConnected ? 'Auction Live' : 'Waiting for auction...'}</span>
                  {teams.length > 0 && <span className="cb-team-count">{teams.length} teams</span>}
                </div>

                {/* Team cards — tap to login (username-based, no password) */}
                {runtimeCredentials.length > 0 && (
                  <div className="cb-team-card-grid">
                    {runtimeCredentials.map((cred) => {
                      const teamData = teams.find(t => t.id === cred.teamId);
                      return (
                        <motion.button
                          key={cred.teamId}
                          type="button"
                          className={`cb-team-card-btn ${previewTeam?.teamId === cred.teamId ? 'active' : ''}`}
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
                          {teamData && (
                            <span className="cb-team-card-meta">
                              {teamData.playersBought || 0} players &middot; {formatLakhs(teamData.remainingPurse)}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {loginError && (
                  <motion.div className="cb-error" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                    {loginError}
                  </motion.div>
                )}

                {/* Manual username login */}
                <details className="cb-manual-login">
                  <summary>Enter username manually</summary>
                  <form className="cb-login-form" onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
                    <div className="cb-field">
                      <input
                        type="text" id="cb-username" value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                        placeholder="Team username (e.g. royal)"
                        disabled={isLoading} autoComplete="username" autoCapitalize="none"
                      />
                    </div>
                    <motion.button
                      type="submit" className="cb-login-btn"
                      disabled={isLoading || !username}
                      whileTap={{ scale: 0.98 }}
                    >
                      {isLoading ? <span className="cb-spinner" /> : 'Join Team'}
                    </motion.button>
                  </form>
                </details>
              </>
            ) : (
              /* ── Scout Screen — Available Players ── */
              <div className="cb-scout">
                <div className="cb-scout-header">
                  <span className="cb-scout-brand">PLAYER SCOUT</span>
                  <button type="button" className="cb-scout-login-cta" onClick={() => setLoginScreen('access')}>Go to Login</button>
                </div>

                {/* Live auction player (if active) */}
                {currentPlayer && (
                  <div className="cb-scout-live-highlight">
                    <span className="cb-scout-live-badge"><span className="cb-live-pulse" /> Now Bidding</span>
                    <div className="cb-scout-player compact">
                      <div className="cb-scout-player-header">
                        <h2>{currentPlayer.name}</h2>
                        <span className={`cb-role-badge ${getRoleBadgeClass(currentPlayer.role)}`}>{getRoleLabel(currentPlayer.role)}</span>
                      </div>
                      <div className="cb-scout-price-row">
                        <div><span>Base Price</span><strong>{formatLakhs(currentPlayer.basePrice || 0)}</strong></div>
                        <div><span>Current Bid</span><strong>{formatLakhs(currentBid)}</strong></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Search & filter for available players */}
                <div className="cb-scout-filters">
                  <div className="cb-scout-search-bar">
                    <IoSearch size={16} />
                    <input
                      type="text"
                      placeholder="Search available players..."
                      value={scoutSearch}
                      onChange={(e) => setScoutSearch(e.target.value)}
                    />
                    {scoutSearch && (
                      <button className="cb-search-clear" onClick={() => setScoutSearch('')}><IoClose size={14} /></button>
                    )}
                  </div>
                  <div className="cb-scout-role-chips">
                    {availableRoles.map((role) => (
                      <button
                        key={role}
                        className={`cb-role-chip ${scoutRoleFilter === role ? 'active' : ''}`}
                        onClick={() => setScoutRoleFilter(role)}
                      >{role === 'all' ? 'All' : role}</button>
                    ))}
                  </div>
                </div>

                <div className="cb-scout-count">
                  {availablePlayers.length} available &middot; {soldRecords.length} sold &middot; {allPlayers.length} total
                </div>

                {/* Available players list */}
                {!playersLoaded ? (
                  <div className="cb-loading-state"><span className="cb-spinner" /> Loading players...</div>
                ) : availablePlayers.length === 0 ? (
                  <div className="cb-scout-empty">
                    <GiCricketBat size={40} color="rgba(255,255,255,0.3)" />
                    <p>No available players match your filter.</p>
                  </div>
                ) : (
                  <div className="cb-scout-player-list">
                    {availablePlayers.slice(0, 50).map((p) => {
                      const parsed = parseRoleDetails(p.role);
                      return (
                        <div key={p.id} className="cb-scout-player-item">
                          <div className="cb-scout-player-img-wrap">
                            <PlayerImage imageUrl={p.imageUrl || ''} playerName={p.name} size="sm" className="cb-scout-player-img" />
                          </div>
                          <div className="cb-scout-player-body">
                            <span className="cb-scout-player-name">{p.name}</span>
                            <div className="cb-scout-player-meta">
                              <span className="cb-squad-role-badge" style={{ background: getRoleBadgeColor(parsed.category) }}>
                                {parsed.badge} {parsed.coreRole}
                              </span>
                              <span className="cb-scout-player-base">{formatLakhs(p.basePrice)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {availablePlayers.length > 50 && (
                      <div className="cb-scout-more">+{availablePlayers.length - 50} more players</div>
                    )}
                  </div>
                )}

                {/* Auction snapshot */}
                <div className="cb-scout-snapshot">
                  <div className="cb-snap-item"><span>Teams</span><strong>{teams.length}</strong></div>
                  <div className="cb-snap-item"><span>Sold</span><strong>{soldRecords.length}</strong></div>
                  <div className="cb-snap-item"><span>Available</span><strong>{allPlayers.length - soldRecords.length}</strong></div>
                </div>
              </div>
            )}

            <div className="cb-login-footer">
              <p>powered by <b>NJS Creative Labs</b></p>
            </div>
          </motion.div>

          {/* ═══════ AUCTION DASHBOARD (below login card) ═══════ */}
          {teams.length > 0 && (
            <motion.div
              className="cb-auction-dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
            >
              <h2 className="cb-dash-title">
                <IoStatsChart size={18} />
                Auction Overview
              </h2>

              {/* Key stats row */}
              <div className="cb-dash-stats">
                <div className="cb-dash-stat">
                  <div className="cb-dash-stat-icon sold"><IoPeople size={18} /></div>
                  <div className="cb-dash-stat-body">
                    <span className="cb-dash-stat-value">{totalPlayersSold}</span>
                    <span className="cb-dash-stat-label">Players Sold</span>
                  </div>
                </div>
                <div className="cb-dash-stat">
                  <div className="cb-dash-stat-icon spent"><IoWallet size={18} /></div>
                  <div className="cb-dash-stat-body">
                    <span className="cb-dash-stat-value">{formatLakhs(totalMoneySpent)}</span>
                    <span className="cb-dash-stat-label">Total Spent</span>
                  </div>
                </div>
                <div className="cb-dash-stat">
                  <div className="cb-dash-stat-icon top"><IoTrophy size={18} /></div>
                  <div className="cb-dash-stat-body">
                    <span className="cb-dash-stat-value">{formatLakhs(topBuyTeam?.highestBid || 0)}</span>
                    <span className="cb-dash-stat-label">Highest Bid</span>
                  </div>
                </div>
              </div>

              {/* Team leaderboard */}
              <div className="cb-dash-leaderboard">
                <h3 className="cb-dash-section-title">Team Standings</h3>
                {teamsByPlayers.map((t, i) => {
                  const spent = (t.allocatedAmount || 0) - t.remainingPurse;
                  const purseUsedPct = t.allocatedAmount ? Math.round((spent / t.allocatedAmount) * 100) : 0;
                  const teamCred = runtimeCredentials.find(c => c.teamId === t.id);
                  return (
                    <div key={t.id} className="cb-dash-team-row" style={{ '--row-color': teamCred?.primaryColor || '#3b82f6' } as React.CSSProperties}>
                      <div className="cb-dash-team-rank">#{i + 1}</div>
                      <div className="cb-dash-team-logo">
                        {t.logoUrl ? <TeamLogo logoUrl={t.logoUrl} teamName={t.name} size="sm" /> : <div className="cb-dash-team-initial">{t.name.slice(0, 2).toUpperCase()}</div>}
                      </div>
                      <div className="cb-dash-team-info">
                        <span className="cb-dash-team-name">{t.name}</span>
                        <div className="cb-dash-team-bar-wrap">
                          <div className="cb-dash-team-bar">
                            <div className="cb-dash-team-bar-fill" style={{ width: `${purseUsedPct}%` }} />
                          </div>
                          <span className="cb-dash-team-pct">{purseUsedPct}%</span>
                        </div>
                      </div>
                      <div className="cb-dash-team-nums">
                        <span className="cb-dash-team-players">{t.playersBought || 0} <small>players</small></span>
                        <span className="cb-dash-team-purse">{formatLakhs(t.remainingPurse)}</span>
                        {(t.highestBid || 0) > 0 && <span className="cb-dash-team-top-buy">Top: {formatLakhs(t.highestBid)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>

        {/* ═══════ TOP BUYS CAROUSEL (press "n") ═══════ */}
        <AnimatePresence>
          {showTopBuysCarousel && topBuys.length > 0 && (
            <motion.div
              className="cb-topbuys-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowTopBuysCarousel(false);  }}
            >
              <motion.div
                className="cb-topbuys-container"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.7, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="cb-topbuys-header">
                  <IoTrophy size={22} color="#fbbf24" />
                  <h2>Top Buys</h2>
                  <button className="cb-topbuys-close" onClick={() => { setShowTopBuysCarousel(false);  }}>
                    <IoClose size={20} />
                  </button>
                </div>

                <div className="cb-topbuys-carousel">
                  <AnimatePresence mode="wait">
                    {topBuys.map((buy, i) => i === topBuysIndex && (
                      <motion.div
                        key={buy.id}
                        className="cb-topbuy-card"
                        initial={{ opacity: 0, x: 80, scale: 0.92 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -80, scale: 0.92 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 220 }}
                        style={{ '--buy-color': buy.primaryColor, '--buy-color2': buy.secondaryColor } as React.CSSProperties}
                      >
                        {/* Team brand reveal */}
                        <motion.div
                          className="cb-topbuy-brand"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          transition={{ delay: 0.15, duration: 0.5, ease: 'easeOut' }}
                        >
                          <div className="cb-topbuy-brand-bg" style={{ background: `linear-gradient(135deg, ${buy.secondaryColor}, ${buy.primaryColor})` }}>
                            {buy.logoUrl && (
                              <motion.div
                                className="cb-topbuy-brand-logo"
                                initial={{ scale: 0, rotate: -20 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ delay: 0.35, type: 'spring', stiffness: 200 }}
                              >
                                <TeamLogo logoUrl={buy.logoUrl} teamName={buy.teamName} size="md" />
                              </motion.div>
                            )}
                            <motion.span
                              className="cb-topbuy-team-name"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.5 }}
                            >{buy.teamName}</motion.span>
                          </div>
                        </motion.div>

                        {/* Rank badge */}
                        <motion.div
                          className={`cb-topbuy-rank rank-${i + 1}`}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
                        >
                          #{i + 1}
                        </motion.div>

                        {/* Player details */}
                        {buy.player && (
                          <motion.div
                            className="cb-topbuy-player"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4, duration: 0.4 }}
                          >
                            <div className="cb-topbuy-player-img-wrap">
                              <PlayerImage imageUrl={buy.player.imageUrl || ''} playerName={buy.player.name} size="lg" className="cb-topbuy-player-img" />
                            </div>
                            <h3 className="cb-topbuy-player-name">{buy.player.name}</h3>
                            <span className={`cb-role-badge ${getRoleBadgeClass(buy.player.role)}`}>{getRoleLabel(buy.player.role)}</span>

                            <motion.div
                              className="cb-topbuy-amount"
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ delay: 0.6, type: 'spring', stiffness: 200 }}
                            >
                              {formatLakhs(buy.soldAmount)}
                            </motion.div>

                            {/* Quick stats */}
                            <div className="cb-topbuy-stats">
                              {getRoleBasedStats(buy.player, 4).map((stat) => (
                                <div key={stat.label} className="cb-topbuy-stat">
                                  <span>{stat.label}</span>
                                  <strong>{stat.value || '--'}</strong>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Dots + nav */}
                <div className="cb-topbuys-nav">
                  <button className="cb-topbuys-arrow" disabled={topBuysIndex === 0} onClick={() => setTopBuysIndex(i => i - 1)}>&lsaquo;</button>
                  <div className="cb-topbuys-dots">
                    {topBuys.map((_, i) => (
                      <button
                        key={i}
                        className={`cb-topbuys-dot ${i === topBuysIndex ? 'active' : ''}`}
                        onClick={() => setTopBuysIndex(i)}
                      />
                    ))}
                  </div>
                  <button className="cb-topbuys-arrow" disabled={topBuysIndex === topBuys.length - 1} onClick={() => setTopBuysIndex(i => i + 1)}>&rsaquo;</button>
                </div>

                <div className="cb-topbuys-hint">Press N to toggle &middot; ←→ to navigate &middot; Esc to close</div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
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

      {/* ── Team Dashboard Header ── */}
      <header className="cb-header">
        <div className="cb-header-banner" style={{ background: `linear-gradient(135deg, ${teamSecondary}, ${teamPrimary})` }}>
          <div className="cb-header-top">
            <div className="cb-header-left">
              {myTeam?.logoUrl && <TeamLogo logoUrl={myTeam.logoUrl} teamName={session.teamName} size="sm" className="cb-header-logo" />}
              <div className="cb-header-team">
                <span className="cb-team-name">{session.teamName}</span>
                <span className="cb-header-sub">
                  <span className={`cb-conn-dot ${isConnected ? 'live' : ''}`} />
                  {isConnected ? formattedTime : 'Offline'}
                  {bidCount > 0 && <> &middot; {bidCount} bids</>}
                </span>
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
              <motion.button className="cb-icon-btn logout" onClick={handleLogout} whileTap={{ scale: 0.9 }} title="Logout">
                <IoEllipsisHorizontal size={18} />
              </motion.button>
            </div>
          </div>

          {/* Budget progress inline */}
          {myTeam && (
            <div className="cb-header-budget">
              <div className="cb-hb-labels">
                <span className="cb-hb-label">
                  <IoWallet size={12} />
                  {formatLakhs(myTeam.remainingPurse)}
                </span>
                <span className="cb-hb-players">{myTeam.playersBought || 0}/{myTeam.totalPlayerThreshold || 25} players</span>
              </div>
              <div className="cb-hb-bar">
                <motion.div
                  className="cb-hb-bar-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${budgetPct}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Motion indicator ── */}
      <AnimatePresence>
        {motionActive && (
          <motion.div className="cb-motion-bar" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <IoSwapVertical size={14} />
            <span>Gesture bidding active — Raise phone to bid</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating live banner on non-live tabs ── */}
      <AnimatePresence>
        {activeTab !== 'live' && currentPlayer && (
          <motion.button
            className="cb-live-banner"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            onClick={() => setActiveTab('live')}
          >
            <span className="cb-live-banner-dot" />
            <span className="cb-live-banner-name">{currentPlayer.name}</span>
            <span className="cb-live-banner-bid">{formatLakhs(currentBid)}</span>
            {isMyBid && <span className="cb-live-banner-my">YOUR BID</span>}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ═══════════════ LIVE TAB ═══════════════ */}
      {activeTab === 'live' && (
        <div className="cb-content cb-live-content">
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

              {/* Full stats toggle for current player */}
              <button
                className="cb-view-full-stats"
                onClick={() => setExpandedPlayer(expandedPlayer?.player.id === currentPlayer.id ? null : { player: currentPlayer, statsView: 'batting' })}
              >
                {expandedPlayer?.player.id === currentPlayer.id ? 'Hide Full Stats ▴' : 'View Full Stats ▾'}
              </button>
              <AnimatePresence>
                {expandedPlayer?.player.id === currentPlayer.id && (
                  <motion.div
                    className="cb-full-stats-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    {renderFullStatsPanel(expandedPlayer.player, expandedPlayer.statsView, (v) => setExpandedPlayer({ player: expandedPlayer.player, statsView: v }))}
                  </motion.div>
                )}
              </AnimatePresence>

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
            <div className="cb-empty-state">
              <GiCricketBat size={56} color="rgba(255,255,255,0.25)" />
              <p>Waiting for next player...</p>
              <p className="cb-empty-hint">The auction master will start the bidding</p>
            </div>
          )}

          {/* ── Action Buttons ── */}
          <div className="cb-actions">
            {mobileBiddingConfig.enableRaiseBid && (
              <motion.button
                className="cb-action-btn raise"
                onClick={handleRaiseBid}
                disabled={!currentPlayer || !isConnected}
                whileTap={{ scale: 0.95 }}
              >
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
                <span className="cb-action-label">PASS</span>
              </motion.button>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ MY TEAM TAB ═══════════════ */}
      {activeTab === 'myteam' && myTeam && (
        <div className="cb-content cb-team-tab">
          {/* Team overview card */}
          <div className="cb-team-overview">
            <div className="cb-team-overview-header">
              {myTeam.logoUrl && <TeamLogo logoUrl={myTeam.logoUrl} teamName={myTeam.name} size="sm" className="cb-overview-logo" />}
              <div className="cb-team-overview-info">
                <h2>{myTeam.name}</h2>
                {myTeam.captain && <span className="cb-captain-badge">C: {myTeam.captain}</span>}
              </div>
            </div>

            {/* Budget progress bar */}
            <div className="cb-budget-progress">
              <div className="cb-budget-progress-labels">
                <span>Spent {formatLakhs(spentAmount)}</span>
                <span>Left {formatLakhs(myTeam.remainingPurse)}</span>
              </div>
              <div className="cb-budget-progress-bar">
                <motion.div
                  className="cb-budget-progress-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${budgetPct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
              <span className="cb-budget-progress-pct">{budgetPct}% used</span>
            </div>

            <div className="cb-team-stats-grid">
              <div className="cb-team-stat">
                <span className="cb-tstat-value">{myTeam.playersBought || 0}</span>
                <span className="cb-tstat-label">Bought</span>
              </div>
              <div className="cb-team-stat">
                <span className="cb-tstat-value">{(myTeam.totalPlayerThreshold || 25) - (myTeam.playersBought || 0)}</span>
                <span className="cb-tstat-label">Slots Left</span>
              </div>
              <div className="cb-team-stat">
                <span className="cb-tstat-value">{formatLakhs(maxAffordableBid)}</span>
                <span className="cb-tstat-label">Max Bid</span>
              </div>
              <div className="cb-team-stat">
                <span className="cb-tstat-value">{formatLakhs(myTeam.highestBid || 0)}</span>
                <span className="cb-tstat-label">Top Buy</span>
              </div>
            </div>
          </div>

          {/* Team Analytics */}
          <div className="cb-analytics-section">
            <h3 className="cb-section-title">Team Analytics</h3>
            <div className="cb-analytics-grid">
              {/* Role Balance */}
              <div className="cb-analytics-card">
                <div className="cb-analytics-card-title">Balance</div>
                <div className="cb-analytics-meter-row">
                  <span>Batting</span>
                  <div className="cb-analytics-meter"><span style={{ width: `${myTeamRoleBalance.batting}%` }} /></div>
                  <strong>{myTeamRoleBalance.batting}%</strong>
                </div>
                <div className="cb-analytics-meter-row">
                  <span>Bowling</span>
                  <div className="cb-analytics-meter"><span style={{ width: `${myTeamRoleBalance.bowling}%` }} /></div>
                  <strong>{myTeamRoleBalance.bowling}%</strong>
                </div>
                <div className="cb-analytics-meter-row">
                  <span>Fielding</span>
                  <div className="cb-analytics-meter"><span style={{ width: `${myTeamRoleBalance.fielding}%` }} /></div>
                  <strong>{myTeamRoleBalance.fielding}%</strong>
                </div>
              </div>

              {/* Top Picks */}
              <div className="cb-analytics-card">
                <div className="cb-analytics-card-title">Top Picks</div>
                {myTeamTopPicks.length > 0 ? myTeamTopPicks.map((player, index) => (
                  <div key={player.id} className="cb-analytics-list-item">
                    <span>#{index + 1} {player.name}</span>
                    <strong>{formatLakhs(player.soldAmount)}</strong>
                  </div>
                )) : <div className="cb-analytics-empty">No picks yet</div>}
              </div>

              {/* Budget & Rules */}
              <div className="cb-analytics-card">
                <div className="cb-analytics-card-title">Budget &amp; Rules</div>
                <div className="cb-analytics-list-item">
                  <span>Total Spend</span>
                  <strong>{formatLakhs(spentAmount)}</strong>
                </div>
                <div className="cb-analytics-list-item">
                  <span>Remaining</span>
                  <strong>{formatLakhs(myTeam.remainingPurse)}</strong>
                </div>
                <div className="cb-analytics-list-item">
                  <span>Max Allowed Bid</span>
                  <strong>{formatLakhs(myTeamMaxBid)}</strong>
                </div>
                <div className={`cb-analytics-status-badge ${myTeamBudgetStatus}`}>
                  {myTeamBudgetStatus === 'danger' ? 'Budget Risk: High' : myTeamBudgetStatus === 'warning' ? 'Budget Risk: Warning' : 'Budget Risk: Safe'}
                </div>
              </div>
            </div>
          </div>

          {/* Squad roster */}
          <div className="cb-squad-section">
            <h3 className="cb-section-title">My Squad ({mySquad.length})</h3>
            {mySquad.length > 0 ? (
              <div className="cb-squad-list">
                {mySquad.map((p) => {
                  const parsed = parseRoleDetails(p.role);
                  return (
                    <motion.div
                      key={p.id}
                      className="cb-squad-card"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => setExpandedPlayer(
                        expandedPlayer?.player.id === p.id ? null : { player: p, statsView: 'batting' }
                      )}
                    >
                      <div className="cb-squad-card-top">
                        <div className="cb-squad-img-wrap">
                          <PlayerImage imageUrl={p.imageUrl || ''} playerName={p.name} size="sm" className="cb-squad-img" />
                        </div>
                        <div className="cb-squad-info">
                          <span className="cb-squad-name">{p.name}</span>
                          <div className="cb-squad-meta">
                            <span className="cb-squad-role-badge" style={{ background: getRoleBadgeColor(parsed.category) }}>
                              {parsed.badge} {parsed.coreRole}
                            </span>
                            <span className="cb-squad-price">{formatLakhs(p.soldAmount)}</span>
                          </div>
                        </div>
                        <IoChevronDown size={14} className={`cb-expand-icon ${expandedPlayer?.player.id === p.id ? 'open' : ''}`} />
                      </div>
                      <AnimatePresence>
                        {expandedPlayer?.player.id === p.id && (
                          <motion.div
                            className="cb-full-stats-panel"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                          >
                            {renderFullStatsPanel(expandedPlayer.player, expandedPlayer.statsView, (v) => setExpandedPlayer({ player: expandedPlayer.player, statsView: v }))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="cb-squad-empty">
                <GiCricketBat size={36} color="rgba(255,255,255,0.15)" />
                <p>No players acquired yet</p>
                <p className="cb-empty-hint">Players you win will appear here</p>
              </div>
            )}
          </div>

          {/* All teams leaderboard */}
          <div className="cb-teams-leaderboard">
            <h3 className="cb-section-title">All Teams</h3>
            <div className="cb-leaderboard-list">
              {[...teams].sort((a, b) => (b.playersBought || 0) - (a.playersBought || 0)).map((t) => (
                <div key={t.id} className={`cb-leaderboard-row ${t.id === myTeam.id ? 'mine' : ''}`}>
                  <div className="cb-lb-team">
                    {t.id === myTeam.id && t.logoUrl && <TeamLogo logoUrl={t.logoUrl} teamName={t.name} size="sm" className="cb-lb-logo" />}
                    <span>{t.name}</span>
                  </div>
                  <div className="cb-lb-stats">
                    <span className="cb-lb-players">{t.playersBought || 0} players</span>
                    <span className="cb-lb-purse">{formatLakhs(t.remainingPurse)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ PLAYERS TAB ═══════════════ */}
      {activeTab === 'players' && (
        <div className="cb-content cb-players-tab">
          {/* Sticky search header */}
          <div className="cb-search-sticky">
            <div className="cb-search-bar">
              <IoSearch size={18} className="cb-search-icon" />
              <input
                type="text"
                className="cb-search-input"
                placeholder="Search player name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="cb-search-clear" onClick={() => setSearchQuery('')}>
                  <IoClose size={16} />
                </button>
              )}
            </div>

            {/* Role filter chips */}
            <div className="cb-role-filters">
              {availableRoles.map((role) => (
                <button
                  key={role}
                  className={`cb-role-chip ${roleFilter === role ? 'active' : ''}`}
                  onClick={() => setRoleFilter(role)}
                >
                  {role === 'all' ? 'All' : role}
                </button>
              ))}
            </div>
          </div>

          <div className="cb-player-count">
            <span>{filteredPlayers.length} player{filteredPlayers.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Player list */}
          {!playersLoaded ? (
            <div className="cb-loading-state">
              <span className="cb-spinner" /> Loading players...
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="cb-squad-empty">
              <p>No players found</p>
              <p className="cb-empty-hint">Try a different search or filter</p>
            </div>
          ) : (
            <div className="cb-players-list">
              {filteredPlayers.map((p) => {
                const sold = soldRecords.find(s => s.id === p.id);
                const parsed = parseRoleDetails(p.role);
                const isExpanded = expandedPlayer?.player.id === p.id;
                return (
                  <motion.div
                    key={p.id}
                    className={`cb-player-row ${sold ? 'sold' : 'available'}`}
                    layout
                    onClick={() => setExpandedPlayer(isExpanded ? null : { player: p, statsView: 'batting' })}
                  >
                    <div className="cb-player-row-top">
                      <div className="cb-player-row-img-wrap">
                        <PlayerImage imageUrl={p.imageUrl || ''} playerName={p.name} size="sm" className="cb-player-row-img" />
                      </div>
                      <div className="cb-player-row-info">
                        <span className="cb-player-row-name">{p.name}</span>
                        <div className="cb-player-row-meta">
                          <span className="cb-squad-role-badge" style={{ background: getRoleBadgeColor(parsed.category) }}>
                            {parsed.badge} {parsed.coreRole}
                          </span>
                          {parsed.battingHand && <span className="cb-detail-chip">{parsed.battingHand}</span>}
                          {parsed.bowlingStyle && <span className="cb-detail-chip">{parsed.bowlingStyle}</span>}
                        </div>
                      </div>
                      <div className="cb-player-row-right">
                        <span className="cb-player-row-base">{formatLakhs(p.basePrice)}</span>
                        {sold && <span className="cb-player-row-sold-badge">{sold.teamName}</span>}
                        {sold && <span className="cb-player-row-sold-amt">{formatLakhs(sold.soldAmount)}</span>}
                      </div>
                    </div>
                    <AnimatePresence>
                      {isExpanded && expandedPlayer && (
                        <motion.div
                          className="cb-full-stats-panel"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {renderFullStatsPanel(expandedPlayer.player, expandedPlayer.statsView, (v) => setExpandedPlayer({ player: expandedPlayer.player, statsView: v }))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Bottom Tab Bar ── */}
      <nav className="cb-bottom-nav">
        {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`cb-bottom-tab ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            <Icon size={22} />
            <span>{label}</span>
            {key === 'live' && currentPlayer && <span className="cb-tab-dot" />}
          </button>
        ))}
      </nav>

      {/* ═══════ TOP BUYS CAROUSEL (press "n") ═══════ */}
      <AnimatePresence>
        {showTopBuysCarousel && topBuys.length > 0 && (
          <motion.div
            className="cb-topbuys-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setShowTopBuysCarousel(false);  }}
          >
            <motion.div
              className="cb-topbuys-container"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="cb-topbuys-header">
                <IoTrophy size={22} color="#fbbf24" />
                <h2>Top Buys</h2>
                <button className="cb-topbuys-close" onClick={() => { setShowTopBuysCarousel(false);  }}>
                  <IoClose size={20} />
                </button>
              </div>
              <div className="cb-topbuys-carousel">
                <AnimatePresence mode="wait">
                  {topBuys.map((buy, i) => i === topBuysIndex && (
                    <motion.div
                      key={buy.id}
                      className="cb-topbuy-card"
                      initial={{ opacity: 0, x: 80, scale: 0.92 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -80, scale: 0.92 }}
                      transition={{ type: 'spring', damping: 22, stiffness: 220 }}
                      style={{ '--buy-color': buy.primaryColor, '--buy-color2': buy.secondaryColor } as React.CSSProperties}
                    >
                      <motion.div className="cb-topbuy-brand" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} transition={{ delay: 0.15, duration: 0.5 }}>
                        <div className="cb-topbuy-brand-bg" style={{ background: `linear-gradient(135deg, ${buy.secondaryColor}, ${buy.primaryColor})` }}>
                          {buy.logoUrl && (
                            <motion.div className="cb-topbuy-brand-logo" initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.35, type: 'spring', stiffness: 200 }}>
                              <TeamLogo logoUrl={buy.logoUrl} teamName={buy.teamName} size="md" />
                            </motion.div>
                          )}
                          <motion.span className="cb-topbuy-team-name" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>{buy.teamName}</motion.span>
                        </div>
                      </motion.div>
                      <motion.div className={`cb-topbuy-rank rank-${i + 1}`} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}>#{i + 1}</motion.div>
                      {buy.player && (
                        <motion.div className="cb-topbuy-player" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.4 }}>
                          <div className="cb-topbuy-player-img-wrap">
                            <PlayerImage imageUrl={buy.player.imageUrl || ''} playerName={buy.player.name} size="lg" className="cb-topbuy-player-img" />
                          </div>
                          <h3 className="cb-topbuy-player-name">{buy.player.name}</h3>
                          <span className={`cb-role-badge ${getRoleBadgeClass(buy.player.role)}`}>{getRoleLabel(buy.player.role)}</span>
                          <motion.div className="cb-topbuy-amount" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.6, type: 'spring', stiffness: 200 }}>
                            {formatLakhs(buy.soldAmount)}
                          </motion.div>
                          <div className="cb-topbuy-stats">
                            {getRoleBasedStats(buy.player, 4).map((stat) => (
                              <div key={stat.label} className="cb-topbuy-stat">
                                <span>{stat.label}</span>
                                <strong>{stat.value || '--'}</strong>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <div className="cb-topbuys-nav">
                <button className="cb-topbuys-arrow" disabled={topBuysIndex === 0} onClick={() => setTopBuysIndex(i => i - 1)}>&lsaquo;</button>
                <div className="cb-topbuys-dots">
                  {topBuys.map((_, i) => (
                    <button key={i} className={`cb-topbuys-dot ${i === topBuysIndex ? 'active' : ''}`} onClick={() => setTopBuysIndex(i)} />
                  ))}
                </div>
                <button className="cb-topbuys-arrow" disabled={topBuysIndex === topBuys.length - 1} onClick={() => setTopBuysIndex(i => i + 1)}>&rsaquo;</button>
              </div>
              <div className="cb-topbuys-hint">Press N to toggle &middot; ←→ to navigate &middot; Esc to close</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
