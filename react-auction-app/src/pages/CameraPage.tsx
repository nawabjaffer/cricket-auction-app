import { useEffect, useRef, useState } from 'react';
import './CameraPage.css';

interface CameraDevice {
  deviceId: string;
  label: string;
}

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [error, setError] = useState<string>('');

  const stopStream = () => {
    const video = videoRef.current;
    if (video && video.srcObject) {
      const tracks = (video.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      video.srcObject = null;
    }
    setIsRunning(false);
  };

  const loadDevices = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cameras = list
        .filter((d) => d.kind === 'videoinput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Camera' }));
      setDevices(cameras);
      if (!selectedDeviceId && cameras[0]) {
        setSelectedDeviceId(cameras[0].deviceId);
      }
    } catch (err) {
      setError('Failed to load camera devices.');
    }
  };

  const startStream = async () => {
    setError('');
    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsRunning(true);
      await loadDevices();
    } catch (err) {
      setError('Unable to access the camera. Please allow permissions.');
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera API is not supported in this browser.');
      return;
    }

    loadDevices();

    return () => {
      stopStream();
    };
  }, []);

  useEffect(() => {
    if (isRunning) {
      startStream();
    }
  }, [selectedDeviceId]);

  return (
    <div className="camera-page">
      <div className="camera-page__header">
        <div>
          <h1>Camera Preview</h1>
          <p>Use this page to test camera access for v3.</p>
        </div>
        <div className="camera-page__actions">
          {!isRunning ? (
            <button className="camera-btn camera-btn--primary" onClick={startStream}>
              Start Camera
            </button>
          ) : (
            <button className="camera-btn camera-btn--ghost" onClick={stopStream}>
              Stop Camera
            </button>
          )}
        </div>
      </div>

      <div className="camera-page__controls">
        <label htmlFor="cameraDevice" className="camera-label">
          Select Camera
        </label>
        <select
          id="cameraDevice"
          value={selectedDeviceId}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
          className="camera-select"
        >
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="camera-page__error">{error}</div>}

      <div className="camera-page__preview">
        <video ref={videoRef} className="camera-video" muted playsInline />
      </div>

      <div className="camera-page__notes">
        <strong>Note:</strong> Camera access requires HTTPS and user permission.
      </div>
    </div>
  );
}
