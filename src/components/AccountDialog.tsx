import { useEffect, useRef, useState } from "react";
import type { Account } from "../types";
import { ROLES } from "../types";

type Props = {
  account: Account | null;
  onSave: (account: Account) => void;
  onCancel: () => void;
};

const EMPTY: Account = { riot_name: "", tag: "NA1", login: "", password: "", role: null };

export function AccountDialog({ account, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Account>(account ?? EMPTY);
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => firstField.current?.focus(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const set = (patch: Partial<Account>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.riot_name.trim()) return setError("Riot name is required.");
    if (!draft.tag.trim()) return setError("Tag is required (for example NA1).");
    onSave({
      riot_name: draft.riot_name.trim(),
      tag: draft.tag.trim().replace(/^#/, ""),
      login: draft.login.trim(),
      password: draft.password,
      role: draft.role?.trim() ? draft.role.trim() : null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <form
        onSubmit={submit}
        className="card w-full max-w-sm p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-bold">
          {account ? "Edit Account" : "Add Account"}
        </h2>

        <div className="flex flex-col gap-3">
          <Labelled caption="Riot name">
            <input
              ref={firstField}
              className="field w-full"
              value={draft.riot_name}
              placeholder="Summoner name (before the #)"
              onChange={(e) => set({ riot_name: e.target.value })}
            />
          </Labelled>

          <Labelled caption="Tag">
            <input
              className="field w-full"
              value={draft.tag}
              placeholder="NA1"
              onChange={(e) => set({ tag: e.target.value })}
            />
          </Labelled>

          <Labelled caption="Account name">
            <input
              className="field w-full"
              value={draft.login}
              placeholder="Login username"
              onChange={(e) => set({ login: e.target.value })}
            />
          </Labelled>

          <Labelled caption="Password">
            <div className="flex gap-1.5">
              <input
                className="field flex-1"
                type={reveal ? "text" : "password"}
                value={draft.password}
                onChange={(e) => set({ password: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-ghost btn-icon !h-auto !w-9"
                data-on={reveal}
                title={reveal ? "Hide password" : "Show password"}
                onClick={() => setReveal((v) => !v)}
              >
                {reveal ? "🙈" : "👁"}
              </button>
            </div>
          </Labelled>

          <Labelled caption="Role">
            <select
              className="field w-full"
              value={draft.role ?? ""}
              onChange={(e) => set({ role: e.target.value || null })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r || "None"}
                </option>
              ))}
            </select>
          </Labelled>
        </div>

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function Labelled({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
        {caption}
      </span>
      {children}
    </label>
  );
}
