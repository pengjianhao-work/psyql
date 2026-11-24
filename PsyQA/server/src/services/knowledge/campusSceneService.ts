// 贸大校园场景卡：从校园墙匿名归纳中提炼出的典型处境
// 数据来源：PsyQA/server/data/campus_wall/campus_posts.csv（已脱敏）
//
// 设计原则：
// - 不引用原始帖子、缩写人名、帖子 id
// - 不编造任何贸大官方资源（心理中心地址、校医室等都不说）
// - 可以用校内宿舍名、活动名、课程名让回答有代入感
// - 高风险/危机内容不会进入这些归纳卡（走 emotionService 里的安全路径）

export type CampusSceneId =
  | 'course'
  | 'exam'
  | 'career'
  | 'dorm'
  | 'romance'
  | 'interpersonal';

export interface CampusScene {
  id: CampusSceneId;
  /** 简短标题，用于调试日志 */
  label: string;
  /** 1-2 段匿名归纳的典型处境，注入到 Prompt 里 */
  summary: string;
  /** 专属 few-shot 开头示例，用校内元素锚定场景，放在 Prompt 末尾强制模型遵循 */
  openingExamples: string[];
}

const CAMPUS_SCENES: Record<CampusSceneId, CampusScene> = {
  course: {
    id: 'course',
    label: '选课与学业',
    summary:
      '选课相关：选课时纠结选哪门、退课要不要、培养方案怎么规划、GPA 不够担心保研考研；部分课程有平时小测、大课/小课指导（有偿）、综测计入 GPA；期末复习压力是另一个场景的内容，这里主要聊选课和学业安排。',
    openingExamples: [
      '「选课时在纠结是选金融市场学还是保一门 GPA」',
      '「退课要不要，选了一门觉得自己hold不住」'
    ]
  },
  exam: {
    id: 'exam',
    label: '考试与睡眠',
    summary:
      '考试周校内高频：数分/高数被集体吐槽"学不会"；睡眠被复习熬夜打乱；"求网课复习方法"帖明显增多；有偿收小测/练习题的需求出现。（注：部分同学期末还叠加服风/商赛/综测等额外付出，这是可选背景，用户没提就不必硬加。）',
    openingExamples: [
      '「数分期末还没复习完，昨晚熬到三点」',
      '「考试周复习到凌晨，睡眠完全被打乱」'
    ]
  },
  career: {
    id: 'career',
    label: '实习与职业',
    summary:
      '考研与实习的选择是贸大同学的持续议题："商赛到底有用吗？"常被问；科研助手"老师还没布置任务"这种不确定感也出现过；同辈 offer 比较、投递节奏、方向迷茫是普遍困扰。',
    openingExamples: [
      '「商赛到底有用吗这个问题，我纠结很久了」',
      '「科研助手老师还没布置任务，offer 一个接一个出来」'
    ]
  },
  dorm: {
    id: 'dorm',
    label: '宿舍关系',
    summary:
      '宿舍生活高频矛盾：室友电话/自言自语声音大被抱怨、"舍敌"一词在校园墙上出现过；代拿外卖/快递是常情但也有人嫌麻烦；虹远/宏远/静远/汇远等宿舍名常出现在交易和求助帖里。',
    openingExamples: [
      '「虹远楼下代拿外卖是常情，但有时候真的嫌麻烦」',
      '「室友半夜打电话，已经持续半个学期了」'
    ]
  },
  romance: {
    id: 'romance',
    label: '恋爱困扰',
    summary:
      '校内恋爱相关讨论：既想谈恋爱又怕遇到不对的人、"浪费心气和时间"；坦白过往/敏感经历给对方的犹豫；"无付出无 deep talk 只有欲望"的关系让部分同学困惑；父母是否知情、多久算合适的话题。性取向相关讨论也有出现。',
    openingExamples: [
      '「既想谈恋爱又怕遇到不对的人，浪费心气」',
      '「deep talk 比仪式感重要，但对方好像只有欲望」'
    ]
  },
  interpersonal: {
    id: 'interpersonal',
    label: '人际矛盾',
    summary:
      '校园墙上的人际主题：组队发帖"没人鸟我"的挫败；服风/商赛里同学间的情绪波动；同学间"没素质"、"宽于待己严于律人"的指责；对校内流浪动物的爱心被分享；服风/综测等竞赛活动后的情绪释放。',
    openingExamples: [
      '「组队发帖没人鸟我，真的很挫败」',
      '「商赛小组有人划水，被骂没素质」'
    ]
  }
};

const VALID_SCENE_IDS = new Set<string>(Object.keys(CAMPUS_SCENES));

export function isValidCampusSceneId(id: unknown): id is CampusSceneId {
  return typeof id === 'string' && VALID_SCENE_IDS.has(id);
}

export function getCampusScene(id: CampusSceneId | string | undefined | null): CampusScene | null {
  if (!isValidCampusSceneId(id)) return null;
  return CAMPUS_SCENES[id];
}

/** 拼成一段可直接注入 LLM Prompt 的校园场景上下文（放在回答要求区，紧挨着生成前） */
export function buildCampusScenePromptBlock(scene: CampusScene | null): string {
  if (!scene) return '';
  const anchorHint = scene.summary;
  const examples = scene.openingExamples.map((e) => `· ${e}`).join('\n');
  return `
[CAM_SCENE_MARKER_2026]
【校内场景参考 · 仅供参考，绝不硬塞】
当前用户可能在「${scene.label}」的困扰里。你服务于对外经济贸易大学在校学生。
用户问题如果确实和下面这些校内元素沾边，可以自然提一下增加代入感；但如果用户根本没提到相关内容，别硬塞贸大名词，先好好回应用户的真实困扰。
参考元素：
${anchorHint}
下面是一些校内场景的常见开头，仅供参考（用户问题不贴就别抄）：
${examples}
禁止编造贸大官方资源（心理中心地址、热线以外的校医信息都不说）；危机时只说全国心理援助热线 400-161-9995。`.trim();
}
