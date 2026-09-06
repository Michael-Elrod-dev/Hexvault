import type { Account } from "../types";
import { accountKey, rankColor, riotId, stripLp } from "../types";

type Props = {
  accounts: Account[];
  ranks: Record<string, string>;
  passwordsVisible: boolean;
  editing: boolean;
  refreshing: boolean;
  onTogglePasswords: () => void;
  onToggleEditing: () => void;
  onCopy: (text: string) => void;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, delta: number) => void;
};

export function AccountsPage(props: Props) {
  const {
    accounts, ranks, passwordsVisible, editing, refreshing,
    onTogglePasswords, onToggleEditing, onCopy, onRefresh, onAdd,
    onEdit, onDelete, onMove,
  } = props;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button className="btn btn-ghost" data-on={passwordsVisible} onClick={onTogglePasswords}>
          {passwordsVisible ? "🙈 Hide Passwords" : "👁 Show Passwords"}
        </button>
        <button
          className="btn btn-ghost"
          data-on={editing}
          onClick={onToggleEditing}
          title="Show reorder, edit and delete controls"
        >
          ✎ Edit
        </button>
        <button className="btn btn-ghost" onClick={onAdd}>
          + Add
        </button>
        <div className="flex-1" />
        <button className="btn" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "⟳ Refresh"}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
        {accounts.length === 0 && (
          <p className="mt-8 text-center text-muted">No accounts yet. Use + Add to create one.</p>
        )}

        {accounts.map((account, index) => {
          const rank = ranks[accountKey(account)] ?? "…";
          const shown = stripLp(rank);
          return (
            <div key={`${accountKey(account)}-${index}`} className="card shrink-0 px-4 pt-3 pb-3.5">
              <div className="flex items-center gap-1.5">
                <button
                  className="truncate text-base font-semibold hover:text-accent-hi"
                  title="Click to copy"
                  onClick={() => onCopy(riotId(account))}
                >
                  {riotId(account)}
                </button>
                {account.role && (
                  <span className="shrink-0 text-muted">– {account.role}</span>
                )}

                <div className="flex-1" />

                <span
                  className="shrink-0 text-xs font-bold"
                  style={{ color: rankColor(shown) }}
                  title={rank !== shown ? rank : undefined}
                >
                  {shown}
                </span>

                {editing && (
                  <div className="ml-1.5 flex shrink-0 gap-1">
                    <button
                      className="btn btn-ghost btn-icon"
                      title="Move up"
                      disabled={index === 0}
                      onClick={() => onMove(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="btn btn-ghost btn-icon"
                      title="Move down"
                      disabled={index === accounts.length - 1}
                      onClick={() => onMove(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className="btn btn-ghost btn-icon"
                      title="Edit account"
                      onClick={() => onEdit(index)}
                    >
                      ✎
                    </button>
                    <button
                      className="btn btn-icon !bg-danger hover:!bg-[#f05a5f]"
                      title="Delete account"
                      onClick={() => onDelete(index)}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-2.5 flex gap-2.5">
                <Field
                  caption="Account name"
                  value={account.login}
                  onCopy={() => onCopy(account.login)}
                />
                <Field
                  caption="Password"
                  value={passwordsVisible ? account.password : "••••••••"}
                  onCopy={() => onCopy(account.password)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  caption,
  value,
  onCopy,
}: {
  caption: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
        {caption}
      </span>
      <button className="value" title="Click to copy" onClick={onCopy}>
        {value}
      </button>
    </div>
  );
}
