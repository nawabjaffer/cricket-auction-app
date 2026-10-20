import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { STUDIO_VIDEO_PRESETS, findStudioVideoPreset } from '../../shared/studioProfile';
import { presetSupport, resolveEffectiveVideo } from '../../services/effectiveConfig';
import { useSettings } from '../../store/settingsStore';
import { useStudio } from '../../store/studioStore';
import { Btn, Card, H2, Muted, Row, Segmented, Slider, ToggleRow } from '../../ui/primitives';
import { colors, radius, space } from '../../ui/theme';

const mbps = (kbps: number) => `${(kbps / 1000).toFixed(kbps % 1000 ? 1 : 0)} Mbps`;

export function VideoSection() {
  const video = useSettings(state => state.video);
  const audio = useSettings(state => state.audio);
  const facing = useSettings(state => state.facing);
  const patch = useSettings(state => state.patch);
  const profile = useStudio(state => state.profile);
  const caps = useStudio(state => state.capabilities);
  const effective = useStudio(state => state.effective);

  const local = { video, audio, overlayRender: 'software' as const, overlayFps: 15, facing };
  let current = effective;
  let qualityError: string | null = null;
  try {
    current = profile ? resolveEffectiveVideo(profile, local, caps) : effective;
  } catch (error) {
    current = null;
    qualityError = error instanceof Error ? error.message : String(error);
  }
  const selectedId = video.presetId ?? profile?.video.presetId ?? '1080p30';
  const codec = video.codec ?? profile?.video.codec ?? 'h264';
  const preset = findStudioVideoPreset(selectedId);

  const setVideo = (next: Partial<typeof video>) => patch({ video: { ...video, ...next } });
  const setAudio = (next: Partial<typeof audio>) => patch({ audio: { ...audio, ...next } });

  const backCamera = caps?.cameras.find(camera => camera.facing === 'back');
  const maxSize = backCamera?.sizes.reduce((best, size) => (size.w * size.h > best.w * best.h ? size : best), { w: 0, h: 0, maxFps: 0 });

  return (
    <View style={{ gap: space.md }}>
      <Card>
        <H2>Quality</H2>
        {qualityError && <Text style={{ color: colors.danger, fontSize: 13 }}>{qualityError}</Text>}
        {STUDIO_VIDEO_PRESETS.map(item => {
          const support = presetSupport(item, codec, caps, facing);
          const active = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: !support.ok }}
              disabled={!support.ok}
              onPress={() => setVideo({ presetId: item.id, bitrateKbps: null })}
              style={{
                padding: space.md, borderRadius: radius.md, borderWidth: 1,
                borderColor: active ? colors.accent : colors.line,
                backgroundColor: active ? 'rgba(61,220,132,0.1)' : 'transparent', opacity: support.ok ? 1 : 0.4,
              }}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{item.label}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{mbps(item.bitrateKbps)}</Text>
              </Row>
              {!support.ok && <Text style={{ color: colors.warn, fontSize: 12, marginTop: 2 }}>{support.reason}</Text>}
            </Pressable>
          );
        })}
        {current?.downgradeReason && <Text style={{ color: colors.warn, fontSize: 12 }}>{current.downgradeReason}</Text>}
        {maxSize && maxSize.w > 0 && (
          <Muted>Back camera: up to {maxSize.w}×{maxSize.h}. Encoder: {caps?.encoders.h264?.hardware ? 'hardware H.264' : 'software H.264'}{caps?.encoders.h265 ? ' + HEVC' : ''}.</Muted>
        )}
      </Card>

      <Card>
        <H2>Bitrate</H2>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text }}>{mbps(current?.bitrateKbps ?? preset.bitrateKbps)}</Text>
          <Btn small variant="ghost" label="Default" onPress={() => setVideo({ bitrateKbps: null })} />
        </Row>
        <Slider
          value={current?.bitrateKbps ?? preset.bitrateKbps}
          min={preset.minBitrateKbps}
          max={preset.maxBitrateKbps}
          step={250}
          label="Video bitrate"
          onChange={value => setVideo({ bitrateKbps: value })}
        />
        <Muted>Allowed range for {preset.label}: {mbps(preset.minBitrateKbps)} – {mbps(preset.maxBitrateKbps)}.</Muted>
        <ToggleRow label="Adaptive bitrate" hint="Lowers the bitrate automatically when the uplink is congested." value={video.adaptive ?? profile?.video.adaptiveBitrate ?? true} onChange={adaptive => setVideo({ adaptive })} />
      </Card>

      <Card>
        <H2>Codec & picture</H2>
        <Segmented
          options={[
            { value: 'h264', label: 'H.264' },
            { value: 'h265', label: 'H.265 (HEVC)', disabled: !!caps && !caps.encoders.h265 },
          ]}
          value={codec}
          onChange={value => setVideo({ codec: value, presetId: selectedId })}
        />
        {codec === 'h265' && <Muted>YouTube, Facebook and Twitch accept H.264 over RTMP. Use HEVC for SRT or servers that support Enhanced RTMP.</Muted>}
        <Segmented
          options={[{ value: 'auto', label: 'Auto' }, { value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }]}
          value={video.orientation ?? profile?.video.orientation ?? 'landscape'}
          onChange={orientation => setVideo({ orientation })}
        />
        <ToggleRow label="Video stabilization" value={video.stabilization ?? profile?.video.stabilization ?? true} onChange={stabilization => setVideo({ stabilization })} />
        <ToggleRow label="Save a local MP4 copy" hint="Recorded on the phone while streaming (needs free storage)." value={video.record ?? profile?.video.recordLocal ?? false} onChange={record => setVideo({ record })} />
      </Card>

      <Card>
        <H2>Audio</H2>
        <Segmented
          options={[96, 128, 192, 256].map(value => ({ value, label: `${value}k` }))}
          value={audio.bitrateKbps ?? profile?.audio.bitrateKbps ?? 128}
          onChange={bitrateKbps => setAudio({ bitrateKbps })}
        />
        <ToggleRow label="Stereo" value={audio.stereo ?? profile?.audio.stereo ?? true} onChange={stereo => setAudio({ stereo })} />
        <ToggleRow label="Noise suppression" value={audio.noise ?? profile?.audio.noiseSuppressor ?? false} onChange={noise => setAudio({ noise })} />
        <ToggleRow label="Echo cancellation" value={audio.echo ?? profile?.audio.echoCanceler ?? false} onChange={echo => setAudio({ echo })} />
        <Muted>Choose a Bluetooth or USB microphone under Setup › Bluetooth.</Muted>
      </Card>

      <Btn
        label="Reset to the tournament profile"
        variant="ghost"
        onPress={() => patch({
          video: { presetId: null, codec: null, adaptive: null, record: null, stabilization: null, orientation: null, bitrateKbps: null },
          audio: { ...audio, bitrateKbps: null, stereo: null, echo: null, noise: null },
        })}
      />
    </View>
  );
}
