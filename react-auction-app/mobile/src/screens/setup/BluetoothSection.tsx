import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  StudioBluetooth, StudioEngine, onStudioEvent,
  type BluetoothAudioInput, type BluetoothDevice, type RemoteKeyEvent,
} from '../../native';
import { requestBluetoothPermissions } from '../../services/permissions';
import { log } from '../../services/logger';
import { REMOTE_ACTIONS, useSettings, type RemoteAction } from '../../store/settingsStore';
import { Btn, Card, H2, Muted, Pill, Row } from '../../ui/primitives';
import { colors, radius, space } from '../../ui/theme';

const KEY_LABELS: Record<string, string> = {
  MEDIA_PLAY_PAUSE: 'Play / pause', HEADSETHOOK: 'Headset button', CAMERA: 'Camera shutter', BUTTON_A: 'Gamepad A',
  BUTTON_B: 'Gamepad B', VOLUME_UP: 'Volume up', VOLUME_DOWN: 'Volume down', MEDIA_NEXT: 'Next', MEDIA_PREVIOUS: 'Previous',
  ENTER: 'Enter / OK', DPAD_CENTER: 'D-pad center', BUTTON_X: 'Gamepad X', BUTTON_Y: 'Gamepad Y',
};

function nextAction(current: RemoteAction): RemoteAction {
  const index = REMOTE_ACTIONS.findIndex(action => action.id === current);
  return REMOTE_ACTIONS[(index + 1) % REMOTE_ACTIONS.length].id;
}

