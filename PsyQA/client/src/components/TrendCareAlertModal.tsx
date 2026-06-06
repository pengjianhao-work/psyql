import React from 'react';

interface TrendCareAlertModalProps {
  open: boolean;
  reason: string;
  onClose: () => void;
  onContactCounselor?: () => void;
}

export const TrendCareAlertModal: React.FC<TrendCareAlertModalProps> = ({
  open,
  reason,
  onClose,
  onContactCounselor
}) => {
  if (!open) return null;

  return (
    <div className="trend-care-overlay" role="dialog" aria-modal="true" aria-labelledby="trend-care-title">
      <div className="trend-care-modal">
        <h3 id="trend-care-title">💚 我们注意到你最近状态有些波动</h3>
        <p>{reason}</p>
        <ul className="trend-care-actions-list">
          <li>与信任的朋友或家人聊聊</li>
          <li>预约学校心理咨询中心</li>
          <li>全国心理援助热线：400-161-9995</li>
        </ul>
        <div className="trend-care-buttons">
          {onContactCounselor && (
            <button type="button" className="action-btn primary" onClick={onContactCounselor}>
              了解辅导员支持
            </button>
          )}
          <button type="button" className="action-btn" onClick={onClose}>
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
};
