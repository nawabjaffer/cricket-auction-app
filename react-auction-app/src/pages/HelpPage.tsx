import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IoArrowForwardOutline, IoBookOutline, IoPhonePortraitOutline, IoDesktopOutline, IoCalendarOutline, IoPeopleOutline, IoRadioOutline, IoTrophyOutline, IoSearchOutline, IoDownloadOutline, IoCheckmarkOutline, IoVideocamOutline, IoLayersOutline, IoShieldCheckmarkOutline } from 'react-icons/io5';
import GuidesPage from './GuidesPage';
import { parseReleaseManifest, releaseApkUrl, releaseManifestUrl, type StudioReleaseManifest } from '../types/mobileStudio';
import './HelpPage.css';
import matchDayImage from '../assets/help/match-day.jpg';
import appHomeImage from '../assets/help/app-home.jpg';
import scoringImage from '../assets/help/scoring-workspace.jpg';
import connectorImage from '../assets/help/connector.jpg';

export default function HelpPage() {
  const [params] = useSearchParams();
  if (params.has('section')) return <GuidesPage />;
  return <HelpOverview />;
}

const TOPICS = [
  { id: 'administration', title: 'Set up your tournament', detail: 'Teams, fixtures, schedules and your competition settings.', icon: IoCalendarOutline },
  { id: 'auction', title: 'Run a player auction', detail: 'Player pools, live bidding, budgets and final squads.', icon: IoPeopleOutline },
  { id: 'cricket', title: 'Score a match', detail: 'Start a fixture, resume a live match and record the action.', icon: IoTrophyOutline },
  { id: 'broadcast', title: 'Take your match live', detail: 'Score overlays, OBS controls and broadcast preparation.', icon: IoRadioOutline },
  { id: 'players', title: 'Players & registration', detail: 'Player records, registration, team allocation and exports.', icon: IoPeopleOutline },
  { id: 'mobile', title: 'Android Live Studio', detail: 'Streaming, mobile scoring, scenes and connector cameras.', icon: IoPhonePortraitOutline },
];

const QUESTIONS = [
  ['Can I use the web app and Android app together?', 'Yes. Use your tournament and existing account permissions in the web app or the Android scoring workspace. Cloud-saved fixtures and scores use the same tournament data. Android Scoring needs an internet connection.'],
  ['Which sports have scoring workspaces?', 'Cricket, football, kabaddi and carrom have dedicated scorers. A tournament administrator must enable the sport for your tournament before you can open it.'],
  ['Where is the match I just started?', 'Open Scoring, then Score. Resume the live match instead of starting it again. Matches also contains your scheduled fixtures. Check that you selected the same tournament and sport.'],
  ['How do multiple camera phones connect?', 'Connect the Host and Connector phones to the same trusted Wi-Fi or hotspot. Start each Connector, then scan its QR or paste its pairing link in Host > Cameras. The Host switches camera sources and applies overlays. Router client isolation can prevent devices from connecting.'],
  ['Does the Android app support iPhone or offline scoring?', 'The current mobile app is Android-only. Its scoring workspace hosts the existing online web app; it is not an offline scoring engine. You can use the responsive web app in other supported browsers.'],
  ['Is the Android download a production release?', 'The current public Android download is an explicitly labeled, development-signed testing build. Production signing, account-provider setup and physical-device streaming validation are still required before a production Android release.'],
  ['Can I stream to YouTube and other platforms?', 'The Host supports configured RTMP/RTMPS and SRT destinations, including manual platform stream keys. Multiple enabled destinations can receive the same program. YouTube account linking requires the organizer\'s OAuth/API setup and an eligible live-streaming channel.'],
  ['Will every phone stream in 4K?', 'No. Available quality depends on the camera, hardware encoder, network and thermal limits. Start with a supported 1080p/30 fps mode and inspect a recording and received test stream before going live.'],
];

