import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { repo } from "../data/db";
import { isMonday } from "../domain/calendar";
import type { GeneratedSnapshot } from "../domain/generated-program";
import { buildPowerThrash, savedPowerThrashSupport, validateMaxes, type PowerThrashSetVolume, type PtTemplate } from "../domain/power-thrash";
import type { GenerateProgress } from "../generate/client";
import { loadPowerThrashSupport, loadPowerThrashTemplate } from "../generate/power-thrash-client";
import { nextMonday } from "../generate/options";
import { StartDateField } from "./StartDateField";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Field, FieldError, FieldLabel } from "./ui/field";
import { Label } from "./ui/label";
import {
  NumberField, NumberFieldDecrement, NumberFieldGroup, NumberFieldIncrement, NumberFieldInput,
} from "./ui/number-field";
import { Progress } from "./ui/progress";
import { Radio, RadioGroup } from "./ui/radio-group";

const MIN_WEIGHT = 5;
const MAX_WEIGHT = 500;
const WEIGHT_STEPS = [
  MIN_WEIGHT, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 30, 35, 40, 45, 50, 52.5,
  ...Array.from({ length: (MAX_WEIGHT - 50) / 5 }, (_, index) => 55 + 5 * index),
];

function stepWeight(value: number | null, direction: 1 | -1): number {
  if (value === null) return MIN_WEIGHT;
  if (direction === 1) return WEIGHT_STEPS.find((weight) => weight > value) ?? MAX_WEIGHT;

  const index = WEIGHT_STEPS.findIndex((weight) => weight >= value);
  return index < 0 ? MAX_WEIGHT : WEIGHT_STEPS[index - 1] ?? MIN_WEIGHT;
}

type TemplateState = { status: "loading" } | { status: "ready"; template: PtTemplate } | { status: "error"; message: string };

type Props = {
  active: boolean;
  from?: GeneratedSnapshot;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onSaved: (snapshot: GeneratedSnapshot, duplicate: boolean) => void;
};

