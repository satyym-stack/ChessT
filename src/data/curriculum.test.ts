import { describe, expect, it } from "vitest";
import { curriculum } from "./curriculum";
import { Chess } from "chess.js";

describe("curriculum content", () => {
  it("contains unique ids and valid FEN + SAN data", () => {
    const ids = new Set<string>();

    curriculum.forEach((position) => {
      expect(ids.has(position.id)).toBe(false);
      ids.add(position.id);
      expect(position.prompt.trim().length).toBeGreaterThan(0);
      expect(position.solutionMoves.length).toBeGreaterThan(0);

      const chess = new Chess(position.fen);
      position.solutionMoves.forEach((move) => {
        expect(() => chess.move(move)).not.toThrow();
      });
    });
  });
});
