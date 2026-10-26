<!--injected-by-void-v1.2.1-->
## Void

- This project uses [Void](https://void.cloud), a full-stack Vite framework for Cloudflare Workers with file-based API routing, server-rendered pages, and typed backend services.
- Use Void's CLI and typed APIs. Before working with Void, read the relevant Markdown docs in `node_modules/void/docs/`; start with `guide/quickstart.md` for setup and `reference/cli.md` for commands.

<!--/injected-by-void-->

## Client Pages

- Style client pages (`pages/**/*.tsx`) with Tailwind utility classes inline in `className`. Put only global styles and theme tokens in `src/styles/global.css` (imported by `pages/layout.tsx`); do not add per-page CSS files.
- For UI components, only use components found in `src/components/` (currently `src/components/ui/`). Do not import UI components from other directories or packages; Void framework primitives from `@void/react` (e.g. `Link`, `Form`) are not UI components.
