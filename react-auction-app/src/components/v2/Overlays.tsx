// ============================================================================
// AUCTION APP V2 - OVERLAY COMPONENTS
// Sold, Unsold, and End overlays with animations
// ============================================================================

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { Button, Card, AnimatedNumber, Kbd } from './ui';
import { RoleIcon } from './PlayerCard';
import type { SoldPlayer, UnsoldPlayer, Player } from '../../types/v2';

// ============================================================================
// BASE OVERLAY WRAPPER
// ============================================================================

interface OverlayWrapperProps {
  isVisible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'info';
}

const overlayVariants = {
  success: 'from-green-500/20 via-green-500/10 to-transparent',
  warning: 'from-orange-500/20 via-orange-500/10 to-transparent',
  info: 'from-blue-500/20 via-blue-500/10 to-transparent',
};

export const OverlayWrapper: React.FC<OverlayWrapperProps> = ({
  isVisible,
  onClose,
  children,
  variant = 'info',
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          {/* Backdrop */}
          <motion.div
            className={clsx(
              'absolute inset-0 bg-gradient-radial',
              overlayVariants[variant]
            )}
            style={{ background: `radial-gradient(circle at center, var(--tw-gradient-from), var(--tw-gradient-via), var(--tw-gradient-to))` }}
          />
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          
          {/* Content */}
          <motion.div
            className="relative z-10"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>

          {/* Close hint */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 text-text-secondary"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            Press <Kbd>Space</Kbd> or <Kbd>ESC</Kbd> to continue
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ============================================================================
// SOLD OVERLAY
// ============================================================================

interface SoldOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  player?: SoldPlayer;
}

export const SoldOverlay: React.FC<SoldOverlayProps> = ({
  isVisible,
  onClose,
  player,
}) => {
  if (!player) return null;

  return (
    <OverlayWrapper isVisible={isVisible} onClose={onClose} variant="success">
      <div className="text-center max-w-lg mx-auto px-4">
        {/* Celebration animation */}
        <motion.div
          className="text-8xl mb-6"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 10, delay: 0.1 }}
        >
          🎉
        </motion.div>

        {/* SOLD badge */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 12, delay: 0.2 }}
        >
          <span className="inline-block px-6 py-2 bg-green-500 text-white text-2xl font-black rounded-full shadow-lg shadow-green-500/30">
            SOLD!
          </span>
        </motion.div>

        {/* Player info */}
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-4xl font-black text-text-primary mb-2">
            {player.name}
          </h2>
          <div className="flex items-center justify-center gap-2 text-text-secondary">
            <RoleIcon role={player.role} size="md" />
            <span>{player.role}</span>
          </div>
        </motion.div>

        {/* Amount */}
        <motion.div
          className="mt-6"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
        >
          <div className="text-6xl font-black text-green-400">
            ₹<AnimatedNumber value={player.soldAmount} decimals={2} />L
          </div>
        </motion.div>

        {/* Team */}
        <motion.div
          className="mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <span className="text-text-secondary">goes to</span>
          <div className="text-2xl font-bold text-text-primary mt-1">
            {player.teamName}
          </div>
        </motion.div>

        {/* Continue button */}
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Button variant="success" size="lg" onClick={onClose}>
            Continue
          </Button>
        </motion.div>
      </div>
    </OverlayWrapper>
  );
};

// ============================================================================
// UNSOLD OVERLAY
// ============================================================================

interface UnsoldOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  player?: UnsoldPlayer;
}

export const UnsoldOverlay: React.FC<UnsoldOverlayProps> = ({
  isVisible,
  onClose,
  player,
}) => {
  if (!player) return null;

  return (
    <OverlayWrapper isVisible={isVisible} onClose={onClose} variant="warning">
      <div className="text-center max-w-lg mx-auto px-4">
        {/* Icon */}
        <motion.div
          className="text-8xl mb-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 10, delay: 0.1 }}
        >
          😔
        </motion.div>

        {/* UNSOLD badge */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 12, delay: 0.2 }}
        >
          <span className="inline-block px-6 py-2 bg-orange-500 text-white text-2xl font-black rounded-full shadow-lg shadow-orange-500/30">
            UNSOLD
          </span>
        </motion.div>

        {/* Player info */}
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-4xl font-black text-text-primary mb-2">
            {player.name}
          </h2>
          <div className="flex items-center justify-center gap-2 text-text-secondary">
            <RoleIcon role={player.role} size="md" />
            <span>{player.role}</span>
          </div>
        </motion.div>

        {/* Info */}
        <motion.div
          className="mt-6 text-text-secondary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {player.canRetry ? (
            <div>
              <span className="text-yellow-400">●</span> Will be available in Round 2
            </div>
          ) : (
            <div>
              <span className="text-red-400">●</span> No longer available
            </div>
          )}
        </motion.div>

        {/* Continue button */}
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Button variant="secondary" size="lg" onClick={onClose}>
            Continue
          </Button>
        </motion.div>
      </div>
    </OverlayWrapper>
  );
};

