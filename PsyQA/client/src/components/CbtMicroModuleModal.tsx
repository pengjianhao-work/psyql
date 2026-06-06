import React, { useState } from 'react';
import { CbtMicroModule, submitCbtComplete } from '../api';

interface Props {
  module: CbtMicroModule;
  problem?: string;
  emotion?: string;
  onClose: () => void;
  onComplete?: (score: number) => void;
}

export const CbtMicroModuleModal: React.FC<Props> = ({
  module,
  problem,
  emotion,
  onClose,
  onComplete
}) => {
  const [stepIdx, setStepIdx] = useState(0);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [resultMsg, setResultMsg] = useState('');

  const step = module.steps[stepIdx];

  const pick = (choiceId: string, fb: string) => {
    setSelections((prev) => ({ ...prev, [stepIdx]: choiceId }));
    setFeedback(fb);
  };

  const next = () => {
    if (stepIdx + 1 >= module.steps.length) {
      void submitCbtComplete({ problem, emotion, selections }).then((r) => {
        setDone(true);
        setResultMsg(r.message);
        onComplete?.(r.score);
      });
      return;
    }
    setStepIdx((i) => i + 1);
    setFeedback(null);
  };

  return (
    <div className="cbt-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="cbt-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{module.title}</h3>
          <span className="cbt-badge">CBT 交互练习</span>
          <button type="button" className="cbt-close" onClick={onClose}>
            ×
          </button>
        </header>
        {!done ? (
          <>
            <p className="cbt-scenario">{step.scenario}</p>
            <p className="cbt-thought">自动思维：{step.thought}</p>
            <div className="cbt-choices">
              {step.choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`cbt-choice${selections[stepIdx] === c.id ? ' picked' : ''}`}
                  onClick={() => pick(c.id, c.feedback)}
                >
                  {c.text}
                </button>
              ))}
            </div>
            {feedback && <p className="cbt-feedback">{feedback}</p>}
            <button
              type="button"
              className="save-care-btn"
              disabled={!selections[stepIdx]}
              onClick={next}
            >
              {stepIdx + 1 >= module.steps.length ? '完成练习' : '下一步'}
            </button>
          </>
        ) : (
          <div className="cbt-done">
            <p>{resultMsg}</p>
            <button type="button" className="save-care-btn" onClick={onClose}>
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
