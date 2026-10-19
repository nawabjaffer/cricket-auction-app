import { requireNativeComponent, type StyleProp, type ViewStyle } from 'react-native';

interface NativePreviewProps { style?: StyleProp<ViewStyle> }
interface NativePeerProps { style?: StyleProp<ViewStyle>; url?: string; active?: boolean; muted?: boolean }

const NativeStudioPreview = requireNativeComponent<NativePreviewProps>('NjsStudioPreview');
const NativePeerPreview = requireNativeComponent<NativePeerProps>('NjsPeerPreview');

/** Live camera preview rendered by the encoder's GL pipeline — overlays included, exactly what is streamed. */
export function StudioPreview({ style }: Readonly<NativePreviewProps>) {
  return <NativeStudioPreview style={style} />;
}

/** Hardware-decoded thumbnail of a LAN camera (RTSP). */
export function PeerPreview({ url, active = true, muted = true, style }: Readonly<NativePeerProps>) {
  return <NativePeerPreview style={style} url={url} active={active} muted={muted} />;
}
