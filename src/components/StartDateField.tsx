import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { isMonday } from "../domain/calendar";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Field, FieldDescription, FieldLabel } from "./ui/field";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";

/** "Suggested start (a Monday)" picker shared by the program forms. `error` is shown only when given. */
export function StartDateField({ value, onChange, disabled, error }: { value: string; onChange: (date: string) => void; disabled?: boolean; error?: string }) {
  const [open, setOpen] = useState(false);
  const selected = isMonday(value) ? new Date(`${value}T00:00:00`) : undefined;
  return (
    <Field invalid={!!error} disabled={disabled} className="gap-3">
      <FieldLabel htmlFor="program-start" className="text-sm leading-5 font-semibold">Suggested start (a Monday)</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id="program-start"
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? "start-date-hint start-date-error" : "start-date-hint"}
          render={<Button type="button" variant="outline" className="min-h-11 w-full max-w-64 justify-between gap-3 px-3 font-normal" />}
        >
          {selected ? selected.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Choose a Monday"}
          <CalendarIcon aria-hidden="true" className="text-muted-foreground" />
        </PopoverTrigger>
        <PopoverPopup align="start" aria-label="Choose a Monday">
          <Calendar
            mode="single"
            required
            autoFocus
            weekStartsOn={1}
            defaultMonth={selected}
            selected={selected}
            disabled={(date) => !!disabled || date.getDay() !== 1}
            onSelect={(date) => {
              onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
              setOpen(false);
            }}
          />
        </PopoverPopup>
      </Popover>
      <FieldDescription id="start-date-hint" className="text-[13px] leading-relaxed">Go at your own pace. Missed dates never skip a session.</FieldDescription>
      {error && <p id="start-date-error" role="alert" className="text-[13px] text-destructive-foreground">{error}</p>}
    </Field>
  );
}
