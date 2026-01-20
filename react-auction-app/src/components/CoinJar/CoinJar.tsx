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
  const [selectedCoinIndex, setSelectedCoinIndex] = useState<number | null>(null);
  const [pickedCoins, setPickedCoins] = useState<number[]>([]);

  const handleAnimationComplete = useCallback(() => {
    // Pick a random coin during the animation
    const randomIndex = Math.floor(Math.random() * 20);
    setSelectedCoinIndex(randomIndex);
    setPickedCoins([randomIndex]);
    
    setTimeout(() => {
      setShowResult(true);
    }, 600);

    setTimeout(() => {
      setShowResult(false);
      onAnimationComplete();
    }, 2100);
  }, [onAnimationComplete]);

  // Play coin shake sound when animating
  if (isAnimating && !selectedCoinIndex) {
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
              animate={!selectedCoinIndex ? {
                rotate: [-8, 8, -8, 8, -5, 5, 0],
                y: [0, -15, 0, -15, 0],
              } : {}}
              transition={{
                duration: 0.4,
                repeat: selectedCoinIndex ? 0 : 6,
                onComplete: handleAnimationComplete,
              }}
            >
              {/* Outer Jar Body */}
              <div className="absolute bottom-0 w-full h-48 bg-gradient-to-b from-blue-200/20 to-blue-300/20 rounded-b-3xl border-4 border-blue-400/40 backdrop-blur-sm overflow-hidden">
                
                {/* Inner Bowl/Container with coins */}
                <motion.div 
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 w-40 h-32 bg-gradient-to-b from-amber-100 to-amber-200 rounded-3xl border-2 border-amber-300 shadow-inner overflow-hidden"
                  animate={!selectedCoinIndex ? {
                    rotate: [-10, 10, -8, 8, -5, 5, 0],
                  } : {}}
                  transition={{
                    duration: 0.4,
                    repeat: selectedCoinIndex ? 0 : 6,
                  }}
                >
                  {/* Coins inside */}
                  <div className="absolute bottom-0 w-full h-28 flex flex-wrap justify-center items-end gap-2 p-3">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <motion.div
                        key={i}
                        className={`w-6 h-6 rounded-full shadow-lg transition-all ${
                          pickedCoins.includes(i) ? 'ring-4 ring-green-400 scale-110' : ''
                        }`}
                        style={{
                          backgroundImage: 'linear-gradient(135deg, #ffd700 0%, #ffb700 50%, #ffd700 100%)',
                        }}
                        animate={!selectedCoinIndex ? {
                          y: [0, -25, 0, -20, 0],
                          rotate: [0, 180, 360],
                        } : selectedCoinIndex === i ? {
                          y: [0, -80],
                          x: [0, 40],
                          scale: [1, 1.3],
                          rotate: [0, 720],
                        } : {}}
                        transition={{
                          duration: selectedCoinIndex === i ? 0.6 : 0.3,
                          delay: selectedCoinIndex === i ? 0.1 : i * 0.02,
                          repeat: selectedCoinIndex ? 0 : Infinity,
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
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
