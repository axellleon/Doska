/**
 * Order-preserving base-62 fractional indexing (inspired by Figma / Implementing Fractional Indexing).
 * Keys compare strictly with standard UTF-16 / ASCII lexicographical comparison (`a < b`).
 */

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length; // 62
const ZERO_CHAR = DIGITS[0]!; // '0'
const SMALLEST_INTEGER = "A00000000000000000000000000";
const INTEGER_ZERO = "a0";

function getIntegerLength(head: string): number {
  if (head >= "a" && head <= "z") {
    return head.charCodeAt(0) - "a".charCodeAt(0) + 2;
  }
  if (head >= "A" && head <= "Z") {
    return "Z".charCodeAt(0) - head.charCodeAt(0) + 2;
  }
  throw new Error(`Invalid order key head: ${head}`);
}

function validateInteger(int: string): void {
  if (int.length !== getIntegerLength(int[0]!)) {
    throw new Error(`Invalid integer part of order key: ${int}`);
  }
}

function incrementInteger(x: string): string | null {
  validateInteger(x);
  const head = x[0]!;
  const digs = x.slice(1).split("");
  let carry = true;

  for (let i = digs.length - 1; carry && i >= 0; i--) {
    const d = DIGITS.indexOf(digs[i]!) + 1;
    if (d === BASE) {
      digs[i] = ZERO_CHAR;
    } else {
      digs[i] = DIGITS[d]!;
      carry = false;
    }
  }

  if (carry) {
    if (head === "Z") {
      return INTEGER_ZERO;
    }
    if (head === "z") {
      return null;
    }
    const nextHead = String.fromCharCode(head.charCodeAt(0) + 1);
    if (nextHead > "a") {
      digs.push(ZERO_CHAR);
    } else {
      digs.pop();
    }
    return nextHead + digs.join("");
  }

  return head + digs.join("");
}

function decrementInteger(x: string): string | null {
  validateInteger(x);
  const head = x[0]!;
  const digs = x.slice(1).split("");
  let borrow = true;

  for (let i = digs.length - 1; borrow && i >= 0; i--) {
    const d = DIGITS.indexOf(digs[i]!) - 1;
    if (d === -1) {
      digs[i] = DIGITS[BASE - 1]!;
    } else {
      digs[i] = DIGITS[d]!;
      borrow = false;
    }
  }

  if (borrow) {
    if (head === "a") {
      return "Z" + DIGITS[BASE - 1]!;
    }
    if (head === "A") {
      return null;
    }
    const prevHead = String.fromCharCode(head.charCodeAt(0) - 1);
    if (prevHead < "Z") {
      digs.push(DIGITS[BASE - 1]!);
    } else {
      digs.pop();
    }
    return prevHead + digs.join("");
  }

  return head + digs.join("");
}

function midpoint(a: string, b: string | null | undefined): string {
  if (b != null && a >= b) {
    throw new Error(`Expected a < b in midpoint, got "${a}" >= "${b}"`);
  }
  if (a.slice(-1) === ZERO_CHAR || (b != null && b.slice(-1) === ZERO_CHAR)) {
    throw new Error("Trailing zero in fractional part");
  }

  if (b != null) {
    let n = 0;
    while ((a[n] ?? ZERO_CHAR) === b[n]) {
      n++;
    }
    if (n > 0) {
      return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
    }
  }

  const digitA = a ? DIGITS.indexOf(a[0]!) : 0;
  const digitB = b != null ? DIGITS.indexOf(b[0]!) : BASE;
  if (digitB - digitA > 1) {
    const midDigit = Math.round(0.5 * (digitA + digitB));
    return DIGITS[midDigit]!;
  }

  if (b != null && b.length > 1) {
    return b.slice(0, 1);
  }

  return DIGITS[digitA]! + midpoint(a.slice(1), null);
}

