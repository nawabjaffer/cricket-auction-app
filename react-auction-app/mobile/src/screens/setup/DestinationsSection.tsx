import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StudioAuth } from '../../native';
import { STUDIO_PLATFORMS, STUDIO_PLATFORM_PRESETS, type StudioPlatform } from '../../shared/studioProfile';
import {
  destinationReadiness, validateCustomUrl, validateStreamKey,
} from '../../services/destinations';
import { keyName, secrets } from '../../services/storage';
import { authorizeYouTube } from '../../services/youtube';
import { log } from '../../services/logger';
import { newLocalDestination, useSettings, type LocalDestination } from '../../store/settingsStore';
import { Btn, Card, Field, H2, Muted, Pill, Row, Segmented, ToggleRow } from '../../ui/primitives';
import { colors, space } from '../../ui/theme';

function DestinationCard({ destination }: Readonly<{ destination: LocalDestination }>) {
  const upsert = useSettings(state => state.upsertDestination);
  const remove = useSettings(state => state.removeDestination);
  const ytLinked = useSettings(state => state.ytLinked);
  const patch = useSettings(state => state.patch);
  const preset = STUDIO_PLATFORM_PRESETS[destination.platform];

  const [readiness, setReadiness] = useState<{ ready: boolean; note: string } | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState(destination.customUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    destinationReadiness(destination, ytLinked).then(setReadiness).catch(() => undefined);
  }, [destination, ytLinked]);
  useEffect(refresh, [refresh]);

  const update = (patchValues: Partial<LocalDestination>) => upsert({ ...destination, ...patchValues });

  const saveKey = async () => {
    const problem = validateStreamKey(keyInput);
    setKeyError(problem);
    if (problem) return;
    await secrets.set(keyName.streamKey(destination.id), keyInput.trim());
    setKeyInput('');
    setMessage('Stream key saved securely on this phone.');
    refresh();
  };

  const clearKey = async () => {
    await secrets.remove(keyName.streamKey(destination.id));
    setMessage('Stream key removed.');
    refresh();
  };

  const saveUrl = () => {
    const problem = validateCustomUrl(destination.platform, urlInput);
    setKeyError(problem);
    if (problem) return;
    update({ customUrl: urlInput.trim() });
    setMessage('Server URL saved.');
  };

  const linkGoogle = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await authorizeYouTube();
      patch({ ytLinked: true });
      setMessage('Google account linked. A broadcast is created automatically each time you go live.');
    } catch (error) {
      log.warn('youtube', error);
      setMessage(error instanceof Error ? error.message : 'Could not link the account.');
    } finally {
      setBusy(false);
    }
  };

  const unlinkGoogle = async () => {
    setBusy(true);
    try {
      const token = await authorizeYouTube().catch(() => null);
      if (token) await StudioAuth.clearGoogleToken(token).catch(() => undefined);
      patch({ ytLinked: false });
      setMessage('Account unlinked.');
    } finally {
      setBusy(false);
    }
  };

  const isYoutubeApi = destination.platform === 'youtube' && (destination.youtubeMode ?? 'api') === 'api';
  const needsUrl = preset.customUrl;
  const needsKey = !isYoutubeApi && preset.protocol !== 'srt';

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: 4 }}>
          <H2>{destination.label}</H2>
          <Row>
            <Pill label={preset.label} />
            {readiness && <Pill label={readiness.note} tone={readiness.ready ? 'ok' : 'warn'} />}
          </Row>
        </View>
      </Row>

      <ToggleRow label="Stream to this destination" value={destination.enabled} onChange={enabled => update({ enabled })} />

      {destination.platform === 'youtube' && (
        <>
          <Segmented
            options={[{ value: 'api', label: 'Linked account' }, { value: 'manual', label: 'Stream key' }]}
            value={destination.youtubeMode ?? 'api'}
            onChange={youtubeMode => update({ youtubeMode })}
          />
          {isYoutubeApi && (
            <>
              <Muted>Creates the broadcast and stream key for you and ends it when you stop. Needs live streaming enabled on the channel.</Muted>
              <Segmented
                options={[{ value: 'public', label: 'Public' }, { value: 'unlisted', label: 'Unlisted' }, { value: 'private', label: 'Private' }]}
                value={destination.youtubePrivacy ?? 'unlisted'}
                onChange={youtubePrivacy => update({ youtubePrivacy })}
              />
              <Row>
                <Btn label={ytLinked ? 'Re-link Google account' : 'Link Google account'} variant={ytLinked ? 'secondary' : 'primary'} onPress={() => void linkGoogle()} busy={busy} style={{ flex: 1 }} />
                {ytLinked && <Btn label="Unlink" variant="ghost" onPress={() => void unlinkGoogle()} disabled={busy} />}
              </Row>
            </>
          )}
        </>
      )}

      {needsUrl && (
        <>
          <Field
            label={destination.platform === 'srt' ? 'SRT URL' : 'Server URL'}
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder={destination.platform === 'srt' ? 'srt://host:9000?streamid=…' : 'rtmp://host/app'}
            keyboardType="url"
            hint={preset.keyHint}
          />
          <Btn label="Save URL" small onPress={saveUrl} />
        </>
      )}

      {needsKey && (
        <>
          <Field
            label={destination.platform === 'rtmp' ? 'Stream key (optional if the URL already has it)' : 'Stream key'}
            value={keyInput}
            onChangeText={setKeyInput}
            secureTextEntry
            placeholder={readiness?.ready ? '•••••••• saved — type to replace' : 'Paste your stream key'}
            error={keyError}
            hint={needsUrl ? undefined : preset.keyHint}
          />
          <Row>
            <Btn label="Save key" small onPress={() => void saveKey()} disabled={!keyInput.trim()} />
            <Btn label="Remove key" small variant="ghost" onPress={() => void clearKey()} />
          </Row>
        </>
      )}

      {message && <Text style={{ color: colors.accent, fontSize: 13 }}>{message}</Text>}

      {!destination.fromProfile && (
        <Btn label="Remove destination" small variant="ghost" onPress={() => { void secrets.remove(keyName.streamKey(destination.id)); remove(destination.id); }} />
      )}
    </Card>
  );
}

export function DestinationsSection() {
  const destinations = useSettings(state => state.destinations);
  const upsert = useSettings(state => state.upsertDestination);
  const [adding, setAdding] = useState<StudioPlatform>('twitch');

  return (
    <View style={{ gap: space.md }}>
      <Muted>
        Stream keys, server URLs and your Google account stay on this phone (encrypted). The tournament profile only suggests which platforms to use.
      </Muted>
      {destinations.length === 0 && <Card><Muted>No destinations yet. Add YouTube, Facebook, Twitch or a custom RTMP / SRT server below.</Muted></Card>}
      {destinations.map(destination => <DestinationCard key={destination.id} destination={destination} />)}
      <Card>
        <H2>Add a destination</H2>
        <Segmented
          options={STUDIO_PLATFORMS.map(platform => ({ value: platform, label: STUDIO_PLATFORM_PRESETS[platform].label.split(' ')[0] }))}
          value={adding}
          onChange={setAdding}
        />
        <Btn label={`Add ${STUDIO_PLATFORM_PRESETS[adding].label}`} onPress={() => upsert(newLocalDestination(adding))} disabled={destinations.length >= 5} />
        <Muted>Streaming to several destinations at once uploads the video once per destination — check your uplink.</Muted>
      </Card>
    </View>
  );
}
