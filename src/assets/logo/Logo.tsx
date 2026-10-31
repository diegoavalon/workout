// Clock-In by Nivelo — logo components. Text renders in the app font (Geist / Aeonik Soft), so it stays crisp and themable.
type Props = { className?: string; size?: number };

export function NiveloMark({ className, size = 24 }: Props) {
  const small = size <= 20;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {small
        ? <rect x="2" y="6" width="20" height="12" rx="6" stroke="currentColor" strokeWidth="3.25" />
        : <rect x="2.25" y="6.75" width="19.5" height="10.5" rx="5.25" stroke="currentColor" strokeWidth={size <= 32 ? 2.4 : 2.25} />}
      <circle cx="12" cy="12" r="2.75" fill="currentColor" />
    </svg>
  );
}

/** Main nav / sign-in story panel. variant "product" = Clock-In · by nivelo (3a); "brand" = nivelo | Clock-In (3b). */
export function ClockInLogo({ variant = "product", className }: { variant?: "product" | "brand"; className?: string }) {
  if (variant === "brand") {
    return (
      <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 8 }} aria-label="Nivelo Clock-In">
        <NiveloMark size={28} />
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.6px" }}>nivelo</span>
        <span aria-hidden="true" style={{ width: 1, height: 22, background: "currentColor", opacity: 0.2 }} />
        <span style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-0.5px", opacity: 0.65 }}>Clock-In</span>
      </span>
    );
  }
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 10 }} aria-label="Clock-In by Nivelo">
      <NiveloMark size={32} />
      <span style={{ display: "flex", flexDirection: "column", gap: 2, lineHeight: 1 }}>
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.6px" }}>Clock-In</span>
        <span style={{ fontSize: 12, opacity: 0.65 }}>by nivelo</span>
      </span>
    </span>
  );
}

/** Footer / app header where space is tight. */
export function ClockInCompact({ className }: { className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <NiveloMark size={20} />
      <span><strong style={{ fontWeight: 600 }}>Clock-In</strong> by nivelo</span>
    </span>
  );
}
