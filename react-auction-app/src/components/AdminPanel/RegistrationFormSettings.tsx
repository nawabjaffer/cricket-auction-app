import { useEffect, useState } from 'react';
import { IoAdd, IoArrowDown, IoArrowUp, IoSave, IoTrash } from 'react-icons/io5';
import { playerRegistrationService } from '../../services/playerRegistrationService';
import { uploadFileToStorage } from '../../services/firebaseStorageService';
import { DEFAULT_REGISTRATION_CONFIG, type PlayerRegistrationConfig, type RegistrationField, type RegistrationFieldType } from '../../types/playerRegistration';
import './RegistrationFormSettings.css';

const FIELD_TYPES: RegistrationFieldType[] = ['text', 'textarea', 'number', 'date', 'select', 'phone', 'email'];

function newField(order: number): RegistrationField {
  return { id: `field-${Date.now()}-${order}`, label: 'New field', type: 'text', required: false, order };
}

export function RegistrationFormSettings() {
  const [config, setConfig] = useState<PlayerRegistrationConfig>(DEFAULT_REGISTRATION_CONFIG);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploadingGuide, setUploadingGuide] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);

  useEffect(() => {
    playerRegistrationService.getConfig().then(saved => {
      if (saved) setConfig(saved);
    }).catch(error => {
      console.error('[RegistrationFormSettings] Failed to load config:', error);
      setStatus('Could not load registration settings.');
    }).finally(() => setLoading(false));
  }, []);

  const updateField = (id: string, patch: Partial<RegistrationField>) => {
    setConfig(current => ({ ...current, fields: current.fields.map(field => field.id === id ? { ...field, ...patch } : field) }));
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= config.fields.length) return;
    const fields = [...config.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];
    setConfig(current => ({ ...current, fields: fields.map((field, fieldIndex) => ({ ...field, order: fieldIndex })) }));
  };

  const save = async () => {
    try {
      await playerRegistrationService.saveConfig(config);
      setStatus('Registration form saved.');
    } catch (error) {
      console.error('[RegistrationFormSettings] Failed to save config:', error);
      setStatus('Could not save registration form.');
    }
  };

  const uploadGuide = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setStatus('Choose a PNG or JPG guide image.'); return; }
    setUploadingGuide(true);
    try {
      const url = await uploadFileToStorage(file, `media/registration/photo-guide-${Date.now()}`);
      setConfig(current => ({ ...current, photoGuideUrl: url }));
      setStatus('Photo guide uploaded. Save the form to publish it.');
    } catch (error) {
      console.error('[RegistrationFormSettings] Failed to upload photo guide:', error);
      setStatus('Could not upload photo guide.');
    } finally {
      setUploadingGuide(false);
    }
  };

  const uploadPaymentQr = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setStatus('Choose a QR image file.'); return; }
    setUploadingQr(true);
    try {
      const url = await uploadFileToStorage(file, `media/registration/payment-qr-${Date.now()}`);
      setConfig(current => ({ ...current, payment: { ...current.payment, qrCodeUrl: url } }));
      setStatus('Payment QR uploaded. Save the form to publish it.');
    } catch (error) {
      console.error('[RegistrationFormSettings] Failed to upload payment QR:', error);
      setStatus('Could not upload payment QR.');
    } finally {
      setUploadingQr(false);
    }
  };

  if (loading) return <div className="registration-settings">Loading registration form…</div>;

  return (
    <div className="registration-settings">
      <div className="registration-settings__header">
        <div><h3>Player Registration Form</h3><p>Configure the tenant-specific form players will use before entering the auction.</p></div>
        <button className="admin-btn admin-btn-primary" type="button" onClick={() => void save()}><IoSave size={16} /> Save Form</button>
      </div>
      <label className="registration-settings__switch"><input type="checkbox" checked={config.enabled} onChange={e => setConfig(current => ({ ...current, enabled: e.target.checked }))} /> Registration is open</label>
      <div className="registration-settings__grid">
        <label>Form title<input value={config.title} onChange={e => setConfig(current => ({ ...current, title: e.target.value }))} /></label>
        <label>Description<textarea value={config.description} onChange={e => setConfig(current => ({ ...current, description: e.target.value }))} /></label>
      </div>
      <div className="registration-settings__guide">
        <div><h4>Portrait photo placement guide</h4><p>Upload a transparent PNG or JPG showing the desired head, shoulders, and body position. It will appear as an overlay in the player image editor and registration camera screen.</p></div>
        <label className="admin-btn admin-btn-secondary admin-btn-sm registration-settings__upload"><IoAdd size={15} /> {uploadingGuide ? 'Uploading…' : 'Upload guide'}<input type="file" accept="image/png,image/jpeg" hidden onChange={e => { void uploadGuide(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {config.photoGuideUrl && <img className="registration-settings__guide-preview" src={config.photoGuideUrl} alt="Portrait placement guide preview" />}
      </div>
      <div className="registration-settings__header registration-settings__header--sub"><div><h4>Fields</h4><p>Required fields are validated before payment and submission.</p></div><button className="admin-btn admin-btn-secondary admin-btn-sm" type="button" onClick={() => setConfig(current => ({ ...current, fields: [...current.fields, newField(current.fields.length)] }))}><IoAdd size={15} /> Add field</button></div>
      <div className="registration-settings__fields">
        {config.fields.map((field, index) => (
          <div className="registration-settings__field" key={field.id}>
            <div className="registration-settings__field-order"><button type="button" aria-label="Move field up" onClick={() => moveField(index, -1)} disabled={index === 0}><IoArrowUp /></button><button type="button" aria-label="Move field down" onClick={() => moveField(index, 1)} disabled={index === config.fields.length - 1}><IoArrowDown /></button></div>
            <input value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} aria-label="Field label" />
            <select value={field.type} onChange={e => updateField(field.id, { type: e.target.value as RegistrationFieldType })} aria-label="Field type">{FIELD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select>
            <label className="registration-settings__required"><input type="checkbox" checked={field.required} disabled={Boolean(field.systemKey)} onChange={e => updateField(field.id, { required: e.target.checked })} /> Required</label>
            <button type="button" aria-label="Remove field" onClick={() => setConfig(current => ({ ...current, fields: current.fields.filter(item => item.id !== field.id) }))} disabled={Boolean(field.systemKey)}><IoTrash /></button>
          </div>
        ))}
      </div>
      <div className="registration-settings__payment">
        <h4>Google Pay</h4>
        <label className="registration-settings__switch"><input type="checkbox" checked={config.payment.enabled} onChange={e => setConfig(current => ({ ...current, payment: { ...current.payment, enabled: e.target.checked } }))} /> Require payment before registration</label>
        <small>{config.payment.enabled && !config.payment.bypassForTesting ? 'Payment is required.' : 'Testing mode: players can register without payment.'} Turn payment off for free registration.</small>
        <label className="registration-settings__switch"><input type="checkbox" checked={Boolean(config.payment.bypassForTesting)} onChange={e => setConfig(current => ({ ...current, payment: { ...current.payment, bypassForTesting: e.target.checked } }))} /> Temporary testing bypass</label>
        <div className="registration-settings__grid">
          <label>Amount (INR)<input type="number" min="0" value={config.payment.amount} onChange={e => setConfig(current => ({ ...current, payment: { ...current.payment, amount: Number(e.target.value) || 0 } }))} /></label>
          <label>Payment URL<input value={config.payment.paymentUrl || ''} onChange={e => setConfig(current => ({ ...current, payment: { ...current.payment, paymentUrl: e.target.value } }))} placeholder="https://..." /></label>
          <label>UPI ID<input value={config.payment.upiId || ''} onChange={e => setConfig(current => ({ ...current, payment: { ...current.payment, upiId: e.target.value } }))} placeholder="name@upi" /></label>
          <label>Merchant name<input value={config.payment.merchantName} onChange={e => setConfig(current => ({ ...current, payment: { ...current.payment, merchantName: e.target.value } }))} /></label>
          <label>Merchant ID<input value={config.payment.merchantId} onChange={e => setConfig(current => ({ ...current, payment: { ...current.payment, merchantId: e.target.value } }))} placeholder="Google Pay merchant ID" /></label>
          <label>Gateway<input value={config.payment.gateway} onChange={e => setConfig(current => ({ ...current, payment: { ...current.payment, gateway: e.target.value } }))} placeholder="Configured payment gateway" /></label>
          <label>Gateway merchant ID<input value={config.payment.gatewayMerchantId} onChange={e => setConfig(current => ({ ...current, payment: { ...current.payment, gatewayMerchantId: e.target.value } }))} /></label>
        </div>
        <label className="admin-btn admin-btn-secondary admin-btn-sm registration-settings__upload"><IoAdd size={15} /> {uploadingQr ? 'Uploading QR…' : 'Upload payment QR'}<input type="file" accept="image/png,image/jpeg" hidden onChange={e => { void uploadPaymentQr(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {config.payment.qrCodeUrl && <img className="registration-settings__qr-preview" src={config.payment.qrCodeUrl} alt="Payment QR preview" />}
        <small>Google Pay requires a supported payment gateway and server-side payment verification before production approval.</small>
      </div>
      {status && <p className="registration-settings__status">{status}</p>}
    </div>
  );
}