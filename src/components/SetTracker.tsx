import { cn } from "../lib/utils";
import { Checkbox } from "./ui/checkbox";
import { CheckboxGroup } from "./ui/checkbox-group";
import { Label } from "./ui/label";

export type SetTracking = {
  count: number;
  completed: string[];
  onChange: (value: string[]) => void;
};

export function SetTracker({ count, completed, onChange, label, unit = "Set", compact = false }: SetTracking & { label: string; unit?: "Set" | "Round"; compact?: boolean }) {
  const complete = count > 0 && completed.length === count;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {!compact && <span>{unit}s completed</span>}
        <span role="status" className={cn(complete && "text-success-foreground")}>
          {completed.length} of {count} {compact ? `${unit.toLowerCase()}s completed` : "completed"}
        </span>
      </div>
      <CheckboxGroup aria-label={`Completed ${unit.toLowerCase()}s for ${label}`} value={completed} onValueChange={onChange} className={cn("flex-row flex-wrap", compact ? "gap-1" : "gap-2")}>
        {Array.from({ length: count }, (_, i) => {
          const value = String(i + 1);
          const checked = completed.includes(value);
          return (
            <Label key={value} className={cn("min-h-11 cursor-pointer rounded-lg border bg-card transition-colors", compact ? "min-w-11 justify-center gap-1.5 px-1.5" : "bg-muted px-3", checked && "border-success/40 bg-success/8 text-success-foreground")}>
              <Checkbox value={value} className={compact ? "size-4" : undefined} />
              <span><span className={cn(compact && "sr-only")}>{unit} </span>{value}</span>
            </Label>
          );
        })}
      </CheckboxGroup>
    </div>
  );
}
