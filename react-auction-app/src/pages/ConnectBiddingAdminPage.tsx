// ============================================================================
// CONNECT BIDDING ADMIN PAGE
// Admin-only interface for raising bids on behalf of teams.
// Mirrors the team login page design with team cards, budgets, stats,
// plus raise-bid and pass controls for each team.
// Accessible at /connect-bidding-admin and /:tenantSlug/connect-bidding-admin
// ============================================================================

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoClose, IoShieldCheckmark, IoPeople, IoShield } from 'react-icons/io5';
import { GiCricketBat } from 'react-icons/gi';
import { useRealtimeMobileSync } from '../hooks/useRealtimeSync';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { authService, type AuthSession } from '../services/auth';
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

  // Admin login (for admin-only access)
  const { isAuthenticated, login: adminLogin, logout: adminLogout, loading: authLoading, error: authError } = useAdminAuth();
  const [email, setEmail] = useState('');
  // Super admin mode (skip team login, control all teams)
  const [superAdminMode, setSuperAdminMode] = useState(false);
  // Team login (for team selection)
  const [teamSession, setTeamSession] = useState<AuthSession | null>(authService.getSession());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<BidFeedback | null>(null);
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);

  const { isEnabled } = useFeatureFlags();
  const superAdminEnabled = isEnabled('super-admin-bidding');

  const {
    currentPlayer,
    currentBid,
    selectedTeam,
    teams,
    auctionActive,
    isConnected,
    lastUpdate,
    submitBid,
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

  const formatLakhs = (v: number) => `₹${Number.isFinite(v) ? v.toFixed(1) : '0.0'}L`;

  const formattedTime = useMemo(() => {
    if (!lastUpdate) return 'Never';
    return new Date(lastUpdate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastUpdate]);

  const loggedInTeam = useMemo(
    () => teams.find((t) => t.id === teamSession?.teamId) || teams.find((t) => t.name === teamSession?.teamName) || null,
    [teams, teamSession],
  );

  const themePrimary = '#e4be75';
  const themeSecondary = '#24467c';

  // ─── Admin Login Screen ───
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
              <motion.button className="cb-icon-btn" onClick={() => adminLogout()} whileTap={{ scale: 0.9 }} title="Logout" style={{ background: 'rgba(239,68,68,0.2)', borderRadius: 8, width: 32, height: 32, border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

          {/* All Teams Grid */}
          <motion.div className="cb-login-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} style={{ marginTop: '0.75rem' }}>
            <div style={{ marginBottom: '0.9rem' }}>
              <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <IoPeople size={16} /> All Teams — Bid Controls
              </h3>
              <p style={{ margin: 0, fontSize: '0.74rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                Tap a team logo to raise the bid instantly.
              </p>
            </div>

            <div className="cb-team-card-grid cb-team-bid-grid">
              {teams.map((team) => {
                const isLeading = selectedTeam?.id === team.id;
                const canRaiseBid = !!currentPlayer && isConnected && auctionActive && !busyTeamId;
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
                    whileTap={{ scale: canRaiseBid ? 0.96 : 1 }}
                    disabled={!canRaiseBid}
                    onClick={() => handleRaiseBid(team.id, team.name)}
                    aria-label={`Raise bid for ${team.name}`}
                  >
                    {isLeading && (
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
                    <span className="cb-team-bid-hint">
                      {busyTeamId === team.id ? 'Placing bid...' : 'Tap logo to raise bid'}
                    </span>
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
