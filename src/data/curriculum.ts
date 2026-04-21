import { Chess } from "chess.js";
import type { ThemeId, TrainingPosition } from "../types";

type Template = {
  key: string;
  theme: ThemeId;
  difficulty: 1 | 2 | 3;
  setupMoves?: string[];
  fen?: string;
  lineUci: string[];
  promptBase: string;
  explanationBase: string;
};

const promptAngles: Record<ThemeId, string[]> = {
  "opening-principles": [
    "Name the move that improves piece activity fastest.",
    "Choose the move that helps your development and keeps pressure on the center.",
    "Play the move you want to make automatically in a real game.",
    "Find the move that improves king safety and coordination.",
    "Pick the disciplined move instead of a flashy one.",
  ],
  "mate-in-1": [
    "Look for the cleanest finishing move right now.",
    "Force yourself to scan every checking move before touching a piece.",
    "Find the move that ends the game immediately.",
    "Choose the mate that leaves no flight squares.",
    "Train your eyes to see the knockout at first glance.",
  ],
  "mate-in-2": [
    "Find the forcing first move that starts the mating net.",
    "Play the move that leaves your opponent only bad replies.",
    "Start the sequence that should become automatic after repetition.",
    "Find the move that tightens the net before the final blow.",
    "Choose the forcing move, not the comfortable move.",
  ],
  forks: [
    "Spot the double attack before you think about anything else.",
    "Find the move that hits two valuable targets at once.",
    "Choose the move that wins material by force.",
    "Train yourself to scan for forks immediately after checks and captures.",
    "Pick the move that creates an unavoidable double threat.",
  ],
  "pins-skewers": [
    "Look through the target, not just at the front piece.",
    "Find the line move that freezes a defender in place.",
    "Play the move that turns alignment into material.",
    "Choose the move that makes the back piece vulnerable.",
    "Train the habit of checking files, ranks, and diagonals for hidden targets.",
  ],
  "hanging-pieces": [
    "Before calculating deeply, ask what is simply undefended.",
    "Find the free win your opponent left behind.",
    "Play the move that punishes loose coordination immediately.",
    "Choose the move that grabs material without giving counterplay.",
    "Build the habit of checking what is attacked and what is defended.",
  ],
  "back-rank": [
    "Scan the back rank before calculating long variations.",
    "Find the move that traps the king behind its own pawns.",
    "Play the forcing move that uses rook and queen geometry.",
    "Choose the move that turns poor king luft into a direct tactic.",
    "Build the reflex of checking every back-rank resource.",
  ],
  "king-pawn-endgames": [
    "Calculate king opposition before you move the pawn.",
    "Find the move that wins the race by one tempo.",
    "Play the move that improves your king, not just your pawn.",
    "Choose the move that converts technique into a point.",
    "Train your endgame patience with the cleanest winning route.",
  ],
};

