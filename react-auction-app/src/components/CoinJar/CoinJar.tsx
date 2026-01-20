// ============================================================================
// COIN JAR ANIMATION COMPONENT
// Animated coin jar for random player selection with hand picking animation
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
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
  const [showHand, setShowHand] = useState(false);
  const [handPhase, setHandPhase] = useState<'reaching' | 'grabbing' | 'lifting' | 'done'>('reaching');

  // Reset state when animation starts
  useEffect(() => {
    if (isAnimating) {
      setShowResult(false);
      setSelectedCoinIndex(null);
      setShowHand(false);
      setHandPhase('reaching');
    }
  }, [isAnimating]);

  const handleAnimationComplete = useCallback(() => {
    // Pick a random coin
    const randomIndex = Math.floor(Math.random() * 15);
    setSelectedCoinIndex(randomIndex);
    
    // Start hand animation
    setShowHand(true);
    setHandPhase('reaching');
    
    // Hand reaches into bowl
    setTimeout(() => setHandPhase('grabbing'), 400);
    
    // Hand grabs and lifts
    setTimeout(() => setHandPhase('lifting'), 800);
    
    // Show result
    setTimeout(() => {
      setHandPhase('done');
      setShowResult(true);
    }, 1200);

    // Complete animation
    setTimeout(() => {
      setShowResult(false);
      setShowHand(false);
      onAnimationComplete();
    }, 2800);
  }, [onAnimationComplete]);

  // Play coin shake sound when animating
  useEffect(() => {
    if (isAnimating && !selectedCoinIndex) {
      audioService.playCoinShake();
    }
  }, [isAnimating, selectedCoinIndex]);

  return (
    <AnimatePresence>
      {isAnimating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-black/90 to-slate-900/95 backdrop-blur-md"
        >
          <div className="text-center relative">
            {/* Decorative sparkles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 bg-yellow-400 rounded-full"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                  }}
                  animate={{
                    opacity: [0, 1, 0],
                    scale: [0, 1.5, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: Math.random() * 2,
                  }}
                />
              ))}
            </div>

            {/* Title */}
            <motion.div
              initial={{ y: -30, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 15 }}
              className="mb-10"
            >
              <h2 className="text-4xl font-bold bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent drop-shadow-lg">
                ✨ Lucky Draw ✨
              </h2>
              <p className="text-white/50 text-sm mt-2">Selecting random player...</p>
            </motion.div>

            {/* Bowl Container */}
            <div className="relative w-72 h-56 mx-auto">
              {/* Animated Hand */}
              <AnimatePresence>
                {showHand && (
                  <motion.div
                    className="absolute z-30 pointer-events-none"
                    style={{ 
                      left: '50%',
                      top: handPhase === 'reaching' ? '-20%' : handPhase === 'grabbing' ? '35%' : '-30%',
                    }}
                    initial={{ x: '-50%', y: -100, opacity: 0, rotate: -10 }}
                    animate={{ 
                      x: '-50%',
                      y: handPhase === 'reaching' ? 0 : handPhase === 'grabbing' ? 60 : -150,
                      opacity: 1,
                      rotate: handPhase === 'grabbing' ? 5 : -10,
                      scale: handPhase === 'grabbing' ? 1.1 : 1,
                    }}
                    exit={{ y: -150, opacity: 0 }}
                    transition={{ 
                      type: 'spring', 
                      damping: 20, 
                      stiffness: 150 
                    }}
                  >
                    {/* Hand SVG */}
                    <svg width="80" height="100" viewBox="0 0 80 100" className="drop-shadow-2xl">
                      {/* Arm */}
                      <rect x="30" y="60" width="20" height="50" rx="8" fill="#F5D0C5" />
                      <rect x="32" y="60" width="16" height="50" rx="6" fill="#FCEEE9" />
                      
                      {/* Palm */}
                      <ellipse cx="40" cy="45" rx="25" ry="20" fill="#F5D0C5" />
                      <ellipse cx="40" cy="45" rx="22" ry="17" fill="#FCEEE9" />
                      
                      {/* Fingers - curl when grabbing */}
                      <motion.g
                        animate={{ 
                          rotate: handPhase === 'grabbing' || handPhase === 'lifting' ? 30 : 0 
                        }}
                        style={{ transformOrigin: '20px 40px' }}
                      >
                        <rect x="8" y="20" width="10" height="30" rx="5" fill="#F5D0C5" />
                      </motion.g>
                      <motion.g
                        animate={{ 
                          rotate: handPhase === 'grabbing' || handPhase === 'lifting' ? 15 : 0 
                        }}
                        style={{ transformOrigin: '25px 35px' }}
                      >
                        <rect x="20" y="8" width="10" height="35" rx="5" fill="#F5D0C5" />
                      </motion.g>
                      <motion.g
                        animate={{ 
                          rotate: handPhase === 'grabbing' || handPhase === 'lifting' ? 0 : 0 
                        }}
                        style={{ transformOrigin: '40px 30px' }}
                      >
                        <rect x="35" y="5" width="10" height="38" rx="5" fill="#F5D0C5" />
                      </motion.g>
                      <motion.g
                        animate={{ 
                          rotate: handPhase === 'grabbing' || handPhase === 'lifting' ? -15 : 0 
                        }}
                        style={{ transformOrigin: '55px 35px' }}
                      >
                        <rect x="50" y="10" width="10" height="32" rx="5" fill="#F5D0C5" />
                      </motion.g>
                      <motion.g
                        animate={{ 
                          rotate: handPhase === 'grabbing' || handPhase === 'lifting' ? -25 : 0 
                        }}
                        style={{ transformOrigin: '65px 45px' }}
                      >
                        <rect x="62" y="28" width="8" height="22" rx="4" fill="#F5D0C5" />
                      </motion.g>
                    </svg>
                    
                    {/* Coin being held */}
                    {(handPhase === 'lifting' || handPhase === 'done') && (
                      <motion.div
                        className="absolute left-1/2 -translate-x-1/2 bottom-0 w-10 h-10 rounded-full shadow-xl"
                        style={{
                          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FFD700 100%)',
                          boxShadow: '0 0 20px rgba(255, 215, 0, 0.6)',
                        }}
                        initial={{ scale: 0 }}
                        animate={{ 
                          scale: 1,
                          rotate: [0, 360],
                        }}
                        transition={{ 
                          scale: { duration: 0.3 },
                          rotate: { duration: 2, repeat: Infinity, ease: 'linear' }
                        }}
                      >
                        <div className="absolute inset-1 rounded-full border-2 border-yellow-300/50" />
                        <div className="absolute inset-0 flex items-center justify-center text-amber-800 font-bold text-xs">
                          ₹
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bowl */}
              <motion.div
                className="relative w-full h-full mx-auto"
                animate={!selectedCoinIndex ? {
                  rotate: [-6, 6, -6, 6, -4, 4, -2, 2, 0],
                  y: [0, -8, 0, -8, 0, -4, 0],
                } : {}}
                transition={{
                  duration: 0.5,
                  repeat: selectedCoinIndex ? 0 : 5,
                  onComplete: handleAnimationComplete,
                }}
              >
                {/* Bowl shadow */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-4 bg-black/30 rounded-full blur-md" />
                
                {/* Bowl body */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-56 h-36 overflow-hidden">
                  {/* Bowl outer */}
                  <div 
                    className="absolute inset-0 rounded-b-full"
                    style={{
                      background: 'linear-gradient(180deg, #8B4513 0%, #A0522D 30%, #CD853F 70%, #DEB887 100%)',
                      boxShadow: 'inset 0 -10px 30px rgba(0,0,0,0.3), 0 5px 15px rgba(0,0,0,0.4)',
                    }}
                  />
                  
                  {/* Bowl inner rim */}
                  <div 
                    className="absolute top-0 left-2 right-2 h-28 rounded-b-full"
                    style={{
                      background: 'linear-gradient(180deg, #654321 0%, #8B4513 50%, #5D3A1A 100%)',
                      boxShadow: 'inset 0 10px 20px rgba(0,0,0,0.4)',
                    }}
                  />
                  
                  {/* Coins inside bowl */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-44 h-24 flex flex-wrap justify-center items-end gap-1 p-2">
                    {Array.from({ length: 15 }).map((_, i) => (
                      <motion.div
                        key={i}
                        className={`w-7 h-7 rounded-full shadow-md relative ${
                          selectedCoinIndex === i ? 'opacity-0' : ''
                        }`}
                        style={{
                          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FFD700 100%)',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.3), inset 0 -2px 4px rgba(0,0,0,0.2)',
                        }}
                        animate={!selectedCoinIndex ? {
                          y: [0, -15 - Math.random() * 10, 0, -12 - Math.random() * 8, 0],
                          rotate: [0, 180, 360],
                          x: [0, (Math.random() - 0.5) * 8, 0],
                        } : {}}
                        transition={{
                          duration: 0.35,
                          delay: i * 0.025,
                          repeat: selectedCoinIndex ? 0 : Infinity,
                        }}
                      >
                        <div className="absolute inset-1 rounded-full border border-yellow-300/40" />
                        <div className="absolute inset-0 flex items-center justify-center text-amber-700 font-bold text-[10px]">
                          ₹
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
                
                {/* Bowl rim highlight */}
                <div 
                  className="absolute bottom-[140px] left-1/2 -translate-x-1/2 w-60 h-3 rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                  }}
                />
              </motion.div>
            </div>

            {/* Result */}
            <AnimatePresence>
              {showResult && playerName && (
                <motion.div
                  initial={{ scale: 0, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.8, opacity: 0, y: -20 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="mt-10"
                >
                  {/* Celebration particles */}
                  <div className="absolute inset-0 pointer-events-none">
                    {[...Array(30)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-2 h-2 rounded-full"
                        style={{
                          left: '50%',
                          top: '60%',
                          backgroundColor: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'][i % 5],
                        }}
                        initial={{ x: 0, y: 0, opacity: 1 }}
                        animate={{
                          x: (Math.random() - 0.5) * 400,
                          y: (Math.random() - 0.5) * 300,
                          opacity: 0,
                          scale: [1, 1.5, 0],
                        }}
                        transition={{ duration: 1.5, ease: 'easeOut' }}
                      />
                    ))}
                  </div>
                  
                  <div className="relative inline-block">
                    <div 
                      className="px-10 py-6 rounded-2xl shadow-2xl"
                      style={{
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                        border: '2px solid rgba(255, 215, 0, 0.5)',
                        boxShadow: '0 0 40px rgba(255, 215, 0, 0.3), inset 0 0 20px rgba(255, 215, 0, 0.1)',
                      }}
                    >
                      <motion.div 
                        className="text-yellow-400/80 text-sm font-medium tracking-wider uppercase"
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        🎉 Selected Player 🎉
                      </motion.div>
                      <div className="text-3xl font-bold text-white mt-2 tracking-wide">
                        {playerName}
                      </div>
                    </div>
                    
                    {/* Glow effect */}
                    <div 
                      className="absolute -inset-1 rounded-2xl -z-10 blur-lg opacity-50"
                      style={{
                        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Loading indicator */}
            {!showResult && !showHand && (
              <motion.div
                className="mt-8 flex items-center justify-center gap-2"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 bg-yellow-400 rounded-full"
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                    />
                  ))}
                </div>
                <span className="text-white/50 text-sm ml-2">Shaking the bowl...</span>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
