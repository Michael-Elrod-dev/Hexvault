import { useState } from "react";
import type { Pool } from "../types";

type Props = {
  pools: Pool[];
  saving: string;
  onAdd: (role: string, champion: string) => void;
  onRemove: (role: string, champion: string) => void;
};

export function ChampionsPage({ pools, saving, onAdd, onRemove }: Props) {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex shrink-0 items-center">
        <h2 className="text-xl font-bold">Champion Pools</h2>
        <div className="flex-1" />
        <span className="text-xs font-semibold text-muted">{saving}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
        {pools.map((pool) => (
          <PoolCard key={pool.role} pool={pool} onAdd={onAdd} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

function PoolCard({
  pool,
  onAdd,
  onRemove,
}: {
  pool: Pool;
  onAdd: (role: string, champion: string) => void;
  onRemove: (role: string, champion: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    onAdd(pool.role, name);
    setDraft("");
  };

  return (
    <div className="card shrink-0 p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">{pool.icon}</span>
        <span className="text-[15px] font-bold" style={{ color: pool.color }}>
          {pool.role.toUpperCase()}
        </span>
        <div className="flex-1" />
        <span className="text-[11px] font-semibold text-muted">
          {pool.champions.length} champions
        </span>
      </div>

      {/* flex-wrap is the whole reflow story: the browser rewraps chips on
          resize with no work from us. The Qt build destroyed and rebuilt every
          chip on each resize. */}
      {pool.champions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pool.champions.map((champion) => (
            <span key={champion} className="chip">
              {champion}
              <button
                className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-muted transition-colors hover:bg-danger hover:text-white"
                title={`Remove ${champion}`}
                onClick={() => onRemove(pool.role, champion)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <form className="mt-3 flex gap-2" onSubmit={submit}>
        <input
          className="field flex-1"
          placeholder="Add a champion…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn btn-ghost">
          + Add
        </button>
      </form>
    </div>
  );
}
