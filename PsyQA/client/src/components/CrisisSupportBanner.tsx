import React from 'react';

interface CrisisSupportBannerProps {
  level: 'high' | 'critical';
  hotline?: string;
}

export const CrisisSupportBanner: React.FC<CrisisSupportBannerProps> = ({
  level,
  hotline = '400-161-9995'
}) => (
  <div className={`crisis-support-banner level-${level}`} role="alert">
    <div className="crisis-support-icon" aria-hidden="true">
      {level === 'critical' ? '🆘' : '⚠️'}
    </div>
    <div>
      <strong>{level === 'critical' ? '请优先保障自身安全' : '建议尽快寻求支持'}</strong>
      <p>
        你并不孤单。可立即联系信任的人，或拨打全国心理援助热线 <a href={`tel:${hotline.replace(/-/g, '')}`}>{hotline}</a>
        ；如有自伤冲动请拨打 120 / 110。
      </p>
    </div>
  </div>
);
