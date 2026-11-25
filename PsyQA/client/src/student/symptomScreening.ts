export type ScreeningKind = 'PHQ-9' | 'GAD-7';

// DB4403/T 201—2021, Appendix C, tables C.1–C.2.
export const screeningQuestions = {
  'PHQ-9': [
    '做事时提不起劲或没有兴趣',
    '感到心情低落，沮丧或绝望',
    '入睡困难、睡不安或睡得过多',
    '感觉疲倦或没有活力',
    '食欲不振或吃太多',
    '觉得自己很糟或觉得自己很失败，或让自己、家人失望',
    '对事物专注有困难，例如看报纸或看电视时',
    '行动或说话速度缓慢到别人已经察觉？或刚好相反——变得比平日更烦躁或坐立不安，动来动去',
    '有不如死掉或用某种方式伤害自己的念头'
  ],
  'GAD-7': [
    '感觉紧张、焦虑或烦躁',
    '不能停止或控制担忧',
    '对各种各样的事情担忧过多',
    '很难放松下来',
    '由于不安而无法静坐',
    '变得容易烦躁或急躁',
    '害怕将有可怕的事发生'
  ]
};

export function scoreScreening(kind: ScreeningKind, answers: Array<number | undefined>) {
  if (answers.length !== screeningQuestions[kind].length) return null;
  let total = 0;
  for (const answer of answers) {
    if (answer === undefined || !Number.isInteger(answer) || answer < 0 || answer > 3) return null;
    total += answer;
  }
  const severity = kind === 'PHQ-9' && total >= 20 ? '重度'
    : total >= 15 ? (kind === 'PHQ-9' ? '中重度' : '重度')
    : total >= 10 ? '中度' : total >= 5 ? '轻度' : '最低范围';
  return { total, severity };
}

// Invitation only. Survey scores and crisis levels never come from text matching.
const mood = /心情低落|情绪低落|很低落|很沮丧|没兴趣|提不起劲|没有兴趣/;
const physical = /失眠|睡不着|睡不好|没胃口|吃不下|食欲下降/;
const worry = /停不下来的担心|控制不住.{0,5}(担心|焦虑)|担心.{0,8}(停不下|控制不住)|总是担心|一直担心/;
const persistence = /持续|好几天|[两二三四五六七八九十几半\d]+个?(周|星期|月)|几乎每天|天天/;
const impact = /影响.{0,8}(上课|学习|生活|睡眠|工作)|上不了课|上课也起不来|没法上课/;

export function suggestScreening(latest: string, previous = ''): ScreeningKind | undefined {
  if (/抑郁.{0,5}(自测|量表)|PHQ.?9/i.test(latest)) return 'PHQ-9';
  if (/焦虑.{0,5}(自测|量表)|GAD.?7/i.test(latest)) return 'GAD-7';
  if (!mood.test(latest) && !physical.test(latest) && !worry.test(latest)
    && !persistence.test(latest) && !impact.test(latest)) return undefined;
  const context = [latest, previous].join('\n');
  if (!persistence.test(context) && !impact.test(context)) return undefined;
  if (mood.test(context)) return 'PHQ-9';
  if (worry.test(context)) return 'GAD-7';
  return undefined;
}
