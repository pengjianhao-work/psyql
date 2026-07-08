import React, { useMemo, useState } from 'react';

type TrainingType = 'emotion' | 'stress' | 'cbt' | 'affirmation' | 'sleep';

type EmotionForm = {
  triggerEvent: string;
  bodyFeeling: string;
  innerThought: string;
  emotionName: string;
};

type StressItem = {
  text: string;
  control: '可控' | '部分可控' | '不可控';
};

const initialEmotionForm: EmotionForm = {
  triggerEvent: '',
  bodyFeeling: '',
  innerThought: '',
  emotionName: ''
};

const trainingCards: Array<{
  key: TrainingType;
  title: string;
  time: string;
  description: string;
}> = [
  {
    key: 'emotion',
    title: '情绪觉察训练',
    time: '3 分钟',
    description: '记录触发事件、身体感受、内心想法和情绪名称'
  },
  {
    key: 'stress',
    title: '压力拆解训练',
    time: '5 分钟',
    description: '把笼统压力拆成小事，区分可控与不可控'
  },
  {
    key: 'cbt',
    title: '消极认知纠正训练',
    time: '4 分钟',
    description: '用轻量 CBT 方式练习更平衡的想法'
  },
  {
    key: 'affirmation',
    title: '自我肯定训练',
    time: '3 分钟',
    description: '写下 2 条自身优点或当日小成就'
  },
  {
    key: 'sleep',
    title: '睡前情绪放松训练',
    time: '6 分钟',
    description: '跟随文字引导做呼吸和肌肉放松'
  }
];

const sleepSteps = [
  '把注意力放到呼吸上，慢慢吸气 4 秒，呼气 6 秒。',
  '轻轻收紧双手 3 秒，然后慢慢放松。',
  '放松肩膀，感受身体的重量落在椅子或床上。',
  '对自己说：今天已经结束了，我可以先休息。',
  '最后做一次缓慢呼吸，允许自己进入安静状态。'
];

interface MicroTrainingPanelProps {
  userId?: string;
}

