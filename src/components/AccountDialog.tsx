import { useEffect, useRef, useState } from "react";
import type { Account } from "../types";

type Props = {
  account: Account | null;
  onSave: (account: Account) => void;
  onCancel: () => void;
};

const EMPTY: Account = { riot_name: "", tag: "NA1", login: "", password: "" };

export function AccountDialog({ account, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Account>(account ?? EMPTY);
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => firstField.current?.focus(), []);

  // Escape is handled globally in App.

  const set = (patch: Partial<Account>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (error) setError("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.riot_name.trim()) return setError("Riot name is required.");
    if (!draft.tag.trim()) return setError("Tag is required, for example NA1.");
    onSave({
      riot_name: draft.riot_name.trim(),
      tag: draft.tag.trim().replace(/^#/, ""),
      login: draft.login.trim(),
      password: draft.password,
    });
  };

  return (
    <div
      className="fade-in absolute inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(9,8,7,.66)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <form
        onSubmit={submit}
        className="pop-in w-full max-w-[400px] rounded-[14px] p-[22px]"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-line-hi)",
          boxShadow: "0 24px 50px rgba(0,0,0,.55)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-[17px] font-medium tracking-[-0.01em]">
          {account ? "Edit account" : "Add account"}
        </h2>

        <div className="mt-5 flex flex-col gap-3.5">
          <div className="flex gap-2.5">
            <Field caption="Riot name" className="min-w-0 flex-1">
              <input
                ref={firstField}
                className="text-input w-full box-border"
                placeholder="Summoner name"
                value={draft.riot_name}
                onChange={(e) => set({ riot_name: e.target.value })}
              />
            </Field>
            <Field caption="Tag" className="w-24 flex-none">
              <input
                className="text-input w-full box-border"
                placeholder="NA1"
                value={draft.tag}
                onChange={(e) => set({ tag: e.target.value })}
              />
            </Field>
          </div>

          <Field caption="Account name">
            <input
              className="text-input w-full box-border"
              placeholder="Login username"
              value={draft.login}
              onChange={(e) => set({ login: e.target.value })}
            />
          </Field>

          <Field caption="Password">
            <div className="flex gap-2">
              <input
                className="text-input min-w-0 flex-1"
                type={reveal ? "text" : "password"}
                placeholder="Password"
                value={draft.password}
                onChange={(e) => set({ password: e.target.value })}
              />
              <button
                type="button"
                className="ghost-lg press"
                onClick={() => setReveal((v) => !v)}
              >
                {reveal ? "Hide" : "Show"}
              </button>
            </div>
          </Field>
        </div>

        {error && <p className="mt-3 text-xs text-error">{error}</p>}

        <div className="mt-[22px] flex justify-end gap-2.5">
          <button
            type="button"
            className="press rounded-lg border border-line-hi px-3.5 py-[9px] text-[13px] text-muted transition-colors hover:border-line-hover hover:text-ink"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="press rounded-lg bg-accent px-[18px] py-[9px] text-[13px] font-medium text-[#0E0D0B] transition-colors hover:bg-accent-hi"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  caption,
  className,
  children,
}: {
  caption: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="font-mono text-[10px] tracking-[0.12em] text-muted-2 uppercase">
        {caption}
      </span>
      {children}
    </label>
  );
}
