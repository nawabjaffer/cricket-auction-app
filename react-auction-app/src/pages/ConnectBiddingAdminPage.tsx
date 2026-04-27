// ============================================================================
// CONNECT BIDDING ADMIN PAGE
// Admin-only interface for raising bids on behalf of teams.
// Accessible at /connect-bidding-admin and /:tenantSlug/connect-bidding-admin
// ============================================================================

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoFlash, IoClose, IoShieldCheckmark } from 'react-icons/io5';
import { GiCricketBat } from 'react-icons/gi';
import { useRealtimeMobileSync } from '../hooks/useRealtimeSync';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { TeamLogo } from '../components/TeamLogo/TeamLogo';
import { PlayerImage } from '../components/PlayerImage/PlayerImage';
import { getRoleLabel, getRoleBadgeClass } from '../utils/playerStats';
import '../components/MobileBidding/MobileBidding.css';

interface BidFeedback {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timestamp: number;
}

export default function ConnectBiddingAdminPage() {
  const { isAuthenticated, login, logout, loading: authLoading, error: authError } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [feedback, setFeedback] = useState<BidFeedback | null>(null);
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);

  const {
    currentPlayer,
    currentBid,
    selectedTeam,
    teams,
    auctionActive,
    isConnected,
    lastUpdate,
    submitBid,
    bidHistory,
  } = useRealtimeMobileSync();

  // Clear feedback after delay
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const handleLogin = useCallback(async () => {
    if (!email.trim()) return;
    try {
      await login(email.trim());
    } catch { /* error handled by useAdminAuth */ }
  }, [email, login]);

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

  const formatLakhs = (v: number) => `₹${Number.isFinite(v) ? v.toFixed(1) : '0.0'}L`;

  const formattedTime = useMemo(() => {
    if (!lastUpdate) return 'Never';
    return new Date(lastUpdate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastUpdate]);

  // ─── Admin Login ───
  if (!isAuthenticated) {
    return (
      <div className="cb-login-page" style={{ '--cb-primary': '#e4be75', '--cb-secondary': '#24467c' } as React.CSSProperties}>
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
            {authError && <div className="cb-error">{authError}</div>}
            <form className="cb-login-form cb-login-form--strict" onSubmit={e => { e.preventDefault(); handleLogin(); }}>
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
            </form>
            <div className="cb-login-footer"><p>powered by <b>NJS Creative Labs</b></p></div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ─── Main Admin Bidding Interface ───
  return (
    <div className="cb-main" style={{ '--cb-primary': '#e4be75', '--cb-secondary': '#24467c' } as React.CSSProperties}>
      {/* Header */}
      <header className="cb-header">
        <div className="cb-header-banner" style={{ background: 'linear-gradient(135deg, #1e293b, #334155)' }}>
          <div className="cb-header-top">
            <div className="cb-header-left">
              <IoShieldCheckmark size={24} color="#fbbf24" />
              <div className="cb-header-team">
                <span className="cb-team-name">Bid Controller</span>
                <span className="cb-header-sub">
                  <span className={`cb-conn-dot ${isConnected ? 'live' : ''}`} />
                  {isConnected ? formattedTime : 'Offline'}
                </span>
              </div>
            </div>
            <div className="cb-header-right">
              <motion.button className="cb-icon-btn logout" onClick={() => logout()} whileTap={{ scale: 0.9 }} title="Logout">
                <IoClose size={18} />
              </motion.button>
            </div>
          </div>
        </div>
      </header>

      <div className="cb-content cb-live-content" style={{ paddingBottom: '2rem' }}>
        {/* Current Player Card */}
        {currentPlayer ? (
          <motion.div className="cb-player-card" key={currentPlayer.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="cb-player-top">
              <div className="cb-player-image-wrap">
                <PlayerImage imageUrl={currentPlayer.imageUrl || ''} playerName={currentPlayer.name} size="lg" className="cb-player-img" />
              </div>
              <div className="cb-player-info">
                <h2 className="cb-player-name">{currentPlayer.name}</h2>
                <span className={`cb-role-badge ${getRoleBadgeClass(currentPlayer.role)}`}>{getRoleLabel(currentPlayer.role)}</span>
                <div className="cb-price-row">
                  <div className="cb-price-item"><span>Base</span><strong>{formatLakhs(currentPlayer.basePrice)}</strong></div>
                </div>
              </div>
            </div>

            {/* Current bid */}
            <div className="cb-bid-section">
              <div className="cb-current-bid">
                <span className="cb-bid-label">Current Bid</span>
                <motion.span className="cb-bid-amount" key={currentBid} initial={{ scale: 1.15 }} animate={{ scale: 1 }}>
                  {formatLakhs(currentBid)}
                </motion.span>
              </div>
              {selectedTeam && (
                <div className="cb-leading-team">
                  {selectedTeam.logoUrl && <TeamLogo logoUrl={selectedTeam.logoUrl} teamName={selectedTeam.name} size="sm" />}
                  <span>{selectedTeam.name}</span>
                </div>
              )}
            </div>

            {/* Bid History */}
            {bidHistory.length > 0 && (
              <div style={{ margin: '0.75rem 0', fontSize: '0.8rem', opacity: 0.7 }}>
                Last: {bidHistory.slice(-3).map(b => `${b.teamName} ₹${b.amount}L`).join(' → ')}
              </div>
            )}
          </motion.div>
        ) : (
          <div className="cb-empty-state">
            <GiCricketBat size={56} color="rgba(255,255,255,0.25)" />
            <p>Waiting for next player...</p>
          </div>
        )}

        {/* Teams Grid — Raise bid for each team */}
        <h3 style={{ margin: '1.25rem 0 0.75rem', fontSize: '0.95rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
          <IoFlash size={14} style={{ verticalAlign: -2 }} /> Raise Bid for Team
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
          {teams.map(team => {
            const isLeading = selectedTeam?.id === team.id;
            return (
              <div
                key={team.id}
                style={{
                  background: isLeading ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.06)',
                  border: isLeading ? '1.5px solid rgba(251,191,36,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 14,
                  padding: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                {team.logoUrl ? (
                  <TeamLogo logoUrl={team.logoUrl} teamName={team.name} size="sm" />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: team.primaryColor || '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                    {team.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span style={{ fontSize: '0.8rem', fontWeight: 600, textAlign: 'center' }}>{team.name}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>
                  {formatLakhs(team.remainingPurse)} · {team.playersBought}/{team.totalPlayerThreshold}
                </span>
                {isLeading && <span style={{ fontSize: '0.65rem', color: '#fbbf24', fontWeight: 700 }}>LEADING</span>}

                <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    disabled={!currentPlayer || !isConnected || !auctionActive || !!busyTeamId}
                    onClick={() => handleRaiseBid(team.id, team.name)}
                    style={{
                      flex: 1,
                      padding: '0.45rem',
                      borderRadius: 8,
                      border: 'none',
                      background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      opacity: (!currentPlayer || !auctionActive) ? 0.4 : 1,
                    }}
                  >
                    {busyTeamId === team.id ? '...' : 'RAISE'}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    disabled={!currentPlayer || !isConnected || !isLeading || !!busyTeamId}
                    onClick={() => handlePass(team.id, team.name)}
                    style={{
                      padding: '0.45rem 0.6rem',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'transparent',
                      color: '#fff',
                      fontWeight: 600,
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
          })}
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
