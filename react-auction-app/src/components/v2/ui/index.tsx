// ============================================================================
// AUCTION APP V2 - UI COMPONENTS
// Modern React components with accessibility and compound patterns
// ============================================================================

import React, { forwardRef, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { clsx } from 'clsx';

// ============================================================================
// BUTTON COMPONENT
// ============================================================================

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent/90 shadow-lg shadow-accent/25',
  secondary: 'bg-surface text-text-primary hover:bg-surface/80 border border-border',
  ghost: 'bg-transparent text-text-primary hover:bg-surface/50',
  danger: 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/25',
  success: 'bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-500/25',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, leftIcon, rightIcon, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-background',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          buttonVariants[variant],
          buttonSizes[size],
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Spinner size="sm" />}
        {!isLoading && leftIcon}
        {children}
        {rightIcon}
      </button>
    );
  }
);
Button.displayName = 'Button';

// ============================================================================
// SPINNER COMPONENT
// ============================================================================

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className }) => {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' };
  
  return (
    <svg
      className={clsx('animate-spin', sizes[size], className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
};

// ============================================================================
// CARD COMPONENT
// ============================================================================

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'glass' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const cardVariants = {
  default: 'bg-surface border border-border',
  glass: 'bg-surface/80 backdrop-blur-xl border border-white/10',
  elevated: 'bg-surface shadow-xl shadow-black/20',
};

const cardPadding = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card: React.FC<CardProps> = ({ 
  children, 
  className, 
  variant = 'default',
  padding = 'md'
}) => {
  return (
    <div className={clsx(
      'rounded-2xl',
      cardVariants[variant],
      cardPadding[padding],
      className
    )}>
      {children}
    </div>
  );
};

// ============================================================================
// BADGE COMPONENT
// ============================================================================

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
}

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-surface text-text-secondary',
  success: 'bg-green-500/20 text-green-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  danger: 'bg-red-500/20 text-red-400',
  info: 'bg-blue-500/20 text-blue-400',
};

export const Badge: React.FC<BadgeProps> = ({ 
  children, 
  variant = 'default', 
  size = 'md',
  className 
}) => {
  return (
    <span className={clsx(
      'inline-flex items-center font-medium rounded-full',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      badgeVariants[variant],
      className
    )}>
      {children}
    </span>
  );
};

// ============================================================================
// AVATAR COMPONENT
// ============================================================================

interface AvatarProps {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const avatarSizes = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-lg',
};

export const Avatar: React.FC<AvatarProps> = ({ 
  src, 
  alt, 
  fallback, 
  size = 'md',
  className 
}) => {
  const [hasError, setHasError] = React.useState(false);
  
  const initials = fallback 
    ? fallback.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className={clsx(
      'relative rounded-full overflow-hidden bg-surface flex items-center justify-center',
      avatarSizes[size],
      className
    )}>
      {src && !hasError ? (
        <img 
          src={src} 
          alt={alt || 'Avatar'}
          className="w-full h-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <span className="font-semibold text-text-secondary">{initials}</span>
      )}
    </div>
  );
};

// ============================================================================
// MODAL COMPONENT (Compound Pattern)
// ============================================================================

interface ModalContextType {
  isOpen: boolean;
  onClose: () => void;
}

const ModalContext = createContext<ModalContextType | null>(null);

const useModalContext = () => {
  const context = useContext(ModalContext);
  if (!context) throw new Error('Modal components must be used within Modal');
  return context;
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const modalVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const modalContentVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 20 },
};

export const Modal: React.FC<ModalProps> & {
  Content: React.FC<{ children: React.ReactNode; className?: string }>;
  Header: React.FC<{ children: React.ReactNode }>;
  Body: React.FC<{ children: React.ReactNode }>;
  Footer: React.FC<{ children: React.ReactNode }>;
} = ({ isOpen, onClose, children }) => {
  return (
    <ModalContext.Provider value={{ isOpen, onClose }}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={onClose}
            />
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </ModalContext.Provider>
  );
};

Modal.Content = ({ children, className }) => {
  return (
    <motion.div
      className={clsx(
        'relative z-10 bg-surface rounded-2xl shadow-2xl max-w-lg w-full mx-4',
        className
      )}
      variants={modalContentVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    >
      {children}
    </motion.div>
  );
};

Modal.Header = ({ children }) => {
  const { onClose } = useModalContext();
  return (
    <div className="flex items-center justify-between p-6 border-b border-border">
      <h2 className="text-xl font-bold text-text-primary">{children}</h2>
      <button
        onClick={onClose}
        className="p-2 rounded-lg hover:bg-surface transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

Modal.Body = ({ children }) => {
  return <div className="p-6">{children}</div>;
};

Modal.Footer = ({ children }) => {
  return (
    <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
      {children}
    </div>
  );
};

// ============================================================================
// TOOLTIP COMPONENT
// ============================================================================

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ 
  content, 
  children, 
  position = 'top' 
}) => {
  const [isVisible, setIsVisible] = React.useState(false);
  
  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            className={clsx(
              'absolute z-50 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg whitespace-nowrap',
              positions[position]
            )}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ============================================================================
// PROGRESS BAR COMPONENT
// ============================================================================

interface ProgressProps {
  value: number;
  max?: number;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const progressColors = {
  default: 'bg-accent',
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  danger: 'bg-red-500',
};

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  variant = 'default',
  size = 'md',
  showLabel = false,
  className,
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const heights = { sm: 'h-1', md: 'h-2', lg: 'h-3' };

  return (
    <div className={clsx('w-full', className)}>
      {showLabel && (
        <div className="flex justify-between mb-1 text-sm text-text-secondary">
          <span>{value}</span>
          <span>{max}</span>
        </div>
      )}
      <div className={clsx('w-full bg-surface rounded-full overflow-hidden', heights[size])}>
        <motion.div
          className={clsx('h-full rounded-full', progressColors[variant])}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// SKELETON COMPONENT
// ============================================================================

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'text',
  width,
  height,
}) => {
  const baseClasses = 'animate-pulse bg-surface';
  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  return (
    <div
      className={clsx(baseClasses, variantClasses[variant], className)}
      style={{ width, height }}
    />
  );
};

// ============================================================================
// DIVIDER COMPONENT
// ============================================================================

interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export const Divider: React.FC<DividerProps> = ({ 
  orientation = 'horizontal',
  className 
}) => {
  return (
    <div
      className={clsx(
        'bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full',
        className
      )}
    />
  );
};

// ============================================================================
// KEYBOARD KEY COMPONENT
// ============================================================================

interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

export const Kbd: React.FC<KbdProps> = ({ children, className }) => {
  return (
    <kbd className={clsx(
      'inline-flex items-center justify-center px-2 py-1 text-xs font-mono font-semibold',
      'bg-surface border border-border rounded-md text-text-secondary',
      'shadow-sm',
      className
    )}>
      {children}
    </kbd>
  );
};

// ============================================================================
// ANIMATED NUMBER COMPONENT
// ============================================================================

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  className,
}) => {
  const [displayValue, setDisplayValue] = React.useState(value);
  
  React.useEffect(() => {
    const start = displayValue;
    const end = value;
    const duration = 500;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      
      setDisplayValue(current);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [value]);

  return (
    <span className={className}>
      {prefix}{displayValue.toFixed(decimals)}{suffix}
    </span>
  );
};
