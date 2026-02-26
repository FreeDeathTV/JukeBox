ADR‑01 — Virtualised Track List (Safe Integration Version)
Purpose
Improve performance by virtualising the track list rendering.
NOT replacing the library UI.
NOT redesigning the layout.
NOT altering any existing behaviour.

VirtualList is a drop‑in replacement for the {#each} loop — nothing more.

1. Scope — What MUST Be Done
✔ Implement a reusable VirtualList.svelte component
This component ONLY handles:

Scroll tracking

Calculating visible window

Rendering a slice of items

Padding above/below

Exposing scrollToIndex()

It does NOT:

Replace the library UI

Change layout

Change styling

Change TrackRow

Change selection logic

Change keyboard logic

✔ Integrate VirtualList by wrapping the existing TrackRow loop
The library UI stays exactly the same.  
Only the {#each} block is replaced.

✔ TrackRow stays untouched
Same markup.
Same styling.
Same behaviour.

✔ Filtering/search must pass the filtered array
VirtualList receives the same array the {#each} loop currently receives.

✔ Keyboard navigation continues to operate on indexes
No changes to navigation logic.

✔ Selection highlighting must continue to work
TrackRow still receives item and index exactly as before.

2. Non‑Scope — What MUST NOT Be Changed
❌ DO NOT modify:
Library layout

Library styling

Library header

Library controls

TrackRow component

Queue logic

Player logic

Audio logic

Database logic

Metadata logic

Window chrome

Mode switching

Drag regions

❌ DO NOT refactor unrelated components
VirtualList is a surgical drop‑in.

3. Architecture Requirements
VirtualList uses fixed-height windowing
itemHeight = 48

buffer = 100

VirtualList computes:
Code
startIndex
endIndex
windowStart = startIndex - buffer
windowEnd = endIndex + buffer
visibleItems = items.slice(windowStart, windowEnd)
topPadding = windowStart * itemHeight
bottomPadding = (items.length - windowEnd) * itemHeight
VirtualList exposes:
js
scrollToIndex(i)
VirtualList is PURE
No stores.
No side effects.
No assumptions about track structure.

4. Component Specification — VirtualList.svelte
Props:
items

itemHeight

buffer

Slot:
"row" with { item, index }

DOM:
svelte
<div class="virtual-container">
  <div style="height:{topPadding}px"></div>

  {#each visibleItems as item, i}
    <slot name="row" item={item} index={windowStart + i}></slot>
  {/each}

  <div style="height:{bottomPadding}px"></div>
</div>
CSS:
css
.virtual-container {
  overflow-y: auto;
  height: 100%;
}
5. Integration Requirements
A. Library Page
Replace ONLY the {#each} block:

svelte
<VirtualList items={$filteredTracks} itemHeight={48} buffer={100}>
  <div slot="row" let:item let:index>
    <TrackRow {item} {index} />
  </div>
</VirtualList>
Everything else stays exactly the same.

B. Duplicates Review Page
Same replacement of the {#each} block.

6. TrackRow Requirements
TrackRow MUST remain exactly 48px tall:

css
.track-row {
  height: 48px;
  min-height: 48px;
  max-height: 48px;
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}
No dynamic height.
No multi-line expansion.

7. Search / Filter Requirements
VirtualList receives the same filtered array the UI already uses:

js
$filteredTracks
No changes to search logic.

8. Keyboard Navigation Requirements
Navigation continues to operate on indexes:

js
currentIndex.update(...)
When selection changes:

js
virtualListRef.scrollToIndex(newIndex);
No changes to navigation logic.

9. Acceptance Criteria — What “Done” Looks Like
✔ Library UI looks identical
✔ No layout changes
✔ No styling changes
✔ No behavioural changes
✔ Only ~300 DOM nodes exist
✔ Scrolling is smooth
✔ Filtering is instant
✔ Keyboard navigation works
✔ Selection highlighting works
✔ No regressions in player/queue
✔ No other components modified
10. Developer Notes
VirtualList is a rendering optimisation, not a UI change

TrackRow stays exactly as it is

Library layout stays exactly as it is

Only the {#each} block is replaced

No other files should be touched