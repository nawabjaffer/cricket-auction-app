import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface SponsorItem {
  id: string;
  name: string;
  logoUrl?: string;
  tier?: string;
  isTitleSponsor?: boolean;
  website?: string;
  brandColor?: string;
}

interface SponsorShowcaseProps {
  sponsors: SponsorItem[];
  titleSponsor?: SponsorItem | null;
}

const buildDummyLogoUrl = (name: string): string => {
  const safeName = encodeURIComponent(name.trim().slice(0, 14).toUpperCase() || 'LOGO');
  return `https://dummyimage.com/600x600/0d1117/e4be75.png&text=${safeName}`;
};

export function SponsorShowcase({ sponsors }: SponsorShowcaseProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [revealedCount, setRevealedCount] = useState(1);
  const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});

  const displaySponsors = useMemo(() => sponsors.slice(0, 20), [sponsors]);

  // Show all sponsors in the grid (no arbitrary cap of 8)
  const gridSponsors = displaySponsors;
  const activeSponsor = gridSponsors[activeIndex] || gridSponsors[0] || null;

  useEffect(() => {
    if (gridSponsors.length === 0) return;

    const interval = globalThis.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % gridSponsors.length);
      setRevealedCount((prev) => (prev < gridSponsors.length ? prev + 1 : gridSponsors.length));
    }, 2200);

    return () => globalThis.clearInterval(interval);
  }, [gridSponsors.length]);

  if (gridSponsors.length === 0) {
    return null;
  }

  return (
    <section className="sponsor-showcase" aria-label="EPL Sponsors">
      <div className="sponsor-grid-window">
        <div className="sponsor-grid-track">
          {gridSponsors.map((sponsor, index) => {
            const isActive = index === activeIndex;
            const isVisible = index < revealedCount;
            const accent = sponsor.brandColor || '#E4BE75';
            const hasRealLogo = Boolean(sponsor.logoUrl && !failedLogos[sponsor.id]);
            const src = hasRealLogo
              ? sponsor.logoUrl!
              : buildDummyLogoUrl(sponsor.name);

            const placeholderClass = hasRealLogo ? '' : 'placeholder';

            return (
              <motion.div
                key={sponsor.id}
                className={`sponsor-card ${isActive ? 'active' : 'logo-only'} ${placeholderClass}`}
                initial={{ opacity: 0, y: 16, scale: 0.92 }}
                animate={{
                  scale: isActive ? 1.08 : 0.95,
                  opacity: isVisible ? (isActive ? 1 : 0.84) : 0,
                  y: isVisible ? 0 : 14,
                }}
                transition={{ type: 'spring', stiffness: 180, damping: 18 }}
                style={{
                  boxShadow: isActive ? `0 10px 40px ${accent}44` : undefined,
                }}
              >
                <motion.img
                  src={src}
                  alt={sponsor.name}
                  className="sponsor-logo"
                  loading="lazy"
                  onError={() => {
                    setFailedLogos((prev) => ({ ...prev, [sponsor.id]: true }));
                  }}
                  animate={{
                    filter: isActive ? 'grayscale(0)' : 'grayscale(1)',
                    scale: isActive ? 1.08 : 0.9,
                  }}
                  transition={{ duration: 0.35 }}
                />

                {/* Show "No image uploaded" indicator for placeholder logos */}
                {!hasRealLogo && isActive && (
                  <div className="sponsor-no-image-hint">
                    <span>No logo uploaded</span>
                    <small>Upload via Admin → Sponsors</small>
                  </div>
                )}

                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      className="sponsor-content"
                      initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, y: 8, filter: 'blur(5px)' }}
                      transition={{ duration: 0.35, delay: 0.08 }}
                    >
                      <div className="sponsor-name">{sponsor.name}</div>
                      <div className="sponsor-meta-row">
                        <span className="sponsor-tier">{sponsor.tier ? `${sponsor.tier} Sponsor` : 'Official Sponsor'}</span>
                        {sponsor.website && <span className="sponsor-site">{sponsor.website}</span>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>

      {activeSponsor && (
        <div className="sponsor-active-detail" aria-live="polite">
          <div className="sponsor-active-name">{activeSponsor.name}</div>
          <div className="sponsor-active-meta">
            <span>{activeSponsor.tier ? `${activeSponsor.tier} Sponsor` : 'Official Sponsor'}</span>
            {activeSponsor.website && <span>{activeSponsor.website}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
