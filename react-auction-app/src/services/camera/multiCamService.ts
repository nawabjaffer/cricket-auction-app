// ============================================================================
// MULTI-CAMERA SERVICE — WebRTC mesh with Firebase RTDB signalling
//
// Lets several phones on the same ground network publish their camera feed to
// one host device (the "production" phone/laptop), which shows every angle and
// picks the one that goes to air. The scorer can flip angles remotely because
// the program selection lives in RTDB alongside the live score.
//
// RTDB layout (under `${basePath}/matches/{matchId}/liveCam`):
//   sources/{sourceId}                 CameraSource presence record
//   signals/{sourceId}/offer           client → host  SDP offer
//   signals/{sourceId}/answer          host   → client SDP answer
//   signals/{sourceId}/iceClient/{k}   client → host  ICE candidate
//   signals/{sourceId}/iceHost/{k}     host   → client ICE candidate
//   program                            { activeSourceId, updatedAt }
//
// Signalling is deliberately one-shot per publish session: a camera switch on
// the client swaps the outgoing track in place (replaceTrack) so no
// renegotiation round-trip is needed.
// ============================================================================

import {
  ref, set, get, push, remove, onValue, onDisconnect, off, type Database,
} from 'firebase/database';

export interface CameraSource {
  id: string;
  name: string;
  facing?: 'environment' | 'user';
  joinedAt: number;
  lastSeen: number;
}

export interface ProgramState {
  activeSourceId: string | null;
  updatedAt: number;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

/** Heartbeat interval — hosts drop sources that go quiet for 3 beats. */
const HEARTBEAT_MS = 5000;
export const SOURCE_STALE_MS = HEARTBEAT_MS * 3;

function pcConfig(): RTCConfiguration {
  return { iceServers: ICE_SERVERS };
}

export class MultiCamService {
  private db: Database | null = null;
  private basePath = '';

  initialize(db: Database, basePath: string): void {
    this.db = db;
    this.basePath = basePath;
  }

  get isReady(): boolean {
    return !!this.db;
  }

  private ensureDb(): Database {
    if (!this.db) throw new Error('MultiCamService not initialized');
    return this.db;
  }

  private camPath(matchId: string): string {
    return `${this.basePath}/matches/${matchId}/liveCam`;
  }

  // ── Program (on-air angle) ────────────────────────────────────────────────

