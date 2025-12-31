// ============================================================================
// ACTION BUTTONS COMPONENT
// Sold, Unsold, Next buttons for auction control
// ============================================================================

import { motion } from 'framer-motion';
import { useAuction } from '../../hooks';
import { activeConfig } from '../../config';

interface ActionButtonsProps {
  disabled?: boolean;
}

export function ActionButtons({ disabled = false }: ActionButtonsProps) {
  const { 
    markAsSold, 
    markAsUnsold, 
    selectNextPlayer, 
    currentPlayer, 
    selectedTeam,
    selectionMode,
  } = useAuction();

  const hotkeys = activeConfig.hotkeys;
  const canSell = currentPlayer && selectedTeam;
  const canMarkUnsold = currentPlayer !== null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      {/* Sold Button */}
      <motion.button
        whileHover={canSell && !disabled ? { scale: 1.05 } : undefined}
        whileTap={canSell && !disabled ? { scale: 0.95 } : undefined}
        onClick={markAsSold}
        disabled={!canSell || disabled}
        className={`
          relative px-8 py-4 rounded-xl font-bold text-xl
          flex items-center gap-3 min-w-[180px] justify-center
          transition-all duration-200 shadow-lg
          ${canSell && !disabled
            ? 'bg-[var(--theme-sold)] text-white hover:shadow-xl'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'}
        `}
      >
        <span className="text-2xl">✅</span>
        SOLD
        <kbd className="absolute top-1 right-2 text-xs opacity-60 px-1 py-0.5 bg-black/20 rounded">
          {hotkeys.markSold.toUpperCase()}
        </kbd>
      </motion.button>

      {/* Unsold Button */}
      <motion.button
        whileHover={canMarkUnsold && !disabled ? { scale: 1.05 } : undefined}
        whileTap={canMarkUnsold && !disabled ? { scale: 0.95 } : undefined}
        onClick={markAsUnsold}
        disabled={!canMarkUnsold || disabled}
        className={`
          relative px-8 py-4 rounded-xl font-bold text-xl
          flex items-center gap-3 min-w-[180px] justify-center
          transition-all duration-200 shadow-lg
          ${canMarkUnsold && !disabled
            ? 'bg-[var(--theme-unsold)] text-white hover:shadow-xl'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'}
        `}
      >
        <span className="text-2xl">❌</span>
        UNSOLD
        <kbd className="absolute top-1 right-2 text-xs opacity-60 px-1 py-0.5 bg-black/20 rounded">
          {hotkeys.markUnsold.toUpperCase()}
        </kbd>
      </motion.button>

      {/* Next Player Button */}
      <motion.button
        whileHover={!disabled ? { scale: 1.05 } : undefined}
        whileTap={!disabled ? { scale: 0.95 } : undefined}
        onClick={selectNextPlayer}
        disabled={disabled}
        className={`
          relative px-8 py-4 rounded-xl font-bold text-xl
          flex items-center gap-3 min-w-[180px] justify-center
          transition-all duration-200 shadow-lg
          ${!disabled
            ? 'bg-[var(--theme-accent)] text-white hover:shadow-xl'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'}
        `}
      >
        <span className="text-2xl">{selectionMode === 'random' ? '🎲' : '➡️'}</span>
        NEXT
        <kbd className="absolute top-1 right-2 text-xs opacity-60 px-1 py-0.5 bg-black/20 rounded">
          {hotkeys.nextPlayer.toUpperCase()}
        </kbd>
      </motion.button>
    </div>
  );
}
