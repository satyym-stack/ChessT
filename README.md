# ChessT

ChessT is a local-first chess trainer for beginners who want to improve by actually playing, getting corrected, and repeating the patterns they keep missing.

It is built as a personal daily-use app, but it can also be hosted publicly so anyone can open it in the browser and use it without creating an account.

## Quick Snapshot

- `♟` Play full games on a real board
- `◉` Get corrected by a beginner-friendly coach
- `↺` Repeat weak patterns through drills
- `✦` Follow a structured lesson path
- `⌘` Keep all progress stored locally in the browser

## What ChessT Does

ChessT is designed to feel more like a coach than a plain puzzle app:

- `Learn` → follow a structured beginner lesson path
- `Coach` → play a real game against a local engine and get corrected when you make bad moves
- `Drills` → repeat patterns and weak spots until they become automatic
- `Review` → turn your finished games into concrete lessons
- `Progress` → track your practice, lesson completion, and local backup/export

## Main Features

- `✓` Real playable chess board
- `✓` Beginner-friendly coaching during games
- `✓` Lesson-aware feedback tied to your current training focus
- `✓` Daily drill sessions with repetition scheduling
- `✓` Review summaries based on your own mistakes
- `✓` Local engine analysis in the browser using Stockfish
- `✓` Local-only storage with export/import backup support
- `✓` No accounts, no backend, no cloud sync

## Tech Stack

- `⚛` `React`
- `◆` `TypeScript`
- `⚡` `Vite`
- `♞` `chess.js`
- `▣` `react-chessboard`
- `♜` `Stockfish` running locally in the browser
- `🧪` `Vitest` and `Testing Library`

## Local Data and Privacy

ChessT stores your progress in your browser using `IndexedDB`.

That means:

- `✓` your games and progress stay on your device
- `✓` your data is not pushed to GitHub when you publish the repo
- `✓` people using your hosted version keep their own data in their own browser

Important:

- `⚠` if you clear your browser storage, your local progress will be lost
- `⚠` if you switch devices, your data does not automatically follow you
- `⚠` use the `Progress` screen export/import tools if you want backups

## Getting Started

### Requirements

- a recent version of `Node.js`
- `npm`

### Install

```bash
npm install
```

### Run Locally

```bash
npm run dev
```

Then open the local URL shown by Vite in your terminal.

## Available Scripts

```bash
npm run dev
```

Starts the development server.

```bash
npm run build
```

Creates a production build in `dist/`.

```bash
npm run preview
```

Previews the production build locally.

```bash
npm test
```

Runs the test suite once.

```bash
npm run test:watch
```

Runs the tests in watch mode.

## How To Use ChessT

A simple daily flow looks like this:

1. `→` Open `Learn` and focus on one lesson.
2. `→` Play one game in `Coach`.
3. `→` Accept the feedback and retry bad moves when the coach stops you.
4. `→` Open `Review` to see what went wrong.
5. `→` Finish a short session in `Drills` to reinforce the same ideas.

## GitHub Pages Deployment

ChessT can be hosted as a static site because it runs entirely in the browser.

### Important Vite Base Path Note

If you host this on a GitHub Pages project site such as:

```text
https://your-username.github.io/chesst/
```

you need to build with the correct base path.

You have two options:

1. `Option A` Edit `vite.config.ts` and add:

```ts
export default defineConfig({
  base: "/chesst/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    css: true,
  },
});
```

2. `Option B` Build manually with a base path:

```bash
npx vite build --base=/chesst/
```

If you are hosting at the root domain, such as `https://your-username.github.io/`, you usually do not need a custom base path.

### Basic Deployment Flow

1. `→` Push the repo to GitHub.
2. `→` Build the app.
3. `→` Publish the `dist/` folder with GitHub Pages.

If you use GitHub Actions for Pages, make sure the workflow deploys the generated `dist/` directory.

## Project Structure

```text
src/
  data/       static lessons, themes, and training positions
  lib/        engine, coach, storage, repetition, and session logic
  App.tsx     main UI and app flow
public/
  stockfish/  browser engine assets
```

## Current Product Direction

ChessT is intentionally focused on beginner improvement through:

- `•` real play
- `•` correction
- `•` repetition
- `•` simple explanations
- `•` structured lessons

It is not trying to be a full online chess platform.

Current non-goals:

- `×` multiplayer
- `×` accounts
- `×` cloud sync
- `×` PGN import from external sites
- `×` heavy engine analysis dashboards

## Notes For Contributors

- `•` Keep the app local-first
- `•` Keep the explanations beginner-friendly
- `•` Prefer coaching and repetition over feature bloat
- `•` Avoid turning the product into a generic chess UI without teaching value

## License

This repository does not currently include a license file.
