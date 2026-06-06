/** 全校统一展示名称（与 server/data/organizations.json 一致） */
export const DEFAULT_SCHOOL_NAME = '心理港湾示范大学';

export const PRODUCT_NAME = '心理港湾';

export function resolveSchoolDisplayName(schoolName?: string): string {
  return schoolName?.trim() || DEFAULT_SCHOOL_NAME;
}
