// ============================================================================
// BID DISPLAY COMPONENT
// Shows current bid amount with Apple-style design
// ============================================================================

import { motion, AnimatePresence } from 'framer-motion';
import { useAuction } from '../../hooks';
import { useCurrencySuffix } from '../../store';

export function BidDisplay() {
  const { 
    currentBid, 
    previousBid, 
  } = useAuction();
  const currencySuffix = useCurrencySuffix();

  return (
    <div className="bid-container">
      {/* Current Bid Display */}
      <div className="bid-main">
        <span className="bid-label">Current Bid</span>
        
        <AnimatePresence mode="wait">
          <motion.div
            key={currentBid}
            initial={{ scale: 0.9, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="bid-amount"
          >
            <span className="bid-currency">₹</span>
            <span className="bid-value">{currentBid.toFixed(2)}</span>
            <span className="bid-unit">{currencySuffix}</span>
          </motion.div>
        </AnimatePresence>

        {/* Previous Bid Reference */}
        {previousBid > 0 && previousBid !== currentBid && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bid-previous"
          >
            was ₹{previousBid.toFixed(2)}{currencySuffix}
          </motion.div>
        )}
      </div>
    </div>
  );
}
