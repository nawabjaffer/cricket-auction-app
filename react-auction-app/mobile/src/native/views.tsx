import { requireNativeComponent, type StyleProp, type ViewStyle } from 'react-native';

interface NativePreviewProps { style?: StyleProp<ViewStyle> }
interface NativePeerProps { style?: StyleProp<ViewStyle>; url?: string; active?: boolean; muted?: boolean }

const NativeStudioPreview = requireNativeComponent<NativePreviewProps>('NjsStudioPreview');
const NativePeerPreview = requireNativeComponent<NativePeerProps>('NjsPeerPreview');

/** Composited encoder output; fill mode crops only the screen preview, not the encoded frame. */
export function StudioPreview({ style }: Readonly<NativePreviewProps>) {
  return <NativeStudioPreview style={style} />;
}

/** Hardware-decoded thumbnail of a LAN camera (RTSP). */
export function PeerPreview({ url, active = true, muted = true, style }: Readonly<NativePeerProps>) {
  return <NativePeerPreview style={style} url={url} active={active} muted={muted} />;
}
