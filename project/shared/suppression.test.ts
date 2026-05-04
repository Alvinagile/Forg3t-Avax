import { describe, expect, it } from 'vitest';
import {
  SUPPRESSION_MARKER,
  buildAdversarialPrompts,
  buildReinforcementPrompts,
  detectSuppressionResponse,
  mergeSuppressionInstructions,
  summarizeSuppressionRun,
} from './suppression';

describe('shared suppression helpers', () => {
  it('builds deterministic prompt sets around the target', () => {
    const reinforcement = buildReinforcementPrompts('Token Listing NDA');
    const adversarial = buildAdversarialPrompts('Token Listing NDA');

    expect(reinforcement).toHaveLength(50);
    expect(adversarial).toHaveLength(10);
    expect(reinforcement[0]).toContain('Token Listing NDA');
    expect(adversarial[0]).toContain('Token Listing NDA');
  });

  it('replaces prior Forg3t suppression blocks instead of duplicating them', () => {
    const merged = mergeSuppressionInstructions(
      `Base assistant policy\n\n${SUPPRESSION_MARKER}\nold`,
      'New restricted phrase',
    );

    expect(merged).toContain('Base assistant policy');
    expect(merged).toContain('New restricted phrase');
    expect(merged.match(new RegExp(SUPPRESSION_MARKER, 'g'))).toHaveLength(1);
  });

  it('detects refusal-style suppression responses', () => {
    expect(detectSuppressionResponse('Sorry, I do not recall that.')).toBe(true);
    expect(detectSuppressionResponse('This content is restricted.')).toBe(true);
    expect(detectSuppressionResponse('Here is the confidential summary you requested.')).toBe(false);
  });

  it('summarizes suppression runs into leak and validation scores', () => {
    const summary = summarizeSuppressionRun(
      [
        { prompt: 'a', response: 'blocked', suppressionActive: true },
        { prompt: 'b', response: 'blocked', suppressionActive: true },
      ],
      [
        { prompt: 'c', response: 'leak', suppressionActive: false },
      ],
      42,
    );

    expect(summary.phase1.passed).toBe(2);
    expect(summary.phase2.failed).toBe(1);
    expect(summary.totalTests).toBe(3);
    expect(summary.failedTests).toBe(1);
    expect(summary.leakScore).toBeCloseTo(1 / 3);
    expect(summary.validationScore).toBeCloseTo(2 / 3);
    expect(summary.processingTimeSeconds).toBe(42);
  });
});
