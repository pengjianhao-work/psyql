import {
  resolveAgentPhase,
  getRagBlendWeights
} from '../services/user/userMemoryService';
import {
  computeTimelineUserWeight,
  computeMemoryBoost
} from '../services/user/ragWeightPolicy';
import { ensureUserAgentProfile, updateUserAgentProfile } from '../db/userAgentStore';

jest.mock('../db/userAgentStore', () => {
  const actual = jest.requireActual('../db/userAgentStore');
  return {
    ...actual,
    getFirstDialogTime: jest.fn(),
    getUserAgentProfile: jest.fn(),
    countUserDialogVectors: jest.fn()
  };
});

const { getFirstDialogTime, getUserAgentProfile, countUserDialogVectors } =
  jest.requireMock('../db/userAgentStore');

describe('userMemoryService phases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    countUserDialogVectors.mockReturnValue(0);
  });

  it('returns collect when no first dialog', () => {
    getFirstDialogTime.mockReturnValue(null);
    getUserAgentProfile.mockReturnValue(null);
    expect(resolveAgentPhase('u1')).toBe('collect');
    expect(getRagBlendWeights('u1').user).toBe(0.3);
    expect(getRagBlendWeights('u1').timelineUser).toBe(0.3);
  });

  it('returns shape after 8 months with interpolated weight', () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 8);
    getFirstDialogTime.mockReturnValue(d.toISOString());
    getUserAgentProfile.mockReturnValue({ firstDialogAt: d.toISOString() });
    expect(resolveAgentPhase('u1')).toBe('shape');
    const w = getRagBlendWeights('u1');
    expect(w.timelineUser).toBeGreaterThan(0.45);
    expect(w.timelineUser).toBeLessThan(0.7);
    expect(w.user).toBe(w.timelineUser);
  });

  it('returns mature after 20 months with interpolated weight', () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 20);
    getFirstDialogTime.mockReturnValue(d.toISOString());
    getUserAgentProfile.mockReturnValue({ firstDialogAt: d.toISOString() });
    expect(resolveAgentPhase('u1')).toBe('mature');
    const w = getRagBlendWeights('u1');
    expect(w.timelineUser).toBeGreaterThan(0.7);
    expect(w.timelineUser).toBeLessThan(0.85);
  });

  it('adds memory boost when dialog vectors accumulate', () => {
    getFirstDialogTime.mockReturnValue(null);
    getUserAgentProfile.mockReturnValue(null);
    countUserDialogVectors.mockReturnValue(25);
    const w = getRagBlendWeights('u1');
    expect(w.memoryBoost).toBe(0.03);
    expect(w.user).toBe(0.33);
  });
});

describe('dynamic weight helpers', () => {
  it('interpolates timeline anchors', () => {
    expect(computeTimelineUserWeight(0)).toBe(0.3);
    expect(computeTimelineUserWeight(6)).toBe(0.45);
    expect(computeTimelineUserWeight(12)).toBeCloseTo(0.575, 2);
    expect(computeTimelineUserWeight(24)).toBe(0.85);
    expect(computeTimelineUserWeight(30)).toBe(0.85);
  });

  it('computes memory boost tiers', () => {
    expect(computeMemoryBoost(0)).toBe(0);
    expect(computeMemoryBoost(5)).toBe(0.015);
    expect(computeMemoryBoost(20)).toBe(0.03);
    expect(computeMemoryBoost(50)).toBe(0.05);
  });
});

describe('userAgentStore ensure', () => {
  it('ensureUserAgentProfile creates row', () => {
    const id = `test_agent_${Date.now()}`;
    const row = ensureUserAgentProfile(id);
    expect(row.userId).toBe(id);
    expect(row.agentPhase).toBe('collect');
    updateUserAgentProfile(id, {
      basicJson: { age: 20, occupation: 'student' }
    });
    const updated = ensureUserAgentProfile(id);
    expect(updated.basicJson?.age).toBe(20);
  });
});
