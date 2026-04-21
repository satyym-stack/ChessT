import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess, type Square } from "chess.js";
import { curriculum } from "./data/curriculum";
import {
  LESSONS,
  chooseLessonForFeedback,
  lessonById,
  lessonForCoachTag,
  lessonHabitCopy,
} from "./data/lessons";
import { themeById } from "./data/themes";
import { diffInDays, toLocalDateKey } from "./lib/date";
import {
  applyUciMoveToFen,
  buildCoachFeedback,
  createFallbackAnalysis,
  createCoachGame,
  finalizeStoredCoachGame,
  finishGameIfOver,
  makeMoveRecord,
  materialBalance,
} from "./lib/coach";
import { getStockfishClient } from "./lib/engine";
import { updateProgressAfterRating } from "./lib/repetition";
import { buildDailySession, chooseActiveTheme, summarizeThemes } from "./lib/session";
import { createDefaultState, loadAppState, normalizeState, saveAppState } from "./lib/storage";
import type {
  ActiveCoachGame,
  ActiveDrillSessionState,
  CoachFeedback,
  CoachMoveRecord,
  CoachTag,
  EngineAnalysis,
  FeedbackClassification,
  LessonId,
  PersistedAppState,
  ReviewRating,
  StoredCoachGame,
  ThemeProgressSummary,
  TrainingPosition,
} from "./types";

type ViewId = "learn" | "coach" | "drills" | "review" | "progress";

const POSITION_MAP = Object.fromEntries(
  curriculum.map((position) => [position.id, position]),
) as Record<string, TrainingPosition>;

function getPosition(positionId: string) {
  const position = POSITION_MAP[positionId];

  if (!position) {
    throw new Error(`Missing position ${positionId}`);
  }

  return position;
}

function resultLabel(result: string) {
  return {
    win: "Win",
    loss: "Loss",
    draw: "Draw",
  }[result] ?? result;
}

function formatCoachTag(tag: CoachTag) {
  return tag.replace("-", " ");
}

function classificationRank(classification: FeedbackClassification | null) {
  return {
    great: 0,
    good: 1,
    inaccuracy: 2,
    mistake: 3,
    blunder: 4,
  }[classification ?? "great"];
}

function checkedKingSquare(fen: string) {
  const chess = new Chess(fen);
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

  if (!chess.inCheck()) {
    return null;
  }

  const board = chess.board();

  for (let rankIndex = 0; rankIndex < board.length; rankIndex += 1) {
    for (let fileIndex = 0; fileIndex < board[rankIndex]!.length; fileIndex += 1) {
      const piece = board[rankIndex]![fileIndex];

      if (piece && piece.type === "k" && piece.color === chess.turn()) {
        return `${files[fileIndex]}${8 - rankIndex}`;
      }
    }
  }

  return null;
}

function resolveFeedbackLesson(feedback: CoachFeedback, fallbackLessonId: LessonId) {
  const lessonId =
    feedback.lessonId ?? chooseLessonForFeedback(fallbackLessonId, feedback.tags).id;
  const lesson = lessonById(lessonId);
  const habitCopy = lessonHabitCopy(lessonId);

  return {
    lessonId,
    lessonTitle: feedback.lessonTitle ?? lesson.title,
    lessonTieIn: feedback.lessonTieIn ?? habitCopy.tieIn,
    nextHabit: feedback.nextHabit ?? habitCopy.nextHabit,
  };
}

function strongestPlayerFeedback(game: StoredCoachGame) {
  return game.moveRecords
    .filter((record): record is CoachMoveRecord & { feedback: CoachFeedback } => {
      return record.isPlayer && record.feedback !== null;
    })
    .sort((left, right) => {
      const rankGap =
        classificationRank(right.feedback.classification) -
        classificationRank(left.feedback.classification);

      if (rankGap !== 0) {
        return rankGap;
      }

      return right.feedback.cpLoss - left.feedback.cpLoss;
    })[0] ?? null;
}

function summarizeDrillSession(session: ActiveDrillSessionState | null) {
  if (!session) {
    return {
      total: 0,
      ratings: { missed: 0, hard: 0, good: 0, easy: 0 } as Record<ReviewRating, number>,
      themes: [] as string[],
    };
  }

  const ratings = { missed: 0, hard: 0, good: 0, easy: 0 } as Record<ReviewRating, number>;
  Object.values(session.ratingsByPosition).forEach((rating) => {
    ratings[rating] += 1;
  });

  return {
    total: session.completedOrder.length,
    ratings,
    themes: Array.from(new Set(session.completedOrder.map((id) => getPosition(id).theme))),
  };
}

function updateDrillStatsForCompletion(
  previousState: PersistedAppState,
  dateKey: string,
  solvedCount: number,
) {
  const sessions = Object.values(previousState.sessions)
    .filter((session) => session.completed)
    .sort((left, right) => left.date.localeCompare(right.date));
  const filteredSessions = sessions.filter((session) => session.date < dateKey);
  const lastCompletedBeforeToday =
    filteredSessions.length > 0
      ? filteredSessions[filteredSessions.length - 1]!.date
      : undefined;

  const currentStreak =
    lastCompletedBeforeToday &&
    diffInDays(new Date(lastCompletedBeforeToday), new Date(dateKey)) === 1
      ? previousState.userStats.currentStreak + 1
      : 1;

  return {
    ...previousState.userStats,
    currentStreak,
    bestStreak: Math.max(previousState.userStats.bestStreak, currentStreak),
    sessionsCompleted: previousState.userStats.sessionsCompleted + 1,
    totalPositionsSolved: previousState.userStats.totalPositionsSolved + solvedCount,
  };
}

function finishCoachGameInState(state: PersistedAppState, game: ActiveCoachGame) {
  const stored = finalizeStoredCoachGame(game);
  const nextStats = {
    ...state.userStats,
    coachedGamesCompleted: state.userStats.coachedGamesCompleted + 1,
    coachWins: state.userStats.coachWins + (stored.result === "win" ? 1 : 0),
    coachLosses: state.userStats.coachLosses + (stored.result === "loss" ? 1 : 0),
    coachDraws: state.userStats.coachDraws + (stored.result === "draw" ? 1 : 0),
  };

  return {
    ...state,
    activeCoachGame: null,
    coachGames: [stored, ...state.coachGames].slice(0, 24),
    userStats: nextStats,
  };
}

