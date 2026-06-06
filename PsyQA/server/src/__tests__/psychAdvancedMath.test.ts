import {
  shannonEntropy,
  autocorrelation,
  zScore,
  mahalanobisDiagonal,
  kalmanFilter1D,
  computeAdvancedMath
} from '../services/psych/psychAdvancedMath';

describe('psychAdvancedMath', () => {
  it('computes Shannon entropy for uniform distribution', () => {
    expect(shannonEntropy([1, 1, 1, 1])).toBeCloseTo(2, 2);
  });

  it('computes positive autocorrelation for rising series', () => {
    expect(autocorrelation([40, 50, 60, 70], 1)).toBeGreaterThan(0.8);
  });

  it('returns z-score above mean for high value', () => {
    expect(zScore(80, [40, 45, 50, 55])).toBeGreaterThan(1);
  });

  it('mahalanobis distance increases with deviation', () => {
    const near = mahalanobisDiagonal([50, 48, 58], [48, 44, 58], [10, 10, 10]);
    const far = mahalanobisDiagonal([80, 75, 30], [48, 44, 58], [10, 10, 10]);
    expect(far).toBeGreaterThan(near);
  });

  it('kalman filter smooths noisy observations', () => {
    const est = kalmanFilter1D([50, 52, 48, 51, 49]);
    expect(est).toBeGreaterThan(45);
    expect(est).toBeLessThan(55);
  });

  it('builds advanced math snapshot', () => {
    const snap = computeAdvancedMath([45, 50, 55, 60], [40, 42, 44, 48], [70, 68, 65, 62], [2, 1, 1], 60, 48);
    expect(snap.emotionEntropy).toBeGreaterThan(0);
    expect(snap.formulas.length).toBeGreaterThanOrEqual(3);
  });
});
