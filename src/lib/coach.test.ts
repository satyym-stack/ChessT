import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { buildCoachFeedback } from "./coach";

describe("buildCoachFeedback", () => {
  it("adds lesson-aware coaching guidance for weak opening moves", () => {
    const chess = new Chess();
    const move = chess.move({
      from: "a2",
      to: "a3",
    });

    if (!move) {
      throw new Error("Expected a3 to be legal from the starting position.");
    }

    const feedback = buildCoachFeedback({
      fenBefore: new Chess().fen(),
      move,
      playerColor: "w",
      currentLessonId: "opening-habits",
      analysisBefore: {
        fen: new Chess().fen(),
        bestMoveUci: "e2e4",
        bestMoveSan: "e4",
        scoreCp: 40,
        mateIn: null,
        depth: 10,
        pvUci: ["e2e4", "e7e5"],
        pvSan: ["e4", "e5"],
      },
      analysisAfter: {
        fen: chess.fen(),
        bestMoveUci: "e7e5",
        bestMoveSan: "e5",
        scoreCp: 180,
        mateIn: null,
        depth: 10,
        pvUci: ["e7e5", "g1f3"],
        pvSan: ["e5", "Nf3"],
      },
    });

    expect(feedback.classification).toBe("mistake");
    expect(feedback.lessonId).toBe("opening-habits");
    expect(feedback.lessonTitle).toBe("Opening Habits");
    expect(feedback.tags).toContain("development");
    expect(feedback.lessonTieIn.toLowerCase()).toContain("opening habits");
    expect(feedback.nextHabit.toLowerCase()).toContain("develops a piece");
  });
});
