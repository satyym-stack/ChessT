import { uciLineToSan, uciToSan } from "./coach";
import type { EngineAnalysis } from "../types";

type PendingRequest = {
  fen: string;
  resolve: (analysis: EngineAnalysis) => void;
  reject: (error: unknown) => void;
  latestInfo: {
    depth: number;
    scoreCp: number | null;
    mateIn: number | null;
    pvUci: string[];
  } | null;
  timer: number;
};

function createWorkerUrl() {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  const scriptUrl = new URL("stockfish/stockfish-18-lite-single.js", baseUrl).toString();
  const wasmUrl = new URL("stockfish/stockfish-18-lite-single.wasm", baseUrl).toString();
  return `${scriptUrl}#${encodeURIComponent(wasmUrl)},worker`;
}

function parseInfoLine(line: string) {
  const depthMatch = line.match(/\bdepth (\d+)/);
  const cpMatch = line.match(/\bscore cp (-?\d+)/);
  const mateMatch = line.match(/\bscore mate (-?\d+)/);
  const pvMatch = line.match(/\bpv (.+)$/);

  return {
    depth: Number(depthMatch?.[1] ?? 0),
    scoreCp: cpMatch ? Number(cpMatch[1]) : null,
    mateIn: mateMatch ? Number(mateMatch[1]) : null,
    pvUci: pvMatch?.[1] ? pvMatch[1].trim().split(/\s+/).slice(0, 6) : [],
  };
}

class StockfishClient {
  private worker: Worker;

  private pending: PendingRequest | null = null;

  private initialized = false;

  private initPromise: Promise<void>;

  private queue: Promise<void> = Promise.resolve();

  private readyResolver: (() => void) | null = null;

  private readyRejecter: ((error: unknown) => void) | null = null;

  constructor() {
    this.worker = new Worker(createWorkerUrl());
    this.worker.onmessage = (event) => {
      this.handleLine(String(event.data));
    };
    this.worker.onerror = (event) => {
      this.readyRejecter?.(event.message || "Stockfish worker failed to load");
      this.readyRejecter = null;
      this.readyResolver = null;
    };
    this.initPromise = new Promise((resolve, reject) => {
      this.readyResolver = resolve;
      this.readyRejecter = reject;
      window.setTimeout(() => {
        if (!this.initialized) {
          reject(new Error("Stockfish worker did not initialize"));
        }
      }, 3000);
    });
    this.worker.postMessage("uci");
  }

  private handleLine(line: string) {
    if (!this.initialized && line === "uciok") {
      this.initialized = true;
      this.readyResolver?.();
      this.readyResolver = null;
      this.readyRejecter = null;
      return;
    }

    if (!this.pending) {
      return;
    }

    if (line.startsWith("info ")) {
      this.pending.latestInfo = parseInfoLine(line);
      return;
    }

    if (line.startsWith("bestmove ")) {
      const current = this.pending;
      window.clearTimeout(current.timer);
      this.pending = null;
      const bestMoveUci = line.split(/\s+/)[1] ?? "";
      const pvUci = current.latestInfo?.pvUci?.length
        ? current.latestInfo.pvUci
        : bestMoveUci
          ? [bestMoveUci]
          : [];

      current.resolve({
        fen: current.fen,
        bestMoveUci,
        bestMoveSan: bestMoveUci ? uciToSan(current.fen, bestMoveUci) : "",
        scoreCp: current.latestInfo?.scoreCp ?? null,
        mateIn: current.latestInfo?.mateIn ?? null,
        depth: current.latestInfo?.depth ?? 0,
        pvUci,
        pvSan: uciLineToSan(current.fen, pvUci),
      });
    }
  }

  async analyzePosition(
    fen: string,
    skill: number,
    moveTimeMs: number,
  ): Promise<EngineAnalysis> {
    await this.initPromise;

    const run = async () =>
      new Promise<EngineAnalysis>((resolve, reject) => {
        this.pending = {
          fen,
          resolve,
          reject,
          latestInfo: null,
          timer: window.setTimeout(() => {
            this.pending = null;
            reject(new Error("Stockfish analysis timed out"));
          }, Math.max(moveTimeMs + 3000, 4000)),
        };

        const skillLevel = Math.max(0, Math.min(20, skill * 4 - 1));
        const elo = 700 + skill * 250;

        this.worker.postMessage("ucinewgame");
        this.worker.postMessage("setoption name UCI_LimitStrength value true");
        this.worker.postMessage(`setoption name UCI_Elo value ${elo}`);
        this.worker.postMessage(`setoption name Skill Level value ${skillLevel}`);
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go movetime ${moveTimeMs}`);
      });

    const next = this.queue.then(run);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );

    return next;
  }

  dispose() {
    this.worker.postMessage("quit");
    this.worker.terminate();
  }
}

let stockfishClient: StockfishClient | null = null;

export function getStockfishClient() {
  stockfishClient ??= new StockfishClient();
  return stockfishClient;
}
