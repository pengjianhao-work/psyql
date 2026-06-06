import React, { useState, useEffect } from 'react';
import { profilesStorageKey } from '../userStorage';

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
}

interface UserSelectorProps {
  storageNamespace: string;
  /** 当该命名空间下尚无存档时使用的初始列表（请用父组件 useMemo 保持稳定引用） */
  fallbackDefaults: UserProfile[];
  currentUserId: string;
  onUserChange: (userId: string) => void;
  onNewUser: (user: UserProfile) => void;
  onRosterChange?: (list: UserProfile[]) => void;
}

export const UserSelector: React.FC<UserSelectorProps> = ({
  storageNamespace,
  fallbackDefaults,
  currentUserId,
  onUserChange,
  onNewUser,
  onRosterChange
}) => {
  const STORAGE_KEY = profilesStorageKey(storageNamespace);
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [users, setUsers] = useState<UserProfile[]>(fallbackDefaults);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as UserProfile[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setUsers(parsed);
          return;
        }
      }
      setUsers(fallbackDefaults);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackDefaults));
    } catch {
      setUsers(fallbackDefaults);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackDefaults));
    }
  }, [STORAGE_KEY]);

  const persistUsers = (nextUsers: UserProfile[]) => {
    setUsers(nextUsers);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUsers));
    onRosterChange?.(nextUsers);
  };

  const handleAddUser = () => {
    const cleanName = newUserName.trim();
    if (cleanName) {
      const base = cleanName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
      const newUserId = `user_${base || 'new'}_${Date.now()}`;
      const newUser: UserProfile = {
        id: newUserId,
        name: cleanName,
        avatar: '🙂'
      };
      const nextUsers = [...users, newUser];
      persistUsers(nextUsers);
      onNewUser(newUser);
      setNewUserName('');
      setShowNewUserForm(false);
    }
  };

  if (users.length === 0) {
    return (
      <div className="user-selector">
        <div className="user-selector-title">👤 用户选择</div>
        <p className="muted" style={{ padding: '8px', fontSize: 12 }}>暂无用户条目</p>
      </div>
    );
  }

  return (
    <div className="user-selector">
      <div className="user-selector-title">👤 用户选择（本机）</div>
      <div className="user-list">
        {users.map((user) => (
          <div
            key={user.id}
            className={`user-item ${currentUserId === user.id ? 'active' : ''}`}
            onClick={() => onUserChange(user.id)}
          >
            <span className="user-avatar">{user.avatar}</span>
            <span className="user-name">{user.name}</span>
          </div>
        ))}
      </div>

      {!showNewUserForm ? (
        <button type="button" className="add-user-btn" onClick={() => setShowNewUserForm(true)}>
          + 添加咨询身份
        </button>
      ) : (
        <div className="new-user-form">
          <input
            type="text"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            placeholder="输入称呼（如别名 / 来访者角色）"
            className="new-user-input"
            autoFocus
          />
          <div className="new-user-actions">
            <button type="button" className="submit-btn" onClick={handleAddUser}>确定</button>
            <button type="button" className="cancel-btn" onClick={() => setShowNewUserForm(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
};
