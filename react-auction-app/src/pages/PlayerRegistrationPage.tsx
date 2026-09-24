import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { IoCamera, IoCheckmarkCircle, IoCloudUploadOutline, IoLockClosed } from 'react-icons/io5';
import { playerRegistrationService } from '../services/playerRegistrationService';
import { DEFAULT_PHOTO_GUIDE_URL, DEFAULT_REGISTRATION_CONFIG, type PlayerRegistrationConfig, type RegistrationField } from '../types/playerRegistration';
import { uploadFileToStorage } from '../services/firebaseStorageService';
import { processPlayerImage } from '../services/playerBackgroundRemovalService';
import { PlayerImageEditor } from '../components/AdminPanel/PlayerImageEditor';
import type { PlayerImageEdit } from '../types';
import './PlayerRegistrationPage.css';

declare global { interface Window { google?: { payments?: { api?: { PaymentsClient: new (options: { environment: 'TEST' | 'PRODUCTION' }) => { isReadyToPay: (request: unknown) => Promise<{ result: boolean }>; loadPaymentData: (request: unknown) => Promise<{ paymentMethodData?: { tokenizationData?: { token?: string } } }> } } } } } }

function loadGooglePayScript(): Promise<void> {
  if (window.google?.payments?.api?.PaymentsClient) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-pay]');
    if (existing) { existing.addEventListener('load', () => resolve()); existing.addEventListener('error', () => reject(new Error('Google Pay failed to load'))); return; }
    const script = document.createElement('script');
    script.src = 'https://pay.google.com/gp/p/js/pay.js'; script.async = true; script.dataset.googlePay = 'true';
    script.onload = () => resolve(); script.onerror = () => reject(new Error('Google Pay failed to load')); document.head.appendChild(script);
  });
}

function PhotoGuide({ onFile, guideUrl }: Readonly<{ onFile: (file: File) => void; guideUrl?: string }>) {
  return <div className="registration-photo"><div className="registration-photo__guide"><img src={guideUrl || DEFAULT_PHOTO_GUIDE_URL} alt="Portrait placement guide" /></div><p>Stand straight, face the camera, and keep your full body inside the outline.</p><label className="registration-photo__button"><IoCamera size={18} /> Take photo<input type="file" accept="image/*" capture="environment" hidden onChange={e => { const file = e.target.files?.[0]; if (file) onFile(file); }} /></label><label className="registration-photo__button registration-photo__button--secondary"><IoCloudUploadOutline size={18} /> Upload photo<input type="file" accept="image/*" hidden onChange={e => { const file = e.target.files?.[0]; if (file) onFile(file); }} /></label></div>;
}