// ============================================================================
// END OVERLAY
// ============================================================================

interface EndOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  onStartRound2?: () => void;
  hasUnsoldPlayers: boolean;
  stats: {
    total: number;
    sold: number;
    unsold: number;
  };
}

export const EndOverlay: React.FC<EndOverlayProps> = ({
  isVisible,
  onClose,
  onStartRound2,
  hasUnsoldPlayers,
  stats,
}) => {
  return (
    <OverlayWrapper isVisible={isVisible} onClose={onClose} variant="info">
      <Card variant="glass" className="max-w-lg mx-auto p-8 text-center">
        {/* Trophy */}
        <motion.div
          className="text-8xl mb-6"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 10, delay: 0.1 }}
        >
          🏆
        </motion.div>

        <h2 className="text-3xl font-black text-text-primary mb-2">
          Auction Complete!
        </h2>
        <p className="text-text-secondary mb-8">
          All available players have been processed
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <motion.div
            className="text-center p-4 bg-surface rounded-xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="text-3xl font-bold text-text-primary">{stats.total}</div>
            <div className="text-sm text-text-muted">Total</div>
          </motion.div>
          <motion.div
            className="text-center p-4 bg-green-500/10 rounded-xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="text-3xl font-bold text-green-400">{stats.sold}</div>
            <div className="text-sm text-text-muted">Sold</div>
          </motion.div>
          <motion.div
            className="text-center p-4 bg-orange-500/10 rounded-xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="text-3xl font-bold text-orange-400">{stats.unsold}</div>
            <div className="text-sm text-text-muted">Unsold</div>
          </motion.div>
        </div>

        {/* Actions */}
        <motion.div
          className="flex flex-col gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {hasUnsoldPlayers && onStartRound2 && (
            <Button variant="primary" size="lg" onClick={onStartRound2}>
              Start Round 2
            </Button>
          )}
          <Button variant="secondary" size="lg" onClick={onClose}>
            {hasUnsoldPlayers ? 'Skip to End' : 'Close'}
          </Button>
        </motion.div>
      </Card>
    </OverlayWrapper>
  );
};

// ============================================================================
// NOTIFICATION TOAST
// ============================================================================

interface NotificationToastProps {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  onDismiss: (id: string) => void;
}

const toastColors = {
  success: 'border-green-500 bg-green-500/10',
  error: 'border-red-500 bg-red-500/10',
  warning: 'border-yellow-500 bg-yellow-500/10',
  info: 'border-blue-500 bg-blue-500/10',
};

const toastIcons = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export const NotificationToast: React.FC<NotificationToastProps> = ({
  id,
  type,
  title,
  message,
  onDismiss,
}) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      className={clsx(
        'p-4 rounded-xl border-l-4 shadow-lg max-w-sm',
        toastColors[type],
        'bg-surface backdrop-blur-xl'
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg">{toastIcons[type]}</span>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-text-primary">{title}</h4>
          <p className="text-sm text-text-secondary mt-0.5">{message}</p>
        </div>
        <button
          onClick={() => onDismiss(id)}
          className="text-text-muted hover:text-text-secondary transition-colors"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
};

// ============================================================================
// NOTIFICATION CONTAINER
// ============================================================================

interface NotificationContainerProps {
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }>;
  onDismiss: (id: string) => void;
}

export const NotificationContainer: React.FC<NotificationContainerProps> = ({
  notifications,
  onDismiss,
}) => {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => (
          <NotificationToast
            key={notification.id}
            {...notification}
            onDismiss={onDismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};
