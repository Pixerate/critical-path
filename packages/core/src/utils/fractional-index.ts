/**
 * Fractional Lexical Indexing Utility
 *
 * Deterministic Base-62 fractional indexing for ordered lists and swimlane task sequences.
 * Produces lexicographically sortable strings (`orderIndex`) that allow infinite insertion
 * between any two items without floating-point precision loss.
 */

export const BASE_62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Encodes a non-negative integer into Base-62.
 */
function toBase62(n: number): string {
  if (n === 0) return '0';
  let s = '';
  let curr = n;
  while (curr > 0) {
    s = BASE_62[curr % 62] + s;
    curr = Math.floor(curr / 62);
  }
  return s;
}

/**
 * Decodes a Base-62 string into a non-negative integer.
 */
function fromBase62(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const idx = BASE_62.indexOf(s[i]);
    if (idx === -1) return 0;
    n = n * 62 + idx;
  }
  return n;
}

/**
 * Encodes an integer into a prefix-encoded string such that standard
 * string comparison strictly matches integer comparison.
 *
 * Non-negative integers (0, 1, 2, ...):
 *   Prefix 'a'-'z' specifies the digit count (1 to 26 digits).
 *   0 -> "a0", 1 -> "a1", 61 -> "az", 62 -> "b10", ...
 *
 * Negative integers (-1, -2, ...):
 *   Prefix 'Z'-'A' specifies inverted digit count with inverted digits.
 *   -1 -> "Zz", -2 -> "Zy", ...
 */
export function encodeInteger(n: number): string {
  if (n >= 0) {
    const digits = toBase62(n);
    const prefixCode = 97 + digits.length - 1; // 97 is 'a'
    const prefix = String.fromCharCode(Math.min(prefixCode, 122)); // clamp to 'z'
    return prefix + digits;
  } else {
    const pos = -n - 1;
    const digits = toBase62(pos);
    let inverted = '';
    for (let i = 0; i < digits.length; i++) {
      const idx = BASE_62.indexOf(digits[i]);
      inverted += BASE_62[61 - idx];
    }
    const prefixCode = 90 - (digits.length - 1); // 90 is 'Z'
    const prefix = String.fromCharCode(Math.max(prefixCode, 65)); // clamp to 'A'
    return prefix + inverted;
  }
}

/**
 * Decodes a prefix-encoded integer string back into a number.
 */
export function decodeInteger(s: string): number {
  if (!s || s.length < 2) return 0;
  const prefix = s[0];
  if (prefix >= 'a' && prefix <= 'z') {
    const len = prefix.charCodeAt(0) - 97 + 1;
    const digits = s.slice(1, 1 + len);
    return fromBase62(digits);
  } else if (prefix >= 'A' && prefix <= 'Z') {
    const len = 90 - prefix.charCodeAt(0) + 1;
    const inverted = s.slice(1, 1 + len);
    let digits = '';
    for (let i = 0; i < inverted.length; i++) {
      const idx = BASE_62.indexOf(inverted[i]);
      digits += idx !== -1 ? BASE_62[61 - idx] : '0';
    }
    const pos = fromBase62(digits);
    return -pos - 1;
  }
  return 0;
}

/**
 * Extracts the integer component from an order key.
 */
export function getIntegerPart(key: string): string {
  if (!key || key.length < 2) return 'a0';
  const prefix = key[0];
  if (prefix >= 'a' && prefix <= 'z') {
    const len = prefix.charCodeAt(0) - 97 + 1;
    return key.slice(0, Math.min(key.length, 1 + len));
  } else if (prefix >= 'A' && prefix <= 'Z') {
    const len = 90 - prefix.charCodeAt(0) + 1;
    return key.slice(0, Math.min(key.length, 1 + len));
  }
  return 'a0';
}

/**
 * Computes a fractional suffix strictly between suffixes `a` and `b` (a < result < b).
 * Missing digits in `a` are treated as '0', so `a` may be shorter than `b`.
 * `b === null` means there is no upper bound.
 */
