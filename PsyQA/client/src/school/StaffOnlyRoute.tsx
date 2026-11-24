import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSchoolSession } from './useSchoolSession';

/**
 * 教师角色仅可访问聚合视图（看板 / 情绪气象 / 热力图）。
 * 教师直接访问学生列表、告警、台账等路由时重定向回看板。
 */
export const StaffOnlyRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { sessionUser } = useSchoolSession();
  if (sessionUser.role === 'teacher') {
    return <Navigate to="/school/dashboard" replace />;
  }
  return children;
};