export function BluetoothSection() {
  const inputId = useSettings(state => state.audio.inputId);
  const audio = useSettings(state => state.audio);
  const remoteKeys = useSettings(state => state.remoteKeys);
  const patch = useSettings(state => state.patch);

  const [adapter, setAdapter] = useState<{ supported: boolean; enabled: boolean; connectGranted: boolean; scanGranted: boolean } | null>(null);
  const [inputs, setInputs] = useState<BluetoothAudioInput[]>([]);
  const [bonded, setBonded] = useState<BluetoothDevice[]>([]);
  const [found, setFound] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [batteries, setBatteries] = useState<Record<string, number>>({});
  const [learning, setLearning] = useState(false);
  const [lastKey, setLastKey] = useState<RemoteKeyEvent | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const state = await StudioBluetooth.getState();
      setAdapter(state);
      setInputs(await StudioBluetooth.listAudioInputs());
      if (state.connectGranted) setBonded(await StudioBluetooth.listBondedDevices());
    } catch (error) {
      log.warn('bluetooth', error);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = onStudioEvent('studio.bluetooth', event => {
      if (event.type === 'audio' || event.type === 'acl') void refresh();
      if (event.type === 'scan') setFound((event.devices as BluetoothDevice[]) ?? []);
    });
    const unsubscribeKeys = onStudioEvent('studio.remoteKey', event => setLastKey(event));
    return () => {
      unsubscribe();
      unsubscribeKeys();
      StudioBluetooth.stopScan().catch(() => undefined);
      StudioBluetooth.setRemoteKeyCapture(false).catch(() => undefined);
    };
  }, [refresh]);

  const allow = async () => {
    const granted = await requestBluetoothPermissions();
    setMessage(granted ? 'Bluetooth access granted.' : 'Bluetooth access was denied. You can allow it in Android settings.');
    await refresh();
  };

  const toggleScan = async () => {
    try {
      if (scanning) { await StudioBluetooth.stopScan(); setScanning(false); return; }
      if (!adapter?.scanGranted && !(await requestBluetoothPermissions())) { setMessage('Allow Bluetooth to scan.'); return; }
      setFound([]);
      await StudioBluetooth.startScan();
      setScanning(true);
      setTimeout(() => setScanning(false), 12_000);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  const chooseInput = async (id: number) => {
    try {
      const applied = await StudioEngine.setAudioInput(id);
      patch({ audio: { ...audio, inputId: id < 0 ? null : id } });
      setMessage(applied ? 'Microphone updated.' : 'That microphone is applied when the camera starts.');
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  const readBattery = async (address: string) => {
    try {
      const level = await StudioBluetooth.readBattery(address);
      setBatteries(current => ({ ...current, [address]: level }));
    } catch (error) { setMessage(`Battery: ${error instanceof Error ? error.message : 'not available for this device'}`); }
  };

  const toggleLearn = async () => {
    const next = !learning;
    await StudioBluetooth.setRemoteKeyCapture(next).catch(() => undefined);
    setLearning(next);
  };

  return (
    <View style={{ gap: space.md }}>
      <Card>
        <H2>Bluetooth</H2>
        {adapter && !adapter.supported && <Muted>This phone has no Bluetooth.</Muted>}
        {adapter?.supported && (
          <Row style={{ flexWrap: 'wrap' }}>
            <Pill label={adapter.enabled ? 'Bluetooth on' : 'Bluetooth off'} tone={adapter.enabled ? 'ok' : 'warn'} />
            <Pill label={adapter.connectGranted ? 'Access granted' : 'Access needed'} tone={adapter.connectGranted ? 'ok' : 'warn'} />
          </Row>
        )}
        <Row>
          {!adapter?.connectGranted && <Btn small variant="primary" label="Allow Bluetooth" onPress={() => void allow()} />}
          <Btn small label="Open settings" onPress={() => { void StudioBluetooth.openBluetoothSettings(); }} />
          <Btn small variant="ghost" label="Refresh" onPress={() => void refresh()} />
        </Row>
        {message && <Text style={{ color: colors.accent, fontSize: 13 }}>{message}</Text>}
      </Card>

      <Card>
        <H2>Microphone</H2>
        <Muted>Pair a Bluetooth headset, lavalier or USB microphone in Android settings, then pick it here. Audio stays in sync with the video.</Muted>
        <MicOption label="Automatic (phone microphone)" subtitle="Android chooses the best input" selected={inputId == null} onPress={() => void chooseInput(-1)} />
        {inputs.map(input => (
          <MicOption key={input.id} label={input.name || input.type} subtitle={`${input.type}${input.bluetooth ? ' · Bluetooth' : ''}`} selected={inputId === input.id} onPress={() => void chooseInput(input.id)} />
        ))}
        {inputs.length === 0 && <Muted>No external microphones detected.</Muted>}
      </Card>

      <Card>
        <H2>Remote buttons</H2>
        <Muted>Use a Bluetooth clicker, gamepad or headset button to control the stream hands-free. Tap a row to change its action.</Muted>
        {Object.keys(remoteKeys).map(key => (
          <Pressable key={key} accessibilityRole="button" onPress={() => patch({ remoteKeys: { ...remoteKeys, [key]: nextAction(remoteKeys[key]) } })}
            style={{ paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Text style={{ color: colors.text, fontSize: 14 }}>{KEY_LABELS[key] ?? key}</Text>
            <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>{REMOTE_ACTIONS.find(action => action.id === remoteKeys[key])?.label}</Text>
          </Pressable>
        ))}
        <Row>
          <Btn small label={learning ? 'Stop learning' : 'Learn a button'} variant={learning ? 'primary' : 'secondary'} onPress={() => void toggleLearn()} />
          {lastKey && <Text style={{ color: colors.muted, fontSize: 12 }}>Last: {KEY_LABELS[lastKey.key] ?? lastKey.key} ({lastKey.keyCode})</Text>}
        </Row>
        {learning && lastKey && !(lastKey.key in remoteKeys) && (
          <Btn small label={`Add ${KEY_LABELS[lastKey.key] ?? lastKey.key}`} onPress={() => patch({ remoteKeys: { ...remoteKeys, [lastKey.key]: 'none' } })} />
        )}
        <Muted>While learning, volume keys no longer change the media volume.</Muted>
      </Card>

      <Card>
        <H2>Paired devices</H2>
        {bonded.length === 0 && <Muted>No paired Bluetooth devices.</Muted>}
        {bonded.map(device => (
          <DeviceRow key={device.address} device={device} battery={batteries[device.address]} onBattery={() => void readBattery(device.address)} />
        ))}
      </Card>

      <Card>
        <H2>Nearby devices</H2>
        <Btn label={scanning ? 'Scanning…' : 'Scan for Bluetooth LE devices'} onPress={() => void toggleScan()} />
        {found.map(device => <DeviceRow key={device.address} device={device} />)}
        {!scanning && found.length === 0 && <Muted>Gimbals, clickers and sensors that advertise over BLE show up here. Pair them in Android settings to use them.</Muted>}
      </Card>
    </View>
  );
}

function MicOption({ label, subtitle, selected, onPress }: Readonly<{ label: string; subtitle: string; selected: boolean; onPress: () => void }>) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: selected ? colors.accent : colors.line, backgroundColor: selected ? 'rgba(61,220,132,0.1)' : 'transparent' }}
    >
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{subtitle}</Text>
    </Pressable>
  );
}

function DeviceRow({ device, battery, onBattery }: Readonly<{ device: BluetoothDevice; battery?: number; onBattery?: () => void }>) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{device.name || 'Unnamed device'}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{device.kind}{device.connected ? ' · connected' : ''}{device.rssi != null ? ` · ${device.rssi} dBm` : ''}</Text>
      </View>
      {battery != null && <Pill label={`${battery}%`} tone={battery < 20 ? 'warn' : 'ok'} />}
      {onBattery && device.bonded && <Btn small variant="ghost" label="Battery" onPress={onBattery} />}
    </Row>
  );
}
