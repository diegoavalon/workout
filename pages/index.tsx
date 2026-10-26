import { Form, useForm } from "@void/react";
import type { Props } from "./index.server";

export default function HomePage({ messages }: Props) {
  const form = useForm("/", { text: "" });
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Welcome to Void
        </h1>
        <p className="max-w-2xl leading-relaxed text-neutral-700">
          This starter is running in Pages mode. The list below is loaded from your database in{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.9em] text-neutral-900">
            pages/index.server.ts
          </code>
          .
        </p>
        <p className="text-neutral-700">
          API example:{" "}
          <a href="/api/hello" className="font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800">
            /api/hello
          </a>
        </p>
      </div>

      {messages.length === 0 ? (
        <p className="border border-dashed border-neutral-300 px-4 py-6 text-neutral-700">
          No messages yet. Run{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.9em] text-neutral-900">
            void db seed
          </code>{" "}
          to load the sample row from{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.9em] text-neutral-900">
            db/seed.ts
          </code>
          .
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 border-y border-neutral-200">
          {messages.map((message) => (
            <li key={message.id} className="flex flex-col gap-1 py-4">
              <strong className="font-medium text-neutral-900">{message.text}</strong>
              <small className="text-sm text-neutral-600">{String(message.createdAt)}</small>
            </li>
          ))}
        </ul>
      )}

      <Form form={form} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium text-neutral-900">
          Message
          <input
            value={form.data.text}
            onChange={(event) => form.setData("text", event.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base font-normal text-neutral-900 placeholder:text-neutral-500 focus:border-brand-600"
            placeholder="Write a message"
          />
        </label>
        <button
          disabled={form.pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add message
        </button>
      </Form>
    </div>
  );
}
