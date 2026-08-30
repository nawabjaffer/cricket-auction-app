// ============================================================================
// LIVE CAMERA SWITCHER
// Compact angle picker for the scoring screen. Shows every phone publishing to
// the multi-camera host and lets the scorer put one on air without leaving the
// scoring controls.
// ============================================================================

import { useEffect, useState } from 'react';
import { IoVideocam, IoRadioButtonOn } from 'react-icons/io5';
import { broadcastDb } from '../../services/camera/broadcastDb';
import { multiCamService, SOURCE_STALE_MS, type CameraSource } from '../../services/camera/multiCamService';
import { tenantPath } from '../../services/tenantPath';
import './LiveCameraSwitcher.css';

interface Props {
  matchId: string | null;
  /** Hide entirely when no camera has joined (default true). */
  hideWhenEmpty?: boolean;
}

export default function LiveCameraSwitcher({ matchId, hideWhenEmpty = true }: Readonly<Props>) {
  const [sources, setSources] = useState<CameraSource[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId) return;
    multiCamService.initialize(broadcastDb, tenantPath('scoring'));
    const unsubSources = multiCamService.subscribeSources(matchId, list => {
      setSources(list.filter(s => Date.now() - (s.lastSeen || 0) < SOURCE_STALE_MS));
    });
    const unsubProgram = multiCamService.subscribeProgram(matchId, p => setActiveId(p.activeSourceId));
    return () => { unsubSources(); unsubProgram(); };
  }, [matchId]);

  if (!matchId) return null;
  if (hideWhenEmpty && sources.length === 0) return null;

  return (
    <div className="cam-switch">
      <div className="cam-switch__head">
        <IoVideocam size={15} />
        <span>Camera angles</span>
        <small>{sources.length} live</small>
      </div>
      {sources.length === 0 ? (
        <p className="cam-switch__empty">No cameras connected.</p>
      ) : (
        <div className="cam-switch__row">
          {sources.map(s => (
            <button
              key={s.id}
              className={`cam-switch__btn ${activeId === s.id ? 'is-live' : ''}`}
              onClick={() => multiCamService.setProgram(matchId, s.id)}
              title={`Put ${s.name} on air`}
            >
              {activeId === s.id && <IoRadioButtonOn size={12} />}
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
