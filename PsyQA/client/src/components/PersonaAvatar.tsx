import React from 'react';
import type { AgentPersona } from '../types';

export interface PersonaAvatarOption {
  key: string;
  label: string;
  emoji: string;
  gradient: string;
}

/** 与服务端 PERSONA_AVATARS 白名单一一对应；后端只校验 key */
export const PERSONA_AVATAR_OPTIONS: PersonaAvatarOption[] = [
  { key: 'warm-bear', label: '暖心熊', emoji: '🐻', gradient: 'linear-gradient(135deg,#f6ad55,#dd6b20)' },
  { key: 'night-owl', label: '夜猫鹰', emoji: '🦉', gradient: 'linear-gradient(135deg,#6366f1,#312e81)' },
  { key: 'sun-cat', label: '向阳猫', emoji: '🐱', gradient: 'linear-gradient(135deg,#fbbf24,#f97316)' },
  { key: 'calm-deer', label: '慢热鹿', emoji: '🦌', gradient: 'linear-gradient(135deg,#a3b18a,#588157)' },
  { key: 'brave-fox', label: '勇敢狐', emoji: '🦊', gradient: 'linear-gradient(135deg,#fb923c,#c2410c)' },
  { key: 'gentle-whale', label: '温柔鲸', emoji: '🐳', gradient: 'linear-gradient(135deg,#38bdf8,#2563eb)' },
  { key: 'little-panda', label: '小熊猫', emoji: '🐼', gradient: 'linear-gradient(135deg,#94a3b8,#475569)' },
  { key: 'star-rabbit', label: '星星兔', emoji: '🐰', gradient: 'linear-gradient(135deg,#f0abfc,#a21caf)' },
  { key: 'quiet-tree', label: '安静树', emoji: '🌳', gradient: 'linear-gradient(135deg,#34d399,#047857)' },
  { key: 'happy-dog', label: '开心狗', emoji: '🐶', gradient: 'linear-gradient(135deg,#fcd34d,#b45309)' }
];

const DEFAULT_OPTION: PersonaAvatarOption = {
  key: '',
  label: '默认形象',
  emoji: '🧠',
  gradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)'
};

export function personaAvatarOption(avatarKey?: string): PersonaAvatarOption {
  return PERSONA_AVATAR_OPTIONS.find((o) => o.key === avatarKey) ?? DEFAULT_OPTION;
}

/** 形象卡是否有任一已填字段（用于决定是否替换默认头像/名字） */
export function personaHasContent(persona?: AgentPersona | null): boolean {
  return Boolean(persona && Object.values(persona).some((v) => Boolean(v)));
}

interface PersonaAvatarProps {
  avatarKey?: string;
  size?: number;
  className?: string;
  title?: string;
}

export const PersonaAvatar: React.FC<PersonaAvatarProps> = ({
  avatarKey,
  size = 36,
  className = '',
  title
}) => {
  const option = personaAvatarOption(avatarKey);
  return (
    <span
      className={`persona-avatar${className ? ` ${className}` : ''}`}
      style={{
        width: size,
        height: size,
        background: option.gradient,
        fontSize: Math.round(size * 0.55)
      }}
      role="img"
      aria-label={title || option.label}
      title={title || option.label}
    >
      {option.emoji}
    </span>
  );
};
