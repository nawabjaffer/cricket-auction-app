export interface YouTubeChatMessage {
  id: string;
  name: string;
  message: string;
  imageUrl?: string;
}

interface YouTubeTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface YouTubeTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

type GoogleIdentityWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (options: {
          client_id: string;
          scope: string;
          callback: (response: YouTubeTokenResponse) => void;
        }) => YouTubeTokenClient;
      };
    };
  };
};

let scriptPromise: Promise<void> | null = null;

function loadGoogleIdentityServices(): Promise<void> {
  if ((window as GoogleIdentityWindow).google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  const pending = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
    const script = existing || document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google sign-in could not be loaded'));
    if (!existing) document.head.appendChild(script);
  });
  const cached = pending.catch(error => {
    scriptPromise = null;
    throw error;
  });
  scriptPromise = cached;
  return cached;
}

export async function requestYouTubeReadToken(clientId: string): Promise<string> {
  await loadGoogleIdentityServices();
  const oauth2 = (window as GoogleIdentityWindow).google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google sign-in is unavailable in this browser');
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/youtube.readonly',
      callback: response => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error_description || response.error || 'YouTube authorization failed'));
      },
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
}

async function getActiveLiveChatId(accessToken: string, videoId: string): Promise<string> {
  const params = new URLSearchParams({ part: 'liveStreamingDetails', id: videoId });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const result = await response.json() as {
    error?: { message?: string };
    items?: Array<{ liveStreamingDetails?: { activeLiveChatId?: string } }>;
  };
  if (!response.ok) throw new Error(result.error?.message || 'Could not read the YouTube video');
  const liveChatId = result.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
  if (!liveChatId) throw new Error('This video has no active live chat. Check that the stream is live and chat is enabled.');
  return liveChatId;
}

export async function startYouTubeLiveChat(
  accessToken: string,
  videoId: string,
  onMessage: (message: YouTubeChatMessage) => void,
  onError: (error: Error) => void,
): Promise<() => void> {
  const liveChatId = await getActiveLiveChatId(accessToken, videoId);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pageToken: string | undefined;
  const seenIds = new Set<string>();

  const poll = async () => {
    if (stopped) return;
    try {
      const params = new URLSearchParams({
        part: 'snippet,authorDetails',
        liveChatId,
        maxResults: '200',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await response.json() as {
        error?: { message?: string };
        nextPageToken?: string;
        pollingIntervalMillis?: number;
        items?: Array<{
          id: string;
          snippet?: { displayMessage?: string; type?: string };
          authorDetails?: { displayName?: string; profileImageUrl?: string };
        }>;
      };
      if (!response.ok) throw new Error(result.error?.message || 'YouTube chat polling failed');
      pageToken = result.nextPageToken;
      for (const item of result.items || []) {
        if (!item.id || seenIds.has(item.id) || !item.snippet?.displayMessage || item.snippet.type !== 'textMessageEvent') continue;
        seenIds.add(item.id);
        onMessage({
          id: item.id,
          name: item.authorDetails?.displayName || 'YouTube viewer',
          message: item.snippet.displayMessage,
          imageUrl: item.authorDetails?.profileImageUrl,
        });
      }
      if (seenIds.size > 3000) seenIds.clear();
      timer = setTimeout(poll, Math.max(result.pollingIntervalMillis || 5000, 5000));
    } catch (error) {
      if (!stopped) onError(error instanceof Error ? error : new Error('YouTube chat polling failed'));
      timer = setTimeout(poll, 15000);
    }
  };

  void poll();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}