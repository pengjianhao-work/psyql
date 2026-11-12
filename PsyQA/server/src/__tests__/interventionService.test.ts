import { getInterventionPlan } from '../services/psych/interventionService';

describe('getInterventionPlan', () => {
  it('routes high risk to safety_plan', () => {
    const plan = getInterventionPlan('anxious', 'academic_stress', 'high');
    expect(plan.frameworkId).toBe('safety_plan');
  });

  it('routes critical risk to safety_plan', () => {
    const plan = getInterventionPlan('sad', 'other', 'critical');
    expect(plan.frameworkId).toBe('safety_plan');
  });

  it('uses academic CBT for anxious academic stress at low risk', () => {
    const plan = getInterventionPlan('anxious', 'academic_stress', 'low');
    expect(plan.frameworkId).toBe('cbt_academic');
    expect(plan.structureHint).toContain('①');
  });

  it('falls back by problem for romantic_relationship', () => {
    const plan = getInterventionPlan('neutral', 'romantic_relationship', 'medium');
    expect(plan.frameworkId).toBe('romantic_support');
  });
});
