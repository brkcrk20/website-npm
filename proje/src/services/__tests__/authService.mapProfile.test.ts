import { describe, it, expect } from 'vitest';
import { mapProfile } from '../authService';

describe('mapProfile', () => {
  it('eksik/null trust verisiyle çökmeden makul varsayılanlar üretir', () => {
    const profile = mapProfile({
      id: 'user-1',
      phone: '+905551112233',
      full_name: 'Test Kullanıcı',
      city: 'İstanbul',
      district: 'Kadıköy',
      created_at: '2026-01-01T00:00:00.000Z',
    });

    expect(profile.id).toBe('user-1');
    expect(profile.fullName).toBe('Test Kullanıcı');
    expect(profile.trustProfile.score).toBe(5);
    expect(profile.trustProfile.successfulTradesCount).toBe(0);
    expect(profile.trustProfile.cancellationRate).toBe(0);
  });

  it('completed/cancelled trade sayılarından iptal oranını doğru hesaplar (takas geçmişi/güven skoru için kritik)', () => {
    const profile = mapProfile(
      { id: 'user-2', full_name: 'Deneme', created_at: '2026-01-01T00:00:00.000Z' },
      { completed_trades: 3, cancelled_trades: 1, trust_score: 4.2, verification_level: 'id_verified' }
    );

    expect(profile.trustProfile.successfulTradesCount).toBe(3);
    // 1 iptal / (3 tamamlanan + 1 iptal) = 0.25
    expect(profile.trustProfile.cancellationRate).toBeCloseTo(0.25, 2);
    expect(profile.trustProfile.idVerified).toBe(true);
    expect(profile.trustProfile.score).toBe(4.2);
  });

  it('trades hiç yokken (totalTrades=0) sıfıra bölme hatası oluşturmaz', () => {
    const profile = mapProfile(
      { id: 'user-3', full_name: 'Yeni Kullanıcı', created_at: '2026-01-01T00:00:00.000Z' },
      { completed_trades: 0, cancelled_trades: 0 }
    );

    expect(profile.trustProfile.cancellationRate).toBe(0);
    expect(Number.isNaN(profile.trustProfile.cancellationRate)).toBe(false);
  });
});
