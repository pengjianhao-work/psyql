import React from 'react';
import type { UserProfilePayload } from '../api';

interface UserProfileCardProps {
  profile: UserProfilePayload | null;
  loading?: boolean;
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({ profile, loading }) => {
  if (loading) {
    return (
      <div className="user-profile-card">
        <h4>我的基础画像</h4>
        <p className="user-profile-loading">加载中…</p>
      </div>
    );
  }

  if (!profile || profile.sessionCount === 0) {
    return (
      <div className="user-profile-card">
        <h4>我的基础画像</h4>
        <p className="user-profile-empty">完成咨询后将自动生成跨会话的基础画像。</p>
      </div>
    );
  }

  return (
    <div className="user-profile-card">
      <h4>我的基础画像</h4>
      <p className="user-profile-summary">{profile.summary}</p>

      <div className="user-profile-stats">
        <span>咨询 {profile.sessionCount} 次</span>
        {profile.feedbackCount > 0 && <span>反馈 {profile.feedbackCount} 次</span>}
        {profile.avgRating !== null && <span>均分 {profile.avgRating}/5</span>}
      </div>

      {profile.topConcerns.length > 0 && (
        <div className="user-profile-section">
          <strong>主要困扰</strong>
          <ul>
            {profile.topConcerns.slice(0, 3).map((c) => (
              <li key={c.category}>
                {c.label} <span className="user-profile-count">×{c.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(profile.dominantEmotionLabel || profile.avgStressLevel !== null) && (
        <div className="user-profile-section">
          <strong>近期状态</strong>
          <p>
            {profile.dominantEmotionLabel && `常见情绪：${profile.dominantEmotionLabel}`}
            {profile.dominantEmotionLabel && profile.avgStressLevel !== null && ' · '}
            {profile.avgStressLevel !== null && `平均压力 ${profile.avgStressLevel}/100`}
          </p>
        </div>
      )}

      {profile.recentThemes.length > 0 && (
        <div className="user-profile-tags">
          {profile.recentThemes.map((t) => (
            <span key={t} className="user-profile-tag">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
