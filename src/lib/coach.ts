import { Chess, type Move, type Square } from "chess.js";
import {
  chooseLessonForFeedback,
  lessonHabitCopy,
  lessonById,
} from "../data/lessons";
import type {
  ActiveCoachGame,
  CoachFeedback,
  CoachMoveRecord,
  CoachTag,
  EngineAnalysis,
  FeedbackClassification,
  LessonId,
  StoredCoachGame,
} from "../types";

const START_FEN = "start";

const MATERIAL_VALUES: Record<string, number> = {
  p: 100,
  n: 300,
  b: 320,
  r: 500,
  q: 900,
  k: 10000,
};

function makeId() {
  return `coach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createChess(fen: string) {
  return fen === START_FEN ? new Chess() : new Chess(fen);
}

export function createCoachGame(playerColor: "w" | "b"): ActiveCoachGame {
  const id = makeId();

  return {
    id,
    startFen: START_FEN,
    currentFen: new Chess().fen(),
    playerColor,
    status: playerColor === "w" ? "player-turn" : "engine-turn",
    moveRecords: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    pendingFeedback: null,
  };
}

export function moveToUci(move: Pick<Move, "from" | "to" | "promotion">) {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function uciToMoveObject(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: (uci[4] as "q" | "r" | "b" | "n" | undefined) ?? "q",
  };
}

export function uciToSan(fen: string, uci: string) {
  const chess = createChess(fen);
  const move = chess.move(uciToMoveObject(uci));
  return move?.san ?? uci;
}

export function uciLineToSan(fen: string, line: string[]) {
  const chess = createChess(fen);
  const sanLine: string[] = [];

  line.forEach((uci) => {
    const move = chess.move(uciToMoveObject(uci));

    if (move) {
      sanLine.push(move.san);
    }
  });

  return sanLine;
}

function sideScoreForPlayer(
  analysis: EngineAnalysis,
  sideToMoveAtFen: "w" | "b",
  playerColor: "w" | "b",
) {
  const mateScore =
    analysis.mateIn === null
      ? null
      : analysis.mateIn > 0
        ? 10000 - Math.abs(analysis.mateIn) * 100
        : -10000 + Math.abs(analysis.mateIn) * 100;
  const rawScore = mateScore ?? analysis.scoreCp ?? 0;

  return sideToMoveAtFen === playerColor ? rawScore : -rawScore;
}

function classifyByLoss(cpLoss: number): FeedbackClassification {
  if (cpLoss <= 25) {
    return "great";
  }

  if (cpLoss <= 80) {
    return "good";
  }

  if (cpLoss <= 180) {
    return "inaccuracy";
  }

  if (cpLoss <= 320) {
    return "mistake";
  }

  return "blunder";
}

function pieceName(pieceType: string) {
  return {
    p: "pawn",
    n: "knight",
    b: "bishop",
    r: "rook",
    q: "queen",
    k: "king",
  }[pieceType];
}

function swapTurn(fen: string, turn: "w" | "b") {
  const parts = fen.split(" ");
  parts[1] = turn;
  return parts.join(" ");
}

function squareCanBeCapturedBySide(fen: string, targetSquare: string, side: "w" | "b") {
  const chess = createChess(swapTurn(fen, side));
  return chess
    .moves({ verbose: true })
    .some((move) => move.to === targetSquare && move.color === side);
}

function countUndevelopedMinorPieces(chess: Chess, color: "w" | "b") {
  const homeSquares =
    color === "w"
      ? ([
          ["b1", "n"],
          ["g1", "n"],
          ["c1", "b"],
          ["f1", "b"],
        ] as const)
      : ([
          ["b8", "n"],
          ["g8", "n"],
          ["c8", "b"],
          ["f8", "b"],
        ] as const);

  return homeSquares.filter(([square, type]) => chess.get(square as Square)?.type === type).length;
}

function isOpeningPhase(chessBefore: Chess) {
  return chessBefore.history().length <= 18;
}

function inferTagsAndDetail(args: {
  chessBefore: Chess;
  chessAfter: Chess;
  move: Move;
  suggestedMoveSan: string;
  cpLoss: number;
  classification: FeedbackClassification;
  playerColor: "w" | "b";
}) {
  const { chessBefore, chessAfter, move, suggestedMoveSan, cpLoss, classification, playerColor } =
    args;
  const tags = new Set<CoachTag>();
  let detail = "";

  const movedPieceName = pieceName(move.piece) ?? "piece";
  const opening = isOpeningPhase(chessBefore);
  const movedToLooseSquare =
    squareCanBeCapturedBySide(chessAfter.fen(), move.to, chessAfter.turn()) &&
    !squareCanBeCapturedBySide(chessAfter.fen(), move.to, playerColor);

  if (movedToLooseSquare && move.piece !== "k") {
    tags.add("hanging-piece");
    detail = `This move leaves your ${movedPieceName} on ${move.to} loose, so your opponent can target it immediately.`;
  }

  if (!detail && opening && move.piece === "q" && cpLoss >= 90) {
    tags.add("development");
    tags.add("piece-activity");
    detail =
      "Bringing the queen out this early often invites attacks and slows down your development.";
  }

  if (
    !detail &&
    opening &&
    countUndevelopedMinorPieces(chessBefore, playerColor) >= 3 &&
    (move.from.startsWith("a") || move.from.startsWith("h")) &&
    cpLoss >= 90
  ) {
    tags.add("development");
    detail =
      "This flank pawn move does not help your pieces come out, so your development falls behind.";
  }

  if (!detail && opening && move.piece !== "p" && move.piece !== "k" && cpLoss >= 100) {
    const samePieceMovedAgain =
      chessBefore
        .history({ verbose: true })
        .filter((previousMove) => previousMove.color === playerColor)
        .some((previousMove) => previousMove.to === move.from);

    if (samePieceMovedAgain && countUndevelopedMinorPieces(chessBefore, playerColor) >= 2) {
      tags.add("development");
      detail =
        "You moved the same piece again before finishing development. Beginners improve faster by bringing more pieces out.";
    }
  }

  if (!detail && opening && move.san.includes("O-O")) {
    tags.add("king-safety");
    detail = "Castling is exactly the kind of practical move that keeps your king safe and your rook useful.";
  }

  if (!detail && suggestedMoveSan.includes("+") && !move.san.includes("+")) {
    tags.add("missed-tactic");
    tags.add("mate-threat");
    detail = `There was a forcing check available with ${suggestedMoveSan}, and forcing moves are worth checking first every turn.`;
  }

  if (!detail && suggestedMoveSan.includes("x") && !move.san.includes("x") && cpLoss >= 80) {
    tags.add("missed-tactic");
    detail = `You missed a stronger capture. ${suggestedMoveSan} was the cleaner tactical move here.`;
  }

  if (!detail && opening && ["e4", "d4", "e5", "d5"].some((square) => move.to === square)) {
    tags.add("center-control");
    detail = "This helps you fight for the center, which is a strong beginner habit.";
  }

  if (!detail && classification === "great") {
    detail = "This is a strong move. It keeps your position healthy and matches what the coach wanted.";
  }

  if (!detail && classification === "good") {
    detail = "This move is playable and keeps your position under control.";
  }

  if (!detail && classification === "inaccuracy") {
    detail = `This is not losing, but there was a cleaner move. ${suggestedMoveSan} would have kept more pressure and fewer problems.`;
  }

  if (!detail && classification === "mistake") {
    detail = `This move gives away too much compared to ${suggestedMoveSan}. Try to slow down and scan checks, captures, and threats first.`;
  }

  if (!detail) {
    detail = `This move drops too much. ${suggestedMoveSan} was the safer move and should be your training answer here.`;
  }

  if (opening) {
    tags.add("development");
  }

  return {
    tags: Array.from(tags),
    detail,
  };
}

export function buildCoachFeedback(args: {
  fenBefore: string;
  move: Move;
  playerColor: "w" | "b";
  currentLessonId: LessonId;
  analysisBefore: EngineAnalysis;
  analysisAfter: EngineAnalysis;
}): CoachFeedback {
  const { fenBefore, move, playerColor, currentLessonId, analysisBefore, analysisAfter } = args;
  const chessBefore = createChess(fenBefore);
  const chessAfter = createChess(chessBefore.fen());
  chessAfter.move(move);

  const beforeScore = sideScoreForPlayer(analysisBefore, playerColor, playerColor);
  const afterScore = sideScoreForPlayer(
    analysisAfter,
    playerColor === "w" ? "b" : "w",
    playerColor,
  );
  const cpLoss = Math.max(0, beforeScore - afterScore);
  const classification = classifyByLoss(cpLoss);
  const heuristic = inferTagsAndDetail({
    chessBefore,
    chessAfter,
    move,
    suggestedMoveSan: analysisBefore.bestMoveSan,
    cpLoss,
    classification,
    playerColor,
  });
  const lesson = chooseLessonForFeedback(currentLessonId, heuristic.tags);
  const lessonCopy = lessonHabitCopy(lesson.id);
  const isCurrentLesson = lesson.id === currentLessonId;
  const summaryByClassification: Record<FeedbackClassification, string> = {
    great: "Excellent move.",
    good: "Good move.",
    inaccuracy: "A playable move, but not the cleanest one.",
    mistake: "This move creates a real problem.",
    blunder: "This move drops too much.",
  };
  const lessonTieIn =
    classification === "great" || classification === "good"
      ? `This supports your current training well. ${lessonById(currentLessonId).title} is the right lesson lane for this position.`
      : isCurrentLesson
        ? lessonCopy.tieIn
        : `This position points to another lesson to revisit: ${lesson.title}. ${lessonCopy.tieIn}`;

  return {
    classification,
    cpLoss,
    summary: summaryByClassification[classification],
    detail: heuristic.detail,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    lessonTieIn,
    nextHabit: lessonCopy.nextHabit,
    suggestedMoveUci: analysisBefore.bestMoveUci,
    suggestedMoveSan: analysisBefore.bestMoveSan,
    engineReplyUci: analysisAfter.bestMoveUci || null,
    tags: heuristic.tags,
    lineSan: analysisBefore.pvSan,
  };
}

export function makeMoveRecord(args: {
  chessBeforeFen: string;
  move: Move;
  isPlayer: boolean;
  feedback?: CoachFeedback | null;
}): CoachMoveRecord {
  const chessAfter = createChess(args.chessBeforeFen);
  chessAfter.move(args.move);

  return {
    ply: chessAfter.history().length,
    side: args.move.color,
    san: args.move.san,
    uci: moveToUci(args.move),
    fenBefore: args.chessBeforeFen,
    fenAfter: chessAfter.fen(),
    isPlayer: args.isPlayer,
    playedAt: new Date().toISOString(),
    classification: args.feedback?.classification ?? null,
    feedback: args.feedback ?? null,
  };
}

export function applyUciMoveToFen(fen: string, uci: string) {
  const chess = createChess(fen);
  const move = chess.move(uciToMoveObject(uci));

  if (!move) {
    throw new Error(`Could not apply move ${uci} on ${fen}`);
  }

  return {
    chess,
    move,
  };
}

export function finishGameIfOver(game: ActiveCoachGame): ActiveCoachGame {
  const chess = createChess(game.currentFen);

  if (!chess.isGameOver()) {
    return game;
  }

  return {
    ...game,
    status: "finished",
    finishedAt: new Date().toISOString(),
    result: resolveResult(chess, game.playerColor),
    pendingFeedback: null,
  };
}

export function resolveResult(chess: Chess, playerColor: "w" | "b") {
  if (chess.isCheckmate()) {
    const loser = chess.turn();
    const winner = loser === "w" ? "b" : "w";

    return winner === playerColor ? "win" : "loss";
  }

  return "draw";
}

export function finalizeStoredCoachGame(game: ActiveCoachGame) {
  const chess = createChess(game.startFen);
  game.moveRecords.forEach((record) => {
    chess.move(record.san);
  });

  const feedbacks = game.moveRecords.flatMap((record) =>
    record.feedback ? [record.feedback] : [],
  );
  const focusTagCounts = new Map<CoachTag, number>();

  feedbacks.forEach((feedback) => {
    feedback.tags.forEach((tag) => {
      focusTagCounts.set(tag, (focusTagCounts.get(tag) ?? 0) + 1);
    });
  });

  return {
    id: game.id,
    startFen: game.startFen,
    finalFen: game.currentFen,
    playerColor: game.playerColor,
    startedAt: game.startedAt,
    finishedAt: game.finishedAt ?? new Date().toISOString(),
    result: game.result ?? "draw",
    pgn: chess.pgn(),
    moveRecords: game.moveRecords,
    mistakeCount: game.moveRecords.filter((record) => record.classification === "mistake").length,
    blunderCount: game.moveRecords.filter((record) => record.classification === "blunder").length,
    focusTags: Array.from(focusTagCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([tag]) => tag),
  } satisfies StoredCoachGame;
}

export function materialBalance(fen: string, playerColor: "w" | "b") {
  const chess = createChess(fen);
  let white = 0;
  let black = 0;

  chess.board().forEach((rank) => {
    rank.forEach((piece) => {
      if (!piece) {
        return;
      }

      if (piece.color === "w") {
        white += MATERIAL_VALUES[piece.type] ?? 0;
      } else {
        black += MATERIAL_VALUES[piece.type] ?? 0;
      }
    });
  });

  return playerColor === "w" ? white - black : black - white;
}

function centralBonus(square: string) {
  return ["d4", "e4", "d5", "e5"].includes(square)
    ? 45
    : ["c3", "d3", "e3", "f3", "c4", "f4", "c5", "f5", "c6", "d6", "e6", "f6"].includes(square)
      ? 18
      : 0;
}

function openingMoveBonus(chess: Chess, move: Move) {
  if (chess.history().length > 16) {
    return 0;
  }

  if (move.san.includes("O-O")) {
    return 80;
  }

  if (move.piece === "n" || move.piece === "b") {
    return 30 + centralBonus(move.to);
  }

  if (move.piece === "p" && (move.to === "e4" || move.to === "d4" || move.to === "e5" || move.to === "d5")) {
    return 34;
  }

  if (move.piece === "q") {
    return -30;
  }

  return centralBonus(move.to);
}

function moveHeuristic(chess: Chess, move: Move) {
  let score = 0;

  if (move.captured) {
    score += (MATERIAL_VALUES[move.captured] ?? 0) - (MATERIAL_VALUES[move.piece] ?? 0) * 0.15;
  }

  if (move.san.includes("+")) {
    score += 55;
  }

  if (move.san.includes("#")) {
    score += 10000;
  }

  if (move.flags.includes("p")) {
    score += 20;
  }

  score += openingMoveBonus(chess, move);
  score += centralBonus(move.to);

  return score;
}

export function createFallbackAnalysis(fen: string): EngineAnalysis {
  const chess = createChess(fen);
  const legalMoves = chess.moves({ verbose: true });

  if (legalMoves.length === 0) {
    return {
      fen,
      bestMoveUci: "",
      bestMoveSan: "",
      scoreCp: 0,
      mateIn: chess.isCheckmate() ? -1 : null,
      depth: 1,
      pvUci: [],
      pvSan: [],
    };
  }

  const ranked = legalMoves
    .map((move) => ({
      move,
      score: moveHeuristic(chess, move),
    }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0]!;

  return {
    fen,
    bestMoveUci: moveToUci(best.move),
    bestMoveSan: best.move.san,
    scoreCp: Math.round(best.score),
    mateIn: best.move.san.includes("#") ? 1 : null,
    depth: 1,
    pvUci: [moveToUci(best.move)],
    pvSan: [best.move.san],
  };
}
