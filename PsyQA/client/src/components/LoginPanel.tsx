import React, { useState, useEffect, useCallback } from 'react';
import {
  AuthUserPublic,
  loginRequest,
  registerRequest,
  getErrorMessage,
  fetchRuntimeHealth
} from '../api';

type Mode = 'login' | 'register';

interface LoginPanelProps {
  onLoggedIn: (user: AuthUserPublic) => void;
  onGuest: () => void;
}

export const LoginPanel: React.FC<LoginPanelProps> = ({ onLoggedIn, onGuest }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [checkingBackend, setCheckingBackend] = useState(false);

  const checkBackend = useCallback(async (): Promise<boolean> => {
    setCheckingBackend(true);
    try {
      const health = await fetchRuntimeHealth();
      const ok = health.status === 'ok';
      setBackendOk(ok);
      return ok;
    } catch {
      setBackendOk(false);
      return false;
    } finally {
      setCheckingBackend(false);
    }
  }, []);

  useEffect(() => {
    void checkBackend();
    const timer = window.setInterval(() => {
      void checkBackend();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [checkBackend]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const online = backendOk === true ? true : await checkBackend();
      if (!online) {
        setError('后端尚未就绪。请双击「一键启动.bat」或在该项目目录运行 npm run dev，等待窗口出现 Server started 后再试。');
        return;
      }
      if (mode === 'login') {
        const data = await loginRequest(username.trim(), password);
        onLoggedIn(data.user);
      } else {
        const data = await registerRequest(username.trim(), password, displayName.trim() || undefined);
        onLoggedIn(data.user);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card">
        <h2 className="login-title">心理港湾 · 登录</h2>
        <p className="login-desc">登录后咨询记录与「用户选择」将绑定到账号；也可使用本地游客模式体验。</p>

        <div
          className={`login-backend-status${backendOk === false ? ' offline' : backendOk ? ' online' : ''}`}
          role="status"
        >
          {checkingBackend && backendOk === null && '正在检测后端连接…'}
          {!checkingBackend && backendOk === true && '● 后端已连接，可以登录'}
          {!checkingBackend && backendOk === false && (
            <>
              ● 后端未连接（端口 3001）
              <button type="button" className="login-retry-btn" onClick={() => void checkBackend()}>
                重新检测
              </button>
            </>
          )}
        </div>

        <div className="login-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError(null); }}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => { setMode('register'); setError(null); }}
          >
            注册新账号
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>用户名（3～24 位，字母/数字/下划线/中文）</span>
            <input
              type="text"
              value={username}
              autoComplete={mode === 'login' ? 'username' : 'new-username'}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={mode === 'login' ? '例如 demo' : '起一个用户名'}
            />
          </label>
          {mode === 'register' && (
            <label>
              <span>显示昵称（可选）</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="在界面顶部显示的名字"
              />
            </label>
          )}
          <label>
            <span>{mode === 'login' ? '密码' : '密码（不少于 6 位）'}</span>
            <input
              type="password"
              value={password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'login' ? '密码' : '设置密码'}
            />
          </label>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-submit" disabled={submitting || backendOk === false}>
            {submitting ? '请稍候…' : backendOk === false ? '等待后端连接…' : mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>

        <p className="login-hint">首次使用可试用：<code>demo</code> / <code>demo123</code></p>

        <button type="button" className="login-guest" onClick={onGuest}>
          暂不登录，游客体验（数据仅存本机浏览器）
        </button>
      </div>
    </div>
  );
};
