import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { IoArrowBackOutline, IoBookOutline, IoSearchOutline } from 'react-icons/io5';
import { useTenantNavigate } from '../hooks/useTenantNavigate';
import './GuidesPage.css';

const GUIDE_META: Record<string, { title: string; summary: string }> = {
  auction: { title: 'Auction', summary: 'Prepare and run a live player auction.' },
  administration: { title: 'Administration', summary: 'Configure tournaments, teams, settings, and results.' },
  players: { title: 'Players & Registration', summary: 'Manage player records and public registration.' },
  cricket: { title: 'Cricket Scoring', summary: 'Set up matches and record a live cricket score.' },
  scoreboard: { title: 'Public Scoreboard', summary: 'Share match results and tournament statistics.' },
  broadcast: { title: 'Broadcast & OBS', summary: 'Connect overlays, replay, and highlights to OBS.' },
  football: { title: 'Football', summary: 'Configure teams and operate the football scorer.' },
  kabaddi: { title: 'Kabaddi', summary: 'Configure teams and operate the kabaddi scorer.' },
};

const guideFiles = import.meta.glob('/docs/guides/*/README.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const GUIDE_SECTIONS = Object.entries(guideFiles)
  .map(([path, content]) => {
    const id = path.split('/').at(-2) ?? '';
    const meta = GUIDE_META[id];
    return meta ? { id, ...meta, content } : null;
  })
  .filter((section): section is NonNullable<typeof section> => section !== null)
  .sort((left, right) => Object.keys(GUIDE_META).indexOf(left.id) - Object.keys(GUIDE_META).indexOf(right.id));

export default function GuidesPage() {
  const navigate = useTenantNavigate();
  const [activeId, setActiveId] = useState(GUIDE_SECTIONS[0]?.id ?? 'auction');
  const [query, setQuery] = useState('');
  const activeGuide = GUIDE_SECTIONS.find(section => section.id === activeId) ?? GUIDE_SECTIONS[0];
  const visibleGuides = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return GUIDE_SECTIONS;
    return GUIDE_SECTIONS.filter(section =>
      `${section.title} ${section.summary} ${section.content}`.toLowerCase().includes(normalizedQuery),
    );
  }, [query]);

  return (
    <main className="guides-page">
      <header className="guides-page__header">
        <div className="guides-page__brand"><IoBookOutline aria-hidden="true" /><span>Operator guides</span></div>
        <button type="button" className="guides-page__back" onClick={() => navigate('/')}>
          <IoArrowBackOutline aria-hidden="true" /> Back to app
        </button>
      </header>

      <div className="guides-page__layout">
        <aside className="guides-page__sidebar" aria-label="Guide sections">
          <h1>Guides</h1>
          <label className="guides-page__search">
            <IoSearchOutline aria-hidden="true" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search guides" />
          </label>
          <nav className="guides-page__nav">
            {visibleGuides.map(section => (
              <button
                type="button"
                key={section.id}
                className={section.id === activeGuide?.id ? 'is-active' : ''}
                aria-current={section.id === activeGuide?.id ? 'page' : undefined}
                onClick={() => setActiveId(section.id)}
              >
                <strong>{section.title}</strong>
                <span>{section.summary}</span>
              </button>
            ))}
            {visibleGuides.length === 0 && <p className="guides-page__empty">No guides match that search.</p>}
          </nav>
        </aside>

        <article className="guides-page__article">
          {activeGuide ? (
            <>
              <p className="guides-page__eyebrow">USER GUIDE / {activeGuide.title.toUpperCase()}</p>
              <ReactMarkdown>{activeGuide.content}</ReactMarkdown>
            </>
          ) : <p>No guides are available.</p>}
        </article>
      </div>
    </main>
  );
}