import { describe, expect, it } from "vitest";
import {
  chooseLessonForFeedback,
  lessonForCoachTag,
  lessonHabitCopy,
} from "./lessons";

describe("lesson coaching helpers", () => {
  it("maps hanging-piece feedback to the stop hanging pieces lesson", () => {
    expect(lessonForCoachTag("hanging-piece")).toBe("stop-hanging-pieces");
    expect(
      chooseLessonForFeedback("opening-habits", ["hanging-piece"]).id,
    ).toBe("stop-hanging-pieces");
  });

  it("returns a concrete repeatable habit for each lesson", () => {
    expect(lessonHabitCopy("checks-captures-threats").nextHabit).toContain(
      "checks first",
    );
  });
});
