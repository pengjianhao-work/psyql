import { useState } from 'react';
import { SupportHotlineList } from './SupportHotlineList';
import { screeningQuestions, scoreScreening, type ScreeningKind } from '../student/symptomScreening';
import { screeningSource, supportResources } from '../student/supportResources';

const frequency = ['没有', '有几天', '一半以上时间', '几乎天天'];
const titles = { 'PHQ-9': '抑郁症状自评', 'GAD-7': '焦虑症状自评' };

export function SymptomScreeningPanel({ suggested }: { suggested?: ScreeningKind }) {
  const [kind, setKind] = useState<ScreeningKind>();
  const [answers, setAnswers] = useState<Array<number | undefined>>([]);
  const [showResult, setShowResult] = useState(false);
  const needsSafetyFollowup = kind === 'PHQ-9' && (answers[8] ?? 0) > 0;
  const score = kind ? scoreScreening(kind, answers) : null;

  function start(next?: ScreeningKind) {
    setKind(next);
    setAnswers([]);
    setShowResult(false);
  }

  return (
    <section className="self-rating-panel" aria-label="心理自评与求助">
      <h4>心理自评与求助</h4>
      {suggested && !kind && <p>如果你愿意，可以做一次{titles[suggested]}，了解过去两周的状态。</p>}
      {!kind ? (
        (Object.keys(titles) as ScreeningKind[]).map((scale) =>
          <button className="save-care-btn" key={scale} type="button" onClick={() => start(scale)}>
            {titles[scale]}（{scale}）
          </button>
        )
      ) : (
        <>
          <p>{titles[kind]}（{kind}）</p>
          <p>最近两周，你有多常受到以下问题困扰？答案仅在此页面计分，离开量表后清空。</p>
          {!showResult && screeningQuestions[kind].map((question, index) => (
            <label key={question}>
              {index + 1}. {question}
              <select value={answers[index] ?? ''} onChange={(event) => {
                const answer = event.target.value;
                setAnswers((previous) => {
                  const next = [...previous];
                  next[index] = answer === '' ? undefined : Number(answer);
                  return next;
                });
              }}>
                <option value="">请选择</option>
                {frequency.map((label, value) => <option key={label} value={value}>{label}</option>)}
              </select>
            </label>
          ))}
          {needsSafetyFollowup && (
            <p role="alert">
              你选了近两周有过伤害自己或不想活的念头。你现在安全吗？
              如果你担心马上会伤害自己、已经受伤或无法保证安全，请立即联系当地急救，并请身边可信任的人陪你。
              即使现在安全，也可以尽快联系专业人员聊聊这件事。
            </p>
          )}
          {showResult && score ? (
            <p role="status">
              {score.total} / {screeningQuestions[kind].length * 3} 分，落在{score.severity}症状范围。
              分数仅用于了解近期症状，不能确诊。如果困扰持续或影响上课、作息，可以联系下方的专业支持。
            </p>
          ) : (
            <button className="save-care-btn" type="button" disabled={!score} onClick={() => setShowResult(true)}>
              查看自评结果
            </button>
          )}
          <button type="button" onClick={() => start()}>退出并清空</button>
          <p><a href={screeningSource} target="_blank" rel="noreferrer">量表来源</a></p>
        </>
      )}
      <details open={Boolean(suggested || showResult || needsSafetyFollowup)}>
        <summary>查看心理支持渠道</summary>
        {supportResources.map((resource) => (
          <p key={resource.url}>
            <a href={resource.url} target="_blank" rel="noreferrer">{resource.label}</a>
            {' · '}{resource.details}
          </p>
        ))}
        <SupportHotlineList />
      </details>
    </section>
  );
}