export function PowerThrashFields({ active, from, saving, onSavingChange, onSaved }: Props) {
  const [loaded, setLoaded] = useState<TemplateState>({ status: "loading" });
  const [startDate, setStartDate] = useState(() => from?.startDate ?? nextMonday());
  const [setVolume, setSetVolume] = useState<PowerThrashSetVolume>(() => from?.file.options.setVolume === "half" ? "half" : "full");
  const savedMaxes = from?.file.options.maxes;
  const [values, setValues] = useState<Partial<Record<string, number | null>>>(() => ({ ...savedMaxes }));
  const [blurred, setBlurred] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [supportProgress, setSupportProgress] = useState<GenerateProgress | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!active || loaded.status !== "loading") return;
    const controller = new AbortController();
    loadPowerThrashTemplate(controller.signal).then(
      (template) => {
        if (!controller.signal.aborted) setLoaded({ status: "ready", template });
      },
      (error: Error) => {
        if (!controller.signal.aborted) setLoaded({ status: "error", message: error.message });
      },
    );
    return () => controller.abort();
  }, [active, loaded.status]);

  if (!active) return null;
  if (loaded.status === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border p-4 text-sm">
        <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" /> Loading Power Thrash II…
      </p>
    );
  }
  if (loaded.status === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="error"><TriangleAlertIcon /><AlertTitle>Couldn’t load Power Thrash II</AlertTitle><AlertDescription>{loaded.message}</AlertDescription></Alert>
        <Button type="button" variant="outline" onClick={() => setLoaded({ status: "loading" })}>Retry download</Button>
      </div>
    );
  }

  const { template } = loaded;
  const maxes = Object.fromEntries(template.maxes.map(({ id }) => [id, values[id] ?? NaN]));
  const errors = validateMaxes(template, maxes);
  for (const [id, value] of Object.entries(maxes)) {
    // Older snapshots can contain maxes outside the new choices.
    if (!Number.isFinite(value) || value === savedMaxes?.[id]) continue;
    if (value < MIN_WEIGHT || value > MAX_WEIGHT) errors[id] = "Enter a weight from 5 to 500 lb.";
    else if (!WEIGHT_STEPS.includes(value)) errors[id] = "Use the stepper to choose an available weight.";
  }
  const dateError = isMonday(startDate) ? undefined : "Start date must be a Monday.";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (busy.current || Object.keys(errors).length || dateError) return;
    busy.current = true;
    onSavingChange(true);
    setSaveError("");
    try {
      const weeks = template.weeks.length;
      const { recovery, warmups } = savedPowerThrashSupport(from?.file, weeks);
      const needRecovery = !recovery;
      const needWarmups = !warmups;
      const generated = needRecovery || needWarmups
        ? await loadPowerThrashSupport({ weeks, startDate, needRecovery, needWarmups }, setSupportProgress)
        : undefined;
      setSupportProgress(null);
      const support = template.weeks.map((_, index) => [
        ...(recovery?.[index] ?? []),
        ...(warmups?.[index] ?? []),
        ...(generated?.[index] ?? []),
      ]);
      const saved = await repo.importGenerated(buildPowerThrash(template, maxes, startDate, setVolume, support));
      if (!saved.snapshot) throw new Error(saved.errors.join(" "));
      onSaved(saved.snapshot, saved.duplicate);
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : "Try saving again.");
    } finally {
      busy.current = false;
      setSupportProgress(null);
      onSavingChange(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-busy={saving} className="flex flex-col gap-7 sm:gap-8">
      <fieldset className="min-w-0">
        <legend id="power-thrash-set-volume" className="mb-3 text-sm font-semibold">Sets per exercise</legend>
        <RadioGroup
          aria-labelledby="power-thrash-set-volume"
          aria-describedby="power-thrash-set-volume-hint"
          value={setVolume}
          onValueChange={(value) => { if (value === "full" || value === "half") setSetVolume(value); }}
          disabled={saving}
          className="grid max-w-sm grid-cols-2 gap-2"
        >
          {(["full", "half"] as const).map((volume) => {
            const label = volume === "full" ? "Full sets" : "Half sets";
            return (
              <Label key={volume} className="min-h-11 cursor-pointer rounded-lg border p-3 has-data-checked:border-foreground/60 has-data-checked:bg-accent/60">
                <Radio value={volume} aria-label={label} />
                {label}
              </Label>
            );
          })}
        </RadioGroup>
        <p id="power-thrash-set-volume-hint" className="mt-2 text-sm text-muted-foreground">Choose Half sets to keep the first half of each exercise’s sets, rounded up.</p>
      </fieldset>
      <fieldset className="min-w-0 border-y py-6">
        <legend className="text-sm font-semibold">One-rep maxes</legend>
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {template.maxes.map((max) => {
            const fieldId = `max-${max.id}`;
            const error = submitted || blurred.has(max.id) ? errors[max.id] : undefined;
            const value = values[max.id] ?? null;
            return (
              <Field key={max.id} invalid={!!error} disabled={saving}>
                <FieldLabel htmlFor={fieldId} className="min-h-5 text-sm leading-5">{max.label}<span className="sr-only"> in pounds</span></FieldLabel>
                <NumberField
                  id={fieldId}
                  min={MIN_WEIGHT}
                  max={MAX_WEIGHT}
                  step="any"
                  allowOutOfRange
                  required
                  value={value}
                  onValueChange={(next, details) => {
                    // A stepper press can normalize a typed value before applying its actual step.
                    const fromButton = details.reason === "increment-press" || details.reason === "decrement-press";
                    if (fromButton && value !== null && details.direction === undefined) {
                      details.cancel();
                      return;
                    }
                    const weight = details.direction ? stepWeight(value, details.direction) : next;
                    setValues((previous) => ({ ...previous, [max.id]: weight }));
                  }}
                >
                  <NumberFieldGroup>
                    <NumberFieldDecrement aria-label={`Decrease ${max.label}`} className="min-w-11 aria-disabled:opacity-50" />
                    <div className="flex min-w-0 flex-1 items-center">
                      <NumberFieldInput
                        inputMode="decimal"
                        placeholder={WEIGHT_STEPS.includes(max.example) ? String(max.example) : undefined}
                        className="min-h-11 text-end"
                        onBlur={() => setBlurred((previous) => new Set(previous).add(max.id))}
                      />
                      <span aria-hidden="true" className="pe-2 text-sm text-muted-foreground">{template.unit}</span>
                    </div>
                    <NumberFieldIncrement aria-label={`Increase ${max.label}`} className="min-w-11 aria-disabled:opacity-50" />
                  </NumberFieldGroup>
                </NumberField>
                {error && <FieldError match id={`${fieldId}-error`}>{error}</FieldError>}
              </Field>
            );
          })}
        </div>
      </fieldset>
      <StartDateField value={startDate} onChange={setStartDate} disabled={saving} error={submitted ? dateError : undefined} />
      <p className="text-sm text-muted-foreground">Training starts with a Persist warm-up. Optional recovery on Tuesday, Thursday, and Saturday. Rest on Sunday.</p>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p className="text-pretty">Original program by {template.credit}.</p>
      </div>
      <div className="flex flex-col gap-4 border-t pt-6">
        {supportProgress && (
          <div role="status" className="flex flex-col gap-2 text-sm">
            <span>{supportProgress.phase === "download" ? "Downloading source programs…" : "Preparing warm-ups and recovery…"}</span>
            {supportProgress.phase === "download" && supportProgress.total
              ? <Progress value={100 * (supportProgress.loaded ?? 0) / supportProgress.total} aria-label="Source program download progress" />
              : null}
          </div>
        )}
        {saveError && <Alert variant="error"><TriangleAlertIcon /><AlertTitle>Couldn’t save your program</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}
        {from && <p className="text-sm text-muted-foreground">Changed inputs create a separate program. Your progress stays with the original.</p>}
        <div className="flex flex-col justify-end gap-2 sm:flex-row">
          {from && <Button type="button" size="xl" variant="outline" disabled={saving} render={<Link to="/generated/$id" params={{ id: from.id }} />}>Back to review</Button>}
          <Button type="submit" size="xl" disabled={saving}>
            {saving ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : null}
            {saving ? "Saving…" : "Create program"}
            {!saving && <ArrowRightIcon aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </form>
  );
}
