import React from 'react';

interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
  count: number;
}

interface SidebarProps {
  categories: CategoryInfo[];
  activeCategory: string | null;
  onCategorySelect: (category: string | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  categories,
  activeCategory,
  onCategorySelect
}) => {
  return (
    <div className="sidebar">
      <h3>🏷️ 问题分类</h3>
      <ul className="category-list">
        <li
          className={`category-item ${activeCategory === null ? 'active' : ''}`}
          onClick={() => onCategorySelect(null)}
        >
          📋 全部问题
        </li>
        {categories.map((category) => (
          <li
            key={category.id}
            className={`category-item ${activeCategory === category.id ? 'active' : ''}`}
            onClick={() => onCategorySelect(category.id)}
          >
            <span className="category-icon">{category.icon}</span>
            <span className="category-name">{category.name.replace(/[📚👥🏠💑🚀🌟🧘👗🎮🕊️]/g, '')}</span>
            <span className="category-count">{category.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};