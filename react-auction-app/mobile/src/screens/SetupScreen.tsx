import React from 'react';
import { View } from 'react-native';
import { Screen, Segmented, H1 } from '../ui/primitives';
import { useNav, type SetupSection } from '../store/navStore';
import { DestinationsSection } from './setup/DestinationsSection';
import { VideoSection } from './setup/VideoSection';
import { OverlaysSection } from './setup/OverlaysSection';
import { BluetoothSection } from './setup/BluetoothSection';
import { space } from '../ui/theme';

const SECTIONS: ReadonlyArray<{ value: SetupSection; label: string }> = [
  { value: 'destinations', label: 'Platforms' },
  { value: 'video', label: 'Quality' },
  { value: 'overlays', label: 'Overlays' },
  { value: 'bluetooth', label: 'Bluetooth' },
];

export function SetupScreen() {
  const section = useNav(state => state.setupSection);
  const setSection = useNav(state => state.setSetupSection);
  return (
    <Screen>
      <H1>Setup</H1>
      <Segmented options={SECTIONS} value={section} onChange={setSection} />
      <View style={{ gap: space.md }}>
        {section === 'destinations' && <DestinationsSection />}
        {section === 'video' && <VideoSection />}
        {section === 'overlays' && <OverlaysSection />}
        {section === 'bluetooth' && <BluetoothSection />}
      </View>
    </Screen>
  );
}
