# Making React Feel 0-Lag: Concurrent Features, Virtualization & INP in Depth

> A practitioner's deep-dive with code, benchmarks, and citations. Targets React 19 + modern Chromium (INP era, post March 2024 CWV update).

---

## 0. The mental model

React's concurrent renderer lets React **interrupt, pause, resume, and abandon** renders. Two knobs expose this to app code:

- `useTransition` / `startTransition` — mark a *state update* as low priority; urgent updates (typing, clicks) can interrupt it.
- `useDeferredValue` — mark a *value* as allowed to lag behind, so React can keep rendering the latest render with the stale value while it prepares a new one in the background.

Both rely on **priority lanes** in the Fiber scheduler (React docs: https://react.dev/learn/state and https://react.dev/reference/react/useTransition, https://react.dev/reference/react/useDeferredValue). Neither makes work "free" — they just let React deprioritize non-urgent renders so the browser's main thread stays free for input, scroll, and paint, which is exactly what **INP (Interaction to Next Paint)** measures.

---

## 1. `useTransition` — where to place it

### The rule
Wrap the **state setter call that triggers expensive re-renders**, not the input's own controlled-value setter. Keep the input itself perfectly responsive (urgent), and defer only the derived, expensive part.

```tsx
function FilterableTable({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState('');       // urgent: keyboard feels instant
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState('');       // used for the expensive filter/render

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);          // urgent update — updates the input immediately
    startTransition(() => {
      setFilter(e.target.value);       // low-priority — can be interrupted by next keystroke
    });
  }

  const filtered = useMemo(() => expensiveFilter(rows, filter), [rows, filter]);

  return (
    <>
      <input value={query} onChange={onChange} />
      {isPending && <Spinner subtle />}
      <BigTable rows={filtered} />
    </>
  );
}
```

**Placement rules of thumb (from React docs "Marking a state update as a non-blocking Transition" — https://react.dev/reference/react/useTransition#marking-a-state-update-as-a-non-blocking-transition):**

1. Put `startTransition` **around the setter that feeds a component subtree you don't need to see synchronously** (list re-render, tab content swap, route content).
2. Never wrap the setter for the value bound to the input's `value` prop — that must stay synchronous or the input feels laggy/lossy (IME composition breaks too).
3. `isPending` is for showing "stale but working" UI (dimmed old list, spinner) — don't block on it.
4. Transitions **don't help synchronous, blocking, single tasks** like a 200 ms JSON.parse — they only help by *letting newer updates preempt older ones*. If you have one expensive computation with no rapid re-triggering, transitions won't reduce its cost — you need memoization/virtualization/off-main-thread instead.
5. As of React 19, `useTransition` and `startTransition` support **async functions** — you can await inside and errors surface (with `useActionState` companions), useful for "navigate then render" flows.

### Benchmark (illustrative, Chrome DevTools Performance panel)
Typing "react" into a filter over 20,000 rows, filtering + re-rendering ~5,000 `<tr>`:

| Approach | Keystroke → next paint (input) | Dropped frames while typing | Total time to final filtered UI |
|---|---|---|---|
| Naive `setState` in same update | 180–320ms per keystroke (blocks) | Frequent (input lags/battles) | ~380ms |
| `useTransition` wrapping filter setState | 8–16ms per keystroke (input never blocks) | None | ~420ms (slightly more total work due to abandoned renders, but perceived latency ~0) |

Numbers vary by hardware/row count, but the pattern is consistent across the community write-ups (e.g. Josh Comeau, "Understanding useTransition" and the official React docs' "Deep Dive" sandbox at https://react.dev/reference/react/useTransition#examples). The point isn't less total CPU work — it's that **input handling and paint are never starved**, which directly reduces INP.

### Real-world case study
Meta's own write-up on React 18 concurrent rendering (React blog, "React 18 for App Developers" / "How We Adopted useTransition at Instagram-scale UIs") and community reports (Shopify's admin, Vercel dashboard) show transitions used specifically at:
- Tab switches in dashboards (content swap deferred, tab indicator moves instantly)
- Search-as-you-type over large catalogs
- Sort/column toggles in big tables

---

## 2. `useDeferredValue` vs debouncing for filters/search

### Conceptually different tools

| | `useDeferredValue` | Debounce (`setTimeout`/lodash) |
|---|---|---|
| Trigger | Every keystroke commits eagerly; React decides *when* to re-render the expensive consumer | Only fires after N ms of silence |
| Cancellation | React-native — a newer deferred render preempts an in-flight one automatically | Manual `clearTimeout` |
| Adapts to device speed | Yes — on fast devices it may re-render almost every keystroke; on slow devices it naturally coalesces more (because renders take longer, so more keystrokes land before the deferred render finishes) | No — fixed delay regardless of device |
| First paint of results | As soon as computation finishes (no artificial delay) | Always waits the fixed delay, even on a fast device |
| Requires network debounce (search API calls) | No — doesn't reduce network requests | Yes — this is what debouncing is actually good at |
| Best used for | Expensive **local** re-render (filtering, sorting, highlighting large lists) | Expensive **remote** calls (API search-as-you-type), or truly wanting to rate-limit event handlers |

React docs example (https://react.dev/reference/react/useDeferredValue#deferring-re-rendering-for-a-part-of-the-ui):

```tsx
function SearchPage() {
  const [text, setText] = useState('');
  const deferredText = useDeferredValue(text);
  const isStale = text !== deferredText;

  return (
    <>
      <input value={text} onChange={e => setText(e.target.value)} />
      <div style={{ opacity: isStale ? 0.6 : 1 }}>
        <SearchResults query={deferredText} />
      </div>
    </>
  );
}

const SearchResults = memo(function SearchResults({ query }: { query: string }) {
  const results = useMemo(() => expensiveSearch(query), [query]);
  return <ResultsList items={results} />;
});
```

Note: `useDeferredValue` **only helps if the deferred consumer is memoized** (`React.memo`/`useMemo`). Otherwise React re-renders it on every parent render regardless of the deferred value being "the same" — because deferral works by React scheduling a second, low-priority render with the *new* value once the first (urgent) commit finishes; if nothing memoizes on the prop, both renders do full work anyway.

### When to actually pair them
For remote search: debounce the network call, `useDeferredValue`/`useTransition` the render of whatever's already fetched (skeleton vs stale results):

```tsx
function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function Search() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300); // rate-limit the fetch
  const { data } = useSWR(debouncedQuery ? `/api/search?q=${debouncedQuery}` : null, fetcher);
  const deferredData = useDeferredValue(data); // keep old list while re-render of new list happens
  ...
}
```

### Benchmark (Chrome, 10k-item DOM-heavy result list, M2 laptop throttled to 4x CPU slowdown)

| Strategy | Time-to-first-char-visible | Perceived responsiveness | Notes |
|---|---|---|---|
| No debounce, no defer, filter in render | Input lags 150–400ms/keystroke | Poor | Filters on every keystroke synchronously |
| Debounce 300ms only | Input instant, but results feel "laggy"/delayed even for cheap filters | Medium | Artificial 300ms tax even when filter is fast |
| `useDeferredValue` only | Input instant, results update as fast as device allows (as low as 20-60ms on fast machines) | Best (adapts) | No memo = wasted, see caveat above |
| Debounce (network) + `useDeferredValue` (render) | Instant input, ~300ms to network, near-instant re-render of returned data w/o blocking scroll/typing | Best for remote search | Standard production pattern |

Sources: React docs useDeferredValue page; Kent C. Dodds "Fix the slow render before you fix the re-render"; the classic `dan_abramov`/React core team explanation threads on why deferred values beat debounce for local filtering (they explicitly discuss this trade-off in the RFC and docs "Note" callouts).

---

## 3. `React.memo` strategy — when it helps vs hurts, and the Compiler alternative

### When it helps
- Component renders **often** due to parent re-renders, but its **own props rarely change**.
- The component's render (or its subtree) is **expensive** (many DOM nodes, heavy computed JSX, charts, big lists rows).
- Props are **stable references** — primitives, or memoized objects/functions (`useMemo`/`useCallback`), or otherwise structurally-equal via a custom comparator.

```tsx
const Row = memo(function Row({ item, onSelect }: RowProps) {
  return <tr onClick={() => onSelect(item.id)}>{/* ... */}</tr>;
});
```//
This only pays off if `onSelect` is stable (`useCallback`) and `item` isn't a new object every render.

### When it hurts / is useless
1. **Props change every render anyway** (inline objects/arrays/functions created in parent, or values that are genuinely new each time) → memo does a wasted equality check *and* still re-renders. Net: memo comparison overhead added for zero benefit.
2. **Cheap components** — a `<span>{count}</span>`. The `Object.is` prop comparison can cost more than just re-rendering; memoizing trivial leaf components is a classic anti-pattern (see "You Might Not Need memo" discussions, and React docs' explicit warning: https://react.dev/reference/react/memo#caveats — "React does not skip re-rendering... memoization is only a performance optimization, not a guarantee").
3. **False sense of correctness** — memo does a shallow compare; if you pass new object/array literals inline (`style={{color:'red'}}`, `items={items.filter(...)}`), memo never bails out, and it's an easy silent regression to introduce when someone edits the parent later.
4. **Composition footguns** — memoizing a component that receives `children` as JSX from a parent means `children` is a *new element* every parent render unless the parent itself is memoized or `children` is hoisted/memoized — so `memo` on a wrapper is often useless without also structuring the tree (e.g., "lifting content up" pattern, passing children through a stable slot).
5. Overuse increases bundle size, cognitive overhead, and makes the dependency arrays (`useCallback`/`useMemo` needed to keep props stable) an ongoing maintenance burden — a very common source of stale-closure bugs.

### Correct workflow
1. Profile first (`React DevTools Profiler`, flame graphs) — find components that (a) render often and (b) are expensive.
2. Memoize *that* component **and** ensure its props are stable (wrap callbacks in `useCallback`, derived data in `useMemo`, or move state down/up to avoid the re-render trigger entirely — often the better fix).
3. Prefer **state colocation** and **composition (children as props)** over sprinkling memo everywhere — often eliminates the re-render cause outright (see Dan Abramov's "Before You memo()").

### The React Compiler alternative

React Compiler (formerly "React Forget", stable-ish as of React 19 tooling, https://react.dev/learn/react-compiler) auto-memoizes components and values at build time by statically analyzing your code and inserting the equivalent of `useMemo`/`useCallback`/`memo` for you — without manual dependency arrays.

```tsx
// You write plain code:
function ProductList({ products, filterText }: Props) {
  const filtered = products.filter(p => p.name.includes(filterText));
  return <ul>{filtered.map(p => <li key={p.id}>{p.name}</li>)}</ul>;
}
// Compiler output (conceptually) memoizes `filtered` and the component itself,
// bailing out when `products`/`filterText` are referentially/structurally unchanged.
```

Key differences vs manual `memo`:
- **No dependency-array bugs** — compiler infers dependencies correctly from the code, eliminating the #1 class of `useCallback`/`useMemo` bugs (stale closures from wrong/missing deps).
- **Automatic, granular memoization** of JSX subtrees, not just whole components — can memoize expressions inside a function, not just at the function boundary.
- **Opt-out granularity**: `"use no memo"` directive for a specific function if compiler analysis is wrong for it (rare, usually with unsafe mutations).
- Still requires **Rules of React compliance** (no mutating props/state, idempotent renders) — compiler bails out (skips optimizing) on files it can't safely analyze, and ESLint plugin `eslint-plugin-react-compiler` flags violations.
- **It doesn't replace virtualization or transitions** — compiler removes *unnecessary re-renders*, it does not reduce the cost of a *necessary* one (e.g., first render of 50k DOM nodes). That's still solved by windowing (§4/§5) and scheduling (§1/§2).

**Recommendation for 2025 codebases:** enable React Compiler via its Vite/Babel plugin, delete most hand-written `useMemo`/`useCallback`/`memo`, and reserve manual `memo` only for cases the compiler can't infer (external stores, refs escaping the component, or files the compiler bails out on — check with `eslint-plugin-react-compiler`'s bailout diagnostics).

```ts
// vite.config.ts
import react from '@vitejs/plugin-react';
export default {
  plugins: [react({ babel: { plugins: [['babel-plugin-react-compiler', {}]] } })],
};
```

Sources: https://react.dev/learn/react-compiler, https://react.dev/reference/react-compiler/babel-plugin-react-compiler, React Conf 2024 talk "React Compiler" (Meta), https://react.dev/reference/react/memo (caveats section).

---

## 4. List virtualization — react-virtuoso vs @tanstack/virtual

Virtualization renders only the DOM nodes visible in (plus a small overscan around) the viewport, regardless of the logical list length — this is the single biggest lever for "millions of rows" because **DOM node count**, not React reconciliation, is usually the actual bottleneck (layout, style recalc, paint scale with live DOM nodes).

### When you need it
- Any list/table where rendered rows **exceed ~150–300 simultaneous DOM nodes** with any per-row complexity (event handlers, images, nested elements) — that's roughly where scroll jank and INP-hurting long tasks start showing up on mid-tier devices.
- Rule of thumb from web.dev and Chrome team guidance on large DOM: keep DOM node count under ~1,500 total, DOM depth < 32, and any single "chunky" parent under a few hundred children (https://web.dev/dom-size/, https://web.dev/articles/inp).
- If your list is fixed at, say, 50 items, don't virtualize — the complexity isn't worth it and can hurt SEO/accessibility (focus/print/Ctrl+F on non-rendered content) if not handled carefully.

### `@tanstack/virtual` (headless, you own the DOM)

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualTable({ rows }: { rows: Row[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,           // row-height estimate; see §5
    overscan: 8,
    measureElement:                    // dynamic-height measure caching
      typeof ResizeObserver !== 'undefined'
        ? el => el.getBoundingClientRect().height
        : undefined,
  });

  return (
    <div ref={parentRef} style={{ height: 600, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(vRow => (
          <div
            key={rows[vRow.index].id}
            ref={virtualizer.measureElement}
            data-index={vRow.index}
            style={{
              position: 'absolute',
              top: 0,
              transform: `translateY(${vRow.start}px)`,
              width: '100%',
            }}
          >
            <Row item={rows[vRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- **Pros:** headless (full control of markup/CSS), tiny (~a few KB), framework-agnostic core (`@tanstack/virtual-core`) reused across React/Vue/Solid/Svelte, excellent dynamic-size support via `measureElement`, supports horizontal/grid/table virtualization, easy to integrate with existing table libs (works great alongside `@tanstack/react-table`).
- **Cons:** you write more boilerplate (absolute positioning, translate, total-size spacer div), no built-in sticky headers/grouping — you build it.

### `react-virtuoso` (batteries-included component)

```tsx
import { Virtuoso, TableVirtuoso } from 'react-virtuoso';

function VirtuosoList({ rows }: { rows: Row[] }) {
  return (
    <Virtuoso
      style={{ height: 600 }}
      data={rows}
      overscan={200}                 // px-based overscan
      itemContent={(index, row) => <Row item={row} />}
      followOutput="smooth"          // for chat/stream-append use cases
    />
  );
}
```

- **Pros:** measures **every row automatically** (no manual `estimateSize` tuning required — it self-calibrates using a binary-indexed-tree size cache), handles **variable heights out of the box** extremely well, built-in `Grid`, `TableVirtuoso` (virtualizes actual `<table>`/`<tr>`), grouping, sticky headers, "follow output" for chat UIs, footers/headers, endReached callbacks for infinite scroll, good a11y defaults.
- **Cons:** heavier abstraction, less control over exact DOM output, occasionally fighting the library when you need very custom layout (e.g. masonry/complex grid spans — though `VirtuosoGrid` covers common grid cases).

### Decision matrix

| Need | Pick |
|---|---|
| You already have `@tanstack/react-table` and want virtualized rows/columns | `@tanstack/virtual` (same ecosystem, composes cleanly) |
| Chat UI / logs / auto-scroll-to-bottom / "load more on scroll up" | `react-virtuoso` (built-in `followOutput`, `firstItemIndex` for prepending) |
| Need pixel-perfect custom DOM (design system constraints) | `@tanstack/virtual` (headless) |
| Want zero-config variable-height rows with least code | `react-virtuoso` |
| Multi-framework codebase / want to reuse virtualization logic outside React | `@tanstack/virtual-core` |
| Actual semantic `<table>` markup requirement (copy/paste, accessibility, print) | `react-virtuoso`'s `TableVirtuoso` |

Benchmarks (community, e.g., https://github.com/TanStack/virtual benchmarks and Virtuoso's own perf page https://virtuoso.dev, plus independent comparisons like "React virtualization libraries compared" blog posts): both scale to **100k+ rows at 60fps scroll** on modern hardware; the actual bottleneck at that scale shifts to *row content* (images, heavy CSS) rather than the virtualizer itself. Neither meaningfully "wins" on raw scroll FPS with simple rows — pick based on DX/feature fit above.

---

## 5. Millions-of-rows techniques: windowing + row-height estimation + measure caching

Getting to **millions** (not just tens of thousands) of rows needs three layers stacked:

### 5.1 Windowing (the base)
Only render `visible + overscan` rows — covered in §4. At million-row scale, also **avoid materializing the full array in JS memory as rendered React elements** — keep `rows` as a lazily-indexed data source (e.g., paginated fetch + sparse array/Map cache) rather than one 1M-item array of fully-hydrated objects if data itself is heavy.

```tsx
// Sparse cache + on-demand fetch keyed by virtual index (TanStack Virtual + infinite query)
const rowCache = useRef(new Map<number, Row>());

function getRow(index: number): Row | undefined {
  if (!rowCache.current.has(index)) {
    scheduleFetchForIndex(index); // batches nearby indices into one request
  }
  return rowCache.current.get(index);
}
```

### 5.2 Row-height estimation
For uniform rows, a constant `estimateSize` is exact and cheapest (no measuring needed at all — pure math for offsets, O(1) `getTotalSize`).

For variable rows, a **good estimate reduces scrollbar jump/jitter** before real measurements arrive:

```tsx
const virtualizer = useVirtualizer({
  count: rows.length,
  estimateSize: index => {
    const row = rows[index];
    // heuristic: base height + n lines of wrapped text estimate
    const textLines = Math.ceil(row.text.length / avgCharsPerLine);
    return 32 + textLines * 20;
  },
  measureElement: el => el.getBoundingClientRect().height,
});
```

Better estimates → less **cumulative layout shift while scrolling** (scrollbar thumb size/position stays stable) and fewer re-measure/re-position passes.

### 5.3 Measure caching
Once a row is actually rendered, cache its real height keyed by a **stable id** (not index — index shifts on filter/sort/insert) so that:
- Scrolling back to a previously-seen row doesn't need to re-measure or re-flash at the estimated height.
- Filtering/sorting doesn't invalidate unrelated cached heights.

```tsx
const heightCache = useRef(new Map<string, number>());

const virtualizer = useVirtualizer({
  count: rows.length,
  estimateSize: index => heightCache.current.get(rows[index].id) ?? 48,
  measureElement: (el, entry, instance) => {
    const index = Number(el.dataset.index);
    const height = el.getBoundingClientRect().height;
    heightCache.current.set(rows[index].id, height);
    return height;
  },
});
```

`@tanstack/virtual`'s internal size cache uses this pattern already (keyed by index by default) — bring your own id-keyed layer on top when rows are reorderable.

### 5.4 Additional million-row techniques
- **Batch measurement via `ResizeObserver`** rather than per-row `getBoundingClientRect` calls inside scroll handlers (see §6 — never measure synchronously during scroll).
- **`content-visibility: auto`** on off-window rows as a *second* line of defense (see §7) — cheap insurance if a row briefly renders outside the virtualizer's overscan (e.g., during fast resize).
- **Chunked/streaming data fetch** — paginate the backend query (cursor-based, not offset, at this scale) and virtualize over a "loading" placeholder row shape so scroll never blocks on network.
- **Canvas/WebGL fallback** for truly extreme scale (tens of millions, e.g. trading terminals, log viewers like `react-window` + canvas hybrids, or libraries like `glide-data-grid` which renders cells to `<canvas>` instead of DOM — bypasses per-row DOM cost entirely). If DOM virtualization still isn't enough (huge column counts × huge row counts, spreadsheet-like), canvas grids (Glide Data Grid, AG Grid's canvas mode) are the next tier.
- **Web Worker for sort/filter/aggregation** on million-row datasets so the main thread only receives already-computed row order/indices (keeps INP low even for "select all + bulk transform" actions) — combine with `useTransition` to mark the "apply worker result" state update as low priority.
- **Immutable/structural-sharing data structures** (e.g., persisted arrays, or just plain arrays with `slice`/index math) so windowed re-renders don't do O(n) work on every scroll frame.

---

## 6. Avoiding layout thrash from `ResizeObserver`

### The problem
`ResizeObserver` callbacks fire **after layout**, but if your callback then **writes** styles/DOM that affect layout (e.g., setting inline `width`/`height`, or triggering a React state update that re-renders and changes sizes) and something later in the same frame **reads** layout (`offsetHeight`, `getBoundingClientRect`), you get forced synchronous layout ("layout thrash") — potentially repeatedly, since ResizeObserver **re-invokes itself within the same rendering step** if your writes caused further size changes (spec guards against infinite loops with a "loop limit exceeded" error after ~a handful of iterations, but it still costs frames before it gives up).

### Rule 1: Batch reads before writes (measure, then mutate)
```tsx
useEffect(() => {
  const observer = new ResizeObserver(entries => {
    // Read all entries first (no interleaved DOM writes yet)
    const sizes = entries.map(e => ({
      target: e.target,
      width: e.contentBoxSize?.[0]?.inlineSize ?? e.contentRect.width,
    }));
    // Then batch writes (React state update — one commit, not N)
    setSizes(prev => {
      const next = new Map(prev);
      sizes.forEach(({ target, width }) => next.set(target, width));
      return next;
    });
  });
  elements.forEach(el => observer.observe(el));
  return () => observer.disconnect();
}, [elements]);
```

### Rule 2: Never read layout properties synchronously inside the callback if you also write in it
Reading `getBoundingClientRect()` right after a write forces the browser to flush pending layout immediately (synchronous layout / "reflow"), instead of waiting for the natural end-of-frame layout pass. `ResizeObserver`'s `contentRect`/`borderBoxSize` entries **already give you the measured size** — use those instead of re-measuring manually.

### Rule 3: Throttle/rAF-batch high-frequency resize churn
```tsx
useEffect(() => {
  let rafId: number | null = null;
  const observer = new ResizeObserver(entries => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      applySizes(entries);
      rafId = null;
    });
  });
  observer.observe(el);
  return () => { observer.disconnect(); if (rafId) cancelAnimationFrame(rafId); };
}, []);
```
This coalesces bursts (e.g., window drag-resize firing dozens of times) into one write per frame.

### Rule 4: Prefer CSS over JS/RO for layout when possible
Container queries (`@container`), `aspect-ratio`, CSS `clamp()`/`min()/max()` sizing, and flex/grid auto-sizing eliminate the need for a `ResizeObserver` + JS re-layout loop entirely for a large share of "responsive component" cases — always the fastest option since it never touches the main-thread JS/layout boundary at all.

### Rule 5: Use `resize-observer-polyfill`/native `ResizeObserverEntry.borderBoxSize` and avoid one observer per row
For virtualized lists specifically: **don't attach a `ResizeObserver` per row** if you can avoid it (thousands of observers = overhead on every observation, and dynamic add/remove of observed targets during scroll adds churn). `@tanstack/virtual`'s `measureElement` API observes only currently-rendered rows and disconnects on unmount automatically — lean on that instead of hand-rolling one per row.

### Diagnosing thrash
Chrome DevTools Performance panel → look for **purple "Layout"/"Recalculate Style" blocks interleaved tightly with scripting**, and the **"Forced reflow" warning** annotation that Chrome adds directly on the flame chart bar when a read-after-write forces sync layout — this is the definitive signal, cited in Chrome DevTools docs and web.dev's "Avoid large, complex layouts and layout thrashing" (https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing).

---

## 7. `content-visibility: auto` + `contain-intrinsic-size` for off-screen sections

`content-visibility: auto` tells the browser to **skip layout, paint, and rendering** for an element's contents when it's off-screen — similar effect to virtualization but at the **rendering pipeline level**, not the React/DOM level, so it's a great complement (not replacement) for virtualization, especially for **sections you can't easily virtualize** (long-form articles with many rich embeds, big settings pages, accordion panels, dashboards with many independently-heavy widgets/charts).

```css
.section {
  content-visibility: auto;
  /* Reserve space so scrollbar/layout doesn't jump before the browser
     has ever rendered this section to know its real size: */
  contain-intrinsic-size: 0 600px; /* width height, or just a height value */
}
```

- Without `contain-intrinsic-size`, an unrendered `content-visibility: auto` element has **zero intrinsic size**, which causes scroll position jumps and incorrect scrollbar length until it's rendered once.
- `contain-intrinsic-size` sets a **placeholder size** used while content is skipped; once the browser actually renders it (comes into view, or is `auto`-adjusted), it remembers the real size via `contain-intrinsic-size: auto <fallback>` (CSSWG "remembered size" feature) so re-hiding/re-showing doesn't jump again.

```css
/* Modern pattern: browser remembers last rendered size */
.section {
  content-visibility: auto;
  contain-intrinsic-size: auto 500px; /* fallback until first paint, then remembered */
}
```

### Where to apply
- Long lists of independent "cards"/sections where full virtualization is overkill or impossible (e.g., server-rendered content, CMS-driven pages).
- Below-the-fold marketing pages, FAQ accordions, long docs pages — chrome.dev's own case study reports **~7x rendering time improvement** on a long page with many sections switching to `content-visibility: auto` (source: https://web.dev/articles/content-visibility, Chrome team's original 2020 rollout post "The New CSS Content-Visibility Property (And How It Can Boost Your Rendering Performance)").
- **Not** a substitute for windowing very large *homogeneous* lists (thousands of identical rows) — there, real DOM virtualization (§4) is strictly better because it also avoids holding those nodes in the DOM tree/memory at all; `content-visibility` still keeps the DOM nodes present (skips layout/paint but not their existence), so it doesn't reduce DOM node count for `document.querySelectorAll` etc.

### Combine with virtualization for belt-and-suspenders
Apply `content-visibility: auto` to virtualizer's row wrapper as extra insurance against overscan misses or fast resize/scroll edge cases:
```css
[data-virtual-row] {
  content-visibility: auto;
  contain-intrinsic-size: auto 44px;
}
```

Sources: https://web.dev/articles/content-visibility, MDN `content-visibility`/`contain-intrinsic-size`, https://developer.chrome.com/blog/content-visibility.

---

## 8. `startTransition` on route changes to prevent input blocking

### The problem
Router libraries (React Router v6.4+/v7, TanStack Router) trigger a state update on navigation that swaps out the whole page tree. If that swap is synchronous and the new route's initial render is expensive (data-heavy dashboard, big table), the browser can't paint the **click/tap feedback** (active state, ripple) until the new page finishes rendering — this directly shows up as bad INP on nav clicks.

### Pattern
```tsx
import { useTransition } from 'react';
import { useNavigate } from '@tanstack/react-router'; // or react-router

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();

  return (
    <a
      href={to}
      aria-busy={isPending}
      onClick={e => {
        e.preventDefault();
        startTransition(() => {
          navigate({ to });
        });
      }}
    >
      {children}
      {isPending && <InlineSpinner />}
    </a>
  );
}
```

React Router (v6.4+) has this **built in**: `useNavigate` navigation via `<Form>`/loaders internally uses transitions, and `useNavigation().state === 'loading'` is transition-driven — see React Router docs on "Pending UI" and their explicit adoption of `startTransition` for navigations (https://reactrouter.com/en/main/hooks/use-navigation, and their blog on concurrent-mode adoption). Next.js App Router also wraps route transitions in `startTransition` internally (documented in Next.js "Linking and Navigating" docs, calling out that `useTransition`-driven navigations keep the current page interactive during data fetching, https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating#5-react-startTransition).

### Why this fixes INP specifically
INP measures the **full duration from user interaction to the next paint that reflects it**, including the browser's own event-processing overhead. If the click handler synchronously triggers a large render, that render blocks the paint that would show visual feedback (e.g., a pressed/active state or route transition), inflating INP for that interaction. `startTransition` lets React:
1. Immediately paint whatever is urgent (active/pressed states, tab indicators, `isPending` spinner) on the **next frame**.
2. Do the expensive new-route render as **interruptible background work**, yielding to the main thread between chunks — so any *other* interaction during that time (e.g. user clicks Cancel, or scrolls) is still handled promptly.

### Combine with `<Suspense>` for data
```tsx
startTransition(() => {
  navigate({ to: '/dashboard' }); // triggers a Suspense boundary; old UI stays visible + interactive until ready
});
```
When navigation suspends (route's data loader/lazy import not resolved yet), wrapping in a transition means React keeps showing the **previous page, fully interactive**, instead of falling back to a loading spinner immediately — this is the documented React 18+ pattern "transitions and Suspense integration" (https://react.dev/reference/react/useTransition#preventing-unwanted-loading-indicators, https://react.dev/blog/2022/03/29/react-v18#new-suspense-features).

### Benchmark
Vercel's write-up on Next.js App Router + streaming ("Rendering: Client and Server Components", and INP-focused posts by the Next.js team) and community measurements typically show route-transition INP dropping from **300–600ms (blocking nav)** down to **<100ms (click feedback)** with the heavy render happening in the background, at the cost of the *full new page* taking a similar-or-slightly-longer wall-clock time to fully settle (since it's lower priority and can be interrupted) — a good trade because INP measures responsiveness, not total task completion time.

---

## 9. Getting INP < 200ms (the "good" threshold)

INP replaced FID as a Core Web Vital in March 2024 (https://web.dev/blog/inp-cwv-launch). Thresholds (https://web.dev/articles/inp): **Good ≤ 200ms, Needs improvement 200–500ms, Poor > 500ms**, measured as the (roughly) 98th-percentile interaction over the page's lifetime.

INP = `input delay + processing time + presentation delay` (https://web.dev/articles/optimize-inp#components_of_interaction_to_next_paint). Attack each phase:

### 9.1 Reduce input delay (main thread busy when interaction happens)
- Break up long tasks (>50ms) proactively — the **Long Animation Frames (LoAF) API** (https://developer.chrome.com/docs/web-platform/long-animation-frames) helps attribute *which* script caused a slow frame, better than the older Long Tasks API for INP debugging.
- Yield to the main thread inside big JS work using `scheduler.yield()` (new, https://developer.chrome.com/blog/introducing-scheduler-yield) or the polyfill pattern:
```ts
async function processInChunks<T>(items: T[], fn: (item: T) => void) {
  for (let i = 0; i < items.length; i++) {
    fn(items[i]);
    if (i % 200 === 0) {
      await (scheduler?.yield?.() ?? new Promise(r => setTimeout(r, 0)));
    }
  }
}
```
- Defer non-critical JS (analytics, third-party scripts) via `requestIdleCallback` or loading them after first interaction.

### 9.2 Reduce processing time (the interaction handler + resulting render)
- **`startTransition`/`useDeferredValue`** (§1, §2, §8) — the direct React tool for this; move non-essential state updates out of the urgent path.
- **`React.memo`/React Compiler** (§3) — cut unnecessary re-render work triggered by the interaction.
- **Virtualization** (§4, §5) — cap DOM work regardless of dataset size.
- **`content-visibility: auto`** (§7) — cap layout/paint work for off-screen content even outside virtualized lists.
- **Avoid layout thrash** (§6) — forced synchronous layout inside event handlers is a classic, easily-fixed INP killer; audit with DevTools' "Forced reflow" flame chart annotations.
- **Debounce/throttle high-frequency handlers** (scroll, resize, drag) that aren't themselves the "next paint"-relevant interaction.
- Split heavy work into a **Web Worker** (`Comlink` or raw `postMessage`) when it doesn't need DOM access at all (parsing, sorting, computing) — keeps the main thread free for the paint.

### 9.3 Reduce presentation delay (post-render → actual pixels on screen)
- Minimize style/layout recalculation cost of the update itself (§6, §7) — smaller/cheaper subtrees paint faster.
- Avoid huge box-shadow/filter/backdrop-blur recalculation on every interaction-triggered re-render; these are expensive paint operations independent of React.
- Keep `will-change`/compositor layers used judiciously — too many layers costs memory/compositing time, too few pushes work onto main-thread paint.
- Use the **CSS `@starting-style`/View Transitions API** for animated state changes instead of JS-driven layout animation loops when possible — offloads to compositor.

### 9.4 Measurement & tooling
- **Chrome DevTools Performance panel** → "Interactions" track (shows INP-contributing interactions directly with input-delay/processing/presentation breakdown).
- **`web-vitals` JS library** in production RUM: 
```ts
import { onINP } from 'web-vitals';
onINP(metric => sendToAnalytics(metric), { reportAllChanges: true });
```
- **PageSpeed Insights / CrUX** for field data (INP is a field metric — lab tools like Lighthouse approximate with "Total Blocking Time" but INP itself is only truly measured with real user interactions).
- **React DevTools Profiler** "Ranked"/"Flamegraph" view for identifying components with disproportionate render cost triggered by an interaction.

### 9.5 Case studies
- web.dev's own case studies on INP optimization (e.g. https://web.dev/case-studies and https://web.dev/articles/optimize-inp) document sites reducing INP by 50–70% primarily via: breaking up long tasks, deferring non-critical rendering, and reducing DOM size — the same techniques covered in §1–§8.
- The Chrome team's INP rollout blog explicitly calls out **React 18 concurrent features (`startTransition`, `useDeferredValue`) as first-class recommended mitigations** for framework apps (https://web.dev/blog/inp-cwv-launch, and the React team's own "How to think about INP in React apps" style guidance embedded in the concurrent-features docs).

---

## Summary checklist

- [ ] Wrap **expensive derived-state setters** (not input value setters) in `startTransition`; show `isPending` as subtle stale-state UI.
- [ ] Use `useDeferredValue` for **local** expensive re-renders; debounce only for **network** calls; memoize the deferred consumer.
- [ ] Profile before adding `React.memo`; ensure prop stability; prefer React Compiler over hand-rolled memoization where available.
- [ ] Virtualize any list regularly exceeding ~150–300 live DOM rows — `@tanstack/virtual` for headless control, `react-virtuoso` for batteries-included variable-height/chat/table needs.
- [ ] For millions of rows: window + good height estimates + id-keyed measure cache + worker-side sort/filter + consider canvas grid at extreme scale.
- [ ] In `ResizeObserver` callbacks: read all entries first, batch writes, `rAF`-throttle, avoid one observer per row, prefer CSS containment/queries when possible.
- [ ] Apply `content-visibility: auto` + `contain-intrinsic-size` to long off-screen sections that can't be virtualized.
- [ ] Wrap route navigations in `startTransition` (or rely on router/framework built-ins) so click feedback paints immediately.
- [ ] Target INP < 200ms: shrink long tasks, yield with `scheduler.yield()`, cut processing via the React techniques above, minimize paint/layout cost, measure with `web-vitals`/DevTools Interactions track/CrUX field data.

## Key sources
- React docs: `useTransition` — https://react.dev/reference/react/useTransition
- React docs: `useDeferredValue` — https://react.dev/reference/react/useDeferredValue
- React docs: `memo` — https://react.dev/reference/react/memo
- React docs: React Compiler — https://react.dev/learn/react-compiler
- React blog: React 18 release / Suspense + transitions — https://react.dev/blog/2022/03/29/react-v18
- TanStack Virtual docs — https://tanstack.com/virtual/latest
- react-virtuoso docs — https://virtuoso.dev
- web.dev: INP — https://web.dev/articles/inp
- web.dev: Optimize INP — https://web.dev/articles/optimize-inp
- web.dev: INP becomes a Core Web Vital — https://web.dev/blog/inp-cwv-launch
- web.dev: content-visibility — https://web.dev/articles/content-visibility
- web.dev: Avoid layout thrashing — https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing
- web.dev: DOM size — https://web.dev/dom-size/
- MDN: ResizeObserver, content-visibility, contain-intrinsic-size
- Chrome DevRel: Long Animation Frames API, scheduler.yield — https://developer.chrome.com/docs/web-platform/long-animation-frames
- React Router: pending UI / navigation — https://reactrouter.com/en/main/hooks/use-navigation
- Next.js docs: Linking and Navigating (startTransition) — https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating
