export type ThemeId =
  | "opening-principles"
  | "mate-in-1"
  | "mate-in-2"
  | "forks"
  | "pins-skewers"
  | "hanging-pieces"
  | "back-rank"
  | "king-pawn-endgames";

export type LessonId =
  | "rules-and-board-vision"
  | "opening-habits"
  | "checks-captures-threats"
  | "stop-hanging-pieces"
  | "core-tactics"
  | "mating-patterns"
  | "basic-endgames";

export type TrainingPosition = {
  id: string;
  theme: ThemeId;
  fen: string;
  sideToMove: "w" | "b";
  prompt: string;
  solutionMoves: string[];
  explanation: string;
  difficulty: 1 | 2 | 3;
};

export type ReviewRating = "missed" | "hard" | "good" | "easy";

export type PositionProgress = {
  positionId: string;
  masteryStage: 0 | 1 | 2 | 3 | 4;
  dueAt: string;
  lastSeenAt: string | null;
  attempts: number;
  recentRatings: ReviewRating[];
};

export type DailySession = {
  date: string;
  warmupIds: string[];
  coreIds: string[];
  weakSpotIds: string[];
  completed: boolean;
};

export type ThemeMeta = {
  id: ThemeId;
  title: string;
  shortLabel: string;
  description: string;
  accent: string;
};

export type ThemeProgressSummary = {
  theme: ThemeMeta;
  dueCount: number;
  masteredCount: number;
  totalCount: number;
  averageStage: number;
  stageTwoOrBetterRatio: number;
};

export type ActiveDrillSessionState = {
  date: string;
  order: string[];
  currentIndex: number;
  ratingsByPosition: Record<string, ReviewRating>;
  completedOrder: string[];
  startedAt: string;
};

export type SessionSummary = {
  total: number;
  ratings: Record<ReviewRating, number>;
  themes: ThemeId[];
};

export type FeedbackClassification =
  | "great"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export type CoachTag =
  | "development"
  | "king-safety"
  | "center-control"
  | "hanging-piece"
  | "missed-tactic"
  | "mate-threat"
  | "piece-activity"
  | "endgame-technique";

export type EngineAnalysis = {
  fen: string;
  bestMoveUci: string;
  bestMoveSan: string;
  scoreCp: number | null;
  mateIn: number | null;
  depth: number;
  pvUci: string[];
  pvSan: string[];
};

export type CoachFeedback = {
  classification: FeedbackClassification;
  cpLoss: number;
  summary: string;
  detail: string;
  lessonId: LessonId;
  lessonTitle: string;
  lessonTieIn: string;
  nextHabit: string;
  suggestedMoveUci: string;
  suggestedMoveSan: string;
  engineReplyUci: string | null;
  tags: CoachTag[];
  lineSan: string[];
};

export type CoachMoveRecord = {
  ply: number;
  side: "w" | "b";
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  isPlayer: boolean;
  playedAt: string;
  classification: FeedbackClassification | null;
  feedback: CoachFeedback | null;
};

export type ActiveCoachGame = {
  id: string;
  startFen: string;
  currentFen: string;
  playerColor: "w" | "b";
  status: "player-turn" | "coach-review" | "engine-turn" | "finished";
  moveRecords: CoachMoveRecord[];
  startedAt: string;
  finishedAt: string | null;
  result: string | null;
  pendingFeedback: CoachFeedback | null;
};

export type StoredCoachGame = {
  id: string;
  startFen: string;
  finalFen: string;
  playerColor: "w" | "b";
  startedAt: string;
  finishedAt: string;
  result: string;
  pgn: string;
  moveRecords: CoachMoveRecord[];
  mistakeCount: number;
  blunderCount: number;
  focusTags: CoachTag[];
};

export type LessonStatus = {
  completed: boolean;
  completedAt: string | null;
};

export type LessonProgress = {
  completedLessonIds: LessonId[];
  currentLessonId: LessonId;
  lessonStatus: Record<LessonId, LessonStatus>;
};

export type AppSettings = {
  coachEnabled: boolean;
  allowTakebacks: boolean;
  coachStrictness: "gentle" | "standard";
  engineSkill: 1 | 2 | 3 | 4 | 5;
  moveTimeMs: number;
  preferredColor: "w" | "b";
};

export type UserStats = {
  currentStreak: number;
  bestStreak: number;
  sessionsCompleted: number;
  totalPositionsSolved: number;
  coachedGamesCompleted: number;
  coachWins: number;
  coachLosses: number;
  coachDraws: number;
};

export type PersistedAppState = {
  version: 2;
  progress: Record<string, PositionProgress>;
  sessions: Record<string, DailySession>;
  activeDrillSession: ActiveDrillSessionState | null;
  userStats: UserStats;
  activeTheme: ThemeId;
  lessonProgress: LessonProgress;
  coachGames: StoredCoachGame[];
  activeCoachGame: ActiveCoachGame | null;
  settings: AppSettings;
};
