// ============================================================================
// CONNECT TO TEAM SCREEN - Modal with QR Codes and Team Details
// ============================================================================
import React, { useState, useMemo, useEffect } from 'react';
import { IoClose, IoPhonePortrait } from 'react-icons/io5';
import { QRCode } from '../QRCode';
import { TeamLogo } from '../TeamLogo';
import { useTeams } from '../../store';
import { authService } from '../../services';
import { realtimeSyncService } from '../../services/realtimeSync';
import './ConnectToTeam.css';

interface ConnectToTeamProps {
  open: boolean;
  onClose: () => void;
}

export const ConnectToTeam: React.FC<ConnectToTeamProps> = ({ open, onClose }) => {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const teams = useTeams();
  
  // Generate credentials based on runtime team data - simplified format
  const teamCredentials = useMemo(() => {
    return teams.map((team, index) => {
      const normalized = team.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
      const username = normalized || `team${index + 1}`;
      // Simplified password: username + "123"
      const password = `${username}123`;
      return {
        teamId: team.id,
        teamName: team.name,
        username,
        password,
        logoUrl: team.logoUrl,
        primaryColor: team.primaryColor || '#3b82f6',
        secondaryColor: team.secondaryColor || '#1e40af',
      };
    });
  }, [teams]);

  if (!open) return null;

  useEffect(() => {
    if (teamCredentials.length > 0) {
      authService.setTeamCredentials(teamCredentials);
    }
  }, [teamCredentials]);

  const handleResetSessions = () => {
    realtimeSyncService.broadcastSessionReset('manual-reset');
  };

  const selectedTeam = teamCredentials.find(t => t.teamId === selectedTeamId);
  const mobileUrl = `${window.location.origin}/mobile-bidding-live`;

  return (
    <div className="connect-modal-overlay" onClick={onClose}>
      <div className="connect-modal" onClick={e => e.stopPropagation()}>
        <div className="connect-header">
          <h2><IoPhonePortrait className="inline-block mr-2" />Connect to Team</h2>
          <button className="connect-close" onClick={onClose}><IoClose /></button>
        </div>
        
        <div className="connect-instructions">
          <p>Select a team to view login credentials and QR code for mobile bidding.</p>
          <button className="connect-reset-btn" onClick={handleResetSessions}>
            Reset Mobile Sessions
          </button>
        </div>
        
        <div className="connect-team-list">
          {teamCredentials.map((team) => (
            <button
              key={team.teamId}
              className={`connect-team-btn${selectedTeamId === team.teamId ? ' selected' : ''}`}
              onClick={() => setSelectedTeamId(team.teamId)}
              style={{
                borderColor: selectedTeamId === team.teamId ? team.primaryColor : undefined,
                backgroundColor: selectedTeamId === team.teamId ? `${team.primaryColor}20` : undefined,
              }}
            >
              <TeamLogo logoUrl={team.logoUrl} teamName={team.teamName} size="md" />
              <span>{team.teamName}</span>
            </button>
          ))}
        </div>
        
        {selectedTeam && (
          <div className="connect-details">
            <div className="connect-qr-section">
              <QRCode value={mobileUrl} size={200} />
              <p className="qr-hint">📱 Scan to open mobile bidding</p>
              <p className="qr-subhint">URL: {mobileUrl}</p>
            </div>
            <div className="connect-info">
              <div className="info-section-title">Login Credentials</div>
              <div className="info-row">
                <span className="info-label">🏏 Team:</span>
                <span className="info-value">{selectedTeam.teamName}</span>
              </div>
              <div className="info-row">
                <span className="info-label">👤 Username:</span>
                <span className="info-value code">{selectedTeam.username}</span>
              </div>
              <div className="info-row">
                <span className="info-label">🔐 Password:</span>
                <span className="info-value code">{selectedTeam.password}</span>
              </div>
              
              <div className="info-section-title" style={{ marginTop: '1rem' }}>How to Connect</div>
              <ol className="connect-steps">
                <li>Open <strong>/mobile-bidding-live</strong> on your phone</li>
                <li>Or scan the QR code above</li>
                <li>Enter credentials:
                  <div style={{ marginTop: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
                    <div><strong>Username:</strong> {selectedTeam.username}</div>
                    <div><strong>Password:</strong> {selectedTeam.password}</div>
                  </div>
                </li>
                <li>Start bidding!</li>
              </ol>
            </div>
          </div>
        )}
        
        {teams.length === 0 && (
          <div className="connect-empty">
            <p>No teams loaded. Please refresh the auction data.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectToTeam;
