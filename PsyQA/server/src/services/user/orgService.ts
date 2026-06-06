import fs from 'fs';
import path from 'path';
import { resolveDataFile } from '../../config/paths';

export interface SchoolOrg {
  id: string;
  name: string;
}

export interface CollegeOrg {
  id: string;
  schoolId: string;
  name: string;
}

interface OrgFile {
  schools: SchoolOrg[];
  colleges: CollegeOrg[];
}

const dataPath = resolveDataFile('organizations.json');

const DEFAULT_ORGS: OrgFile = {
  schools: [{ id: 'psy-u', name: '心理港湾示范大学' }],
  colleges: [
    { id: 'cs-demo', schoolId: 'psy-u', name: '计算机学院' },
    { id: 'math-demo', schoolId: 'psy-u', name: '数学学院' }
  ]
};

function readOrgs(): OrgFile {
  try {
    if (!fs.existsSync(dataPath)) return DEFAULT_ORGS;
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as OrgFile;
    if (!Array.isArray(raw.schools) || !Array.isArray(raw.colleges)) return DEFAULT_ORGS;
    return raw;
  } catch {
    return DEFAULT_ORGS;
  }
}

function writeOrgs(data: OrgFile): void {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

export function ensureOrganizations(): OrgFile {
  const data = readOrgs();
  if (!fs.existsSync(dataPath)) writeOrgs(data);
  return data;
}

export function getCollegeById(collegeId: string): CollegeOrg | null {
  return ensureOrganizations().colleges.find((c) => c.id === collegeId) ?? null;
}

export function getSchoolById(schoolId: string): SchoolOrg | null {
  return ensureOrganizations().schools.find((s) => s.id === schoolId) ?? null;
}

export function resolveOrgDisplay(collegeId?: string): { schoolName: string; collegeName: string } {
  const college = collegeId ? getCollegeById(collegeId) : null;
  const school = college ? getSchoolById(college.schoolId) : null;
  return {
    schoolName: school?.name ?? '心理港湾示范大学',
    collegeName: college?.name ?? collegeId ?? '未分配院系'
  };
}

export function listCollegesForScope(managedOrgIds?: string[], role?: string): CollegeOrg[] {
  const all = ensureOrganizations().colleges;
  if (role === 'admin') return all;
  if (managedOrgIds?.length) return all.filter((c) => managedOrgIds.includes(c.id));
  return all;
}

export function listCollegeOptions(): Array<{ id: string; name: string; schoolName: string }> {
  const orgs = ensureOrganizations();
  return orgs.colleges.map((c) => {
    const school = getSchoolById(c.schoolId);
    return {
      id: c.id,
      name: c.name,
      schoolName: school?.name ?? '心理港湾示范大学'
    };
  });
}
