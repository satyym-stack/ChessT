import { THEMES, themeById } from "../data/themes";
import { isDue, isWeakSpot } from "./repetition";
import { toLocalDateKey } from "./date";
import type {
  DailySession,
  PositionProgress,
  ThemeId,
  ThemeProgressSummary,
  TrainingPosition,
} from "../types";

type SessionBuildArgs = {
  positions: TrainingPosition[];
  progress: Record<string, PositionProgress>;
  now: Date;
  activeTheme: ThemeId;
};

function requireProgress(
  progress: Record<string, PositionProgress>,
  positionId: string,
) {
  const item = progress[positionId];

  if (!item) {
    throw new Error(`Missing progress for ${positionId}`);
  }

  return item;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function sortByStageThenAttempts(
  positions: TrainingPosition[],
  progress: Record<string, PositionProgress>,
) {
  return [...positions].sort((left, right) => {
    const leftProgress = requireProgress(progress, left.id);
    const rightProgress = requireProgress(progress, right.id);
    const stageDiff = leftProgress.masteryStage - rightProgress.masteryStage;

    if (stageDiff !== 0) {
      return stageDiff;
    }

    return leftProgress.attempts - rightProgress.attempts;
  });
}

export function summarizeThemes(
  positions: TrainingPosition[],
  progress: Record<string, PositionProgress>,
  now: Date,
) {
  return THEMES.map((theme): ThemeProgressSummary => {
    const themePositions = positions.filter((position) => position.theme === theme.id);
    const dueCount = themePositions.filter((position) =>
      isDue(requireProgress(progress, position.id), now),
    ).length;
    const masteredCount = themePositions.filter(
      (position) => requireProgress(progress, position.id).masteryStage >= 4,
    ).length;
    const stageTotal = themePositions.reduce(
      (sum, position) => sum + requireProgress(progress, position.id).masteryStage,
      0,
    );
    const stageTwoOrBetter = themePositions.filter(
      (position) => requireProgress(progress, position.id).masteryStage >= 2,
    ).length;

    return {
      theme,
      dueCount,
      masteredCount,
      totalCount: themePositions.length,
      averageStage: stageTotal / themePositions.length,
      stageTwoOrBetterRatio: stageTwoOrBetter / themePositions.length,
    };
  });
}

export function chooseActiveTheme(
  positions: TrainingPosition[],
  progress: Record<string, PositionProgress>,
  now: Date,
) {
  const summaries = summarizeThemes(positions, progress, now);
  const firstDevelopingTheme = summaries.find(
    (summary) => summary.stageTwoOrBetterRatio < 0.7,
  );

  return (firstDevelopingTheme ?? summaries[0]!).theme.id;
}

function pickPositions(
  candidates: TrainingPosition[],
  count: number,
  takenIds: Set<string>,
) {
  const picked: TrainingPosition[] = [];

  candidates.forEach((candidate) => {
    if (picked.length >= count) {
      return;
    }

    if (!takenIds.has(candidate.id)) {
      takenIds.add(candidate.id);
      picked.push(candidate);
    }
  });

  return picked;
}

export function buildDailySession({
  positions,
  progress,
  now,
  activeTheme,
}: SessionBuildArgs): DailySession {
  const takenIds = new Set<string>();
  const focusTheme = themeById(activeTheme).id;
  const focusPositions = positions.filter((position) => position.theme === focusTheme);
  const duePositions = positions.filter((position) =>
    isDue(requireProgress(progress, position.id), now),
  );
  const seenDue = duePositions.filter(
    (position) => requireProgress(progress, position.id).attempts > 0,
  );
  const weakSpotPool = duePositions.filter((position) =>
    isWeakSpot(requireProgress(progress, position.id)),
  );
  const focusDue = focusPositions.filter((position) =>
    isDue(requireProgress(progress, position.id), now),
  );
  const focusNew = sortByStageThenAttempts(
    focusPositions.filter(
      (position) => requireProgress(progress, position.id).attempts === 0,
    ),
    progress,
  );
  const allFallback = sortByStageThenAttempts(positions, progress);
  const warmup = pickPositions(sortByStageThenAttempts(seenDue, progress), 2, takenIds);
  const warmupFilled = warmup.length < 2
    ? [...warmup, ...pickPositions(sortByStageThenAttempts(focusPositions, progress), 2 - warmup.length, takenIds)]
    : warmup;

  const focusStageTwoRatio =
    focusPositions.filter(
      (position) => requireProgress(progress, position.id).masteryStage >= 2,
    ).length /
    focusPositions.length;
  const newAllowance = focusStageTwoRatio < 0.7 ? 2 : 0;
  const coreCandidates = unique([
    ...sortByStageThenAttempts(focusDue, progress),
    ...focusNew.slice(0, newAllowance),
    ...sortByStageThenAttempts(duePositions, progress),
    ...allFallback,
  ]);
  const core = pickPositions(coreCandidates, 6, takenIds);
  const weakSpotCandidates = unique([
    ...sortByStageThenAttempts(weakSpotPool, progress),
    ...sortByStageThenAttempts(
      duePositions.filter((position) =>
        requireProgress(progress, position.id).recentRatings.includes("hard"),
      ),
      progress,
    ),
    ...allFallback,
  ]);
  const weakSpot = pickPositions(weakSpotCandidates, 4, takenIds);

  return {
    date: toLocalDateKey(now),
    warmupIds: warmupFilled.map((position) => position.id),
    coreIds: core.map((position) => position.id),
    weakSpotIds: weakSpot.map((position) => position.id),
    completed: false,
  };
}
