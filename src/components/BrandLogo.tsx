import niveloMark from "../assets/logo/nivelo-mark.svg";
import niveloMarkWhite from "../assets/logo/nivelo-mark-white.svg";

export function BrandLogo() {
  return (
    <span className="inline-flex items-center gap-2.5 font-heading">
      <img src={niveloMark} alt="" aria-hidden="true" className="size-8 shrink-0 dark:hidden" />
      <img src={niveloMarkWhite} alt="" aria-hidden="true" className="hidden size-8 shrink-0 dark:block" />
      <span className="flex flex-col gap-0.5">
        <span className="text-[22px] leading-none font-semibold tracking-tight">Tempo</span>
        <span className="text-xs leading-none text-muted-foreground">by nivelo</span>
      </span>
    </span>
  );
}
