import { useEffect } from 'react';

const BODY_CLASS = 'broadcast-overlay-surface';

export function useBroadcastOverlaySurface(): void {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const previous = {
      htmlBackground: html.style.background,
      htmlOverflow: html.style.overflow,
      bodyBackground: body.style.background,
      bodyMargin: body.style.margin,
      bodyOverflow: body.style.overflow,
      rootBackground: root?.style.background,
      rootMinHeight: root?.style.minHeight,
    };

    html.style.background = 'transparent';
    html.style.overflow = 'hidden';
    body.style.background = 'transparent';
    body.style.margin = '0';
    body.style.overflow = 'hidden';
    body.classList.add(BODY_CLASS);
    if (root) {
      root.style.background = 'transparent';
      root.style.minHeight = '100vh';
    }

    let colorSchemeMeta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    let createdColorScheme = false;
    if (!colorSchemeMeta) {
      colorSchemeMeta = document.createElement('meta');
      colorSchemeMeta.name = 'color-scheme';
      document.head.appendChild(colorSchemeMeta);
      createdColorScheme = true;
    }
    const prevColorScheme = colorSchemeMeta.content;
    colorSchemeMeta.content = 'only light';

    return () => {
      html.style.background = previous.htmlBackground;
      html.style.overflow = previous.htmlOverflow;
      body.style.background = previous.bodyBackground;
      body.style.margin = previous.bodyMargin;
      body.style.overflow = previous.bodyOverflow;
      body.classList.remove(BODY_CLASS);
      if (root) {
        root.style.background = previous.rootBackground ?? '';
        root.style.minHeight = previous.rootMinHeight ?? '';
      }
      if (createdColorScheme) colorSchemeMeta.remove();
      else colorSchemeMeta.content = prevColorScheme;
    };
  }, []);
}
