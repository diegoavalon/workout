import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExerciseCountdown } from "./ExerciseCountdown";

describe("ExerciseCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const renderTimer = (seconds = 30) => render(<dl><dt>Time</dt><ExerciseCountdown seconds={seconds} label="Time" /></dl>);
  const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  const countdown = () => screen.getByRole("timer", { name: "Time countdown" }).textContent;

  it("waits for play, preserves partial seconds when paused, and resumes", () => {
    renderTimer();
    expect(countdown()).toBe("30 s");
    advance(5_000);
    expect(countdown()).toBe("30 s");

    fireEvent.click(screen.getByRole("button", { name: "Start time timer" }));
    advance(1_500);
    fireEvent.click(screen.getByRole("button", { name: "Pause time timer" }));
    expect(countdown()).toBe("29 s");
    expect(screen.getByRole("button", { name: "Resume time timer" })).toBeTruthy();
    advance(10_000);
    expect(countdown()).toBe("29 s");

    fireEvent.click(screen.getByRole("button", { name: "Resume time timer" }));
    advance(28_400);
    expect(countdown()).toBe("1 s");
    advance(200);
    expect(countdown()).toBe("0 s");
    expect(screen.getByRole("status").textContent).toBe("Time’s up");
  });

  it("stops at zero, announces completion, and can be restarted", () => {
    renderTimer(2);
    fireEvent.click(screen.getByRole("button", { name: "Start time timer" }));
    advance(3_000);
    expect(countdown()).toBe("0 s");
    expect(screen.getByRole("status").textContent).toBe("Time’s up");
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Restart time timer" }));
    expect(countdown()).toBe("2 s");
    advance(1_000);
    expect(countdown()).toBe("1 s");
  });

  it.each([false, true])("reset restores the prescription and stops the countdown (paused: %s)", (pause) => {
    renderTimer(180);
    fireEvent.click(screen.getByRole("button", { name: "Start time timer" }));
    advance(2_000);
    if (pause) fireEvent.click(screen.getByRole("button", { name: "Pause time timer" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset time timer" }));
    expect(countdown()).toBe("3:00");
    expect(screen.getByRole("button", { name: "Start time timer" })).toBeTruthy();
    advance(5_000);
    expect(countdown()).toBe("3:00");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("catches up after a backgrounded tab without relying on interval ticks", () => {
    renderTimer(60);
    fireEvent.click(screen.getByRole("button", { name: "Start time timer" }));
    vi.setSystemTime(new Date("2026-10-29T12:00:45Z"));
    fireEvent(document, new Event("visibilitychange"));
    expect(countdown()).toBe("15 s");
    vi.setSystemTime(new Date("2026-10-29T12:02:00Z"));
    fireEvent(document, new Event("visibilitychange"));
    expect(countdown()).toBe("0 s");
    expect(screen.getByRole("status").textContent).toBe("Time’s up");
  });

  it("cleans up a running countdown when the exercise is unmounted", () => {
    const { unmount } = renderTimer();
    fireEvent.click(screen.getByRole("button", { name: "Start time timer" }));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
