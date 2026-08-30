// ============================================================================
// PLAYER CARD COMPONENT
// Displays player information with stats and image
// ============================================================================

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GiCricketBat, GiBaseballGlove, GiSprint, GiShield } from 'react-icons/gi';
import { IoBaseball, IoStar } from 'react-icons/io5';
import type { Player } from '../../types';
import { activeConfig } from '../../config';
import { formatRoleDisplay, getRoleCategory, getRoleBadgeColor as getRoleBadgeHex } from '../../utils/roleFormatter';
import { getKabaddiRoleCategory } from '../../utils/kabaddiRoles';
import { getCachedStorageUrl, resolveImageAsync } from '../../services/firebaseStorageService';
import { extractDriveFileId } from '../../utils/driveImage';
import { getLiveBlobUrl } from '../../services/mediaBlobCache';
import { useCurrencySuffix, useAuctionStore } from '../../store';
import { ImageLightbox } from '../ImageLightbox';

interface PlayerCardProps {
  player: Player;
  isSelected?: boolean;
  showBidInfo?: boolean;
  currentBid?: number;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
}

export function PlayerCard({ 
  player, 
  isSelected = false, 
  showBidInfo = false,
  currentBid,
  onClick,
  size = 'large',
}: PlayerCardProps) {
  const currencySuffix = useCurrencySuffix();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const getRoleIcon = (role: Player['role']) => {
    switch (getKabaddiRoleCategory(role)) {
      case 'Raider': return <GiSprint className="inline-block" />;
      case 'Defender': return <GiShield className="inline-block" />;
      case 'All-Rounder': return <IoStar className="inline-block" />;
      default: break;
    }
    const category = getRoleCategory(role);
    switch (category) {
      case 'Batsman': return <GiCricketBat className="inline-block" />;
      case 'Bowler': return <IoBaseball className="inline-block" />;
      case 'All-Rounder': return <IoStar className="inline-block" />;
      case 'Wicket Keeper Batsman': return <GiBaseballGlove className="inline-block" />;
      default: return <GiCricketBat className="inline-block" />;
    }
  };

  // Firebase Storage image resolution
  const [resolvedImg, setResolvedImg] = useState(() => {
    if (!player.imageUrl) return '/assets/man.jpg';
    const cached = getCachedStorageUrl(player.imageUrl);
    if (cached) {
      const blob = getLiveBlobUrl(cached);
      return blob || cached;
    }
    const fileId = extractDriveFileId(player.imageUrl);
    if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}=s512`;
    return player.imageUrl;
  });
  useEffect(() => {
    if (!player.imageUrl) return;
    let alive = true;
    const cached = getCachedStorageUrl(player.imageUrl);
    if (cached) {
      const blob = getLiveBlobUrl(cached);
      setResolvedImg(blob || cached);
      return () => { alive = false; };
    }
    const storagePath = `images/players/${player.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    resolveImageAsync(player.imageUrl, storagePath, (url) => {
      if (!alive) return;
      const blob = getLiveBlobUrl(url);
      setResolvedImg(blob || url);
    });
    return () => { alive = false; };
  }, [player.imageUrl, player.name]);

  const isUnderAge = useAuctionStore(s => s.enableSpecialCategories) && player.age !== null && player.age < activeConfig.auction.rules.underAgeLimit;

  const sizeClasses = {
    small: 'w-48 h-64',
    medium: 'w-64 h-80',
    large: 'w-80 h-[28rem]',
  };

  const imageSizeClasses = {
    small: 'h-32',
    medium: 'h-40',
    large: 'h-52',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={onClick ? { scale: 1.02 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
      className={`
        ${sizeClasses[size]}
        bg-[var(--theme-surface)] 
        rounded-2xl 
        shadow-2xl 
        overflow-hidden
        ${isSelected ? 'ring-4 ring-[var(--theme-accent)]' : ''}
        ${onClick ? 'cursor-pointer' : ''}
        transition-all duration-300
      `}
    >
      {/* Player Image Section */}
      <div
        className={`relative ${imageSizeClasses[size]} bg-gradient-to-b from-[var(--theme-gradient-start)] to-[var(--theme-gradient-end)] cursor-pointer`}
        onClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
      >
        <img
          src={resolvedImg}
          alt={player.name}
          className="w-full h-full object-cover object-top"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/assets/man.jpg';
          }}
        />

        {/* No image uploaded indicator */}
        {!player.imageUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none">
            <span className="text-amber-400 text-xs font-semibold px-2 py-0.5 bg-black/60 rounded">No Photo</span>
            <span className="text-white/60 text-[0.6rem] mt-1">Upload via Admin</span>
          </div>
        )}
        
        {/* Player ID Badge */}
        <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-mono">
          #{player.id}
        </div>

        {/* Under-age Badge */}
        {isUnderAge && (
          <motion.div
            className="absolute top-2 right-2 text-white px-2.5 py-1 rounded-full text-xs font-bold shadow-lg"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)' }}
            initial={{ scale: 0, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.3 }}
          >
            U-{activeConfig.auction.rules.underAgeLimit}
          </motion.div>
        )}

        {/* Role Badge */}
        <div
          className="absolute bottom-2 left-2 text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1"
          style={{ backgroundColor: getRoleBadgeHex(player.role) }}
        >
          <span>{getRoleIcon(player.role)}</span>
          <span>{formatRoleDisplay(player.role)}</span>
        </div>
      </div>

      {/* Player Info Section */}
      <div className="p-4 space-y-3">
        {/* Name */}
        <h3 className="text-xl font-bold text-[var(--theme-text-primary)] truncate">
          {player.name}
        </h3>

        {/* Age */}
        {player.age && (
          <div className="text-sm text-[var(--theme-text-secondary)]">
            Age: <span className="font-semibold">{player.age} years</span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <StatItem label="Matches" value={player.matches} />
          <StatItem label="Runs" value={player.runs} />
          <StatItem label="Wickets" value={player.wickets} />
          <StatItem 
            label="Best" 
            value={player.role === 'Bowler' ? player.bowlingBestFigures : player.battingBestFigures} 
          />
        </div>

        {/* Base Price / Current Bid */}
        <div className="pt-2 border-t border-[var(--theme-secondary)]/20">
          {showBidInfo && currentBid ? (
            <div className="text-center">
              <div className="text-xs text-[var(--theme-text-secondary)]">Current Bid</div>
              <div className="text-2xl font-bold text-[var(--theme-bid)]">
                ₹{currentBid.toFixed(2)}{currencySuffix}
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-xs text-[var(--theme-text-secondary)]">Base Price</div>
              <div className="text-xl font-bold text-[var(--theme-accent)]">
                ₹{player.basePrice.toFixed(2)}{currencySuffix}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full-view lightbox */}
      <ImageLightbox
        src={resolvedImg}
        alt={player.name}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </motion.div>
  );
}

// Stat item sub-component
function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--theme-background)]/50 rounded px-2 py-1">
      <div className="text-xs text-[var(--theme-text-secondary)]">{label}</div>
      <div className="font-semibold text-[var(--theme-text-primary)]">{value}</div>
    </div>
  );
}
