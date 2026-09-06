import { useEffect, useRef } from "react";
import { idFor, searchChampions } from "../champions";
import type { Champion, Pool } from "../types";
import { Portrait } from "./Portrait";
import { ScrollArea } from "./ScrollArea";

const MAX_SUGGESTIONS = 5;

type Props = {
  pools: Pool[];
  index: Champion[];
  version: string;
  portraitDir: string;
  addingRole: string | null;
  addDraft: string;
  addHighlight: number;
  hoverChamp: string | null;
  onStartAdd: (role: string) => void;
  onCancelAdd: () => void;
  onDraftChange: (value: string) => void;
  onHighlight: (index: number) => void;
  onPick: (role: string, champion: Champion) => void;
  onRemove: (role: string, champion: string) => void;
  onMoveRole: (index: number, delta: number) => void;
  onHoverChamp: (key: string | null) => void;
};

export function ChampionsPage(props: Props) {
  const {
    pools, index, version, portraitDir, addingRole, addDraft, addHighlight,
    hoverChamp, onStartAdd, onCancelAdd, onDraftChange, onHighlight, onPick,
    onRemove, onMoveRole, onHoverChamp,
  } = props;

  return (
    <div className="page-in flex min-h-0 flex-1 flex-col">
      <ScrollArea className="px-5 pt-1 pb-7">
        {pools.map((pool, i) => {
          const matches = searchChampions(addDraft, index, pool.champions).slice(
            0,
            MAX_SUGGESTIONS,
          );
          return (
            <section key={pool.role} className="pt-5 pb-1.5">
              <div className="mb-3.5 flex items-center gap-2.5">
                <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-ink uppercase">
                  {pool.role}
                </h2>
                {/* Deliberately bright: this rule is what separates the roles. */}
                <div className="h-px flex-1 bg-muted-2" />
                <button
                  className="role-btn press"
                  disabled={i === 0}
                  title="Move role up"
                  onClick={() => onMoveRole(i, -1)}
                >
                  ↑
                </button>
                <button
                  className="role-btn press"
                  disabled={i === pools.length - 1}
                  title="Move role down"
                  onClick={() => onMoveRole(i, 1)}
                >
                  ↓
                </button>
                <button
                  className="role-btn press text-accent hover:!bg-[rgba(200,111,75,.14)] hover:!text-accent"
                  style={{ fontSize: 14 }}
                  title={`Add a champion to ${pool.role}`}
                  onClick={() => onStartAdd(pool.role)}
                >
                  +
                </button>
              </div>

              {addingRole === pool.role && (
                <AddRow
                  draft={addDraft}
                  matches={matches}
                  highlight={addHighlight}
                  version={version}
                  portraitDir={portraitDir}
                  onDraftChange={onDraftChange}
                  onHighlight={onHighlight}
                  onPick={(champion) => onPick(pool.role, champion)}
                  onCancel={onCancelAdd}
                />
              )}

              <div className="grid grid-cols-6 gap-2.5">
                {pool.champions.map((name) => {
                  const key = `${pool.role}/${name}`;
                  const hovered = hoverChamp === key;
                  return (
                    <div
                      key={key}
                      className="flex flex-col gap-[5px]"
                      onMouseEnter={() => onHoverChamp(key)}
                      onMouseLeave={() => onHoverChamp(null)}
                    >
                      <div className="relative">
                        <Portrait
                          championId={idFor(name, index)}
                          name={name}
                          version={version}
                          portraitDir={portraitDir}
                          className="block aspect-square w-full rounded-[5px] bg-field transition-colors duration-150"
                          style={{
                            border: `1px solid ${hovered ? "var(--color-accent)" : "var(--color-line)"}`,
                          }}
                        />
                        <button
                          className="absolute -top-1.5 -right-1.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-danger text-[9px] font-bold text-[#0E0D0B] transition-all duration-150"
                          style={{
                            opacity: hovered ? 1 : 0,
                            transform: hovered ? "scale(1)" : "scale(.8)",
                            pointerEvents: hovered ? "auto" : "none",
                          }}
                          title={`Remove ${name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemove(pool.role, name);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="truncate text-center text-[10px] text-muted">{name}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </ScrollArea>
    </div>
  );
}

function AddRow({
  draft,
  matches,
  highlight,
  version,
  portraitDir,
  onDraftChange,
  onHighlight,
  onPick,
  onCancel,
}: {
  draft: string;
  matches: Champion[];
  highlight: number;
  version: string;
  portraitDir: string;
  onDraftChange: (value: string) => void;
  onHighlight: (index: number) => void;
  onPick: (champion: Champion) => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const querying = draft.trim().length > 0;

  /* Free text can never be submitted: Enter only ever commits a champion that
     came from the index, which keeps pool names canonical. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      onHighlight(Math.min(highlight + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      onHighlight(Math.max(highlight - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = matches[highlight];
      if (picked) onPick(picked);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="fade-in relative mb-3.5">
      <div className="flex gap-2">
        <input
          ref={input}
          className="text-input min-w-0 flex-1"
          placeholder="Start typing a champion…"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="ghost-lg press" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {querying && (
        <div
          className="pop-in-fast absolute top-[calc(100%+6px)] right-0 left-0 z-10 rounded-[10px] p-[5px]"
          style={{
            background: "var(--color-surface-hi)",
            border: "1px solid #3A342C",
            boxShadow: "0 18px 36px rgba(0,0,0,.5)",
          }}
        >
          {matches.length === 0 ? (
            <div className="px-[11px] py-[9px] text-xs text-muted">No champion by that name</div>
          ) : (
            matches.map((champion, i) => (
              <button
                key={champion.id}
                className="flex w-full items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] text-left"
                style={{ background: i === highlight ? "#2E2822" : "transparent" }}
                onMouseEnter={() => onHighlight(i)}
                onClick={() => onPick(champion)}
              >
                <Portrait
                  championId={champion.id}
                  name={champion.name}
                  version={version}
                  portraitDir={portraitDir}
                  className="block h-[22px] w-[22px] flex-none rounded bg-field"
                />
                <span className="text-[12.5px] text-ink">{champion.name}</span>
                <span className="flex-1" />
                {i === highlight && (
                  <span className="font-mono text-[10px] text-accent">⏎</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