function getIntegerPart(key: string): string {
  const integerPartLength = getIntegerLength(key[0]!);
  if (integerPartLength > key.length) {
    throw new Error(`Invalid order key: ${key}`);
  }
  return key.slice(0, integerPartLength);
}

function validateOrderKey(key: string): void {
  if (key === SMALLEST_INTEGER) {
    throw new Error(`Invalid order key: ${key}`);
  }
  const i = getIntegerPart(key);
  const f = key.slice(i.length);
  if (f.slice(-1) === ZERO_CHAR) {
    throw new Error(`Invalid order key (trailing zero): ${key}`);
  }
}

/**
 * Generates a lexicographical key strictly between `a` and `b`.
 * Pass `null` or `undefined` for `a` (start) or `b` (end).
 */
export function generateKeyBetween(
  a: string | null | undefined,
  b: string | null | undefined
): string {
  if (a != null) {
    validateOrderKey(a);
  }
  if (b != null) {
    validateOrderKey(b);
  }
  if (a != null && b != null && a >= b) {
    throw new Error(`Expected "${a}" < "${b}"`);
  }

  if (a == null) {
    if (b == null) {
      return INTEGER_ZERO;
    }
    const ib = getIntegerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) {
      return ib + midpoint("", fb);
    }
    if (ib < b) {
      return ib;
    }
    const res = decrementInteger(ib);
    if (res == null) {
      throw new Error("Range underflow in generateKeyBetween");
    }
    return res;
  }

  if (b == null) {
    const ia = getIntegerPart(a);
    const fa = a.slice(ia.length);
    const i = incrementInteger(ia);
    return i == null ? ia + midpoint(fa, null) : i;
  }

  const ia = getIntegerPart(a);
  const fa = a.slice(ia.length);
  const ib = getIntegerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) {
    return ia + midpoint(fa, fb);
  }
  const i = incrementInteger(ia);
  if (i == null) {
    throw new Error("Range overflow in generateKeyBetween");
  }
  if (i < b) {
    return i;
  }
  return ia + midpoint(fa, null);
}

/**
 * Generates `n` strictly increasing keys between `a` and `b`.
 */
export function generateNKeysBetween(
  a: string | null | undefined,
  b: string | null | undefined,
  n: number
): string[] {
  if (n <= 0) {
    return [];
  }
  if (n === 1) {
    return [generateKeyBetween(a, b)];
  }
  if (b == null) {
    let c = generateKeyBetween(a, b);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(c, b);
      result.push(c);
    }
    return result;
  }
  if (a == null) {
    let c = generateKeyBetween(a, b);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(a, c);
      result.push(c);
    }
    result.reverse();
    return result;
  }
  const mid = Math.floor(n / 2);
  const c = generateKeyBetween(a, b);
  return [
    ...generateNKeysBetween(a, c, mid),
    c,
    ...generateNKeysBetween(c, b, n - mid - 1),
  ];
}

export function compareZIndexKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function bringToFrontKey(existingKeys: readonly string[]): string {
  if (existingKeys.length === 0) {
    return generateKeyBetween(null, null);
  }
  let maxKey = existingKeys[0]!;
  for (let i = 1; i < existingKeys.length; i++) {
    if (existingKeys[i]! > maxKey) {
      maxKey = existingKeys[i]!;
    }
  }
  return generateKeyBetween(maxKey, null);
}

export function sendToBackKey(existingKeys: readonly string[]): string {
  if (existingKeys.length === 0) {
    return generateKeyBetween(null, null);
  }
  let minKey = existingKeys[0]!;
  for (let i = 1; i < existingKeys.length; i++) {
    if (existingKeys[i]! < minKey) {
      minKey = existingKeys[i]!;
    }
  }
  return generateKeyBetween(null, minKey);
}

export function sortElementsByZIndex<
  T extends { zIndexKey: string; id: string },
>(elements: readonly T[]): T[] {
  return [...elements].sort((a, b) => {
    const cmp = compareZIndexKeys(a.zIndexKey, b.zIndexKey);
    if (cmp !== 0) return cmp;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
