import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuctionStoreV2 } from '../../../store/v2/auctionStoreV2';
import { Kbd } from '../ui';

export const TeamSquadOverlay: React.FC = () => {
  const { 
    activeOverlay, 
    viewingTeamId, 
    teams, 
    soldPlayers, 
    availablePlayers,
    unsoldPlayers,
    setOverlay, 
    setViewingTeamId 
  } = useAuctionStoreV2();
  
  const isVisible = activeOverlay === 'team_squad';
  const team = teams.find(t => t.id === viewingTeamId);

  const handleClose = () => {
    setOverlay(null);
    setViewingTeamId(null);
  };
  
  // Debug logging
  React.useEffect(() => {
    if (isVisible) {
      console.log('[TeamSquadOverlay] VISIBLE - activeOverlay:', activeOverlay, 'viewingTeamId:', viewingTeamId, 'team:', team);
    } else {
      console.log('[TeamSquadOverlay] NOT visible - activeOverlay:', activeOverlay, 'viewingTeamId:', viewingTeamId);
    }
  }, [isVisible, activeOverlay, viewingTeamId, team]);

  // Handle ESC key to close overlay
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Escape' || e.key === 'Esc') && isVisible) {
        console.log('[TeamSquadOverlay] ESC pressed, closing overlay');
        handleClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, handleClose]);

  if (!isVisible || !team) {
    console.log('[TeamSquadOverlay] Early return - isVisible:', isVisible, 'team:', team);
    return null;
  }

  const teamPlayers = soldPlayers.filter(p => p.teamId === team.id);
  
  // Use player placeholder image from assets
  const placeholderImage = '/assets/man.jpg';
  
  // Find captain image - use placeholder if not found
  let captainImage = placeholderImage;
  
  if (team.captain) {
    const allPlayers = [...soldPlayers, ...availablePlayers, ...unsoldPlayers];
    const captain = allPlayers.find(p => p.name.toLowerCase() === team.captain.toLowerCase());
    if (captain?.imageUrl) {
      captainImage = captain.imageUrl;
    }
  }

  // Split players into two columns
  const midPoint = Math.ceil(teamPlayers.length / 2);
  const leftColumn = teamPlayers.slice(0, midPoint);
  const rightColumn = teamPlayers.slice(midPoint);

  // Dynamic background gradient based on team colors
  const backgroundStyle = {
    background: `linear-gradient(135deg, ${team.primaryColor || '#3b82f6'} 0%, ${team.secondaryColor || '#06b6d4'} 100%)`
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={backgroundStyle}
          onClick={handleClose}
        >
          {/* Decorative Elements (Geometric shapes from reference) */}
          <div className="absolute top-0 right-0 p-10 opacity-20">
             <svg width="200" height="200" viewBox="0 0 100 100" fill="white">
               <path d="M0 0 L50 0 L25 50 Z" />
               <path d="M50 0 L100 0 L75 50 Z" />
               <path d="M25 50 L75 50 L50 100 Z" />
             </svg>
          </div>
          <div className="absolute bottom-0 left-20 p-10 opacity-20 rotate-180">
             <svg width="150" height="150" viewBox="0 0 100 100" fill="white">
               <path d="M0 0 L50 0 L25 50 Z" />
               <path d="M50 0 L100 0 L75 50 Z" />
             </svg>
          </div>

          <div className="container mx-auto px-8 flex flex-row items-center justify-between h-full relative z-10">
            
            {/* Left Side: Info */}
            <div className="flex-1 flex flex-col justify-center h-full pt-20 pb-20">
              <motion.div
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <h1 className="text-8xl font-black text-white uppercase leading-none tracking-tighter mb-2">
                  {team.name}
                </h1>
                <h2 className="text-6xl font-bold text-white/90 uppercase tracking-widest mb-8">
                  SQUAD
                </h2>
                <div className="w-32 h-2 bg-white mb-12" />
              </motion.div>

              <div className="flex flex-row gap-16">
                {/* Column 1 */}
                <div className="flex flex-col gap-4">
                  {leftColumn.map((player, idx) => (
                    <motion.div
                      key={player.id}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.3 + (idx * 0.05) }}
                      className="border-b-2 border-white/30 pb-1"
                    >
                      <span className="text-2xl font-bold text-white uppercase tracking-wide">
                        {player.name}
                      </span>
                    </motion.div>
                  ))}
                  {leftColumn.length === 0 && (
                    <span className="text-white/50 text-xl italic">No players yet</span>
                  )}
                </div>

                {/* Column 2 */}
                <div className="flex flex-col gap-4">
                  {rightColumn.map((player, idx) => (
                    <motion.div
                      key={player.id}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.3 + ((idx + midPoint) * 0.05) }}
                      className="border-b-2 border-white/30 pb-1"
                    >
                      <span className="text-2xl font-bold text-white uppercase tracking-wide">
                        {player.name}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Side: Captain Image */}
            <div className="flex-1 h-full flex items-end justify-end relative">
               <motion.div
                 className="h-[90%] w-full relative"
                 initial={{ x: 100, opacity: 0 }}
                 animate={{ x: 0, opacity: 1 }}
                 transition={{ delay: 0.4, type: 'spring', stiffness: 50 }}
               >
                 {/* Image Container */}
                 <img 
                   src={captainImage} 
                   alt="Captain" 
                   className="absolute bottom-0 right-0 max-h-full object-contain drop-shadow-2xl"
                   style={{ filter: 'drop-shadow(0 0 20px rgba(0,0,0,0.3))' }}
                   onError={(e) => {
                     console.log('[TeamSquadOverlay] Image failed to load:', captainImage);
                     // Fallback to placeholder on error
                     (e.target as HTMLImageElement).src = placeholderImage;
                   }}
                 />
               </motion.div>
            </div>

          </div>

          {/* Close Hint */}
          <div className="absolute bottom-8 left-8 text-white/60">
            Press <Kbd>ESC</Kbd> or <Kbd>T</Kbd> to close
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
