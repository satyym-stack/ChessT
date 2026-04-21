import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, expect, it } from "vitest";
import App from "./App";

vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options: {
      onPieceDrop: (args: { sourceSquare: string; targetSquare: string }) => boolean;
    };
  }) => (
    <div>
      <button
        type="button"
        onClick={() => options.onPieceDrop({ sourceSquare: "g1", targetSquare: "f3" })}
      >
        Play Nf3
      </button>
      <button
        type="button"
        onClick={() => options.onPieceDrop({ sourceSquare: "a2", targetSquare: "a3" })}
      >
        Play a3
      </button>
    </div>
  ),
}));

describe("app flow", () => {
  it("starts a drill session, records a rating, and persists after rerender", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await screen.findByRole("button", { name: "Drills" });
    await user.click(screen.getByRole("button", { name: "Drills" }));
    await user.click(screen.getByRole("button", { name: "Start Daily Drills" }));

    await screen.findByText(/Rep 1 of 12/i);
    await user.click(screen.getByRole("button", { name: "Play Nf3" }));
    await user.click(screen.getByRole("button", { name: "Reveal Solution" }));
    await user.click(screen.getByRole("button", { name: "good" }));

    await waitFor(() => {
      expect(screen.getByText(/Rep 2 of 12/i)).toBeTruthy();
    });

    unmount();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Drills" }));

    await waitFor(() => {
      expect(screen.getByText(/Rep 2 of 12/i)).toBeTruthy();
    });
  });
});
