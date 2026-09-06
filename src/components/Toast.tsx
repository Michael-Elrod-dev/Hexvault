import { useEffect, useState } from "react";

export type ToastState = { id: number; message: string } | null;

export function Toast({ toast }: { toast: ToastState }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 1600);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center transition-opacity duration-150"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div className="flex items-center gap-2 rounded-[10px] border border-ok/60 bg-[#1e3a1e] px-4 py-2.5 shadow-lg">
        <span className="text-ok text-sm font-bold">✓</span>
        <span className="text-xs font-semibold">{toast.message}</span>
      </div>
    </div>
  );
}
