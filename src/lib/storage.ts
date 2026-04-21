import { curriculum } from "../data/curriculum";
import { LESSON_ORDER } from "../data/lessons";
import { THEME_ORDER } from "../data/themes";
import { createInitialProgress } from "./repetition";
import type {
  ActiveDrillSessionState,
  AppSettings,
  LessonId,
  LessonProgress,
  PersistedAppState,
  PositionProgress,
  ThemeId,
  TrainingPosition,
} from "../types";

const DB_NAME = "chesst-db";
const DB_VERSION = 2;
const STORE_NAME = "app";
const ROOT_KEY = "root";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function defaultProgress(positions: TrainingPosition[]) {
  return positions.reduce<Record<string, PositionProgress>>((accumulator, position) => {
    accumulator[position.id] = createInitialProgress(position);
    return accumulator;
  }, {});
}

function createLessonProgress(): LessonProgress {
  const lessonStatus = LESSON_ORDER.reduce<Record<LessonId, { completed: boolean; completedAt: string | null }>>(
    (accumulator, lessonId) => {
      accumulator[lessonId] = {
        completed: false,
        completedAt: null,
      };
      return accumulator;
    },
    {} as Record<LessonId, { completed: boolean; completedAt: string | null }>,
  );

  return {
    completedLessonIds: [],
    currentLessonId: LESSON_ORDER[0]!,
    lessonStatus,
  };
}

export function createDefaultSettings(): AppSettings {
  return {
    coachEnabled: true,
    allowTakebacks: true,
    coachStrictness: "standard",
    engineSkill: 2,
    moveTimeMs: 350,
    preferredColor: "w",
  };
}

export function createDefaultState(): PersistedAppState {
  return {
    version: 2,
    progress: defaultProgress(curriculum),
    sessions: {},
    activeDrillSession: null,
    userStats: {
      currentStreak: 0,
      bestStreak: 0,
      sessionsCompleted: 0,
      totalPositionsSolved: 0,
      coachedGamesCompleted: 0,
      coachWins: 0,
      coachLosses: 0,
      coachDraws: 0,
    },
    activeTheme: THEME_ORDER[0]!,
    lessonProgress: createLessonProgress(),
    coachGames: [],
    activeCoachGame: null,
    settings: createDefaultSettings(),
  };
}

function normalizeTheme(theme: unknown): ThemeId {
  return THEME_ORDER.includes(theme as ThemeId) ? (theme as ThemeId) : THEME_ORDER[0]!;
}

function normalizeProgress(progress: unknown, fallback: Record<string, PositionProgress>) {
  if (!progress || typeof progress !== "object") {
    return fallback;
  }

  return curriculum.reduce<Record<string, PositionProgress>>((accumulator, position) => {
    const candidate = (progress as Record<string, Partial<PositionProgress>>)[position.id];
    accumulator[position.id] = candidate
      ? {
          positionId: position.id,
          masteryStage: Math.min(4, Math.max(0, candidate.masteryStage ?? 0)) as 0 | 1 | 2 | 3 | 4,
          dueAt: candidate.dueAt ?? new Date(0).toISOString(),
          lastSeenAt: candidate.lastSeenAt ?? null,
          attempts: candidate.attempts ?? 0,
          recentRatings: Array.isArray(candidate.recentRatings)
            ? candidate.recentRatings.slice(-7)
            : [],
        }
      : fallback[position.id]!;
    return accumulator;
  }, {});
}

