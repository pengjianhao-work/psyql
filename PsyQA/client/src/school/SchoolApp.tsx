import React, { useEffect, useState } from 'react';

import { NavLink, Outlet } from 'react-router-dom';

import { AuthUserPublic, fetchSchoolDashboard } from '../api';

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



  useEffect(() => {

    fetchSchoolDashboard()

      .then((d) => setPendingAlerts(d.pendingAlerts ?? 0))

      .catch(() => setPendingAlerts(0));

  }, []);



  return (

    <SchoolSessionProvider value={{ sessionUser }}>

      <div className="school-app">

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

            {isAdmin && (

              <>

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

