import { describe, expect, it } from "vitest";
import {
  bringToFrontKey,
  createDemoBoardElements,
  createShapeElement,
  createStickyElement,
  createTextElement,
  generateKeyBetween,
  generateNKeysBetween,
  sendToBackKey,
  sortElementsByZIndex,
  STICKY_PALETTE,
  SHAPE_FILL_PALETTE,
  STROKE_AND_TEXT_PALETTE,
} from "./index.js";

describe("@doska/shared — fractional indexing", () => {
  it("generates monotonic keys at start, end, and middle", () => {
    const k1 = generateKeyBetween(null, null);
    const k2 = generateKeyBetween(k1, null);
    const k0 = generateKeyBetween(null, k1);
    const kMid = generateKeyBetween(k1, k2);

    expect(k0 < k1).toBe(true);
    expect(k1 < kMid).toBe(true);
    expect(kMid < k2).toBe(true);
  });

  it("handles 200 repeated midpoint insertions without collision", () => {
    let low = generateKeyBetween(null, null);
    const high = generateKeyBetween(low, null);
    for (let i = 0; i < 200; i++) {
      const next = generateKeyBetween(low, high);
      expect(next > low).toBe(true);
      expect(next < high).toBe(true);
      low = next;
    }
  });

  it("generates N strictly ordered keys between bounds", () => {
    const keys = generateNKeysBetween(null, null, 25);
    expect(keys).toHaveLength(25);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true);
    }

    const between = generateNKeysBetween(keys[3], keys[4], 10);
    expect(between).toHaveLength(10);
    expect(keys[3]! < between[0]!).toBe(true);
    expect(between[9]! < keys[4]!).toBe(true);
  });

  it("computes bringToFrontKey and sendToBackKey accurately", () => {
    const keys = generateNKeysBetween(null, null, 5);
    const front = bringToFrontKey(keys);
    const back = sendToBackKey(keys);

    for (const k of keys) {
      expect(front > k).toBe(true);
      expect(back < k).toBe(true);
    }
  });

  it("sorts board elements by zIndexKey deterministically", () => {
    const a = createStickyElement({ id: "a", zIndexKey: "a2" });
    const b = createShapeElement("ellipse", { id: "b", zIndexKey: "a0" });
    const c = createTextElement({ id: "c", zIndexKey: "a1" });

    const sorted = sortElementsByZIndex([a, b, c]);
    expect(sorted.map((el) => el.id)).toEqual(["b", "c", "a"]);
  });
});

describe("@doska/shared — factories & palettes", () => {
  it("exposes palettes and builds valid demo scene elements", () => {
    expect(STICKY_PALETTE.length).toBeGreaterThanOrEqual(6);
    expect(SHAPE_FILL_PALETTE.length).toBeGreaterThanOrEqual(6);
    expect(STROKE_AND_TEXT_PALETTE.length).toBeGreaterThanOrEqual(6);

    const demo = createDemoBoardElements(1700000000000);
    expect(demo.length).toBeGreaterThanOrEqual(10);

    const types = new Set(demo.map((e) => e.type));
    expect(types.has("sticky")).toBe(true);
    expect(types.has("shape")).toBe(true);
    expect(types.has("text")).toBe(true);
  });
});
