import type { PlayerImageEdit } from './index';

export type RegistrationFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'phone' | 'email';

export const DEFAULT_PHOTO_GUIDE_URL = '/assets/player-pose-guide.svg';

export interface RegistrationField {
  id: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  order: number;
  systemKey?: 'name' | 'phone' | 'dateOfBirth' | 'photo';
}

export interface RegistrationPaymentConfig {
  enabled: boolean;
  bypassForTesting?: boolean;
  amount: number;
  currency: 'INR';
  paymentUrl?: string;
  upiId?: string;
  qrCodeUrl?: string;
  merchantId: string;
  merchantName: string;
  gateway: string;
  gatewayMerchantId: string;
}

export interface PlayerRegistrationConfig {
  enabled: boolean;
  title: string;
  description: string;
  photoGuideUrl?: string;
  fields: RegistrationField[];
  payment: RegistrationPaymentConfig;
  updatedAt: number;
}

export interface PlayerRegistration {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  dateOfBirth: string;
  photoUrl: string;
  imageEdit?: PlayerImageEdit;
  data: Record<string, string>;
  paymentStatus: 'not_required' | 'paid' | 'pending' | 'failed';
  paymentReference?: string;
  status: 'submitted' | 'reviewed' | 'approved' | 'rejected';
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_REGISTRATION_FIELDS: RegistrationField[] = [
  { id: 'name', label: 'Full name', type: 'text', required: true, order: 0, systemKey: 'name' },
  { id: 'phone', label: 'Phone number', type: 'phone', required: true, order: 1, systemKey: 'phone' },
  { id: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true, order: 2, systemKey: 'dateOfBirth' },
  { id: 'photo', label: 'Player photo', type: 'text', required: true, order: 3, systemKey: 'photo' },
  { id: 'place', label: 'Place', type: 'text', required: false, order: 4 },
  { id: 'role', label: 'Playing role', type: 'select', required: false, options: ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'], order: 5 },
];

export const DEFAULT_REGISTRATION_CONFIG: PlayerRegistrationConfig = {
  enabled: true,
  title: 'Player registration',
  description: 'Submit your details for the auction and match roster.',
  photoGuideUrl: DEFAULT_PHOTO_GUIDE_URL,
  fields: DEFAULT_REGISTRATION_FIELDS,
  payment: {
    enabled: false,
    bypassForTesting: false,
    amount: 0,
    currency: 'INR',
    paymentUrl: '',
    upiId: '',
    qrCodeUrl: '',
    merchantId: '',
    merchantName: '',
    gateway: '',
    gatewayMerchantId: '',
  },
  updatedAt: 0,
};