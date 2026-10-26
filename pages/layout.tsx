import type { ReactNode } from "react";
import { Link } from "@void/react";
import "../src/styles/global.css";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-neutral-900">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-neutral-900 hover:text-brand-700"
          >
            Workout
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
            <Link
              href="/"
              className="rounded-md px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
            >
              Home
            </Link>
            <a
              href="/api/hello"
              className="rounded-md px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
            >
              API
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>

      <footer className="border-t border-neutral-200">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-6 text-sm text-neutral-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="font-medium text-neutral-900">Workout</p>
          <p>Built with Void and Tailwind CSS.</p>
        </div>
      </footer>
    </div>
  );
}
