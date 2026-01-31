// ============================================================================
// CONNECT TO TEAM SCREEN - Modal with QR Codes and Team Details
// ============================================================================
import React, { useState } from 'react';
import { QRCode } from '../QRCode';
import { TeamCredentials } from '../../services/auth';
import './ConnectToTeam.css';

interface ConnectToTeamProps {
  open: boolean;
  onClose: () => void;
}

export const ConnectToTeam: React.FC<ConnectToTeamProps> = ({ open, onClose }) => {
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div className="connect-modal-overlay" onClick={onClose}>
      <div className="connect-modal" onClick={e => e.stopPropagation()}>
        <div className="connect-header">
          <h2>Connect to Team</h2>
          <button className="connect-close" onClick={onClose}>✕</button>
        </div>
        <div className="connect-team-list">
          {TeamCredentials.map(team => (
            <button
              key={team.username}
              className={`connect-team-btn${selectedTeam === team.username ? ' selected' : ''}`}
              onClick={() => setSelectedTeam(team.username)}
            >
              {team.displayName}
            </button>
          ))}
        </div>
        {selectedTeam && (
          <div className="connect-details">
            {(() => {
              const team = TeamCredentials.find(t => t.username === selectedTeam);
              if (!team) return null;
              const mobileUrl = `${window.location.origin}/mobile-bidding`;
              return (
                <>
                  <div className="connect-qr-section">
                    <QRCode value={mobileUrl} size={180} />
                  </div>
                  <div className="connect-info">
                    <div><strong>Team:</strong> {team.displayName}</div>
                    <div><strong>Username:</strong> {team.username}</div>
                    <div><strong>Password:</strong> {team.password}</div>
                    <div><strong>Mobile URL:</strong> <a href={mobileUrl} target="_blank" rel="noopener noreferrer">{mobileUrl}</a></div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectToTeam;
