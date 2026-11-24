import { createSessionToken, revokeSessionToken, verifySessionToken } from '../services/user/sessionService';

describe('sessionService', () => {
  it('创建并校验会话 token', () => {
    const token = createSessionToken('user-x');
    expect(verifySessionToken(token)).toBe('user-x');
  });

  it('篡改 payload 的 token 被拒绝', () => {
    const token = createSessionToken('user-x');
    const [payload] = token.split('.');
    const fake = Buffer.from(JSON.stringify({ sub: 'admin', exp: Date.now() + 1e6 }), 'utf8').toString('base64url');
    expect(verifySessionToken(`${fake}.deadbeef`)).toBeNull();
    expect(verifySessionToken(`${payload}.deadbeef`)).toBeNull();
  });

  it('logout 撤销后 token 立即失效', () => {
    const token = createSessionToken('user-y');
    expect(verifySessionToken(token)).toBe('user-y');
    revokeSessionToken(token);
    expect(verifySessionToken(token)).toBeNull();
  });

  it('撤销一个会话不影响其他会话', () => {
    const a = createSessionToken('user-z');
    const b = createSessionToken('user-z');
    revokeSessionToken(a);
    expect(verifySessionToken(a)).toBeNull();
    expect(verifySessionToken(b)).toBe('user-z');
  });

  it('无 jti 的旧格式 token 仍可验证（向后兼容）', () => {
    const crypto = require('crypto');
    const secret = process.env.AUTH_SECRET || 'psyqa-dev-secret-change-me';
    const payload = Buffer.from(JSON.stringify({ sub: 'legacy', exp: Date.now() + 1e6 }), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    expect(verifySessionToken(`${payload}.${sig}`)).toBe('legacy');
  });
});
