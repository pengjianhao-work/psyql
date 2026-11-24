import type { AgentPersona } from '../../types/userAgent';

/** 形象头像白名单：后端只认 key，emoji/渐变由前端映射 */
export const PERSONA_AVATARS = [
  'warm-bear',
  'night-owl',
  'sun-cat',
  'calm-deer',
  'brave-fox',
  'gentle-whale',
  'little-panda',
  'star-rabbit',
  'quiet-tree',
  'happy-dog'
] as const;

export type PersonaAvatarKey = (typeof PERSONA_AVATARS)[number];

export class PersonaValidationError extends Error {}

/** 单字段长度上限（按字计数，含标点） */
const PERSONA_FIELD_CAPS = {
  name: 12,
  personality: 30,
  toneStyle: 20,
  catchphrase: 20,
  speakingStyle: 40
} as const;

const PERSONA_FIELD_LABEL: Record<keyof typeof PERSONA_FIELD_CAPS, string> = {
  name: '名字',
  personality: '性格',
  toneStyle: '语气',
  catchphrase: '口头禅',
  speakingStyle: '说话习惯'
};

/** 控制字符（含换行）一律替换为空格，防止注入多行提示词 */
const CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/g;

function cleanField(
  value: unknown,
  field: keyof typeof PERSONA_FIELD_CAPS
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new PersonaValidationError(`形象设定 · ${PERSONA_FIELD_LABEL[field]}必须是文字`);
  }
  const cleaned = value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  const cap = PERSONA_FIELD_CAPS[field];
  if ([...cleaned].length > cap) {
    throw new PersonaValidationError(
      `形象设定 · ${PERSONA_FIELD_LABEL[field]}不能超过 ${cap} 字`
    );
  }
  return cleaned;
}

/**
 * 校验并清洗形象卡。非法输入抛 PersonaValidationError（控制器转 400）；
 * 未知 key 丢弃；空字段不保留；avatarKey 必须在白名单内。
 * 传 null/undefined 返回空对象（用于清空）。
 */
export function validatePersona(input: unknown): AgentPersona {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new PersonaValidationError('形象设定格式无效');
  }
  const raw = input as Record<string, unknown>;
  const persona: AgentPersona = {};

  const name = cleanField(raw.name, 'name');
  if (name) persona.name = name;

  const avatarKey = raw.avatarKey;
  if (avatarKey !== undefined && avatarKey !== null && avatarKey !== '') {
    if (
      typeof avatarKey !== 'string' ||
      !(PERSONA_AVATARS as readonly string[]).includes(avatarKey)
    ) {
      throw new PersonaValidationError('形象设定 · 头像选择无效');
    }
    persona.avatarKey = avatarKey;
  }

  const personality = cleanField(raw.personality, 'personality');
  if (personality) persona.personality = personality;
  const toneStyle = cleanField(raw.toneStyle, 'toneStyle');
  if (toneStyle) persona.toneStyle = toneStyle;
  const catchphrase = cleanField(raw.catchphrase, 'catchphrase');
  if (catchphrase) persona.catchphrase = catchphrase;
  const speakingStyle = cleanField(raw.speakingStyle, 'speakingStyle');
  if (speakingStyle) persona.speakingStyle = speakingStyle;

  return persona;
}

/**
 * 锁定行不可删：agentContext 在 crisis/high 路径仍会进提示词，
 * 形象设定必须带这句安全不变量，防止用户输入把人设改成危机时不安全的风格。
 */
export const PERSONA_LOCK_LINE =
  '无论设定如何，你始终是温暖、稳重的陪伴者；危机时以安全为先。';

/** 生成注入提示词的形象设定块；没有任何已填字段时返回 '' */
export function formatPersonaForPrompt(persona?: AgentPersona | null): string {
  if (!persona) return '';
  const fields: string[] = [];
  if (persona.name) fields.push(`- 名字：${persona.name}`);
  if (persona.personality) fields.push(`- 性格：${persona.personality}`);
  if (persona.toneStyle) fields.push(`- 语气：${persona.toneStyle}`);
  if (persona.catchphrase) {
    fields.push(`- 口头禅：${persona.catchphrase}（偶尔自然使用，不要每句都带）`);
  }
  if (persona.speakingStyle) fields.push(`- 说话习惯：${persona.speakingStyle}`);
  if (!fields.length) return '';
  return `【TA 给你的形象设定】\n${fields.join('　')}\n${PERSONA_LOCK_LINE}`;
}