export default function PlayerRegistrationPage() {
  const { tenantSlug = '' } = useParams<{ tenantSlug: string }>();
  const [config, setConfig] = useState<PlayerRegistrationConfig>(DEFAULT_REGISTRATION_CONFIG);
  const [values, setValues] = useState<Record<string, string>>({});
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoEdit, setPhotoEdit] = useState<PlayerImageEdit | undefined>();
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [photoProcessingProgress, setPhotoProcessingProgress] = useState(0);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoProcessingLog, setPhotoProcessingLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [paymentReference, setPaymentReference] = useState('');

  useEffect(() => { playerRegistrationService.getConfig().then(saved => saved && setConfig(saved)).catch(() => setError('Registration form is temporarily unavailable.')); }, []);
  const fields = useMemo(() => [...config.fields].sort((a, b) => a.order - b.order), [config.fields]);
  const paymentRequired = config.payment.enabled && config.payment.amount > 0 && !config.payment.bypassForTesting;
  const setValue = (field: RegistrationField, value: string) => setValues(current => ({ ...current, [field.id]: value }));

  useEffect(() => {
    setAccessToken(paymentRequired ? '' : 'not-required');
  }, [paymentRequired]);

  const handlePhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('Photo must be smaller than 8MB.'); return; }
    setError(''); setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); setPhotoProcessingLog([]); setPhotoProcessingProgress(0);
    try {
      const uploadedUrl = await uploadFileToStorage(file, `media/registrations/${tenantSlug}/${Date.now()}`);
      setPhotoUrl(uploadedUrl);
      setPhotoPreview(uploadedUrl);
      setPhotoEdit(undefined);
    } catch { setError('Photo upload failed. Please try again.'); }
  };

  const removePhotoBackground = async () => {
    if (!photoUrl) return;
    setProcessingPhoto(true); setError('');
    setPhotoProcessingLog(['Starting background removal...']); setPhotoProcessingProgress(0);
    try {
      const processedUrl = await processPlayerImage({
        playerId: `registration-${Date.now()}`,
        playerName: values.name || 'player',
        sourceUrl: photoUrl,
        sourceBlob: photoFile ?? undefined,
        onStatus: status => setPhotoProcessingLog(current => [...current, status === 'loading-model' ? 'Loading AI model...' : status === 'processing' ? 'Analyzing portrait and removing background...' : status === 'uploading' ? 'Saving transparent image...' : 'Background removed successfully.']),
        onProgress: (message, percent) => { if (typeof percent === 'number') setPhotoProcessingProgress(percent); setPhotoProcessingLog(current => [...current.slice(-4), message]); },
      });
      setPhotoUrl(processedUrl);
      setPhotoPreview(processedUrl);
      setPhotoFile(null);
      setPhotoProcessingProgress(100);
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : 'Background removal failed.');
    } finally {
      setProcessingPhoto(false);
    }
  };

  const pay = async (): Promise<void> => {
    if (!paymentRequired) {
      setAccessToken('not-required');
      return;
    }
    await loadGooglePayScript();
    const PaymentsClient = window.google?.payments?.api?.PaymentsClient;
    if (!PaymentsClient) throw new Error('Google Pay is unavailable on this device.');
    const client = new PaymentsClient({ environment: 'TEST' });
    const response = await client.loadPaymentData({
      apiVersion: 2, apiVersionMinor: 0,
      allowedPaymentMethods: [{ type: 'CARD', parameters: { allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'], allowedCardNetworks: ['VISA', 'MASTERCARD'] }, tokenizationSpecification: { type: 'PAYMENT_GATEWAY', parameters: { gateway: config.payment.gateway, gatewayMerchantId: config.payment.gatewayMerchantId } } }],
      merchantInfo: { merchantId: config.payment.merchantId, merchantName: config.payment.merchantName },
      transactionInfo: { totalPriceStatus: 'FINAL', totalPrice: config.payment.amount.toFixed(2), currencyCode: config.payment.currency, countryCode: 'IN' },
    });
    const reference = response.paymentMethodData?.tokenizationData?.token || '';
    setPaymentReference(reference);
    setAccessToken(await playerRegistrationService.issueAccessToken(reference));
  };

  const handlePayment = async () => {
    setBusy(true); setError('');
    try { await pay(); } catch (paymentError) { setError(paymentError instanceof Error ? paymentError.message : 'Payment failed.'); } finally { setBusy(false); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSuccess('');
    const missing = fields.filter(field => field.required && !values[field.id]?.trim() && field.systemKey !== 'photo');
    if (missing.length) { setError(`Please complete: ${missing.map(field => field.label).join(', ')}`); return; }
    if (fields.some(field => field.systemKey === 'photo' && field.required) && !photoUrl) { setError('Please upload your photo.'); return; }
    if (paymentRequired && !accessToken) { setError('Complete payment before entering registration details.'); return; }
    setBusy(true);
    try {
      const nameField = fields.find(field => field.systemKey === 'name')?.id || 'name';
      const phoneField = fields.find(field => field.systemKey === 'phone')?.id || 'phone';
      const dobField = fields.find(field => field.systemKey === 'dateOfBirth')?.id || 'dateOfBirth';
      const identity = { name: values[nameField] || '', phone: values[phoneField] || '', dateOfBirth: values[dobField] || '' };
      if (await playerRegistrationService.findDuplicate(identity)) { setError('A registration already exists for this name, phone number, and date of birth.'); return; }
      if (accessToken !== 'not-required' && !await playerRegistrationService.consumeAccessToken(accessToken)) { setError('Your payment session expired. Please start payment again.'); return; }
      await playerRegistrationService.saveRegistration({ id: crypto.randomUUID(), name: identity.name, phone: identity.phone, dateOfBirth: identity.dateOfBirth, photoUrl, imageEdit: photoEdit, data: values, paymentStatus: accessToken === 'not-required' ? 'not_required' : 'paid', paymentReference, status: 'submitted' });
      setSuccess('Registration submitted successfully. Keep this screen for your confirmation.');
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Registration failed.'); } finally { setBusy(false); }
  };

  if (success) return <main className="registration-page"><section className="registration-card registration-card--success"><IoCheckmarkCircle size={64} /><h1>Registration complete</h1><p>{success}</p><strong>{tenantSlug}</strong></section></main>;
  if (paymentRequired && !accessToken) return <main className="registration-page"><section className="registration-card registration-card--payment"><header><span className="registration-eyebrow">{tenantSlug}</span><h1>Registration access</h1><p>Complete the registration fee to unlock the player details form.</p></header><div className="registration-payment-summary"><span>Registration fee</span><strong>₹{config.payment.amount.toFixed(2)}</strong></div>{config.payment.qrCodeUrl && <img className="registration-payment-qr" src={config.payment.qrCodeUrl} alt="Scan to pay registration fee" />}{config.payment.upiId && <div className="registration-payment-detail"><span>UPI ID</span><strong>{config.payment.upiId}</strong><a href={`upi://pay?pa=${encodeURIComponent(config.payment.upiId)}&pn=${encodeURIComponent(config.payment.merchantName)}&am=${config.payment.amount.toFixed(2)}&cu=INR`}>Open UPI app</a></div>}{config.payment.paymentUrl && <a className="registration-payment-link" href={config.payment.paymentUrl} target="_blank" rel="noreferrer">Open payment page</a>}<button className="registration-submit" type="button" onClick={() => void handlePayment()} disabled={busy}><IoLockClosed size={17} />{busy ? 'Opening Google Pay…' : 'Pay with Google Pay'}</button>{error && <p className="registration-error">{error}</p>}<small className="registration-privacy">Google Pay success automatically unlocks the registration form. Payment links and QR codes still require gateway verification.</small></section></main>;
  return <main className="registration-page"><section className="registration-card"><header><span className="registration-eyebrow">{tenantSlug}</span><h1>{config.title}</h1><p>{config.description}</p></header>{!config.enabled && <div className="registration-notice">Registration is currently closed.</div>}<form onSubmit={submit}>
    {fields.map(field => field.systemKey === 'photo' ? (photoUrl ? null : <PhotoGuide key={field.id} onFile={handlePhoto} guideUrl={config.photoGuideUrl} />) : <label className="registration-field" key={field.id}><span>{field.label}{field.required && ' *'}</span>{field.type === 'textarea' ? <textarea required={field.required} value={values[field.id] || ''} placeholder={field.placeholder} onChange={e => setValue(field, e.target.value)} /> : field.type === 'select' ? <select required={field.required} value={values[field.id] || ''} onChange={e => setValue(field, e.target.value)}><option value="">Select</option>{field.options?.map(option => <option key={option}>{option}</option>)}</select> : <input required={field.required} type={field.type === 'phone' ? 'tel' : field.type} value={values[field.id] || ''} placeholder={field.placeholder} onChange={e => setValue(field, e.target.value)} />}</label>)}
    {photoPreview && photoUrl && <div className="registration-photo-editor"><div className="registration-photo-editor__heading"><strong>Adjust your auction photo</strong><span>Match the portrait to the guide before submitting.</span></div><img className="registration-photo__preview" src={photoPreview} alt="Selected player" />{photoProcessingLog.length > 0 && <div className="registration-photo-editor__log" role="status" aria-live="polite">{photoProcessingLog.map((message, index) => <div key={`${message}-${index}`}>{message}</div>)}</div>}{photoProcessingLog.some(message => message.includes('successfully')) && <div className="registration-photo-editor__success">✓ Background removed successfully. Your transparent image is ready for auction.</div>}<PlayerImageEditor imageUrl={photoUrl} edit={photoEdit} processing={processingPhoto} processingProgress={photoProcessingProgress} onChange={setPhotoEdit} onRemoveBackground={() => { void removePhotoBackground(); }} /></div>}<button className="registration-submit" type="submit" disabled={busy || !config.enabled || processingPhoto}><IoLockClosed size={17} />{busy ? 'Submitting…' : 'Submit registration'}</button>{error && <p className="registration-error">{error}</p>}<small className="registration-privacy">Your registration is stored only for this tenant’s auction and match operations.</small></form></section></main>;
}