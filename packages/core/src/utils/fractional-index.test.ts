import { describe, it, expect } from 'vitest';
import {
  encodeInteger,
  decodeInteger,
  getIntegerPart,
  getInitialKey,
  generateKeyBetween,
  generateNKeysBetween,
  compareOrderIndices
} from './fractional-index.js';

describe('fractional-index', () => {
  describe('encodeInteger and decodeInteger', () => {
    it('encodes and decodes non-negative integers', () => {
      const cases = [0, 1, 2, 9, 10, 61, 62, 100, 1000, 3843, 3844];
      for (const n of cases) {
        const encoded = encodeInteger(n);
        expect(decodeInteger(encoded)).toBe(n);
      }
    });

    it('encodes and decodes negative integers', () => {
      const cases = [-1, -2, -10, -62, -100, -1000];
      for (const n of cases) {
        const encoded = encodeInteger(n);
        expect(decodeInteger(encoded)).toBe(n);
      }
    });

    it('strictly maintains lexicographical sorting across integers', () => {
      const sequence = [-100, -62, -10, -2, -1, 0, 1, 2, 9, 10, 61, 62, 100, 3843, 3844];
      const encoded = sequence.map((n) => encodeInteger(n));

      for (let i = 0; i < encoded.length - 1; i++) {
        expect(encoded[i] < encoded[i + 1]).toBe(true);
        expect(compareOrderIndices(encoded[i], encoded[i + 1])).toBeLessThan(0);
      }

      // Reversing and sorting with compareOrderIndices or standard sort() restores exact order
      const reversed = [...encoded].reverse();
      expect(reversed.sort(compareOrderIndices)).toEqual(encoded);
      expect([...encoded].reverse().sort()).toEqual(encoded);
    });
  });

  describe('getInitialKey', () => {
    it('generates spaced initial keys', () => {
      const k0 = getInitialKey(0);
      const k1 = getInitialKey(1);
      const k2 = getInitialKey(2);

      expect(k0).toBe('a0');
      expect(k1).toBe('a2');
      expect(k2).toBe('a4');

      expect(k0 < k1).toBe(true);
      expect(k1 < k2).toBe(true);
    });
  });

  describe('generateKeyBetween', () => {
    it('returns default initial key when both bounds are null/undefined', () => {
      expect(generateKeyBetween(null, null)).toBe('a0');
      expect(generateKeyBetween(undefined, undefined)).toBe('a0');
      expect(generateKeyBetween('', '')).toBe('a0');
    });

    it('generates a key before an upper bound', () => {
      const b0 = 'a0';
      const beforeB0 = generateKeyBetween(null, b0);
      expect(beforeB0 < b0).toBe(true);

      const b1 = 'a1';
      const beforeB1 = generateKeyBetween(null, b1);
      expect(beforeB1 < b1).toBe(true);

      const bFractional = 'a0V';
      const beforeFractional = generateKeyBetween(null, bFractional);
      expect(beforeFractional < bFractional).toBe(true);
    });

    it('generates a key after a lower bound', () => {
      const a0 = 'a0';
      const afterA0 = generateKeyBetween(a0, null);
      expect(a0 < afterA0).toBe(true);

      const aFractional = 'a0V';
      const afterFractional = generateKeyBetween(aFractional, null);
      expect(aFractional < afterFractional).toBe(true);
    });

    it('generates key between spaced integers', () => {
      const a = 'a0';
      const b = 'a2';
      const mid = generateKeyBetween(a, b);

      expect(mid).toBe('a1');
      expect(a < mid).toBe(true);
      expect(mid < b).toBe(true);
    });

    it('generates fractional key between adjacent integers', () => {
      const a = 'a0';
      const b = 'a1';
      const mid = generateKeyBetween(a, b);

      expect(a < mid).toBe(true);
      expect(mid < b).toBe(true);
    });

    it('handles nested fractional insertions without degradation', () => {
      let current = 'a0';
      const target = 'a1';

      // Perform 50 sequential midpoint insertions
      for (let i = 0; i < 50; i++) {
        const next = generateKeyBetween(current, target);
        expect(current < next).toBe(true);
        expect(next < target).toBe(true);
        current = next;
      }
    });

    it('handles repeated insertions directly after the same lower bound', () => {
      const lower = 'a0';
      let upper = 'a1';

      // Repeatedly drop a card just below the first card
      for (let i = 0; i < 50; i++) {
        const next = generateKeyBetween(lower, upper);
        expect(lower < next).toBe(true);
        expect(next < upper).toBe(true);
        upper = next;
      }
    });

    it('keeps keys strictly ordered under random insertions', () => {
      const keys = ['a0', 'a1'];
      let seed = 42;
      const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };

      for (let i = 0; i < 500; i++) {
        const idx = Math.floor(random() * (keys.length + 1));
        const next = generateKeyBetween(keys[idx - 1] ?? null, keys[idx] ?? null);
        keys.splice(idx, 0, next);
      }

      for (let i = 1; i < keys.length; i++) {
        expect(keys[i - 1] < keys[i]).toBe(true);
      }
    });

    it('throws when the lower bound does not sort before the upper bound', () => {
      expect(() => generateKeyBetween('a1', 'a0')).toThrow(RangeError);
      expect(() => generateKeyBetween('a0', 'a0')).toThrow(RangeError);
    });
  });

  describe('generateNKeysBetween', () => {
    it('returns empty array for count <= 0', () => {
      expect(generateNKeysBetween('a0', 'a2', 0)).toEqual([]);
      expect(generateNKeysBetween('a0', 'a2', -1)).toEqual([]);
    });

    it('generates 1 key matching generateKeyBetween', () => {
      const keys = generateNKeysBetween('a0', 'a2', 1);
      expect(keys.length).toBe(1);
      expect(keys[0]).toBe('a1');
    });

    it('generates N keys in strictly ascending order between a and b', () => {
      const count = 5;
      const a = 'a0';
      const b = 'a1';
      const keys = generateNKeysBetween(a, b, count);

      expect(keys.length).toBe(count);

      // Check strictly greater than a
      expect(a < keys[0]).toBe(true);

      // Check strictly increasing
      for (let i = 0; i < keys.length - 1; i++) {
        expect(keys[i] < keys[i + 1]).toBe(true);
      }

      // Check strictly less than b
      expect(keys[count - 1] < b).toBe(true);
    });

    it('generates N keys at swimlane start (a is null)', () => {
      const count = 3;
      const b = 'a0';
      const keys = generateNKeysBetween(null, b, count);

      expect(keys.length).toBe(count);
      for (let i = 0; i < keys.length - 1; i++) {
        expect(keys[i] < keys[i + 1]).toBe(true);
      }
      expect(keys[count - 1] < b).toBe(true);
    });

    it('generates N keys at swimlane end (b is null)', () => {
      const count = 4;
      const a = 'a5';
      const keys = generateNKeysBetween(a, null, count);

      expect(keys.length).toBe(count);
      expect(a < keys[0]).toBe(true);
      for (let i = 0; i < keys.length - 1; i++) {
        expect(keys[i] < keys[i + 1]).toBe(true);
      }
    });

    it('generates N keys in empty swimlane (both null)', () => {
      const count = 6;
      const keys = generateNKeysBetween(null, null, count);

      expect(keys.length).toBe(count);
      for (let i = 0; i < keys.length - 1; i++) {
        expect(keys[i] < keys[i + 1]).toBe(true);
      }
    });
  });
});
