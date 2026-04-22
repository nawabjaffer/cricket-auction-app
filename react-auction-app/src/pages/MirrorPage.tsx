import { useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './MirrorPage.css';

const DEFAULT_TENANT_SLUG = 'epl-2026';

export default function MirrorPage() {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();

  const targetSlug = useMemo(() => {
    const slug = (tenantSlug || DEFAULT_TENANT_SLUG).trim();
    return slug || DEFAULT_TENANT_SLUG;
  }, [tenantSlug]);

  const mirrorSrc = useMemo(() => `/${targetSlug}/?mirror=1`, [targetSlug]);

  // Hard-disable keyboard interaction on mirror host page.
  useEffect(() => {
    const swallowKey = (event: KeyboardEvent) => {
      event.preventDefault();
    };
    globalThis.addEventListener('keydown', swallowKey, { capture: true });
    return () => {
      globalThis.removeEventListener('keydown', swallowKey, { capture: true });
    };
  }, []);

  return (
    <div className="mirror-page">
      <iframe
        className="mirror-page__frame"
        src={mirrorSrc}
        title="Auction Mirror View"
        loading="eager"
        referrerPolicy="same-origin"
      />
      <div className="mirror-page__input-blocker" aria-hidden="true" />
    </div>
  );
}
