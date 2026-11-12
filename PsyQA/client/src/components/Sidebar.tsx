import React from 'react';
import { CategoryGlyph, stripCategoryEmoji } from './CategoryGlyph';

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
      <h3 className="sidebar-heading">
        <CategoryGlyph id="all" />
        <span>问题分类</span>
      </h3>
      <ul className="category-list">
        <li
          className={`category-item ${activeCategory === null ? 'active' : ''}`}
          onClick={() => onCategorySelect(null)}
        >
          <span className="category-icon">
            <CategoryGlyph id="all" />
          </span>
          <span className="category-name">全部问题</span>
        </li>
        {categories.map((category) => (
          <li
            key={category.id}
            className={`category-item ${activeCategory === category.id ? 'active' : ''}`}
            onClick={() => onCategorySelect(category.id)}
          >
            <span className="category-icon">
              <CategoryGlyph id={category.id} />
            </span>
            <span className="category-name">{stripCategoryEmoji(category.name)}</span>
            <span className="category-count">{category.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