function addEngineReplyToGame(game: ActiveCoachGame, analysis: EngineAnalysis) {
  if (!analysis.bestMoveUci) {
    return game;
  }

  const applied = applyUciMoveToFen(game.currentFen, analysis.bestMoveUci);
  const engineRecord = makeMoveRecord({
    chessBeforeFen: game.currentFen,
    move: applied.move,
    isPlayer: false,
    feedback: null,
  });
  const nextGame: ActiveCoachGame = {
    ...game,
    currentFen: applied.chess.fen(),
    status: "player-turn",
    pendingFeedback: null,
    moveRecords: [...game.moveRecords, engineRecord],
  };

  return finishGameIfOver(nextGame);
}

function shouldPauseForCoach(
  feedback: CoachFeedback,
  strictness: "gentle" | "standard",
) {
  if (feedback.classification === "blunder") {
    return true;
  }

  if (feedback.classification === "mistake") {
    return true;
  }

  return strictness === "standard" && feedback.classification === "inaccuracy";
}

function Nav({
  activeView,
  onChange,
}: {
  activeView: ViewId;
  onChange: (view: ViewId) => void;
}) {
  const items: { id: ViewId; label: string }[] = [
    { id: "learn", label: "Learn" },
    { id: "coach", label: "Coach" },
    { id: "drills", label: "Drills" },
    { id: "review", label: "Review" },
    { id: "progress", label: "Progress" },
  ];

  return (
    <nav className="nav">
      {items.map((item) => (
        <button
          key={item.id}
          className={`nav__button ${item.id === activeView ? "is-active" : ""}`}
          type="button"
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="stat-card">
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
      <p className="stat-card__detail">{detail}</p>
    </article>
  );
}

function ThemeMeter({ summary }: { summary: ThemeProgressSummary }) {
  return (
    <article className="theme-card">
      <div className="theme-card__head">
        <div>
          <span className="theme-pill" style={{ backgroundColor: summary.theme.accent }}>
            {summary.theme.shortLabel}
          </span>
          <h3>{summary.theme.title}</h3>
        </div>
        <strong>{Math.round(summary.averageStage * 25)}%</strong>
      </div>
      <p>{summary.theme.description}</p>
      <div className="theme-card__meter">
        <div
          className="theme-card__meter-fill"
          style={{
            width: `${Math.max(8, Math.round(summary.stageTwoOrBetterRatio * 100))}%`,
            backgroundColor: summary.theme.accent,
          }}
        />
      </div>
      <div className="theme-card__stats">
        <span>{summary.masteredCount}/{summary.totalCount} automatic</span>
        <span>{summary.dueCount} due now</span>
      </div>
    </article>
  );
}

function LearnView({
  state,
  onMarkComplete,
  onFocusTheme,
  onOpenCoach,
}: {
  state: PersistedAppState;
  onMarkComplete: (lessonId: (typeof LESSONS)[number]["id"]) => void;
  onFocusTheme: (themeId: (typeof LESSONS)[number]["focusTheme"]) => void;
  onOpenCoach: () => void;
}) {
  const currentLesson = lessonById(state.lessonProgress.currentLessonId);

  return (
    <section className="panel page-grid">
      <div className="hero">
        <div>
          <span className="eyebrow">Systematic path</span>
          <h1>Learn chess in a beginner-friendly order, then test it in real games.</h1>
          <p>
            Each lesson teaches one habit, points you to repetitions, and gives you
            a real coach mode where the app plays back and corrects your mistakes.
          </p>
        </div>
        <button className="primary-button" type="button" onClick={onOpenCoach}>
          Open Coach Mode
        </button>
      </div>

      <div className="today-panels">
        <article className="callout">
          <span className="eyebrow">Current lesson</span>
          <h2>{currentLesson.title}</h2>
          <p>{currentLesson.summary}</p>
          <p>{currentLesson.whyItMatters}</p>
        </article>
        <article className="callout">
          <span className="eyebrow">How to use this app daily</span>
          <ul className="flat-list">
            <li>Read one lesson and focus on one idea.</li>
            <li>Play one coached game and accept corrections.</li>
            <li>Finish a short drill session on the same theme.</li>
          </ul>
        </article>
      </div>

      <div className="lesson-grid">
        {LESSONS.map((lesson, index) => {
          const status = state.lessonProgress.lessonStatus[lesson.id];
          const unlocked =
            index === 0 || state.lessonProgress.lessonStatus[LESSONS[index - 1]!.id].completed;

          return (
            <article
              key={lesson.id}
              className={`lesson-card ${state.lessonProgress.currentLessonId === lesson.id ? "is-active" : ""}`}
            >
              <div className="lesson-card__head">
                <div>
                  <span className="eyebrow">Lesson {index + 1}</span>
                  <h3>{lesson.title}</h3>
                </div>
                <span className={`status-chip ${status.completed ? "is-done" : unlocked ? "is-open" : "is-locked"}`}>
                  {status.completed ? "Done" : unlocked ? "Open" : "Locked"}
                </span>
              </div>
              <p>{lesson.summary}</p>
              <ul className="flat-list">
                {lesson.keyIdeas.map((idea) => (
                  <li key={idea}>{idea}</li>
                ))}
              </ul>
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onFocusTheme(lesson.focusTheme)}
                  disabled={!unlocked}
                >
                  Practice {themeById(lesson.focusTheme).shortLabel}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onMarkComplete(lesson.id)}
                  disabled={!unlocked || status.completed}
                >
                  {status.completed ? "Completed" : "Mark Complete"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CoachBoard({
  fen,
  orientation,
  interactive,
  lastMove,
  onDrop,
}: {
  fen: string;
  orientation: "white" | "black";
  interactive: boolean;
  lastMove: Pick<CoachMoveRecord, "uci"> | null;
  onDrop: (source: string, target: string) => boolean;
}) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const chess = useMemo(() => new Chess(fen), [fen]);
  const turn = chess.turn();
  const activeCheckSquare = useMemo(() => checkedKingSquare(fen), [fen]);
  const legalTargets = useMemo(() => {
    if (!selectedSquare) {
      return [] as string[];
    }

    try {
      return chess
        .moves({ square: selectedSquare as Square, verbose: true })
        .map((move) => move.to);
    } catch {
      return [] as string[];
    }
  }, [chess, selectedSquare]);
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    if (lastMove?.uci) {
      const fromSquare = lastMove.uci.slice(0, 2);
      const toSquare = lastMove.uci.slice(2, 4);

      [fromSquare, toSquare].forEach((square) => {
        styles[square] = {
          background: "rgba(215, 179, 73, 0.34)",
        };
      });
    }

    if (activeCheckSquare) {
      styles[activeCheckSquare] = {
        ...(styles[activeCheckSquare] ?? {}),
        background:
          "radial-gradient(circle, rgba(180, 48, 48, 0.42) 0%, rgba(180, 48, 48, 0.14) 58%, transparent 60%)",
        boxShadow: "inset 0 0 0 3px rgba(180, 48, 48, 0.8)",
      };
    }

    if (selectedSquare) {
      styles[selectedSquare] = {
        background:
          "radial-gradient(circle, rgba(201, 107, 44, 0.45) 0%, rgba(201, 107, 44, 0.2) 55%, transparent 56%)",
        boxShadow: "inset 0 0 0 3px rgba(201, 107, 44, 0.85)",
      };
    }

    legalTargets.forEach((square) => {
      styles[square] = {
        ...(styles[square] ?? {}),
        background:
          "radial-gradient(circle, rgba(28, 115, 175, 0.38) 0%, rgba(28, 115, 175, 0.18) 36%, transparent 38%)",
      };
    });

    return styles;
  }, [activeCheckSquare, lastMove, legalTargets, selectedSquare]);

  useEffect(() => {
    setSelectedSquare(null);
  }, [fen]);

  function handleSquareSelection(square: string) {
    if (!interactive) {
      return;
    }

    const piece = chess.get(square as Square);

    if (!selectedSquare) {
      if (piece && piece.color === turn) {
        setSelectedSquare(square);
      }
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }

    if (piece && piece.color === turn) {
      setSelectedSquare(square);
      return;
    }

    const moved = onDrop(selectedSquare, square);

    if (moved) {
      setSelectedSquare(null);
    }
  }

  return (
    <div className="board-card">
      <div className="board-card__surface">
        <Chessboard
          options={{
            id: `coach-${orientation}`,
            position: fen,
            boardOrientation: orientation,
            allowDragging: interactive,
            squareStyles,
            canDragPiece: ({ square }) => {
              if (!interactive || !square) {
                return false;
              }

              return chess.get(square as Square)?.color === turn;
            },
            onPieceClick: ({ square }) => {
              if (square) {
                handleSquareSelection(square);
              }
            },
            onSquareClick: ({ square }) => {
              handleSquareSelection(square);
            },
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              sourceSquare && targetSquare
                ? (() => {
                    const moved = onDrop(sourceSquare, targetSquare);

                    if (moved) {
                      setSelectedSquare(null);
                    }

                    return moved;
                  })()
                : false,
          }}
        />
      </div>
    </div>
  );
}

function CoachView({
  state,
  displayFen,
  analysis,
  analysisError,
  analysisLoading,
  coachBusy,
  onStartNewGame,
  onDrop,
  onUndo,
  onContinue,
  onSettingChange,
}: {
  state: PersistedAppState;
  displayFen: string | null;
  analysis: EngineAnalysis | null;
  analysisError: string | null;
  analysisLoading: boolean;
  coachBusy: boolean;
  onStartNewGame: () => void;
  onDrop: (source: string, target: string) => boolean;
  onUndo: () => void;
  onContinue: () => void;
  onSettingChange: <K extends keyof PersistedAppState["settings"]>(
    key: K,
    value: PersistedAppState["settings"][K],
  ) => void;
}) {
  const activeGame = state.activeCoachGame;
  const feedback = activeGame?.pendingFeedback;
  const currentLesson = lessonById(state.lessonProgress.currentLessonId);
  const currentLessonHabit = lessonHabitCopy(currentLesson.id);
  const orientation = state.settings.preferredColor === "w" ? "white" : "black";
  const coachStatusText = activeGame
    ? activeGame.status === "engine-turn"
      ? "The coach is choosing a reply..."
      : activeGame.status === "coach-review"
        ? "The coach stopped the game so you can learn from this move."
        : coachBusy
          ? "Applying your move..."
          : "Your move."
    : "Start a fresh coached game from the normal chess starting position.";
  const material =
    activeGame === null
      ? 0
      : materialBalance(displayFen ?? activeGame.currentFen, activeGame.playerColor);
  const lastMove =
    activeGame && activeGame.moveRecords.length > 0
      ? activeGame.moveRecords[activeGame.moveRecords.length - 1]!
      : null;
  const feedbackLesson = feedback
    ? resolveFeedbackLesson(feedback, state.lessonProgress.currentLessonId)
    : null;

  return (
    <section className="panel page-grid">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Coach Mode</span>
          <h2>Play a real game and let the app correct you as you go.</h2>
        </div>
        <button className="primary-button" type="button" onClick={onStartNewGame}>
          {activeGame ? "Restart Game" : "Start Coached Game"}
        </button>
      </div>

      <div className="coach-grid">
        <article className="callout">
          <span className="eyebrow">Coach settings</span>
          <div className="settings-grid">
            <label>
              <span>Coach corrections</span>
              <select
                value={state.settings.coachEnabled ? "on" : "off"}
                onChange={(event) =>
                  onSettingChange("coachEnabled", event.target.value === "on")
                }
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label>
              <span>Strictness</span>
              <select
                value={state.settings.coachStrictness}
                onChange={(event) =>
                  onSettingChange(
                    "coachStrictness",
                    event.target.value as PersistedAppState["settings"]["coachStrictness"],
                  )
                }
              >
                <option value="gentle">Gentle</option>
                <option value="standard">Standard</option>
              </select>
            </label>
            <label>
              <span>Opponent strength</span>
              <select
                value={state.settings.engineSkill}
                onChange={(event) =>
                  onSettingChange("engineSkill", Number(event.target.value) as 1 | 2 | 3 | 4 | 5)
                }
              >
                <option value="1">Very easy</option>
                <option value="2">Easy</option>
                <option value="3">Medium</option>
                <option value="4">Tough</option>
                <option value="5">Hard</option>
              </select>
            </label>
            <label>
              <span>Your color</span>
              <select
                value={state.settings.preferredColor}
                onChange={(event) =>
                  onSettingChange("preferredColor", event.target.value as "w" | "b")
                }
              >
                <option value="w">White</option>
                <option value="b">Black</option>
              </select>
            </label>
          </div>
        </article>

        <article className="callout">
          <span className="eyebrow">Live coaching</span>
          <p>{coachStatusText}</p>
          <p>
            Current lesson: <strong>{currentLesson.title}</strong>
          </p>
          <p>
            Material balance: <strong>{material > 0 ? `+${material}` : material}</strong>
          </p>
          {analysis && activeGame?.status === "player-turn" && (
            <p>
              Coach prep: best move seen is <strong>{analysis.bestMoveSan}</strong> at depth {analysis.depth}.
            </p>
          )}
          {analysisError && (
            <p>
              Engine fallback active: the built-in local coach is replying while the
              Stockfish worker is unavailable.
            </p>
          )}
          {analysisLoading && activeGame?.status === "player-turn" && (
            <p>The coach is loading its suggestion in the background. You can still move now.</p>
          )}
        </article>
      </div>

      {activeGame ? (
        <div className="session-layout coach-session-layout">
          <div className="session-meta">
            <span className="eyebrow">Game board</span>
            <h2>{coachStatusText}</h2>
            <p className="session-theme">
              You are playing {activeGame.playerColor === "w" ? "White" : "Black"}.
            </p>
            <p>
              The engine replies locally in your browser, so your games and mistakes
              stay on your machine.
            </p>
            <div className="callout">
              <span className="eyebrow">Current habit</span>
              <p>{currentLessonHabit.nextHabit}</p>
            </div>
            <div className="move-list">
              {activeGame.moveRecords.slice(-8).map((record) => (
                <span key={`${record.ply}-${record.san}`} className="answer-chip">
                  {record.ply}. {record.san}
                </span>
              ))}
            </div>
          </div>

          <CoachBoard
            fen={displayFen ?? activeGame.currentFen}
            orientation={orientation}
            interactive={activeGame.status === "player-turn" && !coachBusy}
            lastMove={lastMove}
            onDrop={onDrop}
          />

          <div className="coach-panel">
            <span className="eyebrow">Coach feedback</span>
            {feedback ? (
              <div className="solution-box">
                <strong className={`feedback-title is-${feedback.classification}`}>
                  {feedback.summary}
                </strong>
                <p>{feedback.detail}</p>
                {feedbackLesson && (
                  <>
                    <p>
                      Lesson tie-in: <strong>{feedbackLesson.lessonTitle}</strong>
                    </p>
                    <p>{feedbackLesson.lessonTieIn}</p>
                    <p>
                      Next habit: <strong>{feedbackLesson.nextHabit}</strong>
                    </p>
                  </>
                )}
                <p>
                  Best move: <strong>{feedback.suggestedMoveSan}</strong>
                </p>
                {feedback.lineSan.length > 0 && (
                  <p>Coach line: {feedback.lineSan.join(" ")}</p>
                )}
                <div className="answer-row">
                  {feedback.tags.map((tag) => (
                    <span key={tag} className="answer-chip">
                      {tag.replace("-", " ")}
                    </span>
                  ))}
                </div>
                <div className="button-row">
                  <button className="secondary-button" type="button" onClick={onUndo}>
                    Undo and Retry
                  </button>
                  <button className="primary-button" type="button" onClick={onContinue}>
                    Continue Anyway
                  </button>
                </div>
              </div>
            ) : (
              <p>
                The coach will explain your move quality here and pause when you make
                a serious beginner mistake.
              </p>
            )}
          </div>
        </div>
      ) : (
        <article className="callout">
          <span className="eyebrow">What this mode does</span>
          <ul className="flat-list">
            <li>You play a real game from the starting position.</li>
            <li>The engine responds locally in the browser.</li>
            <li>Bad moves get explained in beginner-friendly language.</li>
            <li>You can undo and retry instead of just losing silently.</li>
          </ul>
        </article>
      )}
    </section>
  );
}

function DrillSessionPanel({
  state,
  onStart,
  onRate,
}: {
  state: PersistedAppState;
  onStart: () => void;
  onRate: (rating: ReviewRating) => void;
}) {
  const session = state.activeDrillSession;
  const todayKey = toLocalDateKey(new Date());

  if (!session) {
    const dueCount = Object.values(state.progress).filter(
      (progress) => new Date(progress.dueAt).getTime() <= Date.now(),
    ).length;

    return (
      <section className="panel page-grid">
        <div className="hero">
          <div>
            <span className="eyebrow">Drills</span>
            <h1>Repeat the patterns you keep missing until they feel automatic.</h1>
            <p>
              The drill mode is your repetition engine. It is separate from coach
              mode so you can hammer one pattern after a real game exposes it.
            </p>
          </div>
          <button className="primary-button" type="button" onClick={onStart}>
            {state.sessions[todayKey]?.completed ? "Run Another Drill Session" : "Start Daily Drills"}
          </button>
        </div>

        <div className="stats-grid">
          <StatCard
            label="Due now"
            value={dueCount}
            detail="Patterns scheduled to come back right now."
          />
          <StatCard
            label="Focus theme"
            value={themeById(state.activeTheme).title}
            detail="The next reps are pulled from this learning lane."
          />
          <StatCard
            label="Current streak"
            value={`${state.userStats.currentStreak} days`}
            detail="Complete one drill session a day to keep the streak moving."
          />
        </div>
      </section>
    );
  }

  const positionId = session.order[session.currentIndex]!;
  const position = getPosition(positionId);
  const expectedSan = position.solutionMoves[0];
  const [boardFen, setBoardFen] = useState(position.fen);
  const [userMoveSan, setUserMoveSan] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    setBoardFen(position.fen);
    setUserMoveSan(null);
    setIsRevealed(false);
  }, [position.id, position.fen]);

  function onPieceDrop(sourceSquare: string, targetSquare: string) {
    if (userMoveSan) {
      return false;
    }

    const chess = new Chess(position.fen);
    const move =
      chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      }) ?? null;

    if (!move) {
      return false;
    }

    setBoardFen(chess.fen());
    setUserMoveSan(move.san);
    return true;
  }

  return (
    <section className="panel session-layout">
      <div className="session-meta">
        <span className="eyebrow">Drill Session</span>
        <h2>
          Rep {session.currentIndex + 1} of {session.order.length}
        </h2>
        <p className="session-theme">{themeById(position.theme).title}</p>
        <p>{position.prompt}</p>
        <div className="session-progress-track">
          <div
            className="session-progress-track__fill"
            style={{
              width: `${Math.round((session.currentIndex / session.order.length) * 100)}%`,
            }}
          />
        </div>
      </div>

      <div className="board-card">
        <div className="board-card__surface">
          <Chessboard
            options={{
              id: `drill-${position.id}`,
              position: boardFen,
              allowDragging: !isRevealed && !userMoveSan,
              onPieceDrop: ({ sourceSquare, targetSquare }) =>
                sourceSquare && targetSquare
                  ? onPieceDrop(sourceSquare, targetSquare)
                  : false,
            }}
          />
        </div>
      </div>

      <div className="coach-panel">
        <span className="eyebrow">Your answer</span>
        <p>
          {userMoveSan
            ? userMoveSan === expectedSan
              ? "Correct pattern."
              : "Different move than the stored solution."
            : "Play the move you think is strongest, then reveal the answer."}
        </p>
        <div className="answer-row">
          <span className="answer-chip">
            {userMoveSan ? `You played ${userMoveSan}` : `${position.sideToMove === "w" ? "White" : "Black"} to move`}
          </span>
          <span className="answer-chip">Stored line starts with {expectedSan}</span>
        </div>
        {!isRevealed ? (
          <button className="secondary-button" type="button" onClick={() => setIsRevealed(true)}>
            Reveal Solution
          </button>
        ) : (
          <div className="solution-box">
            <strong>Solution</strong>
            <p>{position.solutionMoves.join(" ")}</p>
            <p>{position.explanation}</p>
            <div className="rating-grid">
              {(["missed", "hard", "good", "easy"] as ReviewRating[]).map((rating) => (
                <button
                  key={rating}
                  className="rating-button"
                  type="button"
                  onClick={() => onRate(rating)}
                >
                  {rating}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ReviewView({ coachGames }: { coachGames: StoredCoachGame[] }) {
  const repeatedTags = coachGames
    .flatMap((game) => game.focusTags)
    .reduce<Record<string, number>>((accumulator, tag) => {
      accumulator[tag] = (accumulator[tag] ?? 0) + 1;
      return accumulator;
    }, {});
  const topTagEntry = Object.entries(repeatedTags).sort((left, right) => right[1] - left[1])[0];
  const topLesson =
    topTagEntry && lessonById(lessonForCoachTag(topTagEntry[0] as CoachTag));
  const topLessonHabit = topLesson ? lessonHabitCopy(topLesson.id) : null;

  return (
    <section className="panel page-grid">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Review</span>
          <h2>Turn your real games into lessons.</h2>
        </div>
        <p>
          Review is where repeated mistakes become next-session training priorities.
        </p>
      </div>

      <div className="stats-grid">
        {topLesson && topLessonHabit && (
          <StatCard
            label="Revisit next"
            value={topLesson.title}
            detail={topLessonHabit.nextHabit}
          />
        )}
        {topTagEntry && (
          <StatCard
            label="Most repeated issue"
            value={formatCoachTag(topTagEntry[0] as CoachTag)}
            detail={`${topTagEntry[1]} recent coach flags point here.`}
          />
        )}
        {Object.entries(repeatedTags)
          .sort((left, right) => right[1] - left[1])
          .slice(0, 4)
          .map(([tag, count]) => (
            <StatCard
              key={tag}
              label={formatCoachTag(tag as CoachTag)}
              value={count}
              detail="Repeated feedback tag from your recent coach games."
            />
          ))}
      </div>

      <div className="review-grid">
        {coachGames.length === 0 ? (
          <article className="callout">
            <span className="eyebrow">No games yet</span>
            <p>Play a coached game and your mistakes will be summarized here.</p>
          </article>
        ) : (
          coachGames.map((game) => (
            (() => {
              const biggestIssue = strongestPlayerFeedback(game);
              const issueLesson =
                biggestIssue?.feedback
                  ? resolveFeedbackLesson(biggestIssue.feedback, "rules-and-board-vision")
                  : null;

              return (
                <article key={game.id} className="review-card">
                  <div className="review-card__head">
                    <div>
                      <span className="eyebrow">Coached game</span>
                      <h3>{resultLabel(game.result)}</h3>
                    </div>
                    <span className="answer-chip">
                      {new Date(game.finishedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p>
                    {game.mistakeCount} mistakes, {game.blunderCount} blunders
                  </p>
                  {biggestIssue?.feedback && issueLesson && (
                    <div className="solution-box">
                      <p>
                        Biggest turning point: <strong>{biggestIssue.san}</strong> was a{" "}
                        <strong>{biggestIssue.feedback.classification}</strong>.
                      </p>
                      <p>{biggestIssue.feedback.detail}</p>
                      <p>
                        Revisit lesson: <strong>{issueLesson.lessonTitle}</strong>
                      </p>
                      <p>
                        Next habit: <strong>{issueLesson.nextHabit}</strong>
                      </p>
                    </div>
                  )}
                  <div className="answer-row">
                    {game.focusTags.map((tag) => (
                      <span key={tag} className="answer-chip">
                        {formatCoachTag(tag)}
                      </span>
                    ))}
                  </div>
                  <div className="move-list">
                    {game.moveRecords
                      .filter((record) => record.isPlayer && record.feedback)
                      .slice(0, 4)
                      .map((record) => (
                        <span key={`${game.id}-${record.ply}`} className="answer-chip">
                          {record.san}: {record.feedback?.classification}
                        </span>
                      ))}
                  </div>
                </article>
              );
            })()
          ))
        )}
      </div>
    </section>
  );
}

function ProgressView({
  state,
  themeSummaries,
  onExport,
  onImport,
}: {
  state: PersistedAppState;
  themeSummaries: ThemeProgressSummary[];
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const masteryDistribution = Object.values(state.progress).reduce(
    (accumulator, progress) => {
      accumulator[progress.masteryStage] += 1;
      return accumulator;
    },
    [0, 0, 0, 0, 0] as [number, number, number, number, number],
  );
  const completedLessons = state.lessonProgress.completedLessonIds.length;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <section className="panel page-grid">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Progress</span>
          <h2>Your local-first chess dashboard</h2>
        </div>
        <p>
          Everything here is stored in your browser. Export a backup whenever you
          want a portable copy before changing devices.
        </p>
      </div>

      <div className="stats-grid">
        <StatCard
          label="Lessons done"
          value={`${completedLessons}/${LESSONS.length}`}
          detail="Structured curriculum progress."
        />
        <StatCard
          label="Coached games"
          value={state.userStats.coachedGamesCompleted}
          detail="Real games played against the local engine."
        />
        <StatCard
          label="Coach record"
          value={`${state.userStats.coachWins}-${state.userStats.coachLosses}-${state.userStats.coachDraws}`}
          detail="Wins, losses, and draws from coach mode."
        />
        <StatCard
          label="Drill streak"
          value={`${state.userStats.currentStreak} days`}
          detail="Daily repetition streak from drill sessions."
        />
      </div>

      <div className="distribution">
        {masteryDistribution.map((count, stage) => (
          <article key={stage} className="distribution__item">
            <span>Stage {stage}</span>
            <strong>{count}</strong>
          </article>
        ))}
      </div>

      <div className="theme-grid">
        {themeSummaries.map((summary) => (
          <ThemeMeter key={summary.theme.id} summary={summary} />
        ))}
      </div>

      <article className="callout">
        <span className="eyebrow">Data controls</span>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={onExport}>
            Export Backup
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Import Backup
          </button>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                onImport(file);
              }

              event.currentTarget.value = "";
            }}
          />
        </div>
      </article>
    </section>
  );
}

export default function App() {
  const [view, setView] = useState<ViewId>("learn");
  const [state, setState] = useState<PersistedAppState>(createDefaultState());
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [coachAnalysis, setCoachAnalysis] = useState<{
    fen: string;
    loading: boolean;
    data: EngineAnalysis | null;
    error: string | null;
  }>({
    fen: "",
    loading: false,
    data: null,
    error: null,
  });
  const [coachBusy, setCoachBusy] = useState(false);
  const [optimisticCoachFen, setOptimisticCoachFen] = useState<string | null>(null);
  const activeCoachGame = state.activeCoachGame;

  useEffect(() => {
    loadAppState().then((loaded) => {
      setState(loaded);
      setStatus("ready");
    });
  }, []);

  useEffect(() => {
    if (!activeCoachGame) {
      setOptimisticCoachFen(null);
      return;
    }

    if (optimisticCoachFen && optimisticCoachFen === activeCoachGame.currentFen) {
      setOptimisticCoachFen(null);
    }
  }, [activeCoachGame?.currentFen, activeCoachGame?.id, optimisticCoachFen]);

  useEffect(() => {
    if (!activeCoachGame || activeCoachGame.status !== "player-turn") {
      return;
    }

    if (coachAnalysis.fen === activeCoachGame.currentFen && coachAnalysis.data) {
      return;
    }

    let cancelled = false;
    setCoachAnalysis({
      fen: activeCoachGame.currentFen,
      loading: true,
      data: null,
      error: null,
    });

    analyzeWithFallback(activeCoachGame.currentFen)
      .then((analysis) => {
        if (!cancelled) {
          setCoachAnalysis({
            fen: activeCoachGame.currentFen,
            loading: false,
            data: analysis,
            error: null,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCoachAnalysis({
            fen: activeCoachGame.currentFen,
            loading: false,
            data: createFallbackAnalysis(activeCoachGame.currentFen),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeCoachGame?.currentFen,
    activeCoachGame?.status,
    state.settings.engineSkill,
    state.settings.moveTimeMs,
    coachAnalysis.data,
    coachAnalysis.fen,
  ]);

  useEffect(() => {
    if (!activeCoachGame || activeCoachGame.status !== "engine-turn") {
      return;
    }

    let cancelled = false;
    setCoachBusy(true);

    analyzeWithFallback(activeCoachGame.currentFen)
      .then((analysis) => {
        if (cancelled) {
          return;
        }

        const latestGame = state.activeCoachGame;

        if (!latestGame || latestGame.id !== activeCoachGame.id) {
          return;
        }

        const repliedGame = addEngineReplyToGame(latestGame, analysis);
        const nextState =
          repliedGame.status === "finished"
            ? finishCoachGameInState(
                {
                  ...state,
                  activeCoachGame: repliedGame,
                },
                repliedGame,
              )
            : {
                ...state,
                activeCoachGame: repliedGame,
              };

        void persist(nextState);
      })
      .finally(() => {
        if (!cancelled) {
          setCoachBusy(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeCoachGame?.id,
    activeCoachGame?.currentFen,
    activeCoachGame?.status,
    state,
    state.settings.engineSkill,
    state.settings.moveTimeMs,
  ]);

  const now = new Date();
  const themeSummaries = useMemo(
    () => summarizeThemes(curriculum, state.progress, now),
    [state.progress, now],
  );

  async function persist(nextState: PersistedAppState) {
    setState(nextState);
    await saveAppState(nextState);
  }

  async function analyzeWithFallback(fen: string) {
    try {
      return await getStockfishClient().analyzePosition(
        fen,
        state.settings.engineSkill,
        state.settings.moveTimeMs,
      );
    } catch (error) {
      console.warn("Stockfish unavailable, using fallback analysis.", error);
      return createFallbackAnalysis(fen);
    }
  }

  function startDrillSession() {
    const currentDateKey = toLocalDateKey(now);

    if (state.activeDrillSession && state.activeDrillSession.date === currentDateKey) {
      setView("drills");
      return;
    }

    const activeTheme = chooseActiveTheme(curriculum, state.progress, now);
    const session = buildDailySession({
      positions: curriculum,
      progress: state.progress,
      now,
      activeTheme,
    });
    const order = [...session.warmupIds, ...session.coreIds, ...session.weakSpotIds];
    const nextState: PersistedAppState = {
      ...state,
      sessions: {
        ...state.sessions,
        [session.date]: session,
      },
      activeTheme,
      activeDrillSession: {
        date: session.date,
        order,
        currentIndex: 0,
        ratingsByPosition: {},
        completedOrder: [],
        startedAt: now.toISOString(),
      },
    };

    startTransition(() => {
      void persist(nextState);
    });
    setView("drills");
  }

  function rateCurrentDrillPosition(rating: ReviewRating) {
    if (!state.activeDrillSession) {
      return;
    }

    const session = state.activeDrillSession;
    const positionId = session.order[session.currentIndex];
    const currentProgress = positionId ? state.progress[positionId] : null;
    const persistedSession = state.sessions[session.date];

    if (!positionId || !currentProgress || !persistedSession) {
      return;
    }

    const nextProgress = {
      ...state.progress,
      [positionId]: updateProgressAfterRating(currentProgress, rating, now),
    };
    const nextSession: ActiveDrillSessionState = {
      ...session,
      currentIndex: session.currentIndex + 1,
      ratingsByPosition: {
        ...session.ratingsByPosition,
        [positionId]: rating,
      },
      completedOrder: [...session.completedOrder, positionId],
    };
    const isSessionComplete = nextSession.currentIndex >= nextSession.order.length;
    const baseState: PersistedAppState = {
      ...state,
      progress: nextProgress,
      activeDrillSession: isSessionComplete ? null : nextSession,
      sessions: {
        ...state.sessions,
        [session.date]: {
          ...persistedSession,
          completed: isSessionComplete,
        },
      },
    };
    const nextState = isSessionComplete
      ? {
          ...baseState,
          userStats: updateDrillStatsForCompletion(
            baseState,
            session.date,
            nextSession.completedOrder.length,
          ),
        }
      : {
          ...baseState,
          userStats: {
            ...baseState.userStats,
            totalPositionsSolved: baseState.userStats.totalPositionsSolved + 1,
          },
        };

    startTransition(() => {
      void persist(nextState);
    });
  }

  async function handleCoachDrop(sourceSquare: string, targetSquare: string) {
    const game = state.activeCoachGame;

    if (!game || game.status !== "player-turn" || coachBusy) {
      return false;
    }

    const chess = new Chess(game.currentFen);
    const move =
      chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      }) ?? null;

    if (!move) {
      return false;
    }

    const optimisticFen = chess.fen();
    setOptimisticCoachFen(optimisticFen);
    setCoachBusy(true);

    try {
      const analysisBefore =
        coachAnalysis.fen === game.currentFen && coachAnalysis.data
          ? coachAnalysis.data
          : await analyzeWithFallback(game.currentFen);
      const chessAfter = new Chess(game.currentFen);
      chessAfter.move(move);

      if (chessAfter.isGameOver()) {
        const lesson = lessonById(state.lessonProgress.currentLessonId);
        const lessonCopy = lessonHabitCopy(lesson.id);
        const playerRecord = makeMoveRecord({
          chessBeforeFen: game.currentFen,
          move,
          isPlayer: true,
          feedback: {
            classification: "great",
            cpLoss: 0,
            summary: "Excellent move.",
            detail: "The move ends the game in your favor or forces the result immediately.",
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            lessonTieIn: `This finishes the game cleanly and matches the habit you are training inside ${lesson.title}.`,
            nextHabit: lessonCopy.nextHabit,
            suggestedMoveUci: "",
            suggestedMoveSan: move.san,
            engineReplyUci: null,
            tags: ["mate-threat"],
            lineSan: [move.san],
          },
        });
        const finished = finishGameIfOver({
          ...game,
          currentFen: chessAfter.fen(),
          moveRecords: [...game.moveRecords, playerRecord],
        });
        const nextState = finishCoachGameInState(
          {
            ...state,
            activeCoachGame: finished,
          },
          finished,
        );
        await persist(nextState);
        setOptimisticCoachFen(null);
        return true;
      }

      const analysisAfter = await analyzeWithFallback(chessAfter.fen());
      const feedback = buildCoachFeedback({
        fenBefore: game.currentFen,
        move,
        playerColor: game.playerColor,
        currentLessonId: state.lessonProgress.currentLessonId,
        analysisBefore,
        analysisAfter,
      });
      const playerRecord = makeMoveRecord({
        chessBeforeFen: game.currentFen,
        move,
        isPlayer: true,
        feedback,
      });
      const gameAfterPlayer: ActiveCoachGame = {
        ...game,
        currentFen: chessAfter.fen(),
        moveRecords: [...game.moveRecords, playerRecord],
        pendingFeedback: feedback,
        status:
          state.settings.coachEnabled && shouldPauseForCoach(feedback, state.settings.coachStrictness)
            ? "coach-review"
            : "engine-turn",
      };

      if (gameAfterPlayer.status === "coach-review") {
        await persist({
          ...state,
          activeCoachGame: gameAfterPlayer,
        });
        setOptimisticCoachFen(null);
      } else {
        const repliedGame = addEngineReplyToGame(gameAfterPlayer, analysisAfter);
        const nextState =
          repliedGame.status === "finished"
            ? finishCoachGameInState(
                {
                  ...state,
                  activeCoachGame: repliedGame,
                },
                repliedGame,
              )
            : {
                ...state,
                activeCoachGame: repliedGame,
              };
        await persist(nextState);
        setOptimisticCoachFen(null);
      }

      return true;
    } finally {
      setCoachBusy(false);
    }
  }

  function startCoachGame() {
    const nextState = {
      ...state,
      activeCoachGame: createCoachGame(state.settings.preferredColor),
    };

    startTransition(() => {
      void persist(nextState);
    });
    setCoachAnalysis({
      fen: "",
      loading: false,
      data: null,
      error: null,
    });
    setOptimisticCoachFen(null);
    setView("coach");
  }

  function undoCoachMove() {
    const game = state.activeCoachGame;

    if (!game || game.status !== "coach-review") {
      return;
    }

    const lastRecord = game.moveRecords[game.moveRecords.length - 1];

    if (!lastRecord || !lastRecord.isPlayer) {
      return;
    }

    const nextState = {
      ...state,
      activeCoachGame: {
        ...game,
        currentFen: lastRecord.fenBefore,
        status: "player-turn" as const,
        pendingFeedback: null,
        moveRecords: game.moveRecords.slice(0, -1),
      },
    };

    setOptimisticCoachFen(null);
    startTransition(() => {
      void persist(nextState);
    });
  }

  function continueCoachMove() {
    const game = state.activeCoachGame;
    const feedback = game?.pendingFeedback;

    if (!game || !feedback) {
      return;
    }

    if (!feedback.engineReplyUci) {
      const finished = finishGameIfOver({
        ...game,
        status: "finished",
        finishedAt: new Date().toISOString(),
      });
      startTransition(() => {
        void persist(
          finishCoachGameInState(
            {
              ...state,
              activeCoachGame: finished,
            },
            finished,
          ),
        );
      });
      setOptimisticCoachFen(null);
      return;
    }

    const repliedGame = addEngineReplyToGame(
      {
        ...game,
        status: "engine-turn",
      },
      {
        fen: game.currentFen,
        bestMoveUci: feedback.engineReplyUci,
        bestMoveSan: "",
        scoreCp: null,
        mateIn: null,
        depth: 0,
        pvUci: [feedback.engineReplyUci],
        pvSan: [],
      },
    );

    startTransition(() => {
      void persist(
        repliedGame.status === "finished"
          ? finishCoachGameInState(
              {
                ...state,
                activeCoachGame: repliedGame,
              },
              repliedGame,
            )
          : {
              ...state,
              activeCoachGame: repliedGame,
            },
      );
    });
    setOptimisticCoachFen(null);
  }

  function markLessonComplete(lessonId: (typeof LESSONS)[number]["id"]) {
    const lessonIndex = LESSONS.findIndex((lesson) => lesson.id === lessonId);
    const nextLessonId =
      LESSONS[lessonIndex + 1]?.id ?? state.lessonProgress.currentLessonId;

    const nextState = {
      ...state,
      lessonProgress: {
        ...state.lessonProgress,
        completedLessonIds: Array.from(
          new Set([...state.lessonProgress.completedLessonIds, lessonId]),
        ),
        currentLessonId: nextLessonId,
        lessonStatus: {
          ...state.lessonProgress.lessonStatus,
          [lessonId]: {
            completed: true,
            completedAt: new Date().toISOString(),
          },
        },
      },
    };

    startTransition(() => {
      void persist(nextState);
    });
  }

  function focusTheme(themeId: (typeof LESSONS)[number]["focusTheme"]) {
    startTransition(() => {
      void persist({
        ...state,
        activeTheme: themeId,
      });
    });
    setView("drills");
  }

  function changeSetting<K extends keyof PersistedAppState["settings"]>(
    key: K,
    value: PersistedAppState["settings"][K],
  ) {
    startTransition(() => {
      void persist({
        ...state,
        settings: {
          ...state.settings,
          [key]: value,
        },
      });
    });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chesst-backup-${toLocalDateKey(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importData(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const nextState = normalizeState(parsed);
        await persist(nextState);
      } catch (error) {
        console.error(error);
      }
    };
    reader.readAsText(file);
  }

  if (status === "loading") {
    return (
      <main className="app-shell loading-shell">
        <div className="loading-panel">
          <span className="eyebrow">ChessT</span>
          <h1>Loading your trainer…</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="backdrop backdrop--left" />
      <div className="backdrop backdrop--right" />
      <div className="shell-frame">
        <header className="shell-header">
          <div>
            <span className="eyebrow">Personal beginner chess trainer</span>
            <h1>ChessT</h1>
          </div>
          <Nav activeView={view} onChange={setView} />
        </header>

        {view === "learn" && (
          <LearnView
            state={state}
            onMarkComplete={markLessonComplete}
            onFocusTheme={focusTheme}
            onOpenCoach={() => setView("coach")}
          />
        )}
        {view === "coach" && (
          <CoachView
            state={state}
            displayFen={optimisticCoachFen}
            analysis={coachAnalysis.data}
            analysisError={coachAnalysis.error}
            analysisLoading={coachAnalysis.loading}
            coachBusy={coachBusy}
            onStartNewGame={startCoachGame}
            onDrop={(source, target) => {
              const game = state.activeCoachGame;

              if (!game || game.status !== "player-turn" || coachBusy) {
                return false;
              }

              const chess = new Chess(game.currentFen);
              const isLegal = Boolean(
                chess.move({
                  from: source,
                  to: target,
                  promotion: "q",
                }),
              );

              if (!isLegal) {
                return false;
              }

              void handleCoachDrop(source, target);
              return true;
            }}
            onUndo={undoCoachMove}
            onContinue={continueCoachMove}
            onSettingChange={changeSetting}
          />
        )}
        {view === "drills" && (
          <DrillSessionPanel
            state={state}
            onStart={startDrillSession}
            onRate={rateCurrentDrillPosition}
          />
        )}
        {view === "review" && <ReviewView coachGames={state.coachGames} />}
        {view === "progress" && (
          <ProgressView
            state={state}
            themeSummaries={themeSummaries}
            onExport={exportData}
            onImport={importData}
          />
        )}
      </div>
    </main>
  );
}
