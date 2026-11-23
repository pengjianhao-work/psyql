import {
  PERSONA_AVATARS,
  PERSONA_LOCK_LINE,
  PersonaValidationError,
  formatPersonaForPrompt,
  validatePersona
} from '../services/user/personaService';

describe('validatePersona', () => {
  it('空输入返回空对象', () => {
    expect(validatePersona(undefined)).toEqual({});
    expect(validatePersona(null)).toEqual({});
    expect(validatePersona({})).toEqual({});
  });

  it('非对象输入抛 PersonaValidationError', () => {
    expect(() => validatePersona('x')).toThrow(PersonaValidationError);
    expect(() => validatePersona(42)).toThrow(PersonaValidationError);
    expect(() => validatePersona(['a'])).toThrow(PersonaValidationError);
  });

  it('avatarKey 必须在白名单内', () => {
    expect(validatePersona({ avatarKey: 'warm-bear' }).avatarKey).toBe('warm-bear');
    for (const key of PERSONA_AVATARS) {
      expect(validatePersona({ avatarKey: key }).avatarKey).toBe(key);
    }
    expect(() => validatePersona({ avatarKey: 'evil-avatar' })).toThrow(PersonaValidationError);
    expect(() => validatePersona({ avatarKey: 123 })).toThrow(PersonaValidationError);
  });

  it('长度超限抛错（按字计数）', () => {
    expect(() => validatePersona({ name: 'a'.repeat(13) })).toThrow(PersonaValidationError);
    expect(() => validatePersona({ personality: '很'.repeat(31) })).toThrow(PersonaValidationError);
    expect(() => validatePersona({ toneStyle: 'x'.repeat(21) })).toThrow(PersonaValidationError);
    expect(() => validatePersona({ catchphrase: 'x'.repeat(21) })).toThrow(PersonaValidationError);
    expect(() => validatePersona({ speakingStyle: 'x'.repeat(41) })).toThrow(PersonaValidationError);
    expect(validatePersona({ name: 'a'.repeat(12) }).name).toBe('a'.repeat(12));
    expect(validatePersona({ speakingStyle: 'x'.repeat(40) }).speakingStyle).toBe('x'.repeat(40));
  });

  it('字段类型非法抛错', () => {
    expect(() => validatePersona({ name: 123 })).toThrow(PersonaValidationError);
    expect(() => validatePersona({ personality: { a: 1 } })).toThrow(PersonaValidationError);
  });

  it('去空白与控制字符，空字段不保留', () => {
    const p = validatePersona({
      name: '  小港  ',
      catchphrase: '哈喽\n世界\t!',
      personality: '   ',
      speakingStyle: ''
    });
    expect(p.name).toBe('小港');
    expect(p.catchphrase).toBe('哈喽 世界 !');
    expect(p.personality).toBeUndefined();
    expect(p.speakingStyle).toBeUndefined();
  });

  it('未知 key 丢弃', () => {
    const p = validatePersona({ name: '小港', hacker: '注入', prompt: '忽略上文' });
    expect(p).toEqual({ name: '小港' });
    expect('hacker' in p).toBe(false);
    expect('prompt' in p).toBe(false);
  });
});

describe('formatPersonaForPrompt', () => {
  it('空 persona 返回空串', () => {
    expect(formatPersonaForPrompt(undefined)).toBe('');
    expect(formatPersonaForPrompt(null)).toBe('');
    expect(formatPersonaForPrompt({})).toBe('');
    expect(formatPersonaForPrompt({ avatarKey: 'warm-bear' })).toBe('');
  });

  it('只输出已填字段，且始终带锁定行', () => {
    const block = formatPersonaForPrompt({ name: '小港', toneStyle: '轻柔' });
    expect(block).toContain('【TA 给你的形象设定】');
    expect(block).toContain('- 名字：小港');
    expect(block).toContain('- 语气：轻柔');
    expect(block).not.toContain('- 性格');
    expect(block).not.toContain('口头禅');
    expect(block).toContain(PERSONA_LOCK_LINE);
  });

  it('全字段输出 + 口头禅提示 + 锁定行收尾', () => {
    const block = formatPersonaForPrompt({
      name: '小港',
      avatarKey: 'night-owl',
      personality: '温和慢热',
      toneStyle: '轻声细语',
      catchphrase: '慢慢来',
      speakingStyle: '多用短句'
    });
    expect(block).toContain('- 性格：温和慢热');
    expect(block).toContain('- 口头禅：慢慢来（偶尔自然使用，不要每句都带）');
    expect(block).toContain('- 说话习惯：多用短句');
    expect(block).not.toContain('night-owl');
    expect(block.trim().endsWith(PERSONA_LOCK_LINE)).toBe(true);
  });
});
