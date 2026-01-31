// ============================================================================
// MOBILE BIDDING PAGE
// Simple mobile interface for teams to raise bids in real-time
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authService, biddingService } from '../../services';
import type { AuthSession } from '../../services';
import { useAuctionStore } from '../../store/auctionStore';
import './MobileBidding.css';

interface BidFeedback {
  type: 'success' | 'error' | 'info';
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
  
  // Get auction state
  const currentPlayer = useAuctionStore(state => state.currentPlayer);
  const currentBid = useAuctionStore(state => state.currentBid);
  const selectedTeam = useAuctionStore(state => state.selectedTeam);
  const teams = useAuctionStore(state => state.teams);

  // Find the team object for the logged-in user
  const myTeam = teams.find(t => 
    t.name.toLowerCase().includes(session?.teamName?.toLowerCase() || '') ||
    t.id === session?.teamId
  );

  // Check if it's my team's turn
  const isMyBid = selectedTeam?.id === myTeam?.id || selectedTeam?.name === session?.teamName;

  // Handle login
  const handleLogin = useCallback(async () => {
    setIsLoading(true);
    setLoginError('');

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = authService.login(username, password);
    
    if (result.success && result.session) {
      setSession(result.session);
      setUsername('');
      setPassword('');
    } else {
      setLoginError(result.error || 'Login failed');
    }
    
    setIsLoading(false);
  }, [username, password]);

  // Handle logout
  const handleLogout = useCallback(() => {
    authService.logout();
    setSession(null);
  }, []);

  // Show feedback
  const showFeedback = useCallback((type: BidFeedback['type'], message: string) => {
    setFeedback({ type, message, timestamp: Date.now() });
    setTimeout(() => setFeedback(null), 3000);
  }, []);

  // Handle raise bid
  const handleRaiseBid = useCallback(() => {
    if (!session || !myTeam || !currentPlayer) {
      showFeedback('error', 'Cannot place bid right now');
      return;
    }

    // Calculate next bid amount
    const nextBid = currentBid + 100; // Default increment

    const bidId = biddingService.submitBid(
      myTeam,
      nextBid,
      'mobile',
      session.clientId
    );

    if (bidId) {
      setBidCount(prev => prev + 1);
      showFeedback('success', `Bid placed: ₹${nextBid}L`);
    } else {
      showFeedback('error', 'Failed to place bid');
    }
  }, [session, myTeam, currentPlayer, currentBid, showFeedback]);

  // Handle stop bidding
  const handleStopBidding = useCallback(() => {
    if (!session || !myTeam) {
      showFeedback('info', 'Not in active bidding');
      return;
    }

    biddingService.submitStopBidding(myTeam, 'mobile', session.clientId);
    showFeedback('info', 'Stopped bidding');
  }, [session, myTeam, showFeedback]);

  // Subscribe to bidding events
  useEffect(() => {
    const unsubscribe = biddingService.onBid((event, result, reason) => {
      if (event.clientId === session?.clientId) {
        if (result === 'accepted') {
          showFeedback('success', `Bid accepted: ₹${event.amount}L`);
        } else {
          showFeedback('error', reason || 'Bid rejected');
        }
      }
    });

    return unsubscribe;
  }, [session?.clientId, showFeedback]);

  // Login form
  if (!session) {
    return (
      <div className="mobile-bidding-container">
        <div className="login-card">
          <div className="login-header">
            <h1 className="login-title">🏏 Auction Bidding</h1>
            <p className="login-subtitle">Team Login</p>
          </div>

          <form className="login-form" onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
            <div className="form-group">
              <label htmlFor="username">Team Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter team username"
                disabled={isLoading}
                autoComplete="username"
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
          <span className="team-badge">{session.teamName}</span>
          <span className="bid-count">{bidCount} bids placed</span>
        </div>
        <button className="logout-button" onClick={handleLogout}>
          Logout
        </button>
      </header>

      {/* Current Player Info */}
      <div className="player-info-card">
        {currentPlayer ? (
          <>
            <h2 className="player-name">{currentPlayer.name}</h2>
            <p className="player-role">{currentPlayer.role}</p>
            <div className="current-bid-display">
              <span className="bid-label">Current Bid</span>
              <span className="bid-amount">₹{currentBid}L</span>
            </div>
            {selectedTeam && (
              <div className={`leading-team ${isMyBid ? 'is-my-bid' : ''}`}>
                <span>Leading: {selectedTeam.name}</span>
                {isMyBid && <span className="my-bid-badge">YOUR BID</span>}
              </div>
            )}
          </>
        ) : (
          <div className="no-player">
            <p>Waiting for next player...</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <motion.button
          className="bid-button raise-bid"
          onClick={handleRaiseBid}
          disabled={!currentPlayer}
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
            <span className="stat-value">₹{myTeam.remainingPurse?.toFixed(1)}L</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Players</span>
            <span className="stat-value">{myTeam.playersBought}/{myTeam.totalPlayerThreshold}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default MobileBiddingPage;
