import { useState } from "react";
import { Trash2Icon } from "lucide-react";
import {
  AlertDialog, AlertDialogClose, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogPopup, AlertDialogTitle, AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { repo } from "../data/db";
import type { GeneratedSnapshot } from "../domain/generated-program";

export function DeleteProgramButton({ program, active, hasFallback, onDeleted }: {
  program: GeneratedSnapshot;
  active: boolean;
  hasFallback: boolean;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await repo.deleteGenerated(program.id);
    } catch {
      setError("Couldn’t delete this program. Please try again.");
      setDeleting(false);
      return;
    }
    setOpen(false);
    setDeleting(false);
    onDeleted();
  };
  return (
    <AlertDialog open={open} onOpenChange={(value) => { if (!deleting) { setOpen(value); setError(null); } }}>
      <AlertDialogTrigger render={<Button type="button" variant="ghost" size="icon-lg" className="me-2 text-muted-foreground hover:bg-destructive/8 hover:text-destructive-foreground" />} aria-label={`Delete ${program.title}`}>
        <Trash2Icon aria-hidden="true" />
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete program?</AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed">
            This will delete <strong className="font-medium text-foreground">{program.title}</strong> and all its training history, checkmarks, and notes from this device. This can’t be undone.
          </AlertDialogDescription>
          {active && <p className="text-sm leading-relaxed text-muted-foreground">{hasFallback ? "This is your active program. Your most recently active remaining program will become active." : "This is your active program. You’ll need to choose or generate another one to continue training."}</p>}
          {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button type="button" variant="ghost" disabled={deleting} />}>Cancel</AlertDialogClose>
          <Button type="button" variant="destructive" loading={deleting} onClick={remove}>Delete program</Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
