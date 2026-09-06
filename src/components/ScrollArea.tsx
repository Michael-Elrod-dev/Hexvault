import { useCallback, useEffect, useRef, useState } from "react";

const HIDE_DELAY_MS = 800;
const MIN_THUMB = 28;

type Props = {
  className?: string;
  children: React.ReactNode;
};

/**
 * Scroll container with an overlay scrollbar.
 *
 * The native scrollbar is hidden because it occupies layout width, which makes
 * the left and right padding unequal depending on whether it is showing. This
 * draws the thumb on top of the content instead, so horizontal padding stays
 * symmetric, and fades it out shortly after scrolling stops.
 */
export function ScrollArea({ className, children }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [thumb, setThumb] = useState({ top: 0, height: 0, scrollable: false });
  const [visible, setVisible] = useState(false);

  const measure = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    const { scrollHeight, clientHeight, scrollTop } = el;
    const scrollable = scrollHeight > clientHeight + 1;
    if (!scrollable) {
      setThumb({ top: 0, height: 0, scrollable: false });
      return;
    }
    const height = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * clientHeight);
    const maxTop = clientHeight - height;
    const progress = scrollTop / (scrollHeight - clientHeight);
    setThumb({ top: progress * maxTop, height, scrollable: true });
  }, []);

  const flash = useCallback(() => {
    measure();
    setVisible(true);
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  }, [measure]);

  // Track content and viewport size so the thumb is correct before first scroll.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [measure, children]);

  useEffect(
    () => () => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    },
    [],
  );

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={viewport}
        onScroll={flash}
        className={`no-scrollbar h-full overflow-y-auto ${className ?? ""}`}
      >
        {children}
      </div>

      {thumb.scrollable && (
        <div
          className="pointer-events-none absolute right-[3px] w-[6px] rounded-full bg-line-hi transition-opacity duration-300"
          style={{
            top: thumb.top,
            height: thumb.height,
            opacity: visible ? 1 : 0,
          }}
        />
      )}
    </div>
  );
}
