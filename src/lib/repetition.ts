import { addDays } from "./date";
import type {
  PositionProgress,
  ReviewRating,
  TrainingPosition,
} from "../types";

const GOOD_INTERVALS = [1, 2, 4, 7, 14];
const EASY_INTERVALS = [2, 4, 7, 14, 30];

export function createInitialProgress(position: TrainingPosition): PositionProgress {
  return {
    positionId: position.id,
    masteryStage: 0,
    dueAt: new Date(0).toISOString(),
    lastSeenAt: null,
    attempts: 0,
    recentRatings: [],
  };
}

export function isDue(progress: PositionProgress, now: Date) {
  return new Date(progress.dueAt).getTime() <= now.getTime();
}

export function isWeakSpot(progress: PositionProgress) {
  const lastFive = progress.recentRatings.slice(-5);
  const lastSeven = progress.recentRatings.slice(-7);
  const missedCount = lastFive.filter((rating) => rating === "missed").length;
  const hardCount = lastSeven.filter((rating) => rating === "hard").length;

  return missedCount >= 2 || hardCount >= 3;
}

export function updateProgressAfterRating(
  progress: PositionProgress,
  rating: ReviewRating,
  now: Date,
): PositionProgress {
  let masteryStage = progress.masteryStage;
  let dueAt = now;

  if (rating === "missed") {
    masteryStage = Math.max(1, progress.masteryStage - 1) as PositionProgress["masteryStage"];
  }

  if (rating === "hard") {
    dueAt = addDays(now, 1);
  }

  if (rating === "good") {
    masteryStage = Math.min(4, progress.masteryStage + 1) as PositionProgress["masteryStage"];
    dueAt = addDays(
      now,
      GOOD_INTERVALS[masteryStage] ?? GOOD_INTERVALS[GOOD_INTERVALS.length - 1]!,
    );
  }

  if (rating === "easy") {
    masteryStage = Math.min(4, progress.masteryStage + 2) as PositionProgress["masteryStage"];
    dueAt = addDays(
      now,
      EASY_INTERVALS[masteryStage] ?? EASY_INTERVALS[EASY_INTERVALS.length - 1]!,
    );
  }

  return {
    ...progress,
    masteryStage,
    dueAt: dueAt.toISOString(),
    lastSeenAt: now.toISOString(),
    attempts: progress.attempts + 1,
    recentRatings: [...progress.recentRatings, rating].slice(-7),
  };
}
