import type { ThemeMeta, ThemeId } from "../types";

export const THEME_ORDER: ThemeId[] = [
  "opening-principles",
  "mate-in-1",
  "mate-in-2",
  "forks",
  "pins-skewers",
  "hanging-pieces",
  "back-rank",
  "king-pawn-endgames",
];

export const THEMES: ThemeMeta[] = [
  {
    id: "opening-principles",
    title: "Opening Principles",
    shortLabel: "Opening",
    description: "Build development habits, center control, and king safety.",
    accent: "#c96b2c",
  },
  {
    id: "mate-in-1",
    title: "Mate in 1",
    shortLabel: "M1",
    description: "Spot immediate checkmates without hesitation.",
    accent: "#d94f3d",
  },
  {
    id: "mate-in-2",
    title: "Mate in 2",
    shortLabel: "M2",
    description: "Find forcing first moves and follow-up mating patterns.",
    accent: "#c63f5f",
  },
  {
    id: "forks",
    title: "Forks",
    shortLabel: "Forks",
    description: "Train double attacks with knights, queens, and pawns.",
    accent: "#18817e",
  },
  {
    id: "pins-skewers",
    title: "Pins and Skewers",
    shortLabel: "Pins",
    description: "Punish overloaded lines and trapped defenders.",
    accent: "#1c73af",
  },
  {
    id: "hanging-pieces",
    title: "Hanging Pieces",
    shortLabel: "Loose",
    description: "Notice undefended pieces and simple tactical wins.",
    accent: "#4c8d3a",
  },
  {
    id: "back-rank",
    title: "Back-Rank Ideas",
    shortLabel: "Back Rank",
    description: "Recognize boxed kings and finishing rook or queen blows.",
    accent: "#6d5fd1",
  },
  {
    id: "king-pawn-endgames",
    title: "King and Pawn Endgames",
    shortLabel: "Endgames",
    description: "Practice opposition, breakthrough, and promotion races.",
    accent: "#7e6a34",
  },
];

export const themeById = (themeId: ThemeId) =>
  THEMES.find((theme) => theme.id === themeId)!;
