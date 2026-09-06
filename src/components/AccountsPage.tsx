import type { Account } from "../types";
import { accountKey, parseRank, riotId } from "../types";

type Props = {
  accounts: Account[];
  ranks: Record<string, string>;
  passwordsVisible: boolean;
  editing: boolean;
  refreshing: boolean;
  copied: string | null;
  pendingDelete: number | null;
  dragIndex: number | null;
  onTogglePasswords: () => void;
  onToggleEditing: () => void;
  onCopy: (text: string, key: string, message: string) => void;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onAskDelete: (index: number) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (index: number) => void;
  onMove: (index: number, delta: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
};

const MASK = "•".repeat(10);

export function AccountsPage(props: Props) {
  const {
    accounts, ranks, passwordsVisible, editing, refreshing, copied,
    pendingDelete, dragIndex, onTogglePasswords, onToggleEditing, onCopy,
    onRefresh, onAdd, onEdit, onAskDelete, onCancelDelete, onConfirmDelete,
    onMove, onDragStart, onDragOver, onDragEnd,
  } = props;

  return (
    <div className="page-in flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-2 px-5 pt-4 pb-3">
        <div className="font-mono text-[10px] tracking-[0.12em] text-muted-2 uppercase">
          {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
        </div>
        <div className="flex-1" />
        <button className="ghost press" data-on={passwordsVisible} onClick={onTogglePasswords}>
          {passwordsVisible ? "Hide passwords" : "Show passwords"}
        </button>
        <button className="ghost press" data-on={editing} onClick={onToggleEditing}>
          Edit
        </button>
        <button className="ghost press" onClick={onAdd}>
          Add
        </button>
        <button
          className="press flex items-center gap-1.5 rounded-md border border-[rgba(200,111,75,.35)] px-[9px] py-[5px] font-mono text-[11px] text-accent transition-colors hover:bg-[rgba(200,111,75,.14)] disabled:opacity-70"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh ranks"
        >
          <span className={refreshing ? "spin inline-block" : "inline-block"}>↻</span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-5 pb-5">
        {accounts.length === 0 && (
          <p className="mt-10 text-center text-muted">No accounts yet. Use Add to create one.</p>
        )}

        {accounts.map((account, index) => {
          const rank = parseRank(ranks[accountKey(account)]);
          const dragging = dragIndex === index;
          const loginKey = `login-${index}`;
          const pwKey = `pw-${index}`;
          return (
            <div
              /* Keyed by identity, not position. An index-based key makes React
                 remount every card on reorder, which aborts the in-flight drag. */
              key={accountKey(account)}
              className="card-in flex-none rounded-xl px-4 py-3.5 transition-[background-color,border-color,box-shadow] duration-150"
              style={{
                background: dragging ? "var(--color-surface-hi)" : "var(--color-surface)",
                border: `1px solid ${dragging ? "var(--color-accent)" : "var(--color-line)"}`,
                boxShadow: dragging ? "0 10px 24px rgba(0,0,0,.45)" : "none",
              }}
              draggable
              onDragStart={(e) => {
                /* Chromium cancels the drag outright if dragstart sets no data,
                   so no dragover ever fires and nothing can reorder. */
                e.dataTransfer.setData("text/plain", String(index));
                e.dataTransfer.effectAllowed = "move";
                onDragStart(index);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                onDragOver(index);
              }}
              onDrop={(e) => e.preventDefault()}
              onDragEnd={onDragEnd}
            >
              <div className="flex gap-3">
                <div
                  className="w-[3px] flex-none self-stretch rounded-sm"
                  style={{ background: rank.color }}
                />

                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      className="group flex min-w-0 items-baseline gap-[7px] overflow-hidden whitespace-nowrap transition-colors hover:text-accent-hi"
                      onClick={() =>
                        onCopy(riotId(account), `riot-${index}`, `Copied ${riotId(account)}`)
                      }
                    >
                      <span className="truncate text-[15px] font-medium tracking-[-0.005em]">
                        {account.riot_name}
                      </span>
                      <span className="flex-none font-mono text-[11px] text-muted-2 transition-colors group-hover:text-accent-hi">
                        #{account.tag}
                      </span>
                    </button>

                    <div className="flex-1" />

                    <div
                      className="flex-none text-[13px] font-medium whitespace-nowrap"
                      style={{ color: rank.color }}
                    >
                      {rank.label}
                    </div>
                    <div className="min-w-[50px] flex-none text-right font-mono text-[11px] text-muted-2">
                      {rank.lp}
                    </div>

                    <div
                      className="flex gap-1 overflow-hidden transition-[max-width,opacity,margin-left] duration-200 ease-[cubic-bezier(.2,.7,.3,1)]"
                      style={{
                        maxWidth: editing ? 128 : 0,
                        opacity: editing ? 1 : 0,
                        marginLeft: editing ? 6 : 0,
                      }}
                    >
                      <button
                        className="icon-btn press"
                        disabled={index === 0}
                        title="Move up"
                        tabIndex={editing ? 0 : -1}
                        onClick={() => onMove(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="icon-btn press"
                        disabled={index === accounts.length - 1}
                        title="Move down"
                        tabIndex={editing ? 0 : -1}
                        onClick={() => onMove(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        className="icon-btn press"
                        title="Edit account"
                        tabIndex={editing ? 0 : -1}
                        onClick={() => onEdit(index)}
                      >
                        ✎
                      </button>
                      <button
                        className="icon-btn icon-btn-danger press"
                        title="Delete account"
                        tabIndex={editing ? 0 : -1}
                        onClick={() => onAskDelete(index)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <CopyField
                      caption="ID"
                      value={account.login || "—"}
                      flashing={copied === loginKey}
                      onClick={() => onCopy(account.login, loginKey, "Copied account name")}
                    />
                    <CopyField
                      caption="PW"
                      value={passwordsVisible ? account.password : MASK}
                      flashing={copied === pwKey}
                      onClick={() => onCopy(account.password, pwKey, "Copied password")}
                    />
                  </div>
                </div>
              </div>

              {pendingDelete === index && (
                <div
                  className="fade-in mt-3 flex items-center gap-2.5 rounded-lg px-[11px] py-[9px]"
                  style={{
                    background: "rgba(200,85,70,.10)",
                    border: "1px solid rgba(200,85,70,.35)",
                  }}
                >
                  <div className="text-xs text-danger-ink">Remove this account from the app?</div>
                  <div className="flex-1" />
                  <button
                    className="press rounded-md border border-line-hi px-[9px] py-1 text-xs text-muted transition-colors hover:border-line-hover hover:text-ink"
                    onClick={onCancelDelete}
                  >
                    Keep
                  </button>
                  <button
                    className="press rounded-md bg-danger px-2.5 py-[5px] text-xs font-medium text-[#0E0D0B] transition-colors hover:bg-danger-hi"
                    onClick={() => onConfirmDelete(index)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CopyField({
  caption,
  value,
  flashing,
  onClick,
}: {
  caption: string;
  value: string;
  flashing: boolean;
  onClick: () => void;
}) {
  return (
    <button className="copy-field press" data-flash={flashing} onClick={onClick} title="Click to copy">
      <span className="flex-none font-mono text-[10px] tracking-[0.1em] text-muted-2">
        {caption}
      </span>
      <span className="truncate font-mono text-xs text-ink-dim">{value}</span>
    </button>
  );
}
