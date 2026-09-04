// ============================================================================
// AUCTION HOME SCREEN — idle state shared by the alternate layouts.
//
// Mirrors the classic layout's home content (organizer + title sponsor logos,
// welcome copy, live auction counters, sponsor strip) so switching layouts
// never loses information.
// ============================================================================

import { motion } from 'framer-motion';
import type { AuctionLayoutProps } from './types';

export function AuctionHomeScreen({
  organizerName,
  organizerLogo,
  titleSponsor,
  sponsors,
  playerCounts,
  teamCount,
}: AuctionLayoutProps) {
  const otherSponsors = sponsors.filter((s) => s.id !== titleSponsor?.id).slice(0, 6);

  return (
    <motion.div
      className="al-home"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
    >
      <div className="al-home-logos">
        {titleSponsor && (
          titleSponsor.logoUrl ? (
            <img
              className="al-home-logo"
              src={titleSponsor.logoUrl}
              alt={`${titleSponsor.name} logo`}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="al-home-logo-placeholder">
              <span className="al-home-logo-initials">{titleSponsor.name.charAt(0)}</span>
              <small className="al-home-logo-hint">{titleSponsor.name}</small>
            </div>
          )
        )}

        {organizerLogo ? (
          <img
            className="al-home-logo"
            src={organizerLogo}
            alt={organizerName || 'Organizer'}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="al-home-logo-placeholder">
            <span className="al-home-logo-initials">{(organizerName || 'A').charAt(0)}</span>
            <small className="al-home-logo-hint">Upload logo via Admin</small>
          </div>
        )}
      </div>

      <h1 className="al-home-title">
        {organizerName ? `Welcome to ${organizerName} Auction` : 'Welcome to the Auction'}
      </h1>

      <div className="al-home-hint">
        Press <kbd>N</kbd> for next player
      </div>

      <div className="al-home-stats">
        <div className="al-home-stat">
          <span className="al-home-stat-value">{playerCounts.available}</span>
          <span className="al-home-stat-label">Available</span>
        </div>
        <div className="al-home-stat">
          <span className="al-home-stat-value">{playerCounts.sold}</span>
          <span className="al-home-stat-label">Sold</span>
        </div>
        <div className="al-home-stat">
          <span className="al-home-stat-value">{playerCounts.unsold}</span>
          <span className="al-home-stat-label">Unsold</span>
        </div>
        <div className="al-home-stat">
          <span className="al-home-stat-value">{teamCount}</span>
          <span className="al-home-stat-label">Teams</span>
        </div>
      </div>

      {otherSponsors.length > 0 && (
        <div className="al-home-sponsors">
          {otherSponsors.map((sponsor) => (
            <div key={sponsor.id} className="al-home-sponsor">
              {sponsor.logoUrl && (
                <img
                  src={sponsor.logoUrl}
                  alt=""
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <span>{sponsor.name}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
