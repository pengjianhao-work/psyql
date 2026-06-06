import React, { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  AuthUserPublic,
  fetchSchoolDashboard,
  fetchSchoolNotifications,
  markSchoolNotificationsRead,
  SchoolNotificationItem
} from '../api';
import { SchoolSessionProvider } from './useSchoolSession';
import './school.css';

interface SchoolAppProps {
  sessionUser: AuthUserPublic;
  onLogout: () => void;
}

const SchoolApp: React.FC<SchoolAppProps> = ({ sessionUser, onLogout }) => {
  const roleLabel = sessionUser.role === 'admin' ? '管理员' : '辅导员';
  const isAdmin = sessionUser.role === 'admin';
  const [pendingAlerts, setPendingAlerts] = useState(0);
  const [tier1Notices, setTier1Notices] = useState<SchoolNotificationItem[]>([]);

  const loadNotices = useCallback(() => {
    void fetchSchoolNotifications()
      .then((d) => setTier1Notices(d.notifications.filter((n) => n.type === 'tier1_alert')))
      .catch(() => setTier1Notices([]));
  }, []);

  useEffect(() => {
    fetchSchoolDashboard()
      .then((d) => setPendingAlerts(d.pendingAlerts ?? 0))
      .catch(() => setPendingAlerts(0));
    loadNotices();
    const id = window.setInterval(loadNotices, 30_000);
    return () => window.clearInterval(id);
  }, [loadNotices]);

  const dismissNotice = (notice: SchoolNotificationItem) => {
    void markSchoolNotificationsRead([notice.id]).then(() => {
      setTier1Notices((prev) => prev.filter((n) => n.id !== notice.id));
    });
  };

  return (
    <SchoolSessionProvider value={{ sessionUser }}>
      <div className="school-app">
        {tier1Notices.length > 0 && (
          <div className="school-tier1-push-banner" role="alert">
            <strong>一级高危告警 · 请立即处理</strong>
            <p>
              学生 {tier1Notices[0].studentMask}：{tier1Notices[0].summary}
            </p>
            <div className="school-tier1-push-actions">
              <Link to="/school/alerts?tier=1" className="save-care-btn small">
                前往告警台
              </Link>
              <button
                type="button"
                className="school-btn-secondary small"
                onClick={() => dismissNotice(tier1Notices[0])}
              >
                知道了
              </button>
            </div>
          </div>
        )}
        <header className="school-header">

          <div className="school-brand">

            <span aria-hidden="true">🏫</span>

            <div>

              <h1>心理港湾 · 学校端</h1>

              <p>院系心理态势看板 · 学生档案与对话管理</p>

            </div>

          </div>

          <div className="school-header-actions">

            <span className="school-user-badge">

              {sessionUser.avatar} {sessionUser.displayName} · {roleLabel}

            </span>

            <button type="button" className="account-switch-btn" onClick={onLogout}>

              退出登录

            </button>

          </div>

        </header>



        <div className="school-body">

          <nav className="school-nav">

            <NavLink to="/school/dashboard" end className={({ isActive }) => (isActive ? 'active' : '')}>

              数据看板

            </NavLink>

            <NavLink to="/school/alerts" className={({ isActive }) => (isActive ? 'active' : '')}>

              风险告警

              {pendingAlerts > 0 && <span className="school-nav-badge">{pendingAlerts}</span>}

            </NavLink>

            <NavLink to="/school/students" className={({ isActive }) => (isActive ? 'active' : '')}>

              学生列表

            </NavLink>

            <NavLink to="/school/heatmap" className={({ isActive }) => (isActive ? 'active' : '')}>

              预警热力图

            </NavLink>

            <NavLink to="/school/intervention-ledgers" className={({ isActive }) => (isActive ? 'active' : '')}>

              干预台账

            </NavLink>

            {isAdmin && (

              <>

                <NavLink to="/school/admin/knowledge" className={({ isActive }) => (isActive ? 'active' : '')}>

                  知识库后台

                </NavLink>

                <NavLink to="/school/admin/users" className={({ isActive }) => (isActive ? 'active' : '')}>

                  用户管理

                </NavLink>

                <span className="school-nav-admin-badge">管理员</span>

              </>

            )}

          </nav>



          <main className="school-main">

            <Outlet />

          </main>

        </div>

      </div>

    </SchoolSessionProvider>

  );

};



export default SchoolApp;

