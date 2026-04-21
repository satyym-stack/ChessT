import { curriculum } from "./curriculum";
import type { CoachTag, LessonId, ThemeId } from "../types";

export type LessonDefinition = {
  id: LessonId;
  title: string;
  summary: string;
  whyItMatters: string;
  keyIdeas: string[];
  focusTheme: ThemeId;
  recommendedPositionIds: string[];
};

function samplePositions(theme: ThemeId, count = 5) {
  return curriculum
    .filter((position) => position.theme === theme)
    .slice(0, count)
    .map((position) => position.id);
}

export const LESSONS: LessonDefinition[] = [
  {
    id: "rules-and-board-vision",
    title: "Rules and Board Vision",
    summary: "Start by learning to scan every turn for checks, captures, and threats.",
    whyItMatters:
      "Beginners usually lose because they miss something simple, not because they fail deep calculation.",
    keyIdeas: [
      "Before every move, look for checks first.",
      "Then look for captures for both sides.",
      "Always ask what your opponent is threatening.",
    ],
    focusTheme: "mate-in-1",
    recommendedPositionIds: samplePositions("mate-in-1"),
  },
  {
    id: "opening-habits",
    title: "Opening Habits",
    summary: "Learn how to develop pieces, control the center, and castle before attacking.",
    whyItMatters:
      "Good openings give you safe king positions and active pieces without memorizing long theory.",
    keyIdeas: [
      "Develop knights and bishops before hunting pawns.",
      "Fight for the center with pawns and pieces.",
      "Castle early and avoid moving the same piece twice without a reason.",
    ],
    focusTheme: "opening-principles",
    recommendedPositionIds: samplePositions("opening-principles"),
  },
  {
    id: "checks-captures-threats",
    title: "Checks, Captures, Threats",
    summary: "Build the habit of spotting forcing moves before you choose a quiet move.",
    whyItMatters:
      "The strongest beginner improvement often comes from simply noticing forcing ideas one move earlier.",
    keyIdeas: [
      "Checks are the first moves to scan.",
      "Captures change material and usually deserve calculation.",
      "Threats matter most when they are direct and hard to answer.",
    ],
    focusTheme: "forks",
    recommendedPositionIds: samplePositions("forks"),
  },
  {
    id: "stop-hanging-pieces",
    title: "Stop Hanging Pieces",
    summary: "Train yourself to notice when a piece is loose before and after every move.",
    whyItMatters:
      "Most beginner losses come from leaving pieces undefended or missing free material.",
    keyIdeas: [
      "Count attackers and defenders on the square you move to.",
      "Loose pieces become tactical targets.",
      "If you can win material simply, do that before fancy ideas.",
    ],
    focusTheme: "hanging-pieces",
    recommendedPositionIds: samplePositions("hanging-pieces"),
  },
  {
    id: "core-tactics",
    title: "Core Tactics",
    summary: "Memorize the patterns that appear again and again in real beginner games.",
    whyItMatters:
      "Forks, pins, skewers, and back-rank patterns win games at beginner level constantly.",
    keyIdeas: [
      "A fork attacks two targets at once.",
      "Pins and skewers depend on alignment.",
      "Back-rank weaknesses appear when the king has no luft.",
    ],
    focusTheme: "pins-skewers",
    recommendedPositionIds: [
      ...samplePositions("pins-skewers", 3),
      ...samplePositions("back-rank", 2),
    ],
  },
  {
    id: "mating-patterns",
    title: "Mating Patterns",
    summary: "Learn the basic mating shapes so checkmates become patterns instead of surprises.",
    whyItMatters:
      "Recognizing patterns makes both attack and defense much easier during real games.",
    keyIdeas: [
      "Look for boxed kings and limited escape squares.",
      "Force the king with checks before searching for slower moves.",
      "Mate in 1 and mate in 2 patterns teach board vision fast.",
    ],
    focusTheme: "mate-in-2",
    recommendedPositionIds: samplePositions("mate-in-2"),
  },
  {
    id: "basic-endgames",
    title: "Basic Endgames",
    summary: "Learn king activity, opposition, and pawn racing so won games stay won.",
    whyItMatters:
      "Endgames teach clean calculation and stop you from throwing away better positions.",
    keyIdeas: [
      "Activate the king in simplified positions.",
      "Take opposition before pushing pawns blindly.",
      "Count tempi carefully in pawn races.",
    ],
    focusTheme: "king-pawn-endgames",
    recommendedPositionIds: samplePositions("king-pawn-endgames"),
  },
];

export const LESSON_ORDER = LESSONS.map((lesson) => lesson.id);

export const lessonById = (lessonId: LessonId) =>
  LESSONS.find((lesson) => lesson.id === lessonId)!;

const COACH_TAG_LESSON_MAP: Record<CoachTag, LessonId> = {
  development: "opening-habits",
  "king-safety": "opening-habits",
  "center-control": "opening-habits",
  "hanging-piece": "stop-hanging-pieces",
  "missed-tactic": "checks-captures-threats",
  "mate-threat": "mating-patterns",
  "piece-activity": "opening-habits",
  "endgame-technique": "basic-endgames",
};

const LESSON_HABITS: Record<
  LessonId,
  {
    tieIn: string;
    nextHabit: string;
  }
> = {
  "rules-and-board-vision": {
    tieIn:
      "This comes back to board vision. Strong beginner improvement starts with seeing the forcing move first.",
    nextHabit: "Before every move, say: checks, captures, threats.",
  },
  "opening-habits": {
    tieIn:
      "This connects directly to opening habits: bring pieces out, fight for the center, and castle before hunting side pawns.",
    nextHabit: "Ask whether your move develops a piece, helps the center, or improves king safety.",
  },
  "checks-captures-threats": {
    tieIn:
      "This is a checks-captures-threats moment. The quickest beginner gains usually come from noticing forcing moves sooner.",
    nextHabit: "Scan checks first, then captures, then direct threats before you choose a quiet move.",
  },
  "stop-hanging-pieces": {
    tieIn:
      "This is exactly the habit behind not hanging pieces: count attackers and defenders before you leave a piece on a square.",
    nextHabit: "Before letting go of the piece, ask if the destination square is defended enough.",
  },
  "core-tactics": {
    tieIn:
      "This position points back to your core tactics work. Repeated tactical patterns are supposed to become automatic.",
    nextHabit: "Check for forks, pins, skewers, and loose pieces before settling for a safe-looking move.",
  },
  "mating-patterns": {
    tieIn:
      "This is tied to mating patterns: when the enemy king looks boxed in, forcing checks deserve your full attention.",
    nextHabit: "If the king has limited squares, calculate checks before anything else.",
  },
  "basic-endgames": {
    tieIn:
      "This is an endgame technique moment. Simpler positions reward king activity and accurate pawn counting.",
    nextHabit: "In endgames, improve the king first and count pawn races move by move.",
  },
};

export function lessonForCoachTag(tag: CoachTag): LessonId {
  return COACH_TAG_LESSON_MAP[tag];
}

export function chooseLessonForFeedback(
  currentLessonId: LessonId,
  tags: CoachTag[],
): LessonDefinition {
  const matchingCurrentLesson = tags.some((tag) => lessonForCoachTag(tag) === currentLessonId);

  if (matchingCurrentLesson || tags.length === 0) {
    return lessonById(currentLessonId);
  }

  return lessonById(lessonForCoachTag(tags[0]!));
}

export function lessonHabitCopy(lessonId: LessonId) {
  return LESSON_HABITS[lessonId];
}
