import { describe, it, expect } from 'vitest';
import { generateProjectKey, validateProjectKey, formatTaskKey } from './key.js';

describe('Project Key Utilities', () => {
  describe('generateProjectKey', () => {
    it('generates a key for a single word name', () => {
      expect(generateProjectKey('Operative')).toBe('OPE');
      expect(generateProjectKey('App')).toBe('APP');
      expect(generateProjectKey('Go')).toBe('GO');
    });

    it('generates a key for multi-word names', () => {
      expect(generateProjectKey('Mobile App')).toBe('MA');
      expect(generateProjectKey('Frontend Core Platform')).toBe('FCP');
      expect(generateProjectKey('Very Long Project Name Here')).toBe('VLPN');
    });

    it('handles special characters and whitespace', () => {
      expect(generateProjectKey('  v2.0  ')).toBe('V20');
      expect(generateProjectKey('Project #1')).toBe('P1');
    });

    it('returns default PRJ fallback for empty input', () => {
      expect(generateProjectKey('')).toBe('PRJ');
      expect(generateProjectKey('   ')).toBe('PRJ');
    });
  });

  describe('validateProjectKey', () => {
    it('returns true for valid keys', () => {
      expect(validateProjectKey('CP')).toBe(true);
      expect(validateProjectKey('PROJ')).toBe(true);
      expect(validateProjectKey('APP123')).toBe(true);
    });

    it('returns false for invalid keys', () => {
      expect(validateProjectKey('A')).toBe(false); // too short
      expect(validateProjectKey('TOOLONGKEY')).toBe(false); // too long
      expect(validateProjectKey('proj')).toBe(false); // lowercase
      expect(validateProjectKey('P-1')).toBe(false); // special char
      expect(validateProjectKey('')).toBe(false);
    });
  });

  describe('formatTaskKey', () => {
    it('formats project key and task number', () => {
      expect(formatTaskKey('MOB', 42)).toBe('MOB-42');
      expect(formatTaskKey('op', 1)).toBe('OP-1');
    });

    it('uses fallback for missing project key', () => {
      expect(formatTaskKey('', 10)).toBe('TASK-10');
    });
  });
});