  async setProgram(matchId: string, sourceId: string | null): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.camPath(matchId)}/program`), {
      activeSourceId: sourceId,
      updatedAt: Date.now(),
    });
  }

  subscribeProgram(matchId: string, cb: (state: ProgramState) => void): () => void {
    const db = this.ensureDb();
    const node = ref(db, `${this.camPath(matchId)}/program`);
    const handler = onValue(node, snap => {
      const val = snap.exists() ? (snap.val() as ProgramState) : null;
      cb(val ?? { activeSourceId: null, updatedAt: 0 });
    });
    return () => { off(node, 'value', handler); };
  }

  subscribeSources(matchId: string, cb: (sources: CameraSource[]) => void): () => void {
    const db = this.ensureDb();
    const node = ref(db, `${this.camPath(matchId)}/sources`);
    const handler = onValue(node, snap => {
      if (!snap.exists()) { cb([]); return; }
      const data = snap.val() as Record<string, CameraSource>;
      cb(
        Object.values(data)
          .filter((s): s is CameraSource => !!s?.id)
          .sort((a, b) => a.joinedAt - b.joinedAt),
      );
    });
    return () => { off(node, 'value', handler); };
  }

  // ── Publisher (camera phone) ──────────────────────────────────────────────

  /**
   * Publish a local stream to the host. Returns a handle that can swap the
   * outgoing video track (camera flip) and tear the session down.
   */
  async publish(
    matchId: string,
    source: { id: string; name: string; facing?: 'environment' | 'user' },
    stream: MediaStream,
    onState?: (state: RTCPeerConnectionState) => void,
  ): Promise<{ replaceVideoTrack: (track: MediaStreamTrack) => Promise<void>; stop: () => Promise<void> }> {
    const db = this.ensureDb();
    const base = `${this.camPath(matchId)}/signals/${source.id}`;
    const sourceRef = ref(db, `${this.camPath(matchId)}/sources/${source.id}`);

    // Clear any stale session for this source id before starting a new one.
    await remove(ref(db, base));

    const pc = new RTCPeerConnection(pcConfig());
    const videoSender = new Map<string, RTCRtpSender>();

    for (const track of stream.getTracks()) {
      const sender = pc.addTrack(track, stream);
      if (track.kind === 'video') videoSender.set('video', sender);
    }

    pc.onconnectionstatechange = () => onState?.(pc.connectionState);

    const iceRef = ref(db, `${base}/iceClient`);
    pc.onicecandidate = (e) => {
      if (e.candidate) void set(push(iceRef), e.candidate.toJSON());
    };

    const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    await pc.setLocalDescription(offer);
    await set(ref(db, `${base}/offer`), { type: offer.type, sdp: offer.sdp });

    // Host answer
    const answerRef = ref(db, `${base}/answer`);
    const answerHandler = onValue(answerRef, async snap => {
      if (!snap.exists() || pc.signalingState === 'closed') return;
      const desc = snap.val() as RTCSessionDescriptionInit;
      if (pc.currentRemoteDescription) return;
      try { await pc.setRemoteDescription(new RTCSessionDescription(desc)); } catch { /* ignore */ }
    });

    // Host ICE
    const hostIceRef = ref(db, `${base}/iceHost`);
    const seenIce = new Set<string>();
    const hostIceHandler = onValue(hostIceRef, snap => {
      if (!snap.exists()) return;
      const data = snap.val() as Record<string, RTCIceCandidateInit>;
      for (const [key, cand] of Object.entries(data)) {
        if (seenIce.has(key)) continue;
        seenIce.add(key);
        pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => { /* ignore */ });
      }
    });

    // Presence + heartbeat so the host can drop dead sources.
    const record: CameraSource = {
      id: source.id,
      name: source.name,
      facing: source.facing,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
    };
    await set(sourceRef, record);
    await onDisconnect(sourceRef).remove();
    await onDisconnect(ref(db, base)).remove();

    const beat = setInterval(() => {
      void set(sourceRef, { ...record, lastSeen: Date.now() });
    }, HEARTBEAT_MS);

    return {
      replaceVideoTrack: async (track: MediaStreamTrack) => {
        const sender = videoSender.get('video');
        if (sender) await sender.replaceTrack(track);
      },
      stop: async () => {
        clearInterval(beat);
        off(answerRef, 'value', answerHandler);
        off(hostIceRef, 'value', hostIceHandler);
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.close();
        try {
          await onDisconnect(sourceRef).cancel();
          await onDisconnect(ref(db, base)).cancel();
        } catch { /* ignore */ }
        await remove(sourceRef);
        await remove(ref(db, base));
      },
    };
  }

  // ── Host (production device) ──────────────────────────────────────────────

  /**
   * Accept one publisher's feed. Resolves once the answer is published; the
   * remote stream arrives through `onStream`.
   */
  async attachSource(
    matchId: string,
    sourceId: string,
    onStream: (stream: MediaStream) => void,
    onState?: (state: RTCPeerConnectionState) => void,
  ): Promise<() => void> {
    const db = this.ensureDb();
    const base = `${this.camPath(matchId)}/signals/${sourceId}`;

    const offerSnap = await get(ref(db, `${base}/offer`));
    if (!offerSnap.exists()) throw new Error('No offer from source yet');

    const pc = new RTCPeerConnection(pcConfig());
    pc.onconnectionstatechange = () => onState?.(pc.connectionState);
    pc.ontrack = (e) => {
      const [remote] = e.streams;
      if (remote) onStream(remote);
    };

    const iceRef = ref(db, `${base}/iceHost`);
    pc.onicecandidate = (e) => {
      if (e.candidate) void set(push(iceRef), e.candidate.toJSON());
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offerSnap.val() as RTCSessionDescriptionInit));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await set(ref(db, `${base}/answer`), { type: answer.type, sdp: answer.sdp });

    const clientIceRef = ref(db, `${base}/iceClient`);
    const seen = new Set<string>();
    const clientIceHandler = onValue(clientIceRef, snap => {
      if (!snap.exists()) return;
      const data = snap.val() as Record<string, RTCIceCandidateInit>;
      for (const [key, cand] of Object.entries(data)) {
        if (seen.has(key)) continue;
        seen.add(key);
        pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => { /* ignore */ });
      }
    });

    return () => {
      off(clientIceRef, 'value', clientIceHandler);
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
    };
  }

  /** Remove a stale source record (host-side cleanup). */
  async dropSource(matchId: string, sourceId: string): Promise<void> {
    const db = this.ensureDb();
    await remove(ref(db, `${this.camPath(matchId)}/sources/${sourceId}`));
    await remove(ref(db, `${this.camPath(matchId)}/signals/${sourceId}`));
  }
}

export const multiCamService = new MultiCamService();
