import { describe, expect, it } from "vitest";
import { curriculum } from "../data/curriculum";
import { buildDailySession } from "./session";
import {
  createInitialProgress,
  isWeakSpot,
  updateProgressAfterRating,
} from "./repetition";
import type { ReviewRating } from "../types";

describe("repetition scheduler", () => {
  it("schedules good and easy ratings into the future", () => {
    const baseProgress = createInitialProgress(curriculum[0]!);
    const now = new Date("2026-04-19T12:00:00.000Z");

    const afterGood = updateProgressAfterRating(baseProgress, "good", now);
    const afterEasy = updateProgressAfterRating(baseProgress, "easy", now);

    expect(afterGood.masteryStage).toBe(1);
    expect(afterGood.dueAt).toBe("2026-04-21T12:00:00.000Z");
    expect(afterEasy.masteryStage).toBe(2);
    expect(afterEasy.dueAt).toBe("2026-04-26T12:00:00.000Z");
  });

  it("marks weak spots using recent hard or missed ratings", () => {
    const weakSpot = {
      ...createInitialProgress(curriculum[0]!),
      recentRatings: ["good", "missed", "hard", "missed", "good", "hard", "hard"] as ReviewRating[],
    };

    expect(isWeakSpot(weakSpot)).toBe(true);
  });

  it("builds a 12-rep session with 2 warmups, 6 core, and 4 weak spots", () => {
    const progress = Object.fromEntries(
      curriculum.map((position) => [position.id, createInitialProgress(position)]),
    );
    const session = buildDailySession({
      positions: curriculum,
      progress,
      now: new Date("2026-04-19T12:00:00.000Z"),
      activeTheme: "opening-principles",
    });

    expect(session.warmupIds).toHaveLength(2);
    expect(session.coreIds).toHaveLength(6);
    expect(session.weakSpotIds).toHaveLength(4);
  });
});
