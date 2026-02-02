// ============================================================================
// MOTION SENSOR HOOK
// Detects vertical device lift (Z-axis) for gesture-based bidding
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
  cooldown?: number; // Milliseconds between detections
  onMotionDetected?: (motion: 'raise' | 'lower') => void;
}

export function useMotionSensor(options: UseMotionSensorOptions) {
  const {
    enabled = false,
    cooldown = 500, // 500ms cooldown between detections
    onMotionDetected,
  } = options;

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const lastMotionTimeRef = useRef<number>(0);
  const motionDataRef = useRef<MotionData[]>([]);
  const previousAccelerationRef = useRef<number>(0);
  const baselineAccelerationRef = useRef<number | null>(null);

  // Check if device motion is supported
  useEffect(() => {
    const motionSupported =
      typeof window !== 'undefined' &&
      ('DeviceMotionEvent' in window ||
        'ondevicemotion' in window);

    setIsSupported(motionSupported);

    // Check if permission is already granted
    if (motionSupported && typeof navigator !== 'undefined') {
      // iOS 13+ requires explicit permission
      const needsMotionPermission =
        typeof DeviceMotionEvent !== 'undefined' &&
        typeof (DeviceMotionEvent as any).requestPermission === 'function';

      if (needsMotionPermission) {
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
      const motionPermissionAvailable =
        typeof DeviceMotionEvent !== 'undefined' &&
        typeof (DeviceMotionEvent as any).requestPermission === 'function';

      if (motionPermissionAvailable) {
        const permission = await (DeviceMotionEvent as any).requestPermission();
        setHasPermission(permission === 'granted');
        return permission === 'granted';
      }

      // Android/other - assume granted
      setHasPermission(true);
      return true;
    } catch (error) {
      console.error('[MotionSensor] Permission request failed:', error);
      setHasPermission(false);
      return false;
    }
  }, []);

  // Handle device motion event - detect vertical lift (Z-axis)
  const handleDeviceMotion = useCallback(
    (event: DeviceMotionEvent) => {
      if (!enabled) return;

      const acc = event.acceleration ?? event.accelerationIncludingGravity;
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

      // Calculate average Z-axis acceleration (vertical lift) for smoothing
      // Positive Z = lifting phone vertically upward
      const avgZ =
        motionDataRef.current.reduce((sum, d) => sum + d.acceleration.z, 0) /
        motionDataRef.current.length;

      // Establish a baseline to avoid immediate triggers on enable
      if (baselineAccelerationRef.current === null && motionDataRef.current.length >= 3) {
        baselineAccelerationRef.current = avgZ;
        previousAccelerationRef.current = 0;
        return;
      }

      const baselineZ = baselineAccelerationRef.current ?? 0;
      const deltaZ = avgZ - baselineZ;

      // Check cooldown
      if (now - lastMotionTimeRef.current < cooldown) {
        previousAccelerationRef.current = deltaZ;
        return;
      }

      // Detect vertical raise motion (Z-axis positive acceleration)
      // Z-axis: positive = lifting phone up vertically, threshold 0.7 m/s²
      const verticalThreshold = 1.7;
      const isRaising = deltaZ > verticalThreshold && previousAccelerationRef.current <= verticalThreshold;

      if (isRaising) {
        console.log('[MotionSensor] ✅ RAISE detected (ΔZ:', deltaZ.toFixed(2), 'm/s²)');
        lastMotionTimeRef.current = now;
        previousAccelerationRef.current = deltaZ;
        onMotionDetected?.('raise');
      }

      previousAccelerationRef.current = deltaZ;
    },
    [enabled, cooldown, onMotionDetected]
  );

  // Reset buffers when activating the sensor
  useEffect(() => {
    if (isActive) {
      motionDataRef.current = [];
      baselineAccelerationRef.current = null;
      previousAccelerationRef.current = 0;
      lastMotionTimeRef.current = 0;
    }
  }, [isActive]);

  // Setup motion listener
  useEffect(() => {
    if (!enabled || !isActive || !isSupported) {
      return;
    }

    // Permission must be requested from a user gesture (e.g., toggle button)
    if (hasPermission === null) {
      console.warn('[MotionSensor] Permission not requested yet');
      return;
    }

    if (!hasPermission) {
      console.warn('[MotionSensor] Permission not granted');
      return;
    }

    console.log('[MotionSensor] Starting motion detection listener (Z-axis vertical lift)');
    window.addEventListener('devicemotion', handleDeviceMotion, true);

    return () => {
      console.log('[MotionSensor] Stopping motion detection listener');
      window.removeEventListener('devicemotion', handleDeviceMotion, true);
    };
  }, [enabled, isActive, isSupported, hasPermission, handleDeviceMotion]);

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
