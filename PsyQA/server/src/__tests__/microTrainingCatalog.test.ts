import { suggestMicroTrainings } from '../services/psych/microTrainingCatalog';

describe('suggestMicroTrainings', () => {
  it('blocks high risk', () => {
    const result = suggestMicroTrainings({
      emotion: 'anxious',
      problem: 'academic_stress',
      risk: 'high'
    });
    expect(result).toMatchObject({ blocked: true });
  });

  it('suggests breathing/stress for anxious academic', () => {
    const result = suggestMicroTrainings({
      emotion: 'anxious',
      problem: 'academic_stress',
      risk: 'low',
      limit: 2
    });
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].title).toBeTruthy();
    }
  });
});
