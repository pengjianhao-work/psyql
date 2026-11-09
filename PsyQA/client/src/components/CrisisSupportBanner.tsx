import React from 'react';

interface CrisisSupportBannerProps {
  level: 'high' | 'critical';
  hotline?: string;
}

export const CrisisSupportBanner: React.FC<CrisisSupportBannerProps> = ({
  level,
  hotline = '全国心理援助热线：400-161-9995'
}) => {
  const digits = hotline.replace(/\D/g, '') || '4001619995';
  const [open, setOpen] = React.useState(true);

  if (level === 'critical' && open) {
    return (
      <div className="crisis-screen" role="alertdialog" aria-labelledby="crisis-title">
        <div className="crisis-screen-card">
          <h2 id="crisis-title">你现在安全吗？</h2>
          <a className="crisis-screen-call" href={`tel:${digits}`}>
            {hotline}
          </a>
          <p>也可以联系身边信任的人。紧急情况请拨打 120。</p>
          <button type="button" className="crisis-screen-back" onClick={() => setOpen(false)}>
            先看回复
          </button>
        </div>
      </div>
    );
  }

  if (level === 'critical') return null;

  return (
    <div className="crisis-support-banner level-high" role="status">
      <div>
        <strong>听起来最近挺难的</strong>
        <p>
          学校心理中心可以预约聊聊。也可拨打{' '}
          <a href={`tel:${digits}`}>{hotline}</a>
        </p>
      </div>
    </div>
  );
};