const templates: Template[] = [
  {
    key: "open-dev-knight",
    theme: "opening-principles",
    difficulty: 1,
    setupMoves: ["e4", "e5"],
    lineUci: ["g1f3"],
    promptBase: "White to move. Develop naturally and fight for the center.",
    explanationBase: "Nf3 develops a piece, attacks e5, and prepares castling.",
  },
  {
    key: "open-dev-bishop",
    theme: "opening-principles",
    difficulty: 1,
    setupMoves: ["d4", "d5", "Nf3", "Nf6", "e3", "e6"],
    lineUci: ["f1d3"],
    promptBase: "White to move. Keep building a principled setup.",
    explanationBase: "Bd3 develops smoothly, supports kingside castling, and eyes the center.",
  },
  {
    key: "open-black-knight",
    theme: "opening-principles",
    difficulty: 1,
    setupMoves: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
    lineUci: ["g8f6"],
    promptBase: "Black to move. Improve development without creating weaknesses.",
    explanationBase: "Nf6 develops with tempo on e4 and supports quick castling.",
  },
  {
    key: "open-fianchetto",
    theme: "opening-principles",
    difficulty: 2,
    setupMoves: ["d4", "Nf6", "c4", "g6", "Nc3"],
    lineUci: ["f8g7"],
    promptBase: "Black to move. Finish the setup in the most harmonious way.",
    explanationBase: "Bg7 completes the fianchetto, controls the long diagonal, and supports castling.",
  },
  {
    key: "m1-queen-rank",
    theme: "mate-in-1",
    difficulty: 1,
    fen: "6k1/5ppp/8/8/8/6Q1/6PP/6K1 w - - 0 1",
    lineUci: ["g3b8"],
    promptBase: "White to move. There is a direct mate.",
    explanationBase: "Qb8# cuts across the eighth rank and the black king has no flight squares.",
  },
  {
    key: "m1-queen-support",
    theme: "mate-in-1",
    difficulty: 1,
    fen: "5k2/8/5KQ1/8/8/8/8/8 w - - 0 1",
    lineUci: ["g6g7"],
    promptBase: "White to move. Finish the game with king support.",
    explanationBase: "Qg7# works because the white king protects the mating queen.",
  },
  {
    key: "m1-black-queen",
    theme: "mate-in-1",
    difficulty: 1,
    fen: "6k1/6pp/6q1/8/8/8/5PPP/6K1 b - - 0 1",
    lineUci: ["g6b1"],
    promptBase: "Black to move. Spot the instant finish.",
    explanationBase: "Qb1# lands on a protected line and the white king is boxed in by its own pawns.",
  },
  {
    key: "m1-rook-file",
    theme: "mate-in-1",
    difficulty: 2,
    fen: "5rk1/6pp/8/8/8/8/6PP/5RK1 b - - 0 1",
    lineUci: ["f8f1"],
    promptBase: "Black to move. Use the open file.",
    explanationBase: "Rxf1+ is a forcing finish because the king has no safe escape squares after the rook lands.",
  },
  {
    key: "m2-queen-lift",
    theme: "mate-in-2",
    difficulty: 2,
    fen: "6k1/5ppp/8/8/8/6Q1/6PP/5RK1 w - - 0 1",
    lineUci: ["g3b8"],
    promptBase: "White to move. Find the forcing move that begins a mating sequence.",
    explanationBase: "Qb8+ starts a forcing line against the boxed king and teaches the same geometry from harder positions.",
  },
  {
    key: "m2-rook-swing",
    theme: "mate-in-2",
    difficulty: 2,
    fen: "6k1/5ppp/8/8/8/5Q2/6PP/4R1K1 w - - 0 1",
    lineUci: ["f3a8"],
    promptBase: "White to move. Start the mating net with the strongest forcing move.",
    explanationBase: "Qa8+ is the kind of forcing queen swing that leads to short mating patterns.",
  },
  {
    key: "m2-back-rank-hook",
    theme: "mate-in-2",
    difficulty: 2,
    fen: "6k1/5ppp/8/8/8/6Q1/5PPP/3R2K1 w - - 0 1",
    lineUci: ["g3b8"],
    promptBase: "White to move. Start the pattern that should finish in two moves.",
    explanationBase: "Qb8+ is a forcing hook into a follow-up back-rank mate.",
  },
  {
    key: "m2-black-queen-hook",
    theme: "mate-in-2",
    difficulty: 3,
    fen: "6K1/5ppp/8/8/8/6q1/6pk/8 b - - 0 1",
    lineUci: ["g3b8"],
    promptBase: "Black to move. Find the forcing first move in a mating net.",
    explanationBase: "Qb8+ is a forcing move that models how a queen starts the final squeeze.",
  },
  {
    key: "fork-knight-center",
    theme: "forks",
    difficulty: 1,
    fen: "8/2r1k3/8/8/8/2N5/8/4K3 w - - 0 1",
    lineUci: ["c3d5"],
    promptBase: "White to move. Win material with a double attack.",
    explanationBase: "Nd5+ forks the king and rook, the classic beginner-improving pattern.",
  },
  {
    key: "fork-knight-royal",
    theme: "forks",
    difficulty: 2,
    fen: "8/2r1k3/8/8/5N2/8/8/4K3 w - - 0 1",
    lineUci: ["f4d5"],
    promptBase: "White to move. Jump to a square that attacks two premium targets.",
    explanationBase: "Nd5+ forks the king and rook and trains pattern recall around knight geometry.",
  },
  {
    key: "fork-black-knight",
    theme: "forks",
    difficulty: 2,
    fen: "8/4k3/6r1/8/8/3N4/8/4K3 w - - 0 1",
    lineUci: ["d3f4"],
    promptBase: "White to move. Find the knight jump that creates a clean fork.",
    explanationBase: "Nf4+ hits the king and rook together and reinforces another common fork pattern.",
  },
  {
    key: "fork-queen-double",
    theme: "forks",
    difficulty: 2,
    fen: "4k3/8/8/3r4/8/8/4Q3/4K3 w - - 0 1",
    lineUci: ["e2b5"],
    promptBase: "White to move. Use the queen to attack two targets at once.",
    explanationBase: "Qb5+ checks the king and hits the rook, a useful geometry pattern.",
  },
  {
    key: "pin-bishop-file",
    theme: "pins-skewers",
    difficulty: 1,
    fen: "4k3/8/8/8/8/2b5/3R4/4K3 b - - 0 1",
    lineUci: ["c3d2"],
    promptBase: "Black to move. Use alignment to win material.",
    explanationBase: "Bxd2+ keeps the king lined up and wins the pinned rook.",
  },
  {
    key: "pin-rook-file",
    theme: "pins-skewers",
    difficulty: 2,
    fen: "6k1/8/8/8/8/8/4r3/4RK2 b - - 0 1",
    lineUci: ["e2e1"],
    promptBase: "Black to move. Exploit the pin on the first rank.",
    explanationBase: "Re1+ drives home the file pin and forces concessions.",
  },
  {
    key: "skewer-queen-king",
    theme: "pins-skewers",
    difficulty: 2,
    fen: "4k3/4q3/8/8/8/8/4R3/4K3 w - - 0 1",
    lineUci: ["e2e7"],
    promptBase: "White to move. Skewer through the more valuable piece.",
    explanationBase: "Rxe7+ wins the queen because the king must respond first.",
  },
  {
    key: "pin-bishop-knight",
    theme: "pins-skewers",
    difficulty: 2,
    setupMoves: ["d4", "Nf6", "Bg5", "e6", "e4"],
    lineUci: ["f8b4"],
    promptBase: "Black to move. Create a pin that increases pressure immediately.",
    explanationBase: "Bb4+ pins the knight and adds tactical strain to the position.",
  },
  {
    key: "hang-knight",
    theme: "hanging-pieces",
    difficulty: 1,
    setupMoves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4"],
    lineUci: ["f3e5"],
    promptBase: "White to move. One of black's pieces can be taken cleanly.",
    explanationBase: "Nxe5 removes a loose piece while improving your position.",
  },
  {
    key: "hang-bishop",
    theme: "hanging-pieces",
    difficulty: 1,
    fen: "4k3/8/8/8/8/3b4/4Q3/4K3 w - - 0 1",
    lineUci: ["e2d3"],
    promptBase: "White to move. Punish the undefended piece immediately.",
    explanationBase: "Qxd3 wins a free bishop and reinforces the habit of scanning loose pieces.",
  },
  {
    key: "hang-rook",
    theme: "hanging-pieces",
    difficulty: 2,
    fen: "4k3/8/8/8/8/8/r3Q3/4K3 w - - 0 1",
    lineUci: ["e2a2"],
    promptBase: "White to move. A simple capture wins material.",
    explanationBase: "Qxa2 picks up the rook because it is unprotected and unreachable.",
  },
  {
    key: "hang-black-queen",
    theme: "hanging-pieces",
    difficulty: 2,
    fen: "4k3/8/8/8/8/8/8/R3q1K1 w - - 0 1",
    lineUci: ["a1e1"],
    promptBase: "White to move. Find the cleanest way to exploit the loose queen.",
    explanationBase: "Re1 wins the queen immediately and keeps the move simple.",
  },
  {
    key: "back-rank-rook",
    theme: "back-rank",
    difficulty: 1,
    fen: "5rk1/6pp/8/8/8/8/6PP/5RK1 b - - 0 1",
    lineUci: ["f8f1"],
    promptBase: "Black to move. The back rank is fatally weak.",
    explanationBase: "Rxf1+ crashes through because the king has no luft and the file is open.",
  },
  {
    key: "back-rank-queen",
    theme: "back-rank",
    difficulty: 2,
    fen: "6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1",
    lineUci: ["d1d8"],
    promptBase: "White to move. Use the back rank directly.",
    explanationBase: "Qd8+ is the kind of forcing line that punishes a boxed king.",
  },
  {
    key: "back-rank-swing",
    theme: "back-rank",
    difficulty: 2,
    fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
    lineUci: ["d1d8"],
    promptBase: "White to move. Finish the game with a classic rook entry.",
    explanationBase: "Rd8+ is the direct back-rank invasion when the king lacks breathing room.",
  },
  {
    key: "back-rank-black-queen",
    theme: "back-rank",
    difficulty: 2,
    fen: "6K1/5ppp/8/8/8/8/5PPP/3q3k b - - 0 1",
    lineUci: ["d1d8"],
    promptBase: "Black to move. Use the same back-rank pattern from the other side.",
    explanationBase: "Qd8+ attacks along the rank and demonstrates the same boxed-king motif.",
  },
  {
    key: "end-opposition",
    theme: "king-pawn-endgames",
    difficulty: 1,
    fen: "8/8/8/3k4/3P4/4K3/8/8 w - - 0 1",
    lineUci: ["e3d3"],
    promptBase: "White to move. Use king opposition before pushing the pawn.",
    explanationBase: "Kd3 takes the opposition and prepares a clean king-and-pawn conversion.",
  },
  {
    key: "end-race",
    theme: "king-pawn-endgames",
    difficulty: 2,
    fen: "8/4k3/8/3P4/8/4K3/8/8 w - - 0 1",
    lineUci: ["e3e4"],
    promptBase: "White to move. Improve the king before the pawn race begins.",
    explanationBase: "Ke4 shoulders the enemy king away and keeps the promotion path under control.",
  },
  {
    key: "end-breakthrough",
    theme: "king-pawn-endgames",
    difficulty: 2,
    fen: "8/8/3k4/8/3P4/4K3/8/8 w - - 0 1",
    lineUci: ["e3e4"],
    promptBase: "White to move. Choose the king move that supports a winning pawn break.",
    explanationBase: "Ke4 improves the king first and keeps the position winning by technique.",
  },
  {
    key: "end-black-opposition",
    theme: "king-pawn-endgames",
    difficulty: 2,
    fen: "8/8/8/8/3p4/4k3/8/3K4 b - - 0 1",
    lineUci: ["e3d3"],
    promptBase: "Black to move. Use opposition from the other side.",
    explanationBase: "Kd3 takes direct opposition and models the same core endgame habit for black.",
  },
];

