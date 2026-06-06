import { readJsonFileSync, writeJsonFileSync } from '../../utils/jsonFileStore';
import { EmotionType, getCategoryName, ProblemCategory } from '../psych/emotionService';
import { resolveDataFile } from '../../config/paths';

export interface OrgStatsSlice {
  totalConsultations: number;
  activeStudentIds: string[];
  highRiskDialogCount: number;
  highRiskStudentIds: string[];
  problemCounts: Record<string, number>;
  emotionCounts: Record<string, number>;
  stressSum: number;
  stressN: number;
  updatedAt: string;
}

interface CacheFile {
  byOrg: Record<string, OrgStatsSlice>;
  global: OrgStatsSlice;
}

const CACHE_PATH = resolveDataFile('school_stats_cache.json');

const emptySlice = (): OrgStatsSlice => ({
  totalConsultations: 0,
  activeStudentIds: [],
  highRiskDialogCount: 0,
  highRiskStudentIds: [],
  problemCounts: {},
  emotionCounts: {},
  stressSum: 0,
  stressN: 0,
  updatedAt: new Date().toISOString()
});

function loadCache(): CacheFile {
  return readJsonFileSync<CacheFile>(CACHE_PATH, { byOrg: {}, global: emptySlice() });
}

function saveCache(data: CacheFile): void {
  writeJsonFileSync(CACHE_PATH, data);
}

function ensureStudent(slice: OrgStatsSlice, studentId: string): void {
  if (!slice.activeStudentIds.includes(studentId)) {
    slice.activeStudentIds.push(studentId);
  }
}

export function recordConsultationForSchool(params: {
  orgId: string;
  studentId: string;
  psych?: {
    emotion: EmotionType;
    risk: string;
    problem: ProblemCategory;
    stressLevel: number;
  };
}): void {
  const cache = loadCache();
  const orgKey = params.orgId || 'default';
  if (!cache.byOrg[orgKey]) cache.byOrg[orgKey] = emptySlice();
  const slices = [cache.global, cache.byOrg[orgKey]];

  for (const slice of slices) {
    slice.totalConsultations += 1;
    ensureStudent(slice, params.studentId);
    if (params.psych) {
      const prob = getCategoryName(params.psych.problem);
      slice.problemCounts[prob] = (slice.problemCounts[prob] || 0) + 1;
      slice.emotionCounts[params.psych.emotion] = (slice.emotionCounts[params.psych.emotion] || 0) + 1;
      slice.stressSum += params.psych.stressLevel;
      slice.stressN += 1;
      if (params.psych.risk === 'high' || params.psych.risk === 'critical') {
        slice.highRiskDialogCount += 1;
        if (!slice.highRiskStudentIds.includes(params.studentId)) {
          slice.highRiskStudentIds.push(params.studentId);
        }
      }
    }
    slice.updatedAt = new Date().toISOString();
  }
  saveCache(cache);
}

export function getOrgStatsSlice(orgIds: string[] | undefined): OrgStatsSlice {
  const cache = loadCache();
  if (!orgIds?.length) return cache.global;

  const merged = emptySlice();
  for (const id of orgIds) {
    const slice = cache.byOrg[id] || cache.byOrg.default;
    if (!slice) continue;
    merged.totalConsultations += slice.totalConsultations;
    merged.highRiskDialogCount += slice.highRiskDialogCount;
    merged.stressSum += slice.stressSum;
    merged.stressN += slice.stressN;
    for (const sid of slice.activeStudentIds) {
      if (!merged.activeStudentIds.includes(sid)) merged.activeStudentIds.push(sid);
    }
    for (const sid of slice.highRiskStudentIds) {
      if (!merged.highRiskStudentIds.includes(sid)) merged.highRiskStudentIds.push(sid);
    }
    for (const [k, v] of Object.entries(slice.problemCounts)) {
      merged.problemCounts[k] = (merged.problemCounts[k] || 0) + v;
    }
    for (const [k, v] of Object.entries(slice.emotionCounts)) {
      merged.emotionCounts[k] = (merged.emotionCounts[k] || 0) + v;
    }
  }
  return merged;
}

export function invalidateSchoolStatsCache(): void {
  saveCache({ byOrg: {}, global: emptySlice() });
}
