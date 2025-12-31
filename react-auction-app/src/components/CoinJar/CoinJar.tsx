// ============================================================================
// COIN JAR ANIMATION COMPONENT
// Animated coin jar for random player selection
// ============================================================================

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { audioService } from '../../services';

interface CoinJarProps {
  onAnimationComplete: () => void;
  isAnimating: boolean;
  playerName?: string;
}

export function CoinJar({ onAnimationComplete, isAnimating, playerName }: CoinJarProps) {
  const [showResult, setShowResult] = useState(false);

  const handleAnimationComplete = useCallback(() => {
    setShowResult(true);
    setTimeout(() => {
      setShowResult(false);
      onAnimationComplete();
    }, 1500);
  }, [onAnimationComplete]);

  // Play coin shake sound when animating
  if (isAnimating) {
    audioService.playCoinShake();
  }

  return (
    <AnimatePresence>
      {isAnimating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        >
          <div className="text-center">
            {/* Title */}
            <motion.h2
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-3xl font-bold text-white mb-8"
            >
              🎲 Random Selection 🎲
            </motion.h2>

            {/* Coin Jar */}
            <motion.div
              className="relative w-48 h-64 mx-auto"
              animate={!showResult ? {
                rotate: [-5, 5, -5, 5, -3, 3, 0],
                y: [0, -10, 0, -10, 0],
              } : {}}
              transition={{
                duration: 0.5,
                repeat: showResult ? 0 : 5,
                onComplete: handleAnimationComplete,
              }}
            >
              {/* Jar Body */}
              <div className="absolute bottom-0 w-full h-48 bg-gradient-to-b from-amber-200/30 to-amber-400/30 rounded-b-3xl border-4 border-amber-500/50 backdrop-blur-sm overflow-hidden">
                {/* Coins inside */}
                <div className="absolute bottom-0 w-full h-32 flex flex-wrap justify-center items-end gap-1 p-2">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-6 h-6 bg-yellow-400 rounded-full shadow-lg"
                      style={{
                        backgroundImage: 'linear-gradient(135deg, #ffd700 0%, #ffb700 50%, #ffd700 100%)',
                      }}
                      animate={!showResult ? {
                        y: [0, -20, 0, -15, 0],
                        rotate: [0, 180, 360],
                      } : {}}
                      transition={{
                        duration: 0.3,
                        delay: i * 0.02,
                        repeat: showResult ? 0 : Infinity,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Jar Lid */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-16">
                <div className="w-full h-8 bg-amber-600 rounded-t-xl" />
                <div className="w-24 h-4 mx-auto bg-amber-700 rounded-b-lg" />
              </div>
            </motion.div>

            {/* Result */}
            <AnimatePresence>
              {showResult && playerName && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className="mt-8"
                >
                  <div className="inline-block bg-[var(--theme-accent)] text-white px-8 py-4 rounded-xl shadow-2xl">
                    <div className="text-sm opacity-80">Selected Player</div>
                    <div className="text-2xl font-bold">{playerName}</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Loading text */}
            {!showResult && (
              <motion.p
                className="mt-8 text-white/60"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                Selecting random player...
              </motion.p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
