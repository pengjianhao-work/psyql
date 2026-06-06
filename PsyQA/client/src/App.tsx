import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import { AuthUserPublic, fetchCurrentUser, getAuthToken, setAuthToken } from './api';
import './App.css';

const StudentApp = React.lazy(() => import('./student/StudentApp'));
const SchoolApp = React.lazy(() => import('./school/SchoolApp'));
const SchoolDashboard = React.lazy(() => import('./school/SchoolDashboard'));
const SchoolAlerts = React.lazy(() => import('./school/SchoolAlerts'));
const SchoolStudents = React.lazy(() => import('./school/SchoolStudents'));
const SchoolStudentDetail = React.lazy(() => import('./school/SchoolStudentDetail'));
const SchoolAdminUsers = React.lazy(() => import('./school/SchoolAdminUsers'));
const SchoolHeatmap = React.lazy(() => import('./school/SchoolHeatmap'));
const SchoolInterventionLedgers = React.lazy(() => import('./school/SchoolInterventionLedgers'));
const SchoolKnowledgeAdmin = React.lazy(() => import('./school/SchoolKnowledgeAdmin'));

export const GUEST_MODE_KEY = 'psyqa_guest_mode';

function RouteFallback({ label }: { label: string }) {
  return (
    <div className="login-overlay">
      <div className="login-spinner-card">
        <p>{label}</p>
      </div>
    </div>
  );
}

function RootRedirect() {
  const token = getAuthToken();
  const guest = sessionStorage.getItem(GUEST_MODE_KEY) === '1';
  if (guest) return <Navigate to="/student" replace />;
  if (token) return <Navigate to="/login" replace />;
  return <Navigate to="/login" replace />;
}

function StudentRoute() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<AuthUserPublic | null>(null);
  const [guestMode, setGuestMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const guest = sessionStorage.getItem(GUEST_MODE_KEY) === '1';
      const token = getAuthToken();
      if (guest && !token) {
        if (!cancelled) {
          setGuestMode(true);
          setSessionUser(null);
          setReady(true);
        }
        return;
      }
      if (!token) {
        navigate('/login', { replace: true });
        return;
      }
      try {
        const { user } = await fetchCurrentUser();
        if (user.role === 'counselor' || user.role === 'admin') {
          navigate('/school/dashboard', { replace: true });
          return;
        }
        if (!cancelled) {
          sessionStorage.removeItem(GUEST_MODE_KEY);
          setGuestMode(false);
          setSessionUser(user);
          setReady(true);
        }
      } catch {
        setAuthToken(null);
        navigate('/login', { replace: true });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const onLogout = useCallback(() => {
    setAuthToken(null);
    sessionStorage.removeItem(GUEST_MODE_KEY);
    navigate('/login', { replace: true });
  }, [navigate]);

  if (!ready) {
    return <RouteFallback label="正在进入学生端…" />;
  }

  return (
    <Suspense fallback={<RouteFallback label="正在加载学生端…" />}>
      <StudentApp
        sessionUser={sessionUser}
        guestMode={guestMode}
        onLogout={onLogout}
        onSessionUserUpdate={setSessionUser}
      />
    </Suspense>
  );
}

function SchoolRoute() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<AuthUserPublic | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const token = getAuthToken();
      if (!token) {
        navigate('/login', { replace: true });
        return;
      }
      try {
        const { user } = await fetchCurrentUser();
        if (user.role !== 'counselor' && user.role !== 'admin') {
          navigate('/student', { replace: true });
          return;
        }
        if (!cancelled) {
          sessionStorage.removeItem(GUEST_MODE_KEY);
          setSessionUser(user);
          setReady(true);
        }
      } catch {
        setAuthToken(null);
        navigate('/login', { replace: true });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const onLogout = useCallback(() => {
    setAuthToken(null);
    sessionStorage.removeItem(GUEST_MODE_KEY);
    navigate('/login', { replace: true });
  }, [navigate]);

  if (!ready || !sessionUser) {
    return <RouteFallback label="正在进入学校端…" />;
  }

  return (
    <Suspense fallback={<RouteFallback label="正在加载学校端…" />}>
      <SchoolApp sessionUser={sessionUser} onLogout={onLogout} />
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback label="加载中…" />}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/student/*" element={<StudentRoute />} />
          <Route path="/school" element={<SchoolRoute />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route
              path="dashboard"
              element={
                <Suspense fallback={<RouteFallback label="加载看板…" />}>
                  <SchoolDashboard />
                </Suspense>
              }
            />
            <Route
              path="alerts"
              element={
                <Suspense fallback={<RouteFallback label="加载告警…" />}>
                  <SchoolAlerts />
                </Suspense>
              }
            />
            <Route
              path="students"
              element={
                <Suspense fallback={<RouteFallback label="加载学生列表…" />}>
                  <SchoolStudents />
                </Suspense>
              }
            />
            <Route
              path="students/:studentId"
              element={
                <Suspense fallback={<RouteFallback label="加载档案…" />}>
                  <SchoolStudentDetail />
                </Suspense>
              }
            />
            <Route
              path="heatmap"
              element={
                <Suspense fallback={<RouteFallback label="加载热力图…" />}>
                  <SchoolHeatmap />
                </Suspense>
              }
            />
            <Route
              path="intervention-ledgers"
              element={
                <Suspense fallback={<RouteFallback label="加载台账…" />}>
                  <SchoolInterventionLedgers />
                </Suspense>
              }
            />
            <Route
              path="admin/knowledge"
              element={
                <Suspense fallback={<RouteFallback label="加载知识库…" />}>
                  <SchoolKnowledgeAdmin />
                </Suspense>
              }
            />
            <Route
              path="admin/users"
              element={
                <Suspense fallback={<RouteFallback label="加载用户管理…" />}>
                  <SchoolAdminUsers />
                </Suspense>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
