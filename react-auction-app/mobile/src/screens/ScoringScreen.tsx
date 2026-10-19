import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { ArrowLeft, ArrowRight, CalendarDays, ClipboardList, ExternalLink, Home, MoreVertical, RefreshCw, Settings2, Trophy, X, type LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { StudioSystem } from '../native';
import { validatePairing } from '../services/deepLink';
import { parseScoringBrowserMessage, scoringBrowserScript } from '../services/scoringBrowser';
import { isScoringNavigationAllowed, normalizeScoringWorkspace, scoringEntryUrl, scoringPageUrl, type ScoringPage } from '../shared/scoringWorkspace';
import { normalizeOrigin, STUDIO_GAME_LABELS, STUDIO_GAME_TYPES, type StudioGameType, type StudioPairing } from '../shared/studioProfile';
import { useNav } from '../store/navStore';
import { useSettings } from '../store/settingsStore';
import { Banner, Btn, Field, H1, IconButton, Row, Screen, Segmented } from '../ui/primitives';
import { colors } from '../ui/theme';

const SECTIONS: ReadonlyArray<{ id: ScoringPage; label: string; icon: LucideIcon }> = [
  { id: 'matches', label: 'Matches', icon: CalendarDays },
  { id: 'score', label: 'Score', icon: ClipboardList },
  { id: 'scoreboard', label: 'Scoreboard', icon: Trophy },
  { id: 'admin', label: 'Tournament', icon: Settings2 },
];

export function ScoringScreen({ active = true }: Readonly<{ active?: boolean }>) {
  const insets = useSafeAreaInsets();
  const setWorkspace = useNav(state => state.setWorkspace);
  const settings = useSettings.getState();
  const saved = normalizeScoringWorkspace(settings.scoringWorkspace) ?? normalizeScoringWorkspace(settings.pairing ? { ...settings.pairing, origin: settings.origin } : null);
  const [workspace, setScoringWorkspace] = useState<StudioPairing | null>(null);
  const [server, setServer] = useState(saved?.origin ?? settings.origin);
  const [slug, setSlug] = useState(saved?.slug ?? '');
  const [game, setGame] = useState<StudioGameType>(saved?.game ?? 'cricket');
  const [chooser, setChooser] = useState(!saved);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [entryUrl, setEntryUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [section, setSection] = useState<ScoringPage>('matches');
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [menu, setMenu] = useState(false);
  const web = useRef<WebView<object>>(null);
  const connection = useRef(0);
  const externalPrompt = useRef(false);

  const connect = async (candidate: StudioPairing) => {
    const request = ++connection.current;
    setBusy(true);
    setProblem(null);
    try {
      if (!candidate.origin.startsWith('https://')) throw new Error('Use an HTTPS server address for scoring.');
      const resolved = await validatePairing(candidate);
      const valid = normalizeScoringWorkspace(resolved.pairing);
      if (!valid) throw new Error('The selected tournament has an invalid address.');
      if (request !== connection.current) return;
      useSettings.getState().patch({ scoringWorkspace: valid });
      const url = scoringEntryUrl(valid);
      setScoringWorkspace(valid);
      setEntryUrl(url);
      setCurrentUrl(url);
      setSection('matches');
      setChooser(false);
      setPageError(false);
      setLoading(true);
    } catch (error) {
      if (request === connection.current) { setProblem(error instanceof Error ? error.message : String(error)); setChooser(true); }
    } finally {
      if (request === connection.current) setBusy(false);
    }
  };

  useEffect(() => {
    let closed = false;
    void StudioSystem.createWorkspaceToken().then(value => { if (!closed) setToken(value); }).catch(() => { if (!closed) setProblem('Could not initialize the scoring workspace. Reopen Scoring.'); });
    if (saved) void connect(saved);
    return () => { closed = true; connection.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menu) { setMenu(false); return true; }
      if (!chooser && canGoBack) { web.current?.goBack(); return true; }
      if (chooser && workspace) { setChooser(false); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [active, menu, chooser, canGoBack, workspace]);

  const navigate = (page: ScoringPage) => {
    if (!workspace) return;
    const url = scoringPageUrl(workspace, page);
    setEntryUrl(url);
    setCurrentUrl(url);
    setSection(page);
    setProblem(null);
    setPageError(false);
    setMenu(false);
  };

  const browser = (url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || externalPrompt.current) return;
      externalPrompt.current = true;
      Alert.alert('Open in browser?', parsed.hostname, [
        { text: 'Cancel', style: 'cancel', onPress: () => { externalPrompt.current = false; } },
        { text: 'Open', onPress: () => { externalPrompt.current = false; void Linking.openURL(url).catch(() => setProblem('Could not open the browser.')); } },
      ], { cancelable: true, onDismiss: () => { externalPrompt.current = false; } });
    } catch { setProblem('This link cannot be opened.'); }
  };

  const allowNavigation = (url: string): boolean => {
    if (url === 'about:blank') return true;
    if (!workspace) return false;
    if (isScoringNavigationAllowed(url, workspace)) return true;
    try {
      if (new URL(url).origin !== workspace.origin) browser(url);
      else setProblem('This link is outside the selected tournament. Change the scoring workspace to open another tournament.');
    } catch { setProblem('This link cannot be opened inside Scoring.'); }
    return false;
  };

  const receive = async (event: WebViewMessageEvent) => {
    if (!active || !workspace || !isScoringNavigationAllowed(event.nativeEvent.url, workspace)) return;
    const message = parseScoringBrowserMessage(event.nativeEvent.data, token);
    if (!message) return;
    try {
      if (message.type === 'clipboard') { await StudioSystem.copyText(message.text); ToastAndroid.show('Copied', ToastAndroid.SHORT); }
      if (message.type === 'download') {
        const savedFile = await StudioSystem.saveWorkspaceDocument(message.name, message.dataUrl);
        if (savedFile) ToastAndroid.show('Export saved', ToastAndroid.SHORT);
      }
      if (message.type === 'print') await StudioSystem.printWorkspace();
      if (message.type === 'error') setProblem(message.message);
    } catch (error) { setProblem(error instanceof Error ? error.message : 'Could not complete the document action.'); }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Row style={s.header}>
        <IconButton icon={Home} label="Back to Streaming and Scoring" onPress={() => setWorkspace('home')} />
        <View style={s.heading}><Text style={s.title}>Scoring</Text>{workspace && <Text style={s.subtitle} numberOfLines={1}>{workspace.slug} · {STUDIO_GAME_LABELS[workspace.game]}</Text>}</View>
        {workspace && !chooser && <IconButton icon={RefreshCw} label="Reload scoring page" onPress={() => { setProblem(null); setPageError(false); web.current?.reload(); }} />}
        <IconButton icon={chooser && workspace ? X : MoreVertical} label={chooser && workspace ? 'Return to scoring' : 'Scoring options'} onPress={() => { if (chooser && workspace) setChooser(false); else setMenu(true); }} />
      </Row>

      {chooser || !workspace ? <Screen>
        <H1>Tournament</H1>
        <Field label="Server" value={server} onChangeText={setServer} keyboardType="url" editable={!busy} />
        <Field label="Tournament slug" value={slug} onChangeText={setSlug} maxLength={64} editable={!busy} placeholder="league-2026" />
        <Segmented value={game} options={STUDIO_GAME_TYPES.map(value => ({ value, label: STUDIO_GAME_LABELS[value], disabled: busy }))} onChange={setGame} />
        {problem && <Banner tone="danger" text={problem} onDismiss={() => setProblem(null)} />}
        <Btn label="Open scoring" variant="primary" busy={busy} disabled={!slug.trim() || !normalizeOrigin(server)} onPress={() => { void connect({ origin: normalizeOrigin(server) ?? '', tenantId: '', slug: slug.trim(), game }); }} />
      </Screen> : <>
        <Row style={s.browserTools}>
          <IconButton icon={ArrowLeft} label="Previous scoring page" disabled={!canGoBack} onPress={() => web.current?.goBack()} />
          <IconButton icon={ArrowRight} label="Next scoring page" disabled={!canGoForward} onPress={() => web.current?.goForward()} />
          <Text style={s.server} numberOfLines={1}>{workspace.origin.replace('https://', '')}</Text>
          <IconButton icon={ExternalLink} label="Open current scoring page in browser" onPress={() => browser(currentUrl)} />
        </Row>
        {problem && <View style={s.notice}><Banner tone="warn" text={problem} onDismiss={() => setProblem(null)} /></View>}
        <View style={s.browser}>
          {token && <WebView<object> ref={web} source={{ uri: entryUrl }} style={s.web} javaScriptEnabled domStorageEnabled sharedCookiesEnabled thirdPartyCookiesEnabled={false}
            originWhitelist={['*']} mixedContentMode="never" allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
            setSupportMultipleWindows javaScriptCanOpenWindowsAutomatically={false} mediaPlaybackRequiresUserAction
            applicationNameForUserAgent="NJSLiveStudio/Scoring" geolocationEnabled={false} webviewDebuggingEnabled={false}
            injectedJavaScriptBeforeContentLoaded={scoringBrowserScript(workspace, token)} injectedJavaScript={scoringBrowserScript(workspace, token)}
            onMessage={event => { void receive(event); }} onShouldStartLoadWithRequest={request => allowNavigation(request.url)}
            onOpenWindow={event => { const url = event.nativeEvent.targetUrl; if (isScoringNavigationAllowed(url, workspace)) { setEntryUrl(url); setCurrentUrl(url); } else browser(url); }}
            onNavigationStateChange={state => { setCanGoBack(state.canGoBack); setCanGoForward(state.canGoForward); if (isScoringNavigationAllowed(state.url, workspace)) setCurrentUrl(state.url); }}
            onLoadStart={() => { setLoading(true); setPageError(false); }} onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setPageError(true); setProblem('Could not load scoring. Check your internet connection, then reload.'); }}
            onHttpError={event => { if (event.nativeEvent.url === currentUrl || event.nativeEvent.url === entryUrl) { setLoading(false); setProblem(`The scoring server returned HTTP ${event.nativeEvent.statusCode}.`); } }}
            onRenderProcessGone={() => { setPageError(true); setProblem('The scoring page stopped responding. Reload to continue.'); }}
          />}
          {(loading || !token) && <View style={s.loading} pointerEvents="none"><ActivityIndicator size="small" color={colors.accent} /></View>}
          {pageError && <View style={s.recovery}><Btn label="Reload scoring" onPress={() => { setPageError(false); setProblem(null); web.current?.reload(); }} /></View>}
        </View>
        <View style={s.tabs}>{SECTIONS.map(item => {
          const ItemIcon = item.icon;
          return <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: section === item.id }} onPress={() => navigate(item.id)} style={s.tab}>
            <ItemIcon size={18} color={section === item.id ? colors.accent : colors.muted} /><Text style={[s.tabText, section === item.id && { color: colors.accent }]}>{item.label}</Text>
          </Pressable>;
        })}</View>
      </>}

      <Modal visible={menu && active} transparent animationType="fade" onRequestClose={() => setMenu(false)} supportedOrientations={['portrait', 'landscape']}>
        <View style={s.menuBackdrop}><ScrollView style={s.menu} contentContainerStyle={s.menuContent}>
          <Row style={{ justifyContent: 'space-between' }}><Text style={s.title}>Scoring options</Text><IconButton icon={X} label="Close scoring options" onPress={() => setMenu(false)} /></Row>
          <Btn label="Change tournament or sport" onPress={() => { setMenu(false); setChooser(true); setProblem(null); }} />
          {workspace && <>
            <Btn label="Scorecard designer" onPress={() => navigate('designer')} />
            <Btn label="Broadcast controls" onPress={() => navigate('dock')} />
            <Btn label="Operator guides" onPress={() => navigate('guides')} />
            <Btn label="Print / save PDF" onPress={() => { setMenu(false); void StudioSystem.printWorkspace().catch(() => setProblem('Open a scoring page before printing.')); }} />
          </>}
          <Btn label="Back to home" variant="ghost" onPress={() => { setMenu(false); setWorkspace('home'); }} />
        </ScrollView></View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  heading: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 10 },
  browserTools: { paddingHorizontal: 10, paddingVertical: 4 },
  server: { flex: 1, minWidth: 0, color: colors.muted, fontSize: 10 },
  browser: { flex: 1, backgroundColor: '#fff' },
  web: { flex: 1, backgroundColor: '#fff' },
  loading: { position: 'absolute', top: 8, right: 12, padding: 8, backgroundColor: colors.card, borderRadius: 6 },
  recovery: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  notice: { paddingHorizontal: 10, paddingBottom: 6 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 5 },
  tabText: { color: colors.muted, fontSize: 10 },
  menuBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  menu: { flexGrow: 0, maxHeight: '85%', backgroundColor: colors.card, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  menuContent: { padding: 16, paddingBottom: 28, gap: 12 },
});