// ============================================================================
// NOTIFICATION TOAST COMPONENT
// Auto-dismissing notification messages
// ============================================================================

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { NotificationType } from '../../types';

interface NotificationToastProps {
  type: NotificationType;
  message: string;
  onClose: () => void;
  duration?: number;
}

export function NotificationToast({ 
  type, 
  message, 
  onClose, 
  duration = 3000 
}: NotificationToastProps) {
  // Auto-dismiss
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-500',
          icon: '✅',
          border: 'border-green-400',
        };
      case 'error':
        return {
          bg: 'bg-red-500',
          icon: '❌',
          border: 'border-red-400',
        };
      case 'warning':
        return {
          bg: 'bg-yellow-500',
          icon: '⚠️',
          border: 'border-yellow-400',
        };
      case 'info':
      default:
        return {
          bg: 'bg-blue-500',
          icon: 'ℹ️',
          border: 'border-blue-400',
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -50, scale: 0.9 }}
      className={`
        fixed top-4 right-4 z-[100]
        flex items-center gap-3
        ${styles.bg} text-white
        px-6 py-4 rounded-lg shadow-2xl
        border-l-4 ${styles.border}
        max-w-md
      `}
    >
      <span className="text-xl">{styles.icon}</span>
      <span className="font-medium">{message}</span>
      <button 
        onClick={onClose}
        className="ml-4 hover:opacity-70 transition-opacity"
      >
        ✕
      </button>
    </motion.div>
  );
}

// Container for notifications
interface NotificationContainerProps {
  notification: { type: NotificationType; message: string } | null;
  onClear: () => void;
}

export function NotificationContainer({ notification, onClear }: NotificationContainerProps) {
  return (
    <AnimatePresence>
      {notification && (
        <NotificationToast
          type={notification.type}
          message={notification.message}
          onClose={onClear}
        />
      )}
    </AnimatePresence>
  );
}
