import { evaluateAccessExtension, evaluateAcademicYearChange } from './account-control-policy';

describe('Account control policy', () => {
  describe('Current Academic Year', () => {
    it.each([
      [null, 2569, 'advanced'],
      [2569, 2569, 'unchanged'],
      [2569, 2570, 'advanced'],
      [2570, 2569, 'invalid'],
    ] as const)('classifies a change from %s to %s as %s', (current, proposed, outcome) => {
      expect(evaluateAcademicYearChange(current, proposed)).toBe(outcome);
    });
  });

  describe('Student Access Period extension', () => {
    it.each([
      [2576, 2577, 'extended'],
      [2576, 2576, 'unchanged'],
      [2576, 2575, 'invalid'],
    ] as const)('classifies a change from %s to %s as %s', (current, proposed, outcome) => {
      expect(evaluateAccessExtension(current, proposed)).toBe(outcome);
    });
  });
});
