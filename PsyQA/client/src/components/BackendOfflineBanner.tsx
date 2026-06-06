import React from 'react';

interface BackendOfflineBannerProps {
  onRetry: () => void;
}

export const BackendOfflineBanner: React.FC<BackendOfflineBannerProps> = ({ onRetry }) => (
  <div className="backend-offline-banner" role="alert">
    <span>
      后端未连接（端口 3001）。请双击桌面「心理港湾」或运行 <code>npm run dev</code> 后点击重新检测。
    </span>
    <button type="button" className="login-retry-btn" onClick={onRetry}>
      重新检测
    </button>
  </div>
);