function normalizeLessonProgress(progress: unknown): LessonProgress {
  const base = createLessonProgress();

  if (!progress || typeof progress !== "object") {
    return base;
  }

  const candidate = progress as Partial<LessonProgress>;
  const completedLessonIds = Array.isArray(candidate.completedLessonIds)
    ? candidate.completedLessonIds.filter((lessonId): lessonId is LessonId =>
        LESSON_ORDER.includes(lessonId as LessonId),
      )
    : [];

  const lessonStatus = LESSON_ORDER.reduce<LessonProgress["lessonStatus"]>((accumulator, lessonId) => {
    const rawStatus = candidate.lessonStatus?.[lessonId];
    accumulator[lessonId] = rawStatus
      ? {
          completed: Boolean(rawStatus.completed),
          completedAt: rawStatus.completedAt ?? null,
        }
      : base.lessonStatus[lessonId];
    return accumulator;
  }, {} as LessonProgress["lessonStatus"]);

  return {
    completedLessonIds,
    currentLessonId: LESSON_ORDER.includes(candidate.currentLessonId as LessonId)
      ? (candidate.currentLessonId as LessonId)
      : completedLessonIds.length > 0
        ? completedLessonIds[completedLessonIds.length - 1]!
        : base.currentLessonId,
    lessonStatus,
  };
}

function normalizeSettings(settings: unknown): AppSettings {
  const defaults = createDefaultSettings();

  if (!settings || typeof settings !== "object") {
    return defaults;
  }

  const candidate = settings as Partial<AppSettings>;

  return {
    coachEnabled: candidate.coachEnabled ?? defaults.coachEnabled,
    allowTakebacks: candidate.allowTakebacks ?? defaults.allowTakebacks,
    coachStrictness:
      candidate.coachStrictness === "gentle" ? "gentle" : defaults.coachStrictness,
    engineSkill:
      ([1, 2, 3, 4, 5] as const).find((skill) => skill === candidate.engineSkill) ??
      defaults.engineSkill,
    moveTimeMs:
      typeof candidate.moveTimeMs === "number" && candidate.moveTimeMs > 100
        ? candidate.moveTimeMs
        : defaults.moveTimeMs,
    preferredColor: candidate.preferredColor === "b" ? "b" : defaults.preferredColor,
  };
}

function normalizeLegacyActiveSession(session: unknown): ActiveDrillSessionState | null {
  if (!session || typeof session !== "object") {
    return null;
  }

  const candidate = session as Partial<ActiveDrillSessionState> & {
    order?: string[];
    currentIndex?: number;
    ratingsByPosition?: Record<string, string>;
    completedOrder?: string[];
    startedAt?: string;
    date?: string;
  };

  if (!Array.isArray(candidate.order) || typeof candidate.currentIndex !== "number") {
    return null;
  }

  return {
    date: candidate.date ?? "",
    order: candidate.order,
    currentIndex: candidate.currentIndex,
    ratingsByPosition: (candidate.ratingsByPosition ?? {}) as Record<string, never>,
    completedOrder: candidate.completedOrder ?? [],
    startedAt: candidate.startedAt ?? new Date().toISOString(),
  };
}

export function normalizeState(raw: unknown): PersistedAppState {
  const defaults = createDefaultState();

  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const candidate = raw as Partial<PersistedAppState> & {
    activeSession?: unknown;
  };

  return {
    version: 2,
    progress: normalizeProgress(candidate.progress, defaults.progress),
    sessions: candidate.sessions ?? {},
    activeDrillSession:
      normalizeLegacyActiveSession(candidate.activeDrillSession) ??
      normalizeLegacyActiveSession(candidate.activeSession),
    userStats: {
      ...defaults.userStats,
      ...(candidate.userStats ?? {}),
    },
    activeTheme: normalizeTheme(candidate.activeTheme),
    lessonProgress: normalizeLessonProgress(candidate.lessonProgress),
    coachGames: Array.isArray(candidate.coachGames) ? candidate.coachGames : [],
    activeCoachGame: candidate.activeCoachGame ?? null,
    settings: normalizeSettings(candidate.settings),
  };
}

export async function loadAppState() {
  const db = await openDatabase();

  return new Promise<PersistedAppState>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(ROOT_KEY);

    request.onsuccess = () => {
      resolve(normalizeState(request.result));
    };

    request.onerror = () => reject(request.error);
  });
}

export async function saveAppState(state: PersistedAppState) {
  const db = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(state, ROOT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
