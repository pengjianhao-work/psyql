import React, { useMemo } from 'react';
import { CategoryGlyph } from './CategoryGlyph';

type CampusSceneId = 'course' | 'exam' | 'career' | 'dorm' | 'romance' | 'interpersonal';

interface CampusScene {
  id: CampusSceneId;
  title: string;
  topics: string;
  prompt: string;
  icon: string;
}

interface CampusScenePeriod {
  start: string;
  end: string;
  priority: CampusSceneId[];
}

// 仅控制首页推荐排序，不代表学校官方校历；可按每学期实际安排调整。
export const CAMPUS_SCENE_SCHEDULE: CampusScenePeriod[] = [
  { start: '02-01', end: '02-28', priority: ['course'] },
  { start: '03-15', end: '05-15', priority: ['career'] },
  { start: '06-01', end: '07-15', priority: ['exam'] },
  { start: '08-20', end: '09-15', priority: ['course'] },
  { start: '09-16', end: '11-30', priority: ['career'] },
  { start: '12-20', end: '01-31', priority: ['exam'] }
];

const DAILY_PRIORITY: CampusSceneId[] = ['dorm', 'romance', 'interpersonal'];

const CAMPUS_SCENES: CampusScene[] = [
  {
    id: 'course',
    title: '选课与学业',
    topics: '选择困难 · 学业焦虑',
    prompt: '最近选课时总担心选错，也因学业安排感到焦虑，可以帮我理一理吗？',
    icon: 'academic_stress'
  },
  {
    id: 'exam',
    title: '考试与睡眠',
    topics: '复习压力 · 失眠困扰',
    prompt: '考试周复习压力很大，晚上也难入睡，我想说说最近的困扰。',
    icon: 'emotion_regulation'
  },
  {
    id: 'career',
    title: '实习与职业',
    topics: '同辈比较 · 职业迷茫',
    prompt: '实习季看到同学都有进展，我既焦虑又迷茫，不知道怎样看待比较和选择。',
    icon: 'career_future'
  },
  {
    id: 'dorm',
    title: '宿舍关系',
    topics: '生活习惯 · 边界沟通',
    prompt: '我和室友在生活习惯上有摩擦，宿舍关系有些紧张，可以帮我想想怎么沟通吗？',
    icon: 'family_relationship'
  },
  {
    id: 'romance',
    title: '恋爱困扰',
    topics: '亲密关系 · 分歧不安',
    prompt: '我在恋爱关系里有些困扰，和伴侣沟通不顺，想理清自己的感受和需要。',
    icon: 'romantic_relationship'
  },
  {
    id: 'interpersonal',
    title: '人际矛盾',
    topics: '误解冲突 · 相处压力',
    prompt: '我和同学发生了人际矛盾，心里很别扭，不知道接下来可以怎样处理。',
    icon: 'interpersonal'
  }
];

function monthDayValue(value: string): number {
  const [month, day] = value.split('-').map(Number);
  return month * 100 + day;
}

function isInPeriod(dateValue: number, start: string, end: string): boolean {
  const startValue = monthDayValue(start);
  const endValue = monthDayValue(end);
  return startValue <= endValue
    ? dateValue >= startValue && dateValue <= endValue
    : dateValue >= startValue || dateValue <= endValue;
}

function orderedScenes(date: Date): CampusScene[] {
  const dateValue = (date.getMonth() + 1) * 100 + date.getDate();
  const period = CAMPUS_SCENE_SCHEDULE.find((item) =>
    isInPeriod(dateValue, item.start, item.end)
  );
  const priority = period?.priority ?? DAILY_PRIORITY;
  const prioritized = priority.flatMap((id) => {
    const scene = CAMPUS_SCENES.find((item) => item.id === id);
    return scene ? [scene] : [];
  });
  return [...prioritized, ...CAMPUS_SCENES.filter((scene) => !priority.includes(scene.id))];
}

interface CampusSceneEntryProps {
  onSelect: (question: string, sceneId: string) => void;
  disabled?: boolean;
}

export const CampusSceneEntry: React.FC<CampusSceneEntryProps> = ({ onSelect, disabled = false }) => {
  const scenes = useMemo(() => orderedScenes(new Date()), []);

  return (
    <section className="campus-scene-entry" aria-labelledby="campus-scene-title">
      <div className="campus-scene-entry__header">
        <div>
          <p className="campus-scene-entry__eyebrow">UIBE · 校园心事</p>
          <h2 id="campus-scene-title">贸大同学常见困扰</h2>
          <p>从一个具体场景开始，不必先组织好语言。</p>
        </div>
        <span className="campus-scene-entry__hint">点击卡片，直接进入咨询</span>
      </div>
      <div className="campus-scene-entry__grid">
        {scenes.map((scene, index) => (
          <button
            key={scene.id}
            type="button"
            className={`campus-scene-card${index === 0 ? ' is-recommended' : ''}`}
            onClick={() => onSelect(scene.prompt, scene.id)}
            disabled={disabled}
          >
            <span className="campus-scene-card__topline">
              <span className="campus-scene-card__icon">
                <CategoryGlyph id={scene.icon} />
              </span>
              {index === 0 && <span className="campus-scene-card__badge">近期推荐</span>}
              <span className="campus-scene-card__number">{String(index + 1).padStart(2, '0')}</span>
            </span>
            <span className="campus-scene-card__title">{scene.title}</span>
            <span className="campus-scene-card__topics">{scene.topics}</span>
            <span className="campus-scene-card__action">开始聊聊 <span aria-hidden="true">→</span></span>
          </button>
        ))}
      </div>
    </section>
  );
};
