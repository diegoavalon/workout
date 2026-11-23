import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { registerGenerated } from "../domain/generated-program";
import { buildPowerThrash, POWER_THRASH_RECOVERY_DAYS } from "../domain/power-thrash";
import { NewProgram } from "../new-program";
import { generateRecoveryWeeks } from "../persist/generate";
import { examplePowerThrashMaxes, powerThrashFixture, recoveryCorpusFixture } from "../test-fixtures/power-thrash";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), loadTemplate: vi.fn(), loadRecovery: vi.fn(), save: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: ReactNode }) => <a href="#review">{children}</a>,
}));
vi.mock("../generate/client", () => ({
  loadManifest: vi.fn().mockResolvedValue({ equipment: [] }),
  corpusCached: vi.fn().mockResolvedValue(false),
}));
vi.mock("../generate/power-thrash-client", () => ({ loadPowerThrashTemplate: mocks.loadTemplate, loadPowerThrashRecovery: mocks.loadRecovery }));
vi.mock("../data/db", () => ({ repo: { importGenerated: mocks.save } }));

const select = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));
const lift = () => screen.getByRole<HTMLInputElement>("textbox", { name: "Test lift 1 in pounds" });

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.clearAllMocks();
  mocks.loadTemplate.mockReset();
  mocks.loadTemplate.mockResolvedValue(powerThrashFixture);
  mocks.loadRecovery.mockResolvedValue(generateRecoveryWeeks(recoveryCorpusFixture, {
    track: "pump-lift-3x", seed: 20261123, weeks: 12, days: POWER_THRASH_RECOVERY_DAYS,
  }));
  mocks.save.mockImplementation(async (file) => ({ snapshot: registerGenerated(file), duplicate: false }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("lazily shows the max form, retains inputs in both forms, and saves a valid program", async () => {
  render(<NewProgram />);
  expect(mocks.loadTemplate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "4" }));
  fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
  fireEvent.change(screen.getByPlaceholderText("Pick one for me"), { target: { value: "27" } });

  select("Power Thrash II");
  await screen.findByRole("group", { name: "One-rep maxes" });
  expect(screen.getAllByRole("textbox")).toHaveLength(15);
  expect(screen.queryByRole("group", { name: "Days per week" })).toBeNull();
  expect(screen.queryByRole("group", { name: "Equipment" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Advanced" })).toBeNull();
  expect(screen.getByRole("radio", { name: "Full sets" }).getAttribute("aria-checked")).toBe("true");
  select("Half sets");
  fireEvent.click(screen.getByRole("button", { name: "Create program" }));
  expect(lift().getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById("max-test-lift-1-error")?.textContent).toBe("Enter your max.");
  expect(lift().getAttribute("aria-describedby")).toContain("max-test-lift-1-error");
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.change(lift(), { target: { value: "185" } });

  select("Pump Lift");
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("button", { name: "4" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
  expect(screen.getByPlaceholderText<HTMLInputElement>("Pick one for me").value).toBe("27");

  select("Power Thrash II");
  expect(lift().value).toBe("185");
  expect(screen.getByRole("radio", { name: "Half sets" }).getAttribute("aria-checked")).toBe("true");
  for (const field of screen.getAllByRole<HTMLInputElement>("textbox").slice(1)) {
    fireEvent.change(field, { target: { value: field.placeholder } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Create program" }));
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/generated/$id", params: { id: expect.stringMatching(/^gen-/) },
  }));
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
    options: expect.objectContaining({ setVolume: "half", maxes: expect.objectContaining({ "test-lift-1": 185 }) }),
  }));
});

it("prefills maxes and the start date for a saved Power Thrash II program", async () => {
  const snap = registerGenerated(buildPowerThrash(powerThrashFixture, examplePowerThrashMaxes, "2026-11-23"));
  render(<NewProgram from={snap} />);
  expect(screen.getByRole("radio", { name: "Power Thrash II" }).getAttribute("aria-checked")).toBe("true");
  await screen.findByRole("group", { name: "One-rep maxes" });
  expect(lift().value).toBe("175");
  expect(screen.getByRole("radio", { name: "Full sets" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByLabelText("Suggested start (a Monday)").textContent).toContain("Nov 23, 2026");
});

it("steps through the dumbbell weights in both directions and stops at 500 lb", async () => {
  render(<NewProgram />);
  select("Power Thrash II");
  await screen.findByRole("group", { name: "One-rep maxes" });
  const increase = screen.getByRole("button", { name: /^Increase Test lift 1$/ });
  const decrease = screen.getByRole("button", { name: /^Decrease Test lift 1$/ });
  fireEvent.click(increase);
  expect(lift().value).toBe("5");
  expect(decrease.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(increase);
  expect(lift().value).toBe("7.5");

  fireEvent.change(lift(), { target: { value: "25" } });
  fireEvent.keyDown(lift(), { key: "ArrowUp" });
  expect(lift().value).toBe("30");
  fireEvent.keyDown(lift(), { key: "ArrowDown" });
  expect(lift().value).toBe("25");
  fireEvent.keyDown(lift(), { key: "ArrowDown" });
  expect(lift().value).toBe("22.5");

  fireEvent.change(lift(), { target: { value: "50" } });
  for (const value of ["52.5", "55", "60"]) {
    fireEvent.click(increase);
    expect(lift().value).toBe(value);
  }
  for (const value of ["55", "52.5", "50"]) {
    fireEvent.click(decrease);
    expect(lift().value).toBe(value);
  }
  fireEvent.change(lift(), { target: { value: "495" } });
  fireEvent.keyDown(lift(), { key: "ArrowUp" });
  expect(lift().value).toBe("500");
  expect(increase.getAttribute("aria-disabled")).toBe("true");
  fireEvent.keyDown(lift(), { key: "ArrowUp" });
  expect(lift().value).toBe("500");
});

it("preserves a legacy max while validating newly entered weights", async () => {
  const legacyMaxes = { ...examplePowerThrashMaxes, "test-lift-1": 600 };
  const snap = registerGenerated(buildPowerThrash(powerThrashFixture, legacyMaxes, "2026-11-23"));
  render(<NewProgram from={snap} />);
  await screen.findByRole("group", { name: "One-rep maxes" });
  expect(lift().value).toBe("600");
  const secondLift = screen.getByRole("textbox", { name: "Test lift 2 in pounds" });
  const submit = screen.getByRole("button", { name: "Create program" });

  fireEvent.change(secondLift, { target: { value: "27.5" } });
  fireEvent.blur(secondLift);
  expect(screen.getByText("Use the stepper to choose an available weight.")).toBeTruthy();
  fireEvent.change(secondLift, { target: { value: "505" } });
  fireEvent.click(submit);
  expect(screen.getByText("Enter a weight from 5 to 500 lb.")).toBeTruthy();
  expect(mocks.save).not.toHaveBeenCalled();

  fireEvent.change(secondLift, { target: { value: "52.5" } });
  fireEvent.click(submit);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
    options: expect.objectContaining({ maxes: { ...legacyMaxes, "test-lift-2": 52.5 } }),
  })));
});

it("allows retrying a failed template request", async () => {
  mocks.loadTemplate.mockRejectedValueOnce(new Error("The template is unavailable."));
  render(<NewProgram />);
  select("Power Thrash II");
  await screen.findByText("The template is unavailable.");
  fireEvent.click(screen.getByRole("button", { name: "Retry download" }));
  await screen.findByRole("group", { name: "One-rep maxes" });
  expect(mocks.loadTemplate).toHaveBeenCalledTimes(2);
});

it("keeps the maxes and lets the user retry if recovery generation fails", async () => {
  const snap = registerGenerated(buildPowerThrash(powerThrashFixture, examplePowerThrashMaxes, "2026-11-23"));
  mocks.loadRecovery.mockRejectedValueOnce(new Error("The recovery source is unavailable."));
  render(<NewProgram from={snap} />);
  const submit = await screen.findByRole("button", { name: "Create program" });
  fireEvent.click(submit);
  await screen.findByText("The recovery source is unavailable.");
  expect(lift().value).toBe("175");
  expect(mocks.save).not.toHaveBeenCalled();

  fireEvent.click(submit);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
});
