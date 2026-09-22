import { useMemo, useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { extractDriveFileId } from '../utils/driveImage';

interface ResolvedImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  size?: number;
  fallback?: ReactNode;
  crossOrigin?: 'anonymous' | 'use-credentials' | '';
}

export function ResolvedImage({
  src,
  alt = '',
  className,
  style,
  size = 256,
  fallback = null,
  // No consumer of this component draws into a <canvas>, so default to no
  // crossOrigin attribute — Drive/Firebase URLs without CORS headers still
  // render as a plain <img>, they'd just fail to load if crossOrigin were set.
  crossOrigin = '',
}: Readonly<ResolvedImageProps>) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  const urls = useMemo(() => {
    const raw = (src ?? '').trim();
    if (!raw) return [];
    if (raw.startsWith('data:') || raw.startsWith('blob:') || raw.includes('firebasestorage')) return [raw];
    const fileId = extractDriveFileId(raw);
    if (!fileId) return [raw];
    return [
      `https://lh3.googleusercontent.com/d/${fileId}=s${size}`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`,
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      raw,
    ];
  }, [src, size]);

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [src]);

  if (failed || urls.length === 0) return <>{fallback}</>;

  return (
    <img
      src={urls[index]}
      alt={alt}
      draggable={false}
      className={className}
      style={style}
      crossOrigin={crossOrigin || undefined}
      onError={() => {
        if (index < urls.length - 1) setIndex(i => i + 1);
        else setFailed(true);
      }}
    />
  );
}
