// ============================================================================
// MOTION SENSOR HOOK
// Detects device motion (raise/lower) for gesture-based bidding
// Uses Device Motion API with proper permissions handling
// ============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

interface MotionData {
  acceleration: {
    x: number;
    y: number;
    z: number;
  };
  timestamp: number;
}

interface UseMotionSensorOptions {
  enabled: boolean;
  threshold?: number; // Minimum acceleration to trigger (m/s²)
  cooldown?: number; // Milliseconds between detections
  onMotionDetected?: (motion: 'raise' | 'lower') => void;
}

export function useMotionSensor(options: UseMotionSensorOptions) {
  const {
    enabled = false,
    threshold = 2.5, // Moderate motion threshold
    cooldown = 500, // 500ms cooldown between detections
    onMotionDetected,
  } = options;

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const lastMotionTimeRef = useRef<number>(0);
  const motionDataRef = useRef<MotionData[]>([]);
  const previousAccelerationRef = useRef<number>(0);

  // Check if device motion is supported
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      ('DeviceMotionEvent' in window ||
        'ondevicemotion' in window);

    setIsSupported(supported);

    // Check if permission is already granted
    if (supported && typeof navigator !== 'undefined') {
      // iOS 13+ requires explicit permission
      if (
        typeof DeviceMotionEvent !== 'undefined' &&
        typeof (DeviceMotionEvent as any).requestPermission === 'function'
      ) {
        // iOS - check cached permission
        setHasPermission(null); // Will need to request
      } else {
        // Android and older browsers - usually granted
        setHasPermission(true);
      }
    }
  }, []);

  // Request motion permission (iOS 13+)
  const requestPermission = useCallback(async () => {
    try {
      if (
        typeof DeviceMotionEvent !== 'undefined' &&
        typeof (DeviceMotionEvent as any).requestPermission === 'function'
      ) {
        // iOS 13+
        const permission = await (DeviceMotionEvent as any).requestPermission();
        setHasPermission(permission === 'granted');
        return permission === 'granted';
      } else {
        // Android/other - assume granted
        setHasPermission(true);
        return true;
      }
    } catch (error) {
      console.error('[MotionSensor] Permission request failed:', error);
      setHasPermission(false);
      return false;
    }
  }, []);

  // Handle device motion event
  const handleDeviceMotion = useCallback(
    (event: DeviceMotionEvent) => {
      if (!enabled) return;

      const acc = event.acceleration;
      if (!acc) return;

      // Store motion data for smoothing
      const now = Date.now();
      motionDataRef.current.push({
        acceleration: {
          x: acc.x || 0,
          y: acc.y || 0,
          z: acc.z || 0,
        },
        timestamp: now,
      });

      // Keep only last 5 readings (about 100ms at 50Hz)
      if (motionDataRef.current.length > 5) {
        motionDataRef.current.shift();
      }

      // Calculate average acceleration for smoothing
      const avgY =
        motionDataRef.current.reduce((sum, d) => sum + d.acceleration.y, 0) /
        motionDataRef.current.length;

      // Check cooldown
      if (now - lastMotionTimeRef.current < cooldown) {
        previousAccelerationRef.current = avgY;
        return;
      }

      // Detect upward motion (raising device from table)
      // Y-axis: positive = tilting up (device raising), negative = tilting down
      const isRaising = avgY > threshold && previousAccelerationRef.current <= threshold;
      const isLowering = avgY < -threshold && previousAccelerationRef.current >= -threshold;

      if (isRaising) {
        console.log('[MotionSensor] ✅ RAISE detected (Y:', avgY.toFixed(2), ')');
        lastMotionTimeRef.current = now;
        previousAccelerationRef.current = avgY;
        onMotionDetected?.('raise');
      } else if (isLowering) {
        console.log('[MotionSensor] 📉 LOWER detected (Y:', avgY.toFixed(2), ')');
        lastMotionTimeRef.current = now;
        previousAccelerationRef.current = avgY;
        onMotionDetected?.('lower');
      }

      previousAccelerationRef.current = avgY;
    },
    [enabled, threshold, cooldown, onMotionDetected]
  );

  // Setup motion listener
  useEffect(() => {
    if (!enabled || !isActive || !isSupported) {
      return;
    }

    // Request permission if needed
    if (hasPermission === null) {
      requestPermission().then((granted) => {
        if (granted) {
          console.log('[MotionSensor] Permission granted, starting listener');
          window.addEventListener('devicemotion', handleDeviceMotion);
        }
      });
      return;
    }

    if (!hasPermission) {
      console.warn('[MotionSensor] Permission not granted');
      return;
    }

    console.log('[MotionSensor] Starting motion detection listener');
    window.addEventListener('devicemotion', handleDeviceMotion, true);

    return () => {
      console.log('[MotionSensor] Stopping motion detection listener');
      window.removeEventListener('devicemotion', handleDeviceMotion, true);
    };
  }, [enabled, isActive, isSupported, hasPermission, handleDeviceMotion, requestPermission]);

  // Toggle motion sensor
  const toggleMotionSensor = useCallback(async () => {
    if (!isSupported) {
      console.warn('[MotionSensor] Device motion not supported');
      return false;
    }

    if (hasPermission === null) {
      // Need to request permission first
      const granted = await requestPermission();
      if (!granted) {
        console.warn('[MotionSensor] Permission denied');
        return false;
      }
    }

    setIsActive((prev) => !prev);
    return true;
  }, [isSupported, hasPermission, requestPermission]);

  return {
    isSupported,
    hasPermission,
    isActive,
    toggleMotionSensor,
    requestPermission,
  };
}
