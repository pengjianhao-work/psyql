import React from 'react';
import { SensitiveCheckResult } from '../utils/sensitiveInputCheck';

const HOTLINE = '400-161-9995';

interface CrisisInputGuideProps {
  check: SensitiveCheckResult;
  onDismiss?: () => void;
}

export const CrisisInputGuide: React.FC<CrisisInputGuideProps> = ({ check, onDismiss }) => {
  if (check.level !== 'critical' && check.level !== 'high') return null;

  const isCritical = check.level === 'critical';

  return (
    <div className={`crisis-input-guide level-${check.level}`} role="alert">
      <div className="crisis-input-guide-icon" aria-hidden="true">
        {isCritical ? '🆘' : '⚠️'}
      </div>
      <div className="crisis-input-guide-body">
        <strong>{isCritical ? '检测到可能的危机表述' : '你似乎正经历很痛苦的时刻'}</strong>
        <p>{check.message}</p>
        <ul className="crisis-input-guide-steps">
          <li>立即联系信任的人或校内心理中心</li>
          <li>
            全国心理援助热线{' '}
            <a href={`tel:${HOTLINE.replace(/-/g, '')}`}>{HOTLINE}</a>
          </li>
          <li>如有自伤冲动，请拨打 120 / 110</li>
        </ul>
        {check.keywords.length > 0 && (
          <p className="crisis-input-guide-kw muted">匹配词：{check.keywords.join('、')}</p>
        )}
      </div>
      {onDismiss && (
        <button type="button" className="crisis-input-guide-dismiss" onClick={onDismiss} aria-label="收起">
          ×
        </button>
      )}
    </div>
  );
};
