import App from '../App';

/**
 * Mirror page — renders the main auction App in read-only mirror mode.
 * No iframe, no separate execution context. The App component subscribes to
 * Firebase RTDB as a mobile/follower and hydrates the Zustand store from the
 * desktop broadcaster's state. Keyboard shortcuts are blocked.
 */
export default function MirrorPage() {
  return <App mirrorMode />;
}
