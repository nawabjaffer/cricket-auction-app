// ============================================================================
// CONNECT BIDDING ADMIN PAGE
// Admin-only interface for raising bids on behalf of teams.
// Mirrors the team login page design with team cards, budgets, stats,
// plus raise-bid and pass controls for each team.
// Accessible at /connect-bidding-admin and /:tenantSlug/connect-bidding-admin
// ============================================================================

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoClose, IoShieldCheckmark, IoPeople, IoWallet, IoTrophy, IoStatsChart } from 'react-icons/io5';
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

  // Auction-wide stats
  const totalPlayersSold = teams.reduce((s, t) => s + (t.playersBought || 0), 0);
  const totalMoneySpent = teams.reduce((s, t) => s + ((t.allocatedAmount || 0) - t.remainingPurse), 0);
  const topBuyTeam = useMemo(() => [...teams].sort((a, b) => (b.highestBid || 0) - (a.highestBid || 0))[0], [teams]);
  const teamsByPlayers = useMemo(() => [...teams].sort((a, b) => (b.playersBought || 0) - (a.playersBought || 0)), [teams]);

  const themePrimary = '#e4be75';
  const themeSecondary = '#24467c';

  // ─── Admin Login Screen (same layout as team login) ───
  if (!isAuthenticated) {
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
              <div className="cb-login-hint">Use your tournament admin email.</div>
            </form>

            <div className="cb-login-footer"><p>powered by <b>NJS Creative Labs</b></p></div>
          </motion.div>

          {/* Auction Overview Dashboard (same as team login page) */}
          {teams.length > 0 && (
            <motion.div className="cb-auction-dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
              <h2 className="cb-dash-title"><IoStatsChart size={18} /> Auction Overview</h2>
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
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  // ─── Main Admin Bidding Interface (logged in) ───
  return (
    <div className="cb-login-page" style={{ '--cb-primary': themePrimary, '--cb-secondary': themeSecondary } as React.CSSProperties}>
      <div className="cb-login-bg" />
      <div className="cb-login-scroll">

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
              <motion.button className="cb-icon-btn" onClick={() => logout()} whileTap={{ scale: 0.9 }} title="Logout" style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                    {selectedTeam.logoUrl && <TeamLogo logoUrl={selectedTeam.logoUrl} teamName={selectedTeam.name} size="sm" />}
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{selectedTeam.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', background: 'rgba(251,191,36,0.25)', color: '#fbbf24', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>LEADING</span>
                  </div>
                )}
                {bidHistory.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: '0.72rem', opacity: 0.6 }}>
                    History: {bidHistory.slice(-4).map(b => `${b.teamName} ${formatLakhs(b.amount)}`).join(' → ')}
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
            <IoPeople size={16} /> Select Team to Raise Bid
          </h3>

          <div className="cb-team-card-grid">
            {teams.map(team => {
              const isLeading = selectedTeam?.id === team.id;
              const purseUsedPct = team.allocatedAmount ? Math.round(((team.allocatedAmount - team.remainingPurse) / team.allocatedAmount) * 100) : 0;
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

                  {/* Action buttons */}
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
                      {busyTeamId === team.id ? '...' : `RAISE +₹100L`}
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
            })}
          </div>
        </motion.div>

        {/* Auction Dashboard (same as team login page) */}
        {teams.length > 0 && (
          <motion.div className="cb-auction-dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
            <h2 className="cb-dash-title"><IoStatsChart size={18} /> Auction Overview</h2>
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
                return (
                  <div key={t.id} className="cb-dash-team-row" style={{ '--row-color': t.primaryColor || '#3b82f6' } as React.CSSProperties}>
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
