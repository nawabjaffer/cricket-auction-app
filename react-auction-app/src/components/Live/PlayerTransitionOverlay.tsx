// ============================================================================
// PLAYER TRANSITION OVERLAY
// Smooth overlay animation when transitioning between players
// ============================================================================

import { motion } from 'framer-motion';

interface PlayerTransitionOverlayProps {
  active: boolean;
}

export default function PlayerTransitionOverlay({ active }: PlayerTransitionOverlayProps) {
  if (!active) return null;

  return (
    <motion.div
      className="player-transition-overlay"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="transition-content"
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        transition={{ delay: 0.1, duration: 0.2 }}
      >
        <div className="transition-spinner" />
        <p className="transition-text">Loading Next Player...</p>
      </motion.div>
    </motion.div>
  );
}
