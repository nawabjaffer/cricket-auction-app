import { useEffect, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, onValue, ref } from 'firebase/database';
import { useSearchParams } from 'react-router-dom';
import { IoChatbubbleEllipsesOutline, IoHeart, IoSend } from 'react-icons/io5';
import { tenantPath } from '../services/tenantPath';
import { liveCommentService } from '../services/liveCommentService';
import {
  DEFAULT_LIVE_COMMENT_SETTINGS,
  type LiveComment,
  type LiveCommentSettings,
  type MatchSetup,
} from '../types/scoring';
import './LiveCommentsPage.css';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

type AudienceProfile = { name: string; details: string; imageUrl: string };

function createVoterId(): string {
  const key = 'live-comments-voter-id';
  const current = localStorage.getItem(key);
  if (current) return current;
  const next = globalThis.crypto?.randomUUID?.() || `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, next);
  return next;
}

export default function LiveCommentsPage() {
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('matchId') || '';
  const profileKey = `live-comments-profile:${tenantPath('scoring')}`;
  const voteKey = `live-comments-votes:${tenantPath('scoring')}:${matchId}`;
  const [database, setDatabase] = useState<ReturnType<typeof getDatabase> | null>(null);
  const [settings, setSettings] = useState<LiveCommentSettings>(DEFAULT_LIVE_COMMENT_SETTINGS);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [profile, setProfile] = useState<AudienceProfile>({ name: '', details: '', imageUrl: '' });
  const [message, setMessage] = useState('');
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    try {
      const appName = 'live-comments-audience';
      const app = getApps().find(existing => existing.name === appName) || initializeApp(firebaseConfig, appName);
      setDatabase(getDatabase(app));
    } catch {
      setFeedback('Could not connect to the live audience service.');
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(profileKey);
      if (saved) setProfile({ name: '', details: '', imageUrl: '', ...JSON.parse(saved) as Partial<AudienceProfile> });
      setVotedIds(JSON.parse(localStorage.getItem(voteKey) || '[]') as string[]);
    } catch { /* use an empty profile on malformed local data */ }
  }, [profileKey, voteKey]);

  useEffect(() => {
    if (!database || !matchId) return;
    liveCommentService.initialize(database, tenantPath('scoring'));
    const unsubscribeSettings = liveCommentService.subscribeSettings(setSettings);
    const unsubscribeQueue = liveCommentService.subscribeQueue(matchId, setComments);
    const unsubscribeMatch = onValue(ref(database, tenantPath(`scoring/matches/${matchId}/setup`)), snapshot => {
      setMatch(snapshot.exists() ? snapshot.val() as MatchSetup : null);
    });
    return () => { unsubscribeSettings(); unsubscribeQueue(); unsubscribeMatch(); };
  }, [database, matchId]);

  const updateProfile = (next: AudienceProfile) => {
    setProfile(next);
    localStorage.setItem(profileKey, JSON.stringify(next));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!matchId || !profile.name.trim() || !message.trim() || busy) return;
    const lastSentAt = Number(localStorage.getItem(`live-comments-last-submit:${matchId}`) || 0);
    const waitSeconds = Math.ceil((15_000 - (Date.now() - lastSentAt)) / 1000);
    if (waitSeconds > 0) { setFeedback(`Please wait ${waitSeconds}s before sending another message.`); return; }
    setBusy(true);
    setFeedback('');
    try {
      await liveCommentService.submit(matchId, { ...profile, message });
      localStorage.setItem(`live-comments-last-submit:${matchId}`, String(Date.now()));
      setMessage('');
      setFeedback('Your comment is in the live queue.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not send your comment. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleVote = async (comment: LiveComment) => {
    if (!matchId || votedIds.includes(comment.id)) return;
    try {
      const accepted = await liveCommentService.vote(matchId, comment.id, createVoterId());
      if (accepted) {
        const next = [...votedIds, comment.id];
        setVotedIds(next);
        localStorage.setItem(voteKey, JSON.stringify(next));
      }
    } catch { setFeedback('Could not record your vote.'); }
  };

  const acceptingComments = settings.enabled && Boolean(match) && match?.status !== 'completed';

  return (
    <main className="live-comments">
      <header className="live-comments__header">
        <div className="live-comments__brand-mark"><IoChatbubbleEllipsesOutline size={22} /></div>
        <div className="live-comments__brand-copy">
          <span className="live-comments__eyebrow">LIVE AUDIENCE</span>
          <h1>Join the conversation</h1>
        </div>
        <span className={`live-comments__status ${acceptingComments ? 'is-live' : ''}`}>
          <span />{acceptingComments ? 'OPEN' : 'CLOSED'}
        </span>
      </header>

      <section className="live-comments__match">
        <span className="live-comments__match-label">ON AIR</span>
        <strong>{match ? `${match.teamA.name} vs ${match.teamB.name}` : 'Cricket broadcast'}</strong>
        <span>{match?.venue || 'Your message may be featured on the live broadcast.'}</span>
      </section>

      {!matchId ? (
        <section className="live-comments__notice"><h2>Match link required</h2><p>Open the audience link shared by the scorer to join this match.</p></section>
      ) : !acceptingComments ? (
        <section className="live-comments__notice"><h2>Comments are closed</h2><p>The scorer will reopen the conversation when the broadcast is ready.</p></section>
      ) : (
        <form className="live-comments__compose" onSubmit={handleSubmit}>
          <div className="live-comments__section-heading">
            <div><span>YOUR MESSAGE</span><h2>Say it live</h2></div>
            <span className="live-comments__limit">{message.length}/280</span>
          </div>
          <div className="live-comments__profile-grid">
            <label className="live-comments__field">
              <span>Display name</span>
              <input value={profile.name} onChange={event => updateProfile({ ...profile, name: event.target.value })} maxLength={40} placeholder="e.g. Sam R." required />
            </label>
            <label className="live-comments__field">
              <span>Team or detail <small>optional</small></span>
              <input value={profile.details} onChange={event => updateProfile({ ...profile, details: event.target.value })} maxLength={64} placeholder="e.g. Blue Hawks fan" />
            </label>
          </div>
          <label className="live-comments__field live-comments__field--avatar">
            <span>Profile image URL <small>optional</small></span>
            <input type="url" value={profile.imageUrl} onChange={event => updateProfile({ ...profile, imageUrl: event.target.value })} placeholder="https://..." inputMode="url" />
          </label>
          <label className="live-comments__field">
            <span>Comment</span>
            <textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={280} rows={3} placeholder="Cheer on your team..." required />
          </label>
          <div className="live-comments__submit-row">
            <span>One message every 15 seconds</span>
            <button type="submit" disabled={busy || !profile.name.trim() || !message.trim()}><IoSend size={17} />{busy ? 'Sending' : 'Send'}</button>
          </div>
          {feedback && <p className="live-comments__feedback" role="status">{feedback}</p>}
        </form>
      )}

      <section className="live-comments__queue">
        <div className="live-comments__section-heading">
          <div><span>FAN VOICES</span><h2>Live comments</h2></div>
          <span className="live-comments__count">{comments.length}</span>
        </div>
        {comments.length === 0 ? (
          <div className="live-comments__empty"><span>01</span><p>Be the first to leave a message.</p></div>
        ) : comments.map((comment, index) => {
          const voted = votedIds.includes(comment.id);
          return (
            <article key={comment.id} className="live-comments__comment">
              <span className="live-comments__rank">{String(index + 1).padStart(2, '0')}</span>
              <div className="live-comments__avatar">
                {comment.name.slice(0, 1).toUpperCase()}
                {comment.imageUrl && <img src={comment.imageUrl} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} />}
              </div>
              <div className="live-comments__comment-body">
                <div className="live-comments__comment-meta"><strong>{comment.name}</strong>{comment.details && <span>{comment.details}</span>}{comment.source === 'youtube' && <em>YouTube</em>}</div>
                <p>{comment.message}</p>
              </div>
              <button className={`live-comments__vote ${voted ? 'is-voted' : ''}`} onClick={() => void handleVote(comment)} disabled={voted} aria-label={`Upvote ${comment.name}'s comment`}>
                <IoHeart size={17} /><span>{comment.upvotes}</span>
              </button>
            </article>
          );
        })}
      </section>
      <footer className="live-comments__footer">Keep it kind. Comments are reviewed before they appear on air.</footer>
    </main>
  );
}