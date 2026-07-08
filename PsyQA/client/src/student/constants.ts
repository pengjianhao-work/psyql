export const DEMO_QUESTIONS = [
  '最近学习压力很大，学不进去怎么办？',
  '我感觉很孤独，没有朋友',
  '和室友关系不好，很烦恼',
  '担心未来找不到工作',
  '总是情绪低落，提不起劲'
];

export const CATEGORY_PROMPT_MAP: Record<string, string[]> = {
  academic_stress: ['最近学习压力很大，学不进去怎么办？', '担心未来找不到工作'],
  interpersonal: ['和室友关系不好，很烦恼', '我感觉很孤独，没有朋友'],
  career_future: ['担心未来找不到工作'],
  emotion_regulation: ['总是情绪低落，提不起劲'],
  romantic_relationship: ['和恋人经常吵架，不知道怎么办', '暧昧关系让我很焦虑'],
  family_relationship: ['和父母沟通困难，压力很大', '家里期望和我自己的想法冲突'],
  self_identity: ['不确定自己适合什么方向', '总觉得自己不够好'],
  other: DEMO_QUESTIONS
};

export const DEFAULT_GUEST_USERS = [
  { id: 'user1', name: '小明', avatar: '👦' },
  { id: 'user2', name: '小红', avatar: '👧' },
  { id: 'user3', name: '小李', avatar: '👨' }
];
