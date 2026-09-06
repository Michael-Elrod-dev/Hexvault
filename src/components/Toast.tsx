export type ToastState = { id: number; message: string } | null;

/** Toast notification. Stays mounted through the fade-out. */
export function Toast({ toast, visible }: { toast: ToastState; visible: boolean }) {
  if (!toast) return null;

  return (
    <div
      className="pointer-events-none absolute right-0 bottom-[22px] left-0 flex justify-center transition-[opacity,transform] duration-200"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transitionTimingFunction: "cubic-bezier(.2,.7,.3,1)",
      }}
    >
      <div
        className="flex items-center gap-2.5 rounded-[10px] px-[15px] py-2.5"
        style={{
          background: "var(--color-field-hi)",
          border: "1px solid rgba(200,111,75,.45)",
          boxShadow: "0 14px 30px rgba(0,0,0,.5)",
        }}
      >
        <span className="text-[13px] text-accent">✓</span>
        <span className="text-[12.5px] font-medium text-ink">{toast.message}</span>
      </div>
    </div>
  );
}
