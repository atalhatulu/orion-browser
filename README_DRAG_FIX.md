# Fix for Drag-and-Drop in Edit Mode

## Problem
The original drag-and-drop implementation for reordering the three zones (header, surf, bottom) in edit mode had several issues:
- The dragged element did not snap to a valid position; it could be dropped anywhere, leading to incorrect ordering.
- No visual feedback (placeholder) was shown during the drag to indicate where the element would be inserted.
- The drop logic was based on the mouse position relative to the target element, but the insertion was not correctly updating the DOM order.
- After dropping, the `style.order` attributes were not updated to reflect the new order, causing the layout to not change visually.

## Solution
The updated `renderer.js` includes a complete rewrite of the drag-and-drop logic for the zones:

1. **Edit Mode Detection**: The `MutationObserver` watches for the `edit-mode` class on the `<body>` element (toggled via the settings menu). When present, drag-and-drop is enabled; when removed, it is disabled.

2. **Drag Events**:
   - `dragstart`: Sets the dragged zone and adds a visual `is-dragging` class. Also adds `is-dragging-global` to the body to potentially disable pointer events on other elements.
   - `dragend`: Removes the visual classes and clears the dragged zone reference.

3. **Drop Target (the container `.orion-browser`)**:
   - `dragover`: Prevents the default to allow a drop, calculates the insert index based on the mouse Y coordinate (top half vs. bottom half of each zone), and updates a placeholder element's position.
   - `dragleave`: Removes the placeholder and the `drag-over` class from the container.
   - `drop`: 
     - Prevents default.
     - Removes the dragged zone from its current location.
     - Inserts the dragged zone at the calculated index (before the target child if the index points to an existing child, or appended if at the end).
     - Removes the placeholder.
     - Updates the `style.order` of all zones to match their new DOM order (1-based).
     - Saves the new order to `localStorage` under the key `orion-zone-orders`.

4. **Placeholder**: A thin, colored `<div>` (height 2px, background color matching the edit-mode accent) is inserted at the target index during `dragover` and removed on `dragleave` or `drop`.

5. **Initialization**: On load, the saved order from `localStorage` is read and applied to each zone's `style.order`. The zone elements are then sorted by their `order` to ensure the internal `zones` array matches the DOM.

## CSS Notes
The existing CSS already provides visual feedback for draggable zones in edit mode:
- `.zone-draggable` adds a dashed border and semi-transparent background.
- `.is-dragging` (added during drag) reduces opacity, changes background, and scales slightly.
- The body class `edit-mode` also blurs the content area and shows a click‑through shield.

No additional CSS is required for the placeholder; it is styled directly in JavaScript.

## Usage
1. Open Orion Browser.
2. Click the settings button (⚙) in the top‑right corner.
3. In the settings pane, toggle the "Edit Mode" switch (this sends an `ORION_IPC:toggle-magic-mode:true/false` message, which adds/removes the `edit-mode` class on `<body>`).
4. Once in edit mode, the three zones (header, surf area, bottom bar) will show a dashed border and can be dragged.
5. Drag a zone over another zone; a thin line will appear indicating where the zone will be inserted if released.
6. Release the mouse button to drop the zone; it will snap into place and the order will be persisted.
7. Exit edit mode to lock the layout and interact with the browser normally.

## Files Modified
- `renderer.js`: Replaced the entire drag‑and‑drop section (lines ~75‑269) with the new implementation.
- No changes were required to `main.js`, `preload.js`, `package.json`, or `style.css`.

## Testing
After applying the changes, run:
```bash
cd /home/teha/Documents/GitHub/orion-browser
npm run dev   # or npm start
```
Then follow the usage steps above to verify that the zones can be reordered smoothly with visual feedback and that the order persists after a reload.
