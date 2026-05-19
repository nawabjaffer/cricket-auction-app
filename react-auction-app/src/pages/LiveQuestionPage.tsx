// ============================================================================
// LIVE QUESTION PAGE — /:tenantSlug/cricket/scorer/live-question
// Public audience page to answer live trivia questions during broadcast.
// Reads active question from Firebase and allows voting on options.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue, runTransaction } from 'firebase/database';
import { tenantPath } from '../services/tenantPath';
import type { LiveQuestion, OverlayControlState } from '../types/scoring';
import './LiveQuestionPage.css';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export default function LiveQuestionPage() {
  const [question, setQuestion] = useState<LiveQuestion | null>(null);
  const [voted, setVoted] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [db, setDb] = useState<ReturnType<typeof getDatabase> | null>(null);

  // Initialize Firebase
  useEffect(() => {
    const appName = 'live-question-audience';
    const existing = getApps().find(a => a.name === appName);
    const app = existing || initializeApp(firebaseConfig, appName);
    const database = getDatabase(app);
    setDb(database);
  }, []);

  // Subscribe to active question from overlay control state
  useEffect(() => {
    if (!db) return;
    const params = new URLSearchParams(window.location.search);
    const matchId = params.get('matchId');
    if (!matchId) return;

    const basePath = tenantPath('scoring');
    const overlayRef = ref(db, `${basePath}/matches/${matchId}/overlay`);
    const responsesRef = ref(db, `${basePath}/matches/${matchId}/questionResponses`);

    const unsubOverlay = onValue(overlayRef, (snap) => {
      if (snap.exists()) {
        const ctrl = snap.val() as OverlayControlState;
        if (ctrl.activeOverlay === 'live_question' && ctrl.liveQuestion) {
          setQuestion(ctrl.liveQuestion);
          setVoted(null); // Reset vote for new question
        } else {
          setQuestion(null);
        }
      }
    });

    const unsubResponses = onValue(responsesRef, (snap) => {
      if (snap.exists()) {
        setResponses(snap.val());
      } else {
        setResponses({});
      }
    });

    return () => { unsubOverlay(); unsubResponses(); };
  }, [db]);

  const handleVote = useCallback((optionIndex: number) => {
    if (!db || !question || voted) return;
    const params = new URLSearchParams(window.location.search);
    const matchId = params.get('matchId');
    if (!matchId) return;

    const basePath = tenantPath('scoring');
    const responseRef = ref(db, `${basePath}/matches/${matchId}/questionResponses/${question.id}_${optionIndex}`);

    runTransaction(responseRef, (current) => {
      return (current || 0) + 1;
    });

    setVoted(question.options?.[optionIndex] || `Option ${optionIndex + 1}`);
    // Store in localStorage to prevent re-voting
    localStorage.setItem(`lq_voted_${question.id}`, String(optionIndex));
  }, [db, question, voted]);

  // Check if already voted (from localStorage)
  useEffect(() => {
    if (!question) return;
    const prev = localStorage.getItem(`lq_voted_${question.id}`);
    if (prev !== null) {
      const idx = parseInt(prev);
      setVoted(question.options?.[idx] || `Option ${idx + 1}`);
    }
  }, [question]);

  if (!question) {
    return (
      <div className="live-question-page live-question-page--waiting">
        <div className="live-question-page__icon">🏏</div>
        <h2>Live Question</h2>
        <p>Waiting for the next question from the broadcast...</p>
        <div className="live-question-page__pulse" />
      </div>
    );
  }

  const totalVotes = Object.values(responses).reduce((sum, v) => sum + v, 0);

  return (
    <div className="live-question-page">
      <div className="live-question-page__card">
        <div className="live-question-page__badge">LIVE QUESTION</div>
        <h2 className="live-question-page__text">{question.text}</h2>

        {question.options && question.options.length > 0 ? (
          <div className="live-question-page__options">
            {question.options.map((opt, i) => {
              const voteKey = `${question.id}_${i}`;
              const count = responses[voteKey] || 0;
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const isSelected = voted === opt;

              return (
                <button
                  key={i}
                  className={`live-question-page__option ${isSelected ? 'live-question-page__option--selected' : ''} ${voted ? 'live-question-page__option--voted' : ''}`}
                  onClick={() => handleVote(i)}
                  disabled={!!voted}
                >
                  <span className="live-question-page__option-text">{opt}</span>
                  {voted && (
                    <span className="live-question-page__option-pct">{pct}%</span>
                  )}
                  {voted && (
                    <div
                      className="live-question-page__option-bar"
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="live-question-page__no-options">Open-ended question — answer will be revealed on broadcast!</p>
        )}

        {voted && (
          <div className="live-question-page__voted-msg">
            ✓ You voted: <strong>{voted}</strong>
            {totalVotes > 0 && <span className="live-question-page__total"> ({totalVotes} votes)</span>}
          </div>
        )}
      </div>
    </div>
  );
}
