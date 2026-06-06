import React from 'react';
import { DEFAULT_SCHOOL_NAME, resolveSchoolDisplayName } from '../constants/branding';

interface BrandSchoolChipProps {
  schoolName?: string;
  className?: string;
}

/** 三端统一的学校名称标识（绿顶栏胶囊样式） */
export const BrandSchoolChip: React.FC<BrandSchoolChipProps> = ({ schoolName, className = '' }) => {
  const label = resolveSchoolDisplayName(schoolName);
  return (
    <span className={`brand-school-chip ${className}`.trim()} title={label}>
      {label}
    </span>
  );
};

export { DEFAULT_SCHOOL_NAME };
