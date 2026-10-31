# Clock-In by Nivelo — logo kit

Final mark: **2a Balanced vial**. Color: ink #171717 on light, #FFFFFF on dark. Never recolor the bubble separately.

## Files
| File | Use |
| --- | --- |
| favicon.ico (16/32/48) | Legacy browsers, `/favicon.ico` |
| favicon.svg | Modern browsers (scales cleanly) |
| favicon-16.png, favicon-32.png | PNG fallbacks |
| apple-touch-icon.png (180) | iOS home screen (full-bleed; iOS rounds corners) |
| icon-192.png, icon-512.png + site.webmanifest | Android / PWA (maskable safe zone) |
| clockin-lockup-product(-white).svg | Main nav, sign-in panel — "Clock-In by nivelo" (3a) |
| clockin-lockup-brand(-white).svg | Main nav once there are several apps — "nivelo \| Clock-In" (3b) |
| clockin-compact(-white).svg | Footer, tight headers |
| nivelo-mark(-white).svg | Mark alone (avatars, loading, kiosk footer) |
| Logo.tsx | Preferred in-app implementation (replaces `PlumbMark` in src/app/shell.tsx) |

SVG lockups use live text (Geist → Aeonik Soft → system). For marketing or print, outline text in Figma first.

## <head>
```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#171717">
```

## Rules
- Clear space: one bubble diameter on all sides of the vial.
- Minimum size: mark 16 px (uses heavier stroke automatically ≤ 20 px); product lockup 120 px wide.
- Mark sits left of text, vertically centred; gap 10 px (product) / 8 px (brand, compact).
