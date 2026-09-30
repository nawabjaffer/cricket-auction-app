import { useEffect, useRef, useState } from 'react';
import { decompressFrames, parseGIF } from 'gifuct-js';
import { getGifFrameDelayMs, normalizeAnimationPlaybackSpeed } from './animationSpeed';

interface AnimatedGifProps {
  src: string;
  alt: string;
  className?: string;
  playbackSpeed?: number;
}

export function AnimatedGif({ src, alt, className, playbackSpeed = 1 }: AnimatedGifProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const decodeFailed = failedSources.includes(src);
  const speed = normalizeAnimationPlaybackSpeed(playbackSpeed);

  useEffect(() => {
    let cancelled = false;
    let frameTimer: ReturnType<typeof setTimeout> | undefined;

    const render = async () => {
      try {
        const response = await fetch(src, { mode: 'cors' });
        if (!response.ok) throw new Error(`GIF request failed: ${response.status}`);
        const parsed = parseGIF(await response.arrayBuffer());
        const frames = decompressFrames(parsed, true);
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context || frames.length === 0) throw new Error('GIF has no renderable frames');

        const width = parsed.lsd.width;
        const height = parsed.lsd.height;
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);

        const patchCanvas = document.createElement('canvas');
        const patchContext = patchCanvas.getContext('2d');
        if (!patchContext) throw new Error('Could not initialize GIF canvas');
        let frameIndex = 0;
        let restoreBeforePreviousFrame: ImageData | null = null;

        const drawNextFrame = () => {
          if (cancelled) return;
          const frame = frames[frameIndex];
          if (frameIndex > 0) {
            const previousFrame = frames[frameIndex - 1];
            if (previousFrame.disposalType === 2) {
              context.clearRect(previousFrame.dims.left, previousFrame.dims.top, previousFrame.dims.width, previousFrame.dims.height);
            } else if (previousFrame.disposalType === 3 && restoreBeforePreviousFrame) {
              context.putImageData(restoreBeforePreviousFrame, 0, 0);
            }
          }

          const restoreBeforeCurrentFrame = frame.disposalType === 3
            ? context.getImageData(0, 0, width, height)
            : null;
          patchCanvas.width = frame.dims.width;
          patchCanvas.height = frame.dims.height;
          const patch = patchContext.createImageData(frame.dims.width, frame.dims.height);
          patch.data.set(frame.patch);
          patchContext.putImageData(patch, 0, 0);
          context.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

          restoreBeforePreviousFrame = restoreBeforeCurrentFrame;
          frameIndex = (frameIndex + 1) % frames.length;
          frameTimer = setTimeout(drawNextFrame, getGifFrameDelayMs(frame.delay, speed));
        };

        if (!cancelled) {
          drawNextFrame();
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[OBS-Overlay] GIF frame decoding failed; using native image playback:', error);
          setFailedSources(sources => sources.includes(src) ? sources : [...sources, src]);
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
      if (frameTimer) clearTimeout(frameTimer);
    };
  }, [src, speed]);

  if (decodeFailed) return <img src={src} alt={alt} className={className} />;
  return <canvas ref={canvasRef} className={className} role="img" aria-label={alt} />;
}