/**
 * 为 mental_dataset.json 的 knowledge 条目自动打心理标签。
 * 运行: npm run tag:knowledge
 */
import * as fs from 'fs';
import * as path from 'path';
import { analyzeEmotion, analyzeProblem, EmotionType, ProblemCategory } from '../src/services/emotionService';

const INTERVENTION_BY_PROBLEM: Record<ProblemCategory, string> = {
  academic_stress: 'cbt',
  interpersonal: 'interpersonal',
  family_relationship: 'boundary',
  romantic_relationship: 'grief_support',
  career_future: 'motivational_interview',
  self_identity: 'supportive',
  emotion_regulation: 'mindfulness',
  body_image: 'supportive',
  addiction: 'behavioral',
  trauma: 'trauma_informed',
  other: 'supportive'
};

const datasetPath = path.join(__dirname, '..', 'data', 'mental_dataset.json');

interface KnowledgeRow {
  question: string;
  answer: string;
  tags?: {
    problems: ProblemCategory[];
    emotions: EmotionType[];
    interventionTypes: string[];
  };
}

function main(): void {
  const raw = fs.readFileSync(datasetPath, 'utf-8');
  const data = JSON.parse(raw) as { knowledge: KnowledgeRow[]; [k: string]: unknown };

  data.knowledge = data.knowledge.map((item) => {
    const text = `${item.question} ${item.answer}`;
    const emotion = analyzeEmotion(text);
    const problem = analyzeProblem(text);
    const emotions = [emotion.emotion, ...emotion.secondaryEmotions].filter(
      (e, i, arr) => arr.indexOf(e) === i
    );
    const problems = problem.category === 'other' ? [] : [problem.category];
    const interventionTypes = problems.length
      ? [INTERVENTION_BY_PROBLEM[problem.category]]
      : ['supportive'];

    return {
      ...item,
      tags: {
        problems,
        emotions,
        interventionTypes
      }
    };
  });

  fs.writeFileSync(datasetPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Tagged ${data.knowledge.length} knowledge items -> ${datasetPath}`);
}

main();