function midpointSuffix(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while (n < b.length && (a[n] ?? '0') === b[n]) {
      n++;
    }
    if (n > 0) {
      return b.slice(0, n) + midpointSuffix(a.slice(n), b.slice(n));
    }
  }

  const digitA = a.length > 0 ? BASE_62.indexOf(a[0]) : 0;
  const digitB = b !== null ? BASE_62.indexOf(b[0]) : BASE_62.length;

  if (digitB - digitA > 1) {
    return BASE_62[Math.floor((digitA + digitB) / 2)];
  }

  // Adjacent digits: if b has more digits, its first digit alone already sits between a and b.
  if (b !== null && b.length > 1) {
    return b[0];
  }

  // Otherwise keep a's digit and subdivide the remainder with no upper bound.
  return BASE_62[digitA] + midpointSuffix(a.slice(1), null);
}

/**
 * Generates a default initial order key for an index with optional spacing.
 * E.g. index 0 -> "a0", index 1 (spacing 2) -> "a2", index 2 -> "a4"
 */
export function getInitialKey(index: number, spacing: number = 2): string {
  return encodeInteger(Math.max(0, index) * Math.max(1, spacing));
}

/**
 * Generates a single key strictly between keys `a` and `b` (a < key < b).
 * Handles null/undefined for lower and upper bounds.
 */
export function generateKeyBetween(
  a: string | null | undefined,
  b: string | null | undefined
): string {
  const hasA = a !== null && a !== undefined && a !== '';
  const hasB = b !== null && b !== undefined && b !== '';

  if (!hasA && !hasB) {
    return 'a0';
  }

  if (!hasA && hasB) {
    const intB = getIntegerPart(b!);
    if (intB === b) {
      const valB = decodeInteger(intB);
      return encodeInteger(valB - 1);
    }
    // If b has fractional suffix (e.g. "a0V"), integer part is already strictly smaller than b
    return intB;
  }

  if (hasA && !hasB) {
    const intA = getIntegerPart(a!);
    const valA = decodeInteger(intA);
    return encodeInteger(valA + 1);
  }

  // Both a and b are present
  if (a! >= b!) {
    throw new RangeError(`generateKeyBetween: lower bound "${a}" must sort before upper bound "${b}"`);
  }

  const intA = getIntegerPart(a!);
  const intB = getIntegerPart(b!);

  if (intA !== intB) {
    const valA = decodeInteger(intA);
    const valB = decodeInteger(intB);

    if (valB - valA > 1) {
      const midVal = Math.floor((valA + valB) / 2);
      return encodeInteger(midVal);
    }

    if (valB - valA === 1) {
      const suffixA = a!.slice(intA.length);
      return intA + midpointSuffix(suffixA, null);
    }
  }

  // Same integer part or fractional subdivision
  const suffixA = a!.slice(intA.length);
  const suffixB = b!.slice(intB.length);
  return intA + midpointSuffix(suffixA, suffixB);
}

/**
 * Generates `count` keys in strictly ascending order between keys `a` and `b`.
 * Uses a balanced divide-and-conquer partition to guarantee even spacing.
 */
export function generateNKeysBetween(
  a: string | null | undefined,
  b: string | null | undefined,
  count: number
): string[] {
  if (count <= 0) return [];
  if (count === 1) return [generateKeyBetween(a, b)];

  const result: string[] = new Array(count);

  function fill(
    leftKey: string | null | undefined,
    rightKey: string | null | undefined,
    startIdx: number,
    endIdx: number
  ) {
    if (startIdx > endIdx) return;
    const midIdx = Math.floor((startIdx + endIdx) / 2);
    const midKey = generateKeyBetween(leftKey, rightKey);
    result[midIdx] = midKey;
    fill(leftKey, midKey, startIdx, midIdx - 1);
    fill(midKey, rightKey, midIdx + 1, endIdx);
  }

  fill(a, b, 0, count - 1);
  return result;
}

/**
 * Standard comparator for fractional order indices.
 * Uses strict code-point comparison matching Firestore, SQLite, and JavaScript array.sort().
 */
export function compareOrderIndices(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}
