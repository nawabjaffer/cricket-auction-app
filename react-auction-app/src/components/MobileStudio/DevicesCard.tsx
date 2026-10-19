// ============================================================================
// DEVICES CARD — phones that are currently reporting in from NJS Live Studio
// (studio hosts and LAN camera sources), with their live state.
// ============================================================================

import { useEffect, useState } from 'react';
import { IoBatteryHalf, IoCopyOutline, IoPhonePortraitOutline } from 'react-icons/io5';
import { isDeviceOnline, type StudioDevicePresence } from '../../types/mobileStudio';

const STATE_LABELS: Record<StudioDevicePresence['state'], string> = {
  idle: 'Idle', preview: 'Preview', connecting: 'Connecting', live: 'LIVE', reconnecting: 'Reconnecting', error: 'Error',
};

export default function DevicesCard({ devices }: Readonly<{ devices: StudioDevicePresence[] }>) {
  // Re-evaluate staleness every few seconds even when no new heartbeat arrives.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const online = devices.filter(device => isDeviceOnline(device, now));

  return (
    <section className="mstudio__card" aria-labelledby="mstudio-devices">
      <header className="mstudio__card-head">
        <IoPhonePortraitOutline size={22} aria-hidden="true" />
        <div>
          <h2 id="mstudio-devices">Connected phones</h2>
          <p>{online.length === 0 ? 'No phones are online right now.' : `${online.length} phone${online.length === 1 ? '' : 's'} online.`}</p>
        </div>
      </header>
      {online.length > 0 && (
        <ul className="mstudio__devices">
          {online.map(device => (
            <li key={device.id} className={`mstudio__device mstudio__device--${device.state}`}>
              <div>
                <strong>{device.name}</strong>
                <small>{device.role === 'camera' ? 'LAN camera' : 'Studio'} · v{device.appVersion}{device.resolution ? ` · ${device.resolution}` : ''}{device.bitrateKbps ? ` · ${(device.bitrateKbps / 1000).toFixed(1)} Mbps` : ''}</small>
              </div>
              <span className="mstudio__state">{STATE_LABELS[device.state]}</span>
              {device.battery !== undefined && (
                <span className="mstudio__battery"><IoBatteryHalf size={15} aria-hidden="true" /> {device.battery}%{device.charging ? ' ⚡' : ''}</span>
              )}
              {device.lanUrl && (
                <button type="button" className="mstudio__icon-btn" title="Copy RTSP URL (OBS / VLC media source)" aria-label={`Copy RTSP URL of ${device.name}`}
                  onClick={() => { void navigator.clipboard?.writeText(device.lanUrl ?? '').catch(() => undefined); }}>
                  <IoCopyOutline size={15} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