function HelpOverview() {
  const [platform, setPlatform] = useState<'web' | 'android'>('web');
  const [query, setQuery] = useState('');
  const [release, setRelease] = useState<StudioReleaseManifest | null>(null);
  const [releaseChecked, setReleaseChecked] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(releaseManifestUrl(window.location.origin, 'testing'), { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok ? parseReleaseManifest(await response.json()) : null)
      .then(value => { if (!controller.signal.aborted) { setRelease(value?.channel === 'testing' ? value : null); setReleaseChecked(true); } })
      .catch(() => { if (!controller.signal.aborted) setReleaseChecked(true); });
    return () => controller.abort();
  }, []);
  const filteredTopics = TOPICS.filter(topic => `${topic.title} ${topic.detail}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <main className="help-hub" id="top">
    <a className="help-hub__skip" href="#topics">Skip to help topics</a>
    <header className="help-hub__header">
      <a className="help-hub__brand" href="/help"><img src="/njs-store-192.png" width="36" height="36" alt="NJS Store" /><span>NJS Store<small>HELP CENTER</small></span></a>
      <nav aria-label="Help navigation"><a href="#explore">Web & mobile</a><a href="#topics">Guides</a><a href="#questions">Questions</a></nav>
      <a className="help-hub__header-guide" href="/help?section=auction"><IoBookOutline aria-hidden="true" /> Operator guides <IoArrowForwardOutline aria-hidden="true" /></a>
    </header>
    <section className="help-hub__intro">
      <img className="help-hub__cover" src={matchDayImage} alt="Red cricket ball resting on the grass" fetchPriority="high" width="1600" height="1071" />
      <div className="help-hub__intro-content">
        <p className="help-hub__eyebrow">YOUR TOURNAMENT. FROM SETUP TO STREAM.</p>
        <h1>NJS Store help</h1>
        <p>Plan the fixtures. Score the moment. Bring your audience closer.</p>
        <div className="help-hub__paths">
          <a href="/help?section=administration"><IoDesktopOutline aria-hidden="true" /><span>Web & tournament setup</span><IoArrowForwardOutline aria-hidden="true" /></a>
          <a href="/help?section=mobile"><IoPhonePortraitOutline aria-hidden="true" /><span>Android & live streaming</span><IoArrowForwardOutline aria-hidden="true" /></a>
        </div>
      </div>
    </section>
    <div className="help-hub__sport-strip"><span>One tournament workflow.</span><span>Cricket</span><span>Football</span><span>Kabaddi</span><span>Carrom</span></div>

    <section className="help-hub__section" id="explore" aria-labelledby="explore-title">
      <div className="help-hub__section-head"><div><p className="help-hub__eyebrow">CHOOSE YOUR WORKSPACE</p><h2 id="explore-title">At your desk. At the ground.</h2></div>
        <div className="help-hub__platforms" role="tablist" aria-label="App platform">
          <button role="tab" id="web-tab" aria-controls="platform-panel" aria-selected={platform === 'web'} onClick={() => setPlatform('web')}><IoDesktopOutline aria-hidden="true" /> Web app</button>
          <button role="tab" id="android-tab" aria-controls="platform-panel" aria-selected={platform === 'android'} onClick={() => setPlatform('android')}><IoPhonePortraitOutline aria-hidden="true" /> Android</button>
        </div>
      </div>
      <div id="platform-panel" role="tabpanel" aria-labelledby={`${platform}-tab`} className="help-hub__platform-panel">
        <div className="help-hub__workflow">
          <p className="help-hub__label">{platform === 'web' ? 'THE TOURNAMENT WORKSPACE' : 'NJS LIVE STUDIO FOR ANDROID'}</p>
          <h3>{platform === 'web' ? 'From the first player to the final result.' : 'Two modes. One match-day app.'}</h3>
          <p>{platform === 'web' ? 'Organize players and teams, schedule fixtures, operate your sport\'s scorer and share the scoreboard. Your enabled features follow the tournament and your account permissions.' : 'Choose Scoring for your existing online fixtures and scorer. Choose Streaming to run the Host studio or share another phone\'s camera as a Connector.'}</p>
          <ul>
            {(platform === 'web' ? ['Tournament setup, registration and player auctions', 'Match schedules, live scoring and results', 'Scorecard design and OBS broadcast controls'] : ['Simple Matches, Score and Results navigation', 'Host scenes, web overlays and streaming destinations', 'Connector QR pairing and local camera switching']).map(item => <li key={item}><IoCheckmarkOutline aria-hidden="true" />{item}</li>)}
          </ul>
          <a className="help-hub__text-link" href={`/help?section=${platform === 'web' ? 'administration' : 'mobile'}`}>Read the {platform === 'web' ? 'web' : 'Android'} guide <IoArrowForwardOutline aria-hidden="true" /></a>
        </div>
        <div className="help-hub__screens">
          <figure><img src={appHomeImage} alt="NJS Android app home with Streaming and Scoring choices" width="540" height="1200" loading="lazy" /><figcaption>Streaming or Scoring</figcaption></figure>
          <figure><img src={platform === 'web' ? scoringImage : connectorImage} alt={platform === 'web' ? 'Existing web administration sign-in inside the Android scoring workspace' : 'Android Connector camera screen with Start connector and camera details'} width="540" height="1200" loading="lazy" /><figcaption>{platform === 'web' ? 'Your existing online workspace' : 'A camera-focused Connector'}</figcaption></figure>
        </div>
      </div>
    </section>

    <section className="help-hub__topics-band" id="topics" aria-labelledby="topics-title"><div className="help-hub__section">
      <div className="help-hub__section-head"><div><p className="help-hub__eyebrow">FIND YOUR NEXT STEP</p><h2 id="topics-title">What would you like to do?</h2></div>
        <label className="help-hub__search"><IoSearchOutline aria-hidden="true" /><input aria-label="Search help topics" placeholder="Search help topics" value={query} onChange={event => setQuery(event.target.value)} /></label>
      </div>
      <div className="help-hub__topics">{filteredTopics.map(topic => <a key={topic.id} className="help-hub__topic" href={`/help?section=${topic.id}`}>
        <topic.icon aria-hidden="true" /><div><h3>{topic.title}</h3><p>{topic.detail}</p></div><IoArrowForwardOutline aria-hidden="true" />
      </a>)}</div>
      {!filteredTopics.length && <p role="status">No matching topics. Try scoring, Android, auction or broadcast.</p>}
      <div className="help-hub__sport-guides"><span>Sport-specific guides</span>{['cricket', 'football', 'kabaddi', 'carrom'].map(sport => <a key={sport} href={`/help?section=${sport}`}>{sport}<IoArrowForwardOutline aria-hidden="true" /></a>)}</div>
    </div></section>

    <section className="help-hub__section help-hub__broadcast" aria-labelledby="broadcast-title">
      <div><p className="help-hub__eyebrow">A SIMPLE LOCAL CAMERA WORKFLOW</p><h2 id="broadcast-title">One Host. More angles.</h2>
        <p>Keep phones on the same trusted Wi-Fi or hotspot. The Host brings your selected camera and overlays together for the broadcast.</p>
        <ol>{[
          { icon: IoVideocamOutline, title: 'Start a Connector', text: 'Open Streaming, choose Connector and start its camera feed.' },
          { icon: IoPhonePortraitOutline, title: 'Pair it with the Host', text: 'Scan the Connector QR, or paste its private pairing link in Host > Cameras.' },
          { icon: IoLayersOutline, title: 'Choose the program', text: 'Switch sources or scenes on the Host and use its configured streaming destinations.' },
        ].map((step, index) => <li key={step.title}><span className="help-hub__step-number">0{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div><step.icon aria-hidden="true" /></li>)}</ol>
        <a className="help-hub__text-link" href="/help?section=mobile">Camera pairing & streaming guide<IoArrowForwardOutline aria-hidden="true" /></a>
      </div>
      <aside className="help-hub__download" aria-labelledby="android-download-title"><IoPhonePortraitOutline aria-hidden="true" /><p className="help-hub__label">ANDROID TESTING CHANNEL</p><h3 id="android-download-title">Try the Android app</h3>
        <p>Install the current testing build on a supported ARM Android phone. Keep the same signer when updating to preserve your settings.</p>
        {release ? <a className="help-hub__download-link" href={releaseApkUrl(window.location.origin, release)}><IoDownloadOutline aria-hidden="true" />Download Android test APK<span>v{release.versionName}</span></a> : <p role="status">{releaseChecked ? 'The Android testing download is currently unavailable.' : 'Checking the Android testing release...'}</p>}
        <p className="help-hub__release-note"><IoShieldCheckmarkOutline aria-hidden="true" />Development-signed testing build. Not a production-certified Android release.</p>
      </aside>
    </section>

    <section className="help-hub__questions-band" id="questions"><div className="help-hub__section help-hub__questions">
      <div><p className="help-hub__eyebrow">GOOD TO KNOW</p><h2>Match-day questions,<br />straight answers.</h2><a className="help-hub__text-link" href="/help?section=mobile">Open the complete Android guide<IoArrowForwardOutline aria-hidden="true" /></a></div>
      <div>{QUESTIONS.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
    </div></section>
    <footer className="help-hub__footer"><a className="help-hub__brand" href="#top"><img src="/njs-store-192.png" width="32" height="32" alt="" /><span>NJS Store</span></a><p>Web tournaments. Android scoring. Match-day streaming.</p><a href="/help?section=auction">All operator guides<IoArrowForwardOutline aria-hidden="true" /></a></footer>
  </main>;
}