import React from 'react';

interface GuestModeBannerProps {
  onLogin: () => void;
}

export const GuestModeBanner: React.FC<GuestModeBannerProps> = ({ onLogin }) => (
  <div className="student-guest-banner" role="note">
    <div>
      <strong>游客体验模式</strong>
      <p>对话仅保存在本机浏览器，换设备或清空缓存后会丢失。登录学生账号可云端同步咨询记录、趋势与报告。</p>
    </div>
    <button type="button" className="student-guest-login-btn" onClick={onLogin}>
      登录 / 注册
    </button>
  </div>
);
