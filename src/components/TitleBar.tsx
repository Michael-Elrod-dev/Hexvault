import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Custom titlebar for `decorations: false`. The buttons must not carry
 * `data-tauri-drag-region` or clicks start a drag.
 */
export function TitleBar() {
  const minimize = () => getCurrentWindow().minimize();
  const toggleMaximize = () => getCurrentWindow().toggleMaximize();
  const close = () => getCurrentWindow().close();

  return (
    <div
      data-tauri-drag-region
      className="flex h-[34px] flex-none items-center border-b border-line-soft pl-4 select-none"
    >
      <div
        data-tauri-drag-region
        className="font-mono text-[11px] tracking-[0.08em] text-muted-2"
      >
        HEXVAULT
      </div>
      <div data-tauri-drag-region className="flex-1 self-stretch" />

      <div className="flex h-full items-stretch text-muted-2">
        <button
          className="grid w-[38px] place-items-center text-xs transition-colors hover:bg-raised hover:text-ink"
          title="Minimize"
          onClick={minimize}
        >
          −
        </button>
        <button
          className="grid w-[38px] place-items-center text-[10px] transition-colors hover:bg-raised hover:text-ink"
          title="Maximize"
          onClick={toggleMaximize}
        >
          □
        </button>
        <button
          className="grid w-[38px] place-items-center text-xs transition-colors hover:bg-[#C05540] hover:text-white"
          title="Close"
          onClick={close}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
