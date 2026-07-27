import * as fs from 'fs';
import { Question, SimilarQuestion } from '../../types';
import { preprocessText, computeTextRelevance, buildRetrievalQuery } from '../../utils/textProcessor';
import { hasDirectTopicOverlap } from '../../utils/relevanceFilter';
import { psyqaFullJsonPath } from '../../config/paths';

const PSYCHOLOGY_KEYWORDS = [
  '压力', '焦虑', '失眠', '抑郁', '孤独', '自卑', '紧张', '烦躁',
  '失恋', '宿舍', '考试', '学习', '考研', '就业', '人际', '感情',
  '压力大', '焦虑症', '抑郁症', '情绪低落', '心情烦躁', '自我否定'
];

const MIN_SIMILAR_QUESTION_SCORE = 4;

export function enhanceQueryWithKeywords(query: string, extraTerms: string[] = []): string {
  const terms = new Set<string>(extraTerms);
  for (const keyword of PSYCHOLOGY_KEYWORDS) {
    if (query.includes(keyword)) terms.add(keyword);
  }
  return buildRetrievalQuery(query, undefined, Array.from(terms));
}

export const loadQuestions = async (): Promise<Question[]> => {
  const dataPath = psyqaFullJsonPath();

  if (!fs.existsSync(dataPath)) {
    console.warn(`[questions] 未找到 ${dataPath}，相似问题库为空（咨询主流程仍可用）`);
    return [];
  }

  return new Promise((resolve, reject) => {
    fs.readFile(dataPath, 'utf-8', (err, data) => {
      if (err) {
        console.warn(`[questions] 读取失败，已降级为空题库: ${err.message}`);
        return resolve([]);
      }
      try {
        resolve(JSON.parse(data) as Question[]);
      } catch (parseError) {
        console.warn('[questions] JSON 解析失败，已降级为空题库');
        resolve([]);
      }
    });
  });
};

export const findSimilarQuestions = (
  query: string,
  questions: Question[],
  topN: number = 3,
  description?: string
): SimilarQuestion[] => {
  const rawQuery = description ? `${query} ${description}` : query;
  const queryText = enhanceQueryWithKeywords(rawQuery);

  const scored = questions.map((q) => {
    const relevance = computeTextRelevance(queryText, q.question, q.description);
    const keywordBonus =
      q.keywords && preprocessText(queryText).includes(preprocessText(q.keywords)) ? 2 : 0;
    const blob = `${q.question} ${q.description || ''} ${q.keywords || ''}`;
    const overlapBonus =
      hasDirectTopicOverlap(rawQuery, q.question) || hasDirectTopicOverlap(rawQuery, blob) ? 8 : 0;
    return {
      question: q.question,
      description: q.description,
      keywords: q.keywords,
      answers: q.answers,
      similarity: relevance + keywordBonus + overlapBonus
    };
  });

  const sorted = scored
    .filter((s) => {
      if (s.similarity < MIN_SIMILAR_QUESTION_SCORE) return false;
      return (
        s.similarity >= 10 ||
        hasDirectTopicOverlap(rawQuery, s.question) ||
        hasDirectTopicOverlap(rawQuery, `${s.question} ${s.description || ''}`)
      );
    })
    .sort((a, b) => b.similarity - a.similarity);

  if (sorted.length === 0) {
    return [];
  }

  const topScore = sorted[0].similarity;
  const minScore = Math.max(MIN_SIMILAR_QUESTION_SCORE * 0.55, topScore * 0.5);
  return sorted.filter((s) => s.similarity >= minScore).slice(0, topN);
};

export interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
  count: number;
}

const MAIN_CATEGORIES: CategoryInfo[] = [
  { id: 'academic_stress', name: '📚 学业压力', icon: '📚', count: 0 },
  { id: 'interpersonal', name: '👥 人际关系', icon: '👥', count: 0 },
  { id: 'family_relationship', name: '🏠 家庭关系', icon: '🏠', count: 0 },
  { id: 'romantic_relationship', name: '💑 恋爱关系', icon: '💑', count: 0 },
  { id: 'career_future', name: '🚀 职业未来', icon: '🚀', count: 0 },
  { id: 'self_identity', name: '🌟 自我认同', icon: '🌟', count: 0 },
  { id: 'emotion_regulation', name: '🧘 情绪调节', icon: '🧘', count: 0 },
  { id: 'body_image', name: '👗 身体意象', icon: '👗', count: 0 },
  { id: 'addiction', name: '🎮 成瘾问题', icon: '🎮', count: 0 },
  { id: 'trauma', name: '🕊️ 创伤经历', icon: '🕊️', count: 0 }
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  academic_stress: ['学习', '考试', '考研', '高考', '作业', '成绩', '复习', '论文', '答辩', '挂科', '绩点'],
  interpersonal: ['朋友', '室友', '同学', '社交', '孤独', '孤单', '社恐', '人际沟通', '人际关系'],
  family_relationship: ['父母', '家人', '妈妈', '爸爸', '家庭', '亲情', '家庭矛盾', '父母期望'],
  romantic_relationship: ['恋爱', '失恋', '感情', '喜欢', '分手', '暗恋', '表白', '异地恋'],
  career_future: ['迷茫', '未来', '方向', '目标', '就业', '工作', '职业规划', '前途'],
  self_identity: ['自信', '自卑', '自我', '价值', '自我认同', '自我怀疑', '自尊心'],
  emotion_regulation: ['情绪', '心情', '调节', '控制', '管理', '情绪问题', '焦虑', '抑郁'],
  body_image: ['身材', '外貌', '体重', '颜值', '身材焦虑', '外貌焦虑', '减肥'],
  addiction: ['游戏', '手机', '网络', '熬夜', '上瘾', '沉迷', '游戏上瘾'],
  trauma: ['创伤', '阴影', '回忆', '伤害', '痛苦经历', '心理阴影', '童年阴影']
};

export const getCategories = (questions: Question[]): CategoryInfo[] => {
  const categoryCounts: Record<string, number> = {};
  MAIN_CATEGORIES.forEach((cat) => {
    categoryCounts[cat.id] = 0;
  });

  questions.forEach((q) => {
    const text = (q.question + ' ' + q.description + ' ' + q.keywords).toLowerCase();
    for (const [categoryId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const kw of keywords) {
        if (text.includes(kw.toLowerCase())) {
          categoryCounts[categoryId]++;
          break;
        }
      }
    }
  });

  return MAIN_CATEGORIES.map((cat) => ({
    ...cat,
    count: categoryCounts[cat.id]
  }));
};

export const getAllCategories = (): CategoryInfo[] => MAIN_CATEGORIES;
