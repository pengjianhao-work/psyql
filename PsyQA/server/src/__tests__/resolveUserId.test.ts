import { normalizeUserId, isGuestUserId, isGuestApiAllowed } from '../utils/resolveUserId';

describe('resolveUserId helpers', () => {
  test('normalizeUserId strips unsafe chars', () => {
    expect(normalizeUserId('acc_abc-123')).toBe('acc_abc-123');
    expect(normalizeUserId('bad id!')).toBe('bad_id_');
  });

  test('guest user pattern', () => {
    expect(isGuestUserId('user1')).toBe(true);
    expect(isGuestUserId('acc_student01')).toBe(false);
  });

  test('guest api allowed in non-production by default', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    expect(isGuestApiAllowed()).toBe(true);
    process.env.NODE_ENV = prev;
  });
});
