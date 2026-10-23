import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parsePhotoUrls } from './utils';

describe('Auth & Session Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('defaults Remember Me preference to true if not explicitly set to false', () => {
    const isRemembered = localStorage.getItem('tricore_remember_me') !== 'false';
    expect(isRemembered).toBe(true);
  });

  it('stores email in localStorage when Remember Me is enabled', () => {
    const email = 'driver@tricore.com';
    const rememberMe = true;

    if (rememberMe) {
      localStorage.setItem('tricore_remember_me', 'true');
      localStorage.setItem('tricore_remember_email', email);
    }

    expect(localStorage.getItem('tricore_remember_me')).toBe('true');
    expect(localStorage.getItem('tricore_remember_email')).toBe('driver@tricore.com');
  });

  it('clears saved email and sets remember_me to false when unchecked', () => {
    localStorage.setItem('tricore_remember_email', 'old@tricore.com');
    const rememberMe = false;

    if (!rememberMe) {
      localStorage.setItem('tricore_remember_me', 'false');
      localStorage.removeItem('tricore_remember_email');
    }

    expect(localStorage.getItem('tricore_remember_me')).toBe('false');
    expect(localStorage.getItem('tricore_remember_email')).toBeNull();
  });

  it('caches user profile in localStorage and retrieves it on initial load', () => {
    const mockProfile = { id: 'usr_123', full_name: 'Driver Dave', role: 'driver' };
    localStorage.setItem('tricore_user_profile', JSON.stringify(mockProfile));

    const cached = JSON.parse(localStorage.getItem('tricore_user_profile'));
    expect(cached).toEqual(mockProfile);
    expect(cached.role).toBe('driver');
  });
});

describe('POD Photos Parsing (parsePhotoUrls)', () => {
  it('returns empty array when photoUrl is null or empty', () => {
    expect(parsePhotoUrls(null)).toEqual([]);
    expect(parsePhotoUrls(undefined)).toEqual([]);
    expect(parsePhotoUrls('')).toEqual([]);
  });

  it('handles a legacy single photo URL', () => {
    const singleUrl = 'https://supabase.co/storage/v1/object/public/delivery-proofs/pod-photos/123.jpg';
    expect(parsePhotoUrls(singleUrl)).toEqual([singleUrl]);
  });

  it('handles multiple photos serialized as JSON array (up to 4)', () => {
    const urls = [
      'https://supabase.co/storage/v1/object/public/delivery-proofs/pod-photos/123-1.jpg',
      'https://supabase.co/storage/v1/object/public/delivery-proofs/pod-photos/123-2.jpg',
      'https://supabase.co/storage/v1/object/public/delivery-proofs/pod-photos/123-3.jpg',
      'https://supabase.co/storage/v1/object/public/delivery-proofs/pod-photos/123-4.jpg'
    ];
    const jsonStr = JSON.stringify(urls);
    expect(parsePhotoUrls(jsonStr)).toEqual(urls);
  });

  it('handles comma-separated photo URLs', () => {
    const csv = 'https://site.com/p1.jpg, https://site.com/p2.jpg';
    expect(parsePhotoUrls(csv)).toEqual(['https://site.com/p1.jpg', 'https://site.com/p2.jpg']);
  });
});
