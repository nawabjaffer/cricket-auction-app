// ============================================================================
// MOBILE BIDDING PAGE
// Real-time mobile interface for teams to raise bids
// Uses Firebase Realtime Database for cross-device synchronization
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GiCricketBat } from 'react-icons/gi';
import { IoWifi, IoWifiOutline } from 'react-icons/io5';
import { authService } from '../../services';
import type { AuthSession } from '../../services';
import { useRealtimeMobileSync } from '../../hooks/useRealtimeSync';
import { TeamLogo } from '../TeamLogo/TeamLogo';
import { PlayerImage } from '../PlayerImage/PlayerImage';
import './MobileBidding.css';

interface BidFeedback {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timestamp: number;
}

export function MobileBiddingPage() {
  const [session, setSession] = useState<AuthSession | null>(authService.getSession());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<BidFeedback | null>(null);
  const [bidCount, setBidCount] = useState(0);
  const [lastSoldPlayer, setLastSoldPlayer] = useState<{name: string; amount: number; winnerTeam: string} | null>(null);
  const lastPlayerIdRef = useRef<string | null>(null);
  
  // Use Firebase Realtime Database for cross-device sync
  const {
    currentPlayer,
    currentBid,
    selectedTeam,
    teams,
    auctionActive,
    isConnected,
    lastUpdate,
    lastSessionReset,
    submitBid,
  } = useRealtimeMobileSync();

  // Build runtime credentials from live team data
  const runtimeCredentials = useMemo(() => {
    return teams.map((team, index) => {
      const normalized = team.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
      const username = normalized || `team${index + 1}`;
      const idSuffix = team.id?.slice(-4) || String(index + 1).padStart(4, '0');
      const password = `${username}@${idSuffix}`;
      return {
        teamId: team.id,
        teamName: team.name,
        username,
        password,
        primaryColor: team.primaryColor || '#ffffff',
        secondaryColor: team.secondaryColor || '#000000',
      };
    });
  }, [teams]);

  useEffect(() => {
    if (runtimeCredentials.length > 0) {
      authService.setTeamCredentials(runtimeCredentials);
    }
  }, [runtimeCredentials]);

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
      // Player was sold - get the actual player name from the ref
      const playerName = lastPlayerIdRef.current;
      setLastSoldPlayer({
        name: playerName,
        amount: currentBid,
        winnerTeam: selectedTeam.name,
      });
    } else if (currentPlayer) {
      // New player started, clear sold message and store current player name
      setLastSoldPlayer(null);
      lastPlayerIdRef.current = currentPlayer.name; // Store name, not ID
    }
  }, [currentPlayer, currentBid, selectedTeam]);

  // Handle login
  const handleLogin = useCallback(async () => {
    setIsLoading(true);
    setLoginError('');

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = authService.login(username, password);

    if (result.success && result.session) {
      setSession(result.session);
      setLoginError('');
      console.log('[MobileBidding] Login successful:', result.session.teamName);
    } else {
      setLoginError(result.error || 'Invalid credentials');
    }

    setIsLoading(false);
  }, [username, password]);

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
        type: 'error',
        message: 'No player up for auction',
        timestamp: Date.now(),
      });
      return;
    }
    
    if (!auctionActive) {
      setFeedback({
        type: 'error',
        message: 'Auction is not active',
        timestamp: Date.now(),
      });
      return;
    }

    // Check if this team was the last bidder
    if (selectedTeam && selectedTeam.id === myTeam.id) {
      setFeedback({
        type: 'warning',
        message: `${myTeam.name} must wait for another team to bid before bidding again`,
        timestamp: Date.now(),
      });
      return;
    }

    // Calculate next bid amount (100L increment)
    const newBid = currentBid + 100;
    
    // Submit bid through Firebase Realtime sync
    const success = await submitBid(myTeam.id, newBid, 'raise');
    
    if (success) {
      setBidCount(prev => prev + 1);
      setFeedback({
        type: 'success',
        message: `Bid placed: ₹${newBid}L`,
        timestamp: Date.now(),
      });

      console.log('[MobileBidding] Bid submitted:', {
        team: myTeam.name,
        amount: newBid,
        player: currentPlayer.name,
      });
    } else {
      setFeedback({
        type: 'error',
        message: 'Failed to submit bid - try again',
        timestamp: Date.now(),
      });
    }
  }, [myTeam, currentPlayer, currentBid, selectedTeam, auctionActive, submitBid]);

  // Handle stop bidding
  const handleStopBidding = useCallback(async () => {
    if (!myTeam || !currentPlayer) return;

    await submitBid(myTeam.id, currentBid, 'stop');
    
    setFeedback({
      type: 'info',
      message: 'Stopped bidding for this player',
      timestamp: Date.now(),
    });
  }, [myTeam, currentPlayer, currentBid, submitBid]);

  // Clear feedback after 3 seconds
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Check for existing session on mount
  useEffect(() => {
    const existingSession = authService.getSession();
    if (existingSession) {
      setSession(existingSession);
    }
  }, []);

  // Format last update time - using state to avoid impure Date.now() in render
  const [formattedTime, setFormattedTime] = useState('Connecting...');
  
  useEffect(() => {
    const updateTime = () => {
      if (!lastUpdate) {
        setFormattedTime('Connecting...');
        return;
      }
      const seconds = Math.floor((Date.now() - lastUpdate) / 1000);
      if (seconds < 5) {
        setFormattedTime('Just now');
      } else if (seconds < 60) {
        setFormattedTime(`${seconds}s ago`);
      } else {
        const minutes = Math.floor(seconds / 60);
        setFormattedTime(`${minutes}m ago`);
      }
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [lastUpdate]);

  // Login form
  if (!session) {
    return (
      <div className="mobile-bidding-login">
        <div className="login-container">
          <div className="login-header">
            <GiCricketBat size={48} color="var(--primary)" />
            <h1>IPL Auction</h1>
            <p>Team Login</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
            <div className="form-group">
              <label htmlFor="username">Team Code</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter team code"
                disabled={isLoading}
                autoComplete="username"
                autoCapitalize="off"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            {loginError && (
              <motion.div 
                className="login-error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {loginError}
              </motion.div>
            )}

            <button 
              type="submit" 
              className="login-button"
              disabled={isLoading || !username || !password}
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className="team-list-hint">
            <p>Contact admin for credentials</p>
          </div>
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
          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Connection Status */}
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? (
          <>
            <IoWifi size={16} />
            <span>Connected</span>
          </>
        ) : (
          <>
            <IoWifiOutline size={16} />
            <span>Waiting for auction...</span>
          </>
        )}
        <span className="last-update">Updated: {formattedTime}</span>
      </div>

      {/* Current Player Info */}
      <div className="player-info-card">
        {currentPlayer ? (
          <>
            <div className="player-image-container">
              <PlayerImage 
                imageUrl={currentPlayer.imageUrl || ''} 
                playerName={currentPlayer.name}
                size="lg"
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
                  💪
                </motion.div>
                <motion.h2
                  className="sold-title motivation"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  Keep Going!
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
                  Don't worry! The next player could be your star. Stay focused and bid smart!
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
    </div>
  );
}

export default MobileBiddingPage;