export const MicroTrainingPanel: React.FC<MicroTrainingPanelProps> = ({ userId }) => {
  const [active, setActive] = useState<TrainingType | null>(null);
  const [emotionForm, setEmotionForm] = useState<EmotionForm>(initialEmotionForm);
  const [stressTitle, setStressTitle] = useState('');
  const [stressItems, setStressItems] = useState<StressItem[]>([
    { text: '', control: '可控' },
    { text: '', control: '部分可控' },
    { text: '', control: '不可控' }
  ]);
  const [cbtChoice, setCbtChoice] = useState('');
  const [affirmationOne, setAffirmationOne] = useState('');
  const [affirmationTwo, setAffirmationTwo] = useState('');
  const [sleepStep, setSleepStep] = useState(0);

  const activeTitle = useMemo(
    () => trainingCards.find((card) => card.key === active)?.title || '',
    [active]
  );

  const saveLocalRecord = (type: string, payload: unknown) => {
    const key = `psyqa_micro_training_${userId || 'guest'}`;
    let oldRecords: unknown[] = [];
    try {
      oldRecords = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      oldRecords = [];
    }
    const newRecord = {
      type,
      payload,
      createdAt: new Date().toLocaleString('zh-CN')
    };
    localStorage.setItem(key, JSON.stringify([...oldRecords, newRecord], null, 2));
    window.alert('已完成本次训练，记录已保存到浏览器本地。');
    setActive(null);
  };

  const renderEmotionTraining = () => (
    <div>
      <p>请用 1～2 句话填写下面四栏，不需要写得很完美。</p>
      <label>
        当下触发事件
        <textarea
          className="micro-training-input"
          rows={3}
          value={emotionForm.triggerEvent}
          onChange={(event) =>
            setEmotionForm((prev) => ({ ...prev, triggerEvent: event.target.value }))
          }
          placeholder="例如：今天小组作业分工不顺利"
        />
      </label>
      <label>
        身体感受
        <textarea
          className="micro-training-input"
          rows={3}
          value={emotionForm.bodyFeeling}
          onChange={(event) =>
            setEmotionForm((prev) => ({ ...prev, bodyFeeling: event.target.value }))
          }
          placeholder="例如：胸口闷、肩膀紧、头有点痛"
        />
      </label>
      <label>
        内心想法
        <textarea
          className="micro-training-input"
          rows={3}
          value={emotionForm.innerThought}
          onChange={(event) =>
            setEmotionForm((prev) => ({ ...prev, innerThought: event.target.value }))
          }
          placeholder="例如：是不是最后又要我一个人完成"
        />
      </label>
      <label>
        情绪名称
        <input
          className="micro-training-input"
          value={emotionForm.emotionName}
          onChange={(event) =>
            setEmotionForm((prev) => ({ ...prev, emotionName: event.target.value }))
          }
          placeholder="例如：焦虑、委屈、烦躁"
        />
      </label>
      <button
        type="button"
        className="micro-training-btn primary"
        onClick={() => {
          saveLocalRecord('emotion_awareness', emotionForm);
          setEmotionForm(initialEmotionForm);
        }}
      >
        完成情绪觉察
      </button>
    </div>
  );

  const renderStressTraining = () => (
    <div>
      <p>请先写下你的压力主题，再把它拆成几件小事。</p>
      <label>
        我现在的压力是
        <input
          className="micro-training-input"
          value={stressTitle}
          onChange={(event) => setStressTitle(event.target.value)}
          placeholder="例如：期末焦虑、求职焦虑、小组作业压力"
        />
      </label>
      {stressItems.map((item, index) => (
        <div key={index} className="micro-training-stress-row">
          <input
            className="micro-training-input"
            value={item.text}
            onChange={(event) => {
              setStressItems((prev) =>
                prev.map((row, rowIndex) =>
                  rowIndex === index ? { ...row, text: event.target.value } : row
                )
              );
            }}
            placeholder={`小事 ${index + 1}`}
          />
          <select
            className="micro-training-input"
            value={item.control}
            onChange={(event) => {
              setStressItems((prev) =>
                prev.map((row, rowIndex) =>
                  rowIndex === index
                    ? { ...row, control: event.target.value as StressItem['control'] }
                    : row
                )
              );
            }}
          >
            <option value="可控">可控</option>
            <option value="部分可控">部分可控</option>
            <option value="不可控">不可控</option>
          </select>
        </div>
      ))}
      <button
        type="button"
        className="micro-training-btn secondary"
        onClick={() => setStressItems((prev) => [...prev, { text: '', control: '可控' }])}
      >
        添加一件小事
      </button>
      <button
        type="button"
        className="micro-training-btn primary"
        onClick={() => {
          saveLocalRecord('stress_decompose', { stressTitle, stressItems });
          setStressTitle('');
          setStressItems([
            { text: '', control: '可控' },
            { text: '', control: '部分可控' },
            { text: '', control: '不可控' }
          ]);
        }}
      >
        完成压力拆解
      </button>
    </div>
  );

  const renderCbtTraining = () => (
    <div>
      <p>
        练习题：你之前可能出现过类似想法：
        <strong>「考不好整个人前途就废掉了。」</strong>
      </p>
      <p>下面哪种想法更合理？</p>
      {[
        'A. 我这次没考好，说明我以后一定不行。',
        'B. 一次考试会影响阶段结果，但不能决定整个人生，我可以复盘原因并调整方法。',
        'C. 我应该完全不在乎考试。'
      ].map((option) => (
        <label key={option} className="micro-training-radio">
          <input
            type="radio"
            name="cbt"
            value={option}
            checked={cbtChoice === option}
            onChange={(event) => setCbtChoice(event.target.value)}
          />
          <span>{option}</span>
        </label>
      ))}
      {cbtChoice && cbtChoice.startsWith('B') && (
        <p className="micro-training-tip success">
          选择正确。这个表达更平衡：它承认考试重要，但没有把一次结果扩大成整个人生。
        </p>
      )}
      {cbtChoice && !cbtChoice.startsWith('B') && (
        <p className="micro-training-tip warn">
          这个想法可能包含「灾难化思维」。更合适的方式是：一次考试不能决定全部，我可以先复盘具体问题。
        </p>
      )}
      <button
        type="button"
        className="micro-training-btn primary"
        onClick={() => {
          saveLocalRecord('cbt_reframe', {
            sourceText: '考不好整个人前途就废掉了',
            selectedChoice: cbtChoice,
            correct: cbtChoice.startsWith('B')
          });
          setCbtChoice('');
        }}
      >
        完成认知纠正训练
      </button>
    </div>
  );

  const renderAffirmationTraining = () => (
    <div>
      <p>请写下今天的 2 条自身优点或小成就。</p>
      <label>
        第 1 条
        <textarea
          className="micro-training-input"
          rows={3}
          value={affirmationOne}
          onChange={(event) => setAffirmationOne(event.target.value)}
          placeholder="例如：我今天虽然焦虑，但还是开始做作业了"
        />
      </label>
      <label>
        第 2 条
        <textarea
          className="micro-training-input"
          rows={3}
          value={affirmationTwo}
          onChange={(event) => setAffirmationTwo(event.target.value)}
          placeholder="例如：我主动和组员沟通了任务安排"
        />
      </label>
      <button
        type="button"
        className="micro-training-btn primary"
        onClick={() => {
          saveLocalRecord('self_affirmation', { affirmationOne, affirmationTwo });
          setAffirmationOne('');
          setAffirmationTwo('');
        }}
      >
        完成自我肯定
      </button>
    </div>
  );

  const renderSleepTraining = () => (
    <div>
      <p>请跟随文字一步一步完成，不需要追求标准。</p>
      <div className="micro-training-step-box">
        <p className="micro-training-step-meta">
          第 {sleepStep + 1} 步 / 共 {sleepSteps.length} 步
        </p>
        <h3>{sleepSteps[sleepStep]}</h3>
      </div>
      {sleepStep < sleepSteps.length - 1 ? (
        <button
          type="button"
          className="micro-training-btn primary"
          onClick={() => setSleepStep((prev) => prev + 1)}
        >
          下一步
        </button>
      ) : (
        <button
          type="button"
          className="micro-training-btn primary"
          onClick={() => {
            saveLocalRecord('sleep_relaxation', { completed: true, totalSteps: sleepSteps.length });
            setSleepStep(0);
          }}
        >
          完成睡前放松
        </button>
      )}
    </div>
  );

  const renderTrainingBody = () => {
    if (active === 'emotion') return renderEmotionTraining();
    if (active === 'stress') return renderStressTraining();
    if (active === 'cbt') return renderCbtTraining();
    if (active === 'affirmation') return renderAffirmationTraining();
    if (active === 'sleep') return renderSleepTraining();
    return null;
  };

  return (
    <>
      <section className="micro-training-panel">
        <div>
          <p className="micro-training-kicker">今日轻量练习</p>
          <h2 className="micro-training-title">3～8 分钟短期心理训练</h2>
          <p className="micro-training-desc">
            适合课间、睡前、学习间隙完成。记录暂存浏览器本地，后续可对接服务端归档。
          </p>
        </div>
        <div className="micro-training-grid">
          {trainingCards.map((card) => (
            <button
              key={card.key}
              type="button"
              className="micro-training-card"
              onClick={() => setActive(card.key)}
            >
              <div className="micro-training-card-title">{card.title}</div>
              <div className="micro-training-card-time">{card.time}</div>
              <div className="micro-training-card-desc">{card.description}</div>
            </button>
          ))}
        </div>
      </section>

      {active && (
        <div className="micro-training-overlay" onClick={() => setActive(null)} role="presentation">
          <div
            className="micro-training-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="micro-training-modal-title"
          >
            <div className="micro-training-modal-head">
              <h2 id="micro-training-modal-title">{activeTitle}</h2>
              <button type="button" className="micro-training-btn secondary" onClick={() => setActive(null)}>
                关闭
              </button>
            </div>
            {renderTrainingBody()}
          </div>
        </div>
      )}
    </>
  );
};

export default MicroTrainingPanel;
