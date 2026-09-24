import { describe, expect, it } from 'vitest';
import { buildAuctionPlayerFromRegistration } from '../services/playerRegistrationService';

describe('buildAuctionPlayerFromRegistration', () => {
  it('maps a registration into an admin player entry that the auction roster can display', () => {
    const registration = {
      id: 'reg-1',
      tenantId: 'tenant-a',
      name: 'Rohit Sharma',
      phone: '+91 98765 43210',
      dateOfBirth: '1990-04-30',
      photoUrl: 'https://cdn.example.com/rohit.png',
      data: {
        place: 'Mumbai',
        role: 'Batsman',
        teamName: 'Royal Challengers',
      },
      paymentStatus: 'paid' as const,
      paymentReference: 'pay-ref-123',
      status: 'submitted' as const,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };

    const player = buildAuctionPlayerFromRegistration(registration);

    expect(player).toMatchObject({
      id: 'reg-1',
      name: 'Rohit Sharma',
      imageUrl: 'https://cdn.example.com/rohit.png',
      role: 'Batsman',
      place: 'Mumbai',
      phone: '+91 98765 43210',
      dateOfBirth: '1990-04-30',
      basePrice: 0,
      matches: '',
      runs: '',
      wickets: '',
      battingBestFigures: '',
      bowlingBestFigures: '',
    });
  });
});
