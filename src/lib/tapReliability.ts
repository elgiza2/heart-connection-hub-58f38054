/**
 * @doc Guarantees that the FIRST tap on an interactive element activates it.
 *
 * On real phones a tap is frequently lost: the element under the finger is
 * re-rendered, moved, or unmounted between `pointerdown` and the browser's
 * synthesized `click` (menus closing on pointerdown, list virtualization,
 * layout shifts from :active/hover styles, heavy React re-renders). The
 * browser then fires no `click` at all and the user has to tap again.
 *
 * This installs a global safety net: remember the interactive element under
 * the finger on pointerdown; if the finger lifts in roughly the same place and
 * no `click` lands shortly after, dispatch one ourselves. It never fires when
 * the browser already did its job, so it cannot double-activate.
 */
const INTERACTIVE =
  'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], label, summary, input[type="checkbox"], input[type="radio"], [data-tap-target="true"]';

const SLOP = 12; // px of finger travel still considered a tap
const CLICK_GRACE = 120; // ms to wait for the browser's own click

export function installTapReliability() {
  if (typeof window === "undefined") return;
  if ((window as any).__tapReliabilityInstalled) return;
  (window as any).__tapReliabilityInstalled = true;

  let downX = 0;
  let downY = 0;
  let downTarget: HTMLElement | null = null;
  let downAt = 0;
  let sawClick = false;
  let pointerId: number | null = null;

  const isDisabled = (el: HTMLElement) =>
    (el as HTMLButtonElement).disabled === true ||
    el.getAttribute("aria-disabled") === "true" ||
    el.hasAttribute("disabled");

  document.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      sawClick = false;
      pointerId = e.pointerId;
      downX = e.clientX;
      downY = e.clientY;
      downAt = performance.now();
      const el = (e.target as HTMLElement | null)?.closest?.(INTERACTIVE) as HTMLElement | null;
      downTarget = el && !isDisabled(el) ? el : null;
    },
    true,
  );

  document.addEventListener(
    "click",
    () => {
      sawClick = true;
    },
    true,
  );

  const onUp = (e: PointerEvent) => {
    if (pointerId !== null && e.pointerId !== pointerId) return;
    const target = downTarget;
    downTarget = null;
    pointerId = null;
    if (!target) return;
    if (Math.abs(e.clientX - downX) > SLOP || Math.abs(e.clientY - downY) > SLOP) return;
    if (performance.now() - downAt > 700) return; // long-press, not a tap
    const x = e.clientX;
    const y = e.clientY;

    window.setTimeout(() => {
      if (sawClick) return; // the browser handled it
      if (!target.isConnected || isDisabled(target)) return;
      // Only replay when the element is still sitting under the finger, so we
      // never activate something that scrolled or animated into that spot.
      const under = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!under) return;
      if (!(target.contains(under) || under.contains(target))) return;
      target.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }),
      );
    }, CLICK_GRACE);
  };

  document.addEventListener("pointerup", onUp, true);
  document.addEventListener(
    "pointercancel",
    () => {
      downTarget = null;
      pointerId = null;
    },
    true,
  );
}
