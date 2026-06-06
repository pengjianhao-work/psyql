import React from 'react';

interface PrivacyEthicsModalProps {
  open: boolean;
  title?: string;
  onAccept: () => void;
}

export const PrivacyEthicsModal: React.FC<PrivacyEthicsModalProps> = ({
  open,
  title = '心理服务伦理与隐私声明',
  onAccept
}) => {
  if (!open) return null;

  return (
    <div className="login-overlay ethics-overlay">
      <div className="login-card ethics-card">
        <h2>{title}</h2>
        <div className="ethics-body">
          <p><strong>服务性质：</strong>心理港湾提供 AI 辅助心理支持与信息参考，不能替代专业医疗诊断、心理咨询或危机干预。</p>
          <p><strong>隐私保护：</strong>您的对话与心理分析数据将绑定账号存储；学校端仅可查看经脱敏处理的风险摘要，无法查看完整对话原文。</p>
          <p><strong>危机提示：</strong>若您有自伤、自杀或伤害他人的想法，请立即联系身边可信任的人，或拨打心理危机热线 400-161-9995 / 120。</p>
          <p><strong>知情同意：</strong>继续使用即表示您已阅读并理解上述说明，自愿使用本服务。</p>
        </div>
        <button type="button" className="login-submit" onClick={onAccept}>我已阅读并同意</button>
      </div>
    </div>
  );
};

export const ethicsStorageKey = (namespace: string): string => `psyqa_ethics_v1_${namespace}`;
export const reportEthicsSessionKey = 'psyqa_report_ethics_session';
