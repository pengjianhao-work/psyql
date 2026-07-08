import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginPanel } from '../components/LoginPanel';
import { AuthUserPublic, fetchCurrentUser, setAuthToken } from '../api';
import { GUEST_MODE_KEY } from '../App';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const { user } = await fetchCurrentUser();
        if (!cancelled) {
          if (user.role === 'counselor' || user.role === 'admin') {
            navigate('/school', { replace: true });
          } else {
            navigate('/student', { replace: true });
          }
        }
      } catch {
        setAuthToken(null);
        if (!cancelled) setChecking(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const redirectByRole = (user: AuthUserPublic) => {
    sessionStorage.removeItem(GUEST_MODE_KEY);
    if (user.role === 'counselor' || user.role === 'admin') {
      navigate('/school', { replace: true });
    } else {
      navigate('/student', { replace: true });
    }
  };

  const onGuest = () => {
    setAuthToken(null);
    sessionStorage.setItem(GUEST_MODE_KEY, '1');
    navigate('/student', { replace: true });
  };

  if (checking) {
    return (
      <div className="login-overlay">
        <div className="login-spinner-card">
          <p>正在校验登录状态…</p>
        </div>
      </div>
    );
  }

  return (
    <LoginPanel
      onLoggedIn={redirectByRole}
      onGuest={onGuest}
    />
  );
};

export default LoginPage;
