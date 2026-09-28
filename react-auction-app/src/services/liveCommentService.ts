import {
  get,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  set,
  update,
  type Database,
} from 'firebase/database';
import { DEFAULT_LIVE_COMMENT_SETTINGS, type LiveComment, type LiveCommentSettings } from '../types/scoring';
import { rankLiveComments } from '../utils/liveComments';

class LiveCommentService {
  private db: Database | null = null;
  private basePath = '';

  initialize(db: Database, basePath: string): void {
    this.db = db;
    this.basePath = basePath.replace(/\/$/, '');
  }

  private database(): Database {
    if (!this.db || !this.basePath) throw new Error('LiveCommentService is not initialized');
    return this.db;
  }

  private settingsPath(): string {
    return `${this.basePath}/liveComments/config`;
  }

  private matchPath(matchId: string): string {
    return `${this.basePath}/matches/${matchId}/liveComments`;
  }

  subscribeSettings(callback: (settings: LiveCommentSettings) => void): () => void {
    const database = this.database();
    return onValue(ref(database, this.settingsPath()), snapshot => {
      callback({ ...DEFAULT_LIVE_COMMENT_SETTINGS, ...(snapshot.val() || {}) });
    });
  }

  async getSettings(): Promise<LiveCommentSettings> {
    const snapshot = await get(ref(this.database(), this.settingsPath()));
    return { ...DEFAULT_LIVE_COMMENT_SETTINGS, ...(snapshot.val() || {}) };
  }

  async saveSettings(settings: LiveCommentSettings): Promise<void> {
    await set(ref(this.database(), this.settingsPath()), settings);
  }

  async updateSettings(patch: Partial<LiveCommentSettings>): Promise<void> {
    await update(ref(this.database(), this.settingsPath()), patch);
  }

  subscribeQueue(matchId: string, callback: (comments: LiveComment[]) => void): () => void {
    const database = this.database();
    return onValue(ref(database, this.matchPath(matchId)), snapshot => {
      const data = snapshot.val() as Record<string, unknown> | null;
      const entries = Object.entries(data?.items || {}).flatMap(([id, raw]) => {
        if (!raw || typeof raw !== 'object') return [];
        const comment = raw as Omit<LiveComment, 'id'>;
        return [{ ...comment, id, upvotes: Number(comment.upvotes) || 0 }];
      });
      callback(rankLiveComments(entries));
    });
  }

  async submit(matchId: string, input: Pick<LiveComment, 'name' | 'message' | 'details' | 'imageUrl'>): Promise<string> {
    const database = this.database();
    const settings = await this.getSettings();
    if (!settings.enabled) throw new Error('Audience comments are not open right now');

    const name = input.name.trim().slice(0, 40);
    const message = input.message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 280);
    const details = input.details?.trim().slice(0, 64) || undefined;
    const imageUrl = this.safeImageUrl(input.imageUrl);
    if (!name || !message) throw new Error('Name and message are required');

    const newRef = push(ref(database, `${this.matchPath(matchId)}/items`));
    if (!newRef.key) throw new Error('Could not create a comment');
    const comment: Omit<LiveComment, 'id'> = {
      name,
      message,
      ...(details ? { details } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      source: 'audience',
      upvotes: 0,
      createdAt: Date.now(),
    };
    await set(newRef, comment);
    return newRef.key;
  }

  async vote(matchId: string, commentId: string, voterId: string): Promise<boolean> {
    const database = this.database();
    let accepted = false;
    const voteRef = ref(database, `${this.matchPath(matchId)}/votes/${commentId}/${voterId}`);
    const result = await runTransaction(voteRef, current => {
      if (current !== null) return;
      accepted = true;
      return Date.now();
    });
    if (!result.committed || !accepted) return false;

    await runTransaction(ref(database, `${this.matchPath(matchId)}/items/${commentId}/upvotes`), current =>
      (Number(current) || 0) + 1,
    );
    return true;
  }

  async importYouTubeComment(matchId: string, externalId: string, comment: Pick<LiveComment, 'name' | 'message' | 'imageUrl'>): Promise<void> {
    const database = this.database();
    const safeId = `youtube_${externalId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const commentRef = ref(database, `${this.matchPath(matchId)}/items/${safeId}`);
    const existing = await get(commentRef);
    if (existing.exists()) return;
    await set(commentRef, {
      name: comment.name.trim().slice(0, 40) || 'YouTube viewer',
      message: comment.message.trim().slice(0, 280),
      ...(this.safeImageUrl(comment.imageUrl) ? { imageUrl: this.safeImageUrl(comment.imageUrl) } : {}),
      source: 'youtube',
      upvotes: 0,
      createdAt: Date.now(),
    } satisfies Omit<LiveComment, 'id'>);
  }

  async remove(matchId: string, commentId: string): Promise<void> {
    const database = this.database();
    await Promise.all([
      remove(ref(database, `${this.matchPath(matchId)}/items/${commentId}`)),
      remove(ref(database, `${this.matchPath(matchId)}/votes/${commentId}`)),
    ]);
  }

  async clearMatch(matchId: string): Promise<void> {
    await remove(ref(this.database(), this.matchPath(matchId)));
  }

  private safeImageUrl(value?: string): string | undefined {
    if (!value?.trim()) return undefined;
    try {
      const url = new URL(value.trim());
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
    } catch {
      return undefined;
    }
  }
}

export const liveCommentService = new LiveCommentService();