function createFen(template: Template) {
  if (template.fen) {
    return template.fen;
  }

  const chess = new Chess();

  template.setupMoves?.forEach((move) => {
    chess.move(move);
  });

  return chess.fen();
}

function lineToSan(fen: string, lineUci: string[]) {
  const chess = new Chess(fen);
  const sanLine: string[] = [];

  lineUci.forEach((uciMove) => {
    const move = chess.move({
      from: uciMove.slice(0, 2),
      to: uciMove.slice(2, 4),
      promotion: uciMove[4] as "q" | undefined,
    });

    if (!move) {
      throw new Error(`Invalid line move ${uciMove} for FEN ${fen}`);
    }

    sanLine.push(move.san);
  });

  return sanLine;
}

function makePositionsFromTemplate(template: Template): TrainingPosition[] {
  const fen = createFen(template);
  const sideToMove = fen.split(" ")[1] as "w" | "b";
  let sanLine: string[];

  try {
    sanLine = lineToSan(fen, template.lineUci);
  } catch (error) {
    throw new Error(
      `Template ${template.key} is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return promptAngles[template.theme].map((angle, index) => ({
    id: `${template.key}-${index + 1}`,
    theme: template.theme,
    fen,
    sideToMove,
    prompt: `${template.promptBase} ${angle}`,
    solutionMoves: sanLine,
    explanation: `${template.explanationBase} ${angle}`,
    difficulty: template.difficulty,
  }));
}

export const curriculum: TrainingPosition[] = templates.flatMap(
  makePositionsFromTemplate,
);

export function validateCurriculumContent(positions: TrainingPosition[]) {
  const ids = new Set<string>();

  positions.forEach((position) => {
    if (ids.has(position.id)) {
      throw new Error(`Duplicate training position id: ${position.id}`);
    }

    ids.add(position.id);

    const chess = new Chess(position.fen);

    if (!position.prompt.trim()) {
      throw new Error(`Prompt missing for ${position.id}`);
    }

    if (!position.explanation.trim()) {
      throw new Error(`Explanation missing for ${position.id}`);
    }

    if (position.solutionMoves.length === 0) {
      throw new Error(`No solution line for ${position.id}`);
    }

    position.solutionMoves.forEach((san) => {
      const move = chess.move(san);

      if (!move) {
        throw new Error(`Invalid SAN ${san} for ${position.id}`);
      }
    });
  });
}

validateCurriculumContent(curriculum);
