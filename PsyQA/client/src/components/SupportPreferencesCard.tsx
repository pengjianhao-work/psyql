import { useEffect, useState } from 'react';
import {
  getSupportPreferences, saveSupportPreferences, SupportAnswers, SupportQuestion
} from '../api';

const trainingQuestions = new Set(['goal', 'format', 'minutes']);
type EditSection = 'all' | 'chat' | 'training';

interface Props {
  userId: string;
  onAnswers: (userId: string, answers: SupportAnswers) => void;
}

export function SupportPreferencesCard({ userId, onAnswers }: Props) {
  const [questions, setQuestions] = useState<SupportQuestion[]>([]);
  const [saved, setSaved] = useState<SupportAnswers>({});
  const [draft, setDraft] = useState<SupportAnswers | null>(null);
  const [section, setSection] = useState<EditSection>('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    getSupportPreferences(userId, controller.signal).then(({ questions, answers }) => {
      if (controller.signal.aborted) return;
      setQuestions(questions);
      setSaved(answers);
      onAnswers(userId, answers);
    }).catch(() => {
      if (!controller.signal.aborted) setError('问卷加载失败，请重试。');
    });
    return () => controller.abort();
  }, [userId, onAnswers, attempt]);

  function choose(question: SupportQuestion, option: string) {
    if (!draft) return;
    const current = draft[question.id] ?? [];
    const next = current.includes(option)
      ? current.filter((value) => value !== option)
      : question.max === 1 || option === 'any'
        ? [option]
        : [...current.filter((value) => value !== 'any'), option];
    setDraft({ ...draft, [question.id]: next });
  }

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    setError('');
    try {
      const answers = await saveSupportPreferences(userId, draft);
      setSaved(answers);
      setDraft(null);
      onAnswers(userId, answers);
    } catch {
      setError('保存失败，答案仍在，可以重试。');
    } finally {
      setSaving(false);
    }
  }

  const hasAnswers = Object.keys(saved).length > 0;
  const visibleQuestions = questions.filter(({ id }) =>
    section === 'all' || trainingQuestions.has(id) === (section === 'training')
  );
  function edit(nextSection: EditSection) {
    setSection(nextSection);
    setDraft(saved);
  }
  return (
    <section className="agent-profile-card support-preferences">
      <h4>我的画像 · 支持偏好</h4>
      <p>花约 2 分钟告诉我们，你希望怎么聊、最近想改善什么。答案会用于调整问答和推荐练习，每题都可以跳过。</p>
      {error && <p role="alert">{error}</p>}
      {!questions.length && (error
        ? <button type="button" onClick={() => setAttempt(attempt + 1)}>重新加载</button>
        : <p role="status">正在加载问卷…</p>)}
      {!draft && questions.length > 0 && (
        <>
          {hasAnswers && <dl className="support-preferences-summary">
            {questions.filter(({ id }) => saved[id]?.length).map((question) => (
              <div key={question.id}>
                <dt>{question.title}</dt>
                <dd>{question.options.filter(({ id }) => saved[question.id].includes(id)).map(({ label }) => label).join(' / ')}</dd>
              </div>
            ))}
          </dl>}
          {hasAnswers ? (
            <div className="support-preferences-actions">
              <button type="button" onClick={() => edit('chat')}>修改聊天偏好</button>
              <button type="button" onClick={() => edit('training')}>更新近期目标</button>
            </div>
          ) : <button type="button" onClick={() => edit('all')}>填写问卷</button>}
        </>
      )}
      {draft && (
        <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
          {visibleQuestions.map((question) => {
            const selected = draft[question.id] ?? [];
            return (
              <fieldset key={question.id} disabled={saving}>
                <legend>{question.title}（{question.max === 1 ? '单选' : '最多选两项'}）</legend>
                {question.options.map(({ id, label }) => (
                  <label key={id}>
                    <input
                      type={question.max === 1 ? 'radio' : 'checkbox'}
                      name={question.id}
                      checked={selected.includes(id)}
                      disabled={question.max > 1 && selected.length >= question.max && !selected.includes(id) && id !== 'any'}
                      onChange={() => choose(question, id)}
                    /> {label}
                  </label>
                ))}
                {selected.length > 0 && (
                  <button type="button" onClick={() => setDraft({ ...draft, [question.id]: [] })}>跳过此题</button>
                )}
              </fieldset>
            );
          })}
          <button type="submit" disabled={saving}>{saving ? '保存中…' : '保存偏好'}</button>
          <button type="button" disabled={saving} onClick={() => { setDraft(null); setError(''); }}>取消</button>
        </form>
      )}
      <details>
        <summary>问卷设计依据</summary>
        <p>这些情境题用于记录个人偏好。题目设计参考了决策偏好和近期压力体验的研究。</p>
        <ul>
          <li><a href="https://www.myersbriggs.org/my-mbti-personality-type/the-mbti-preferences/">Myers &amp; Briggs Foundation 的决策偏好说明</a></li>
          <li><a href="https://pubmed.ncbi.nlm.nih.gov/6668417/">Cohen 等人的感知压力研究</a></li>
          <li><a href="https://www.who.int/thailand/activities/doing-what-matters-in-times-of-stress">世界卫生组织压力管理指南</a></li>
        </ul>
      </details>
    </section>
  );
}
