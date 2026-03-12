/**
 * Drag-and-drop reordering for the widget grid.
 *
 * Call `initDrag(list)` with the `<ul>` container. A lightweight `.drag-handle`
 * element is injected into every `<li>` (current and future). The entire drag
 * operation is driven by pointer events (not the native HTML DnD API), giving
 * full control over the cursor throughout the interaction.
 *
 * DOM mutations from reordering will be picked up by any existing
 * MutationObserver on the list.
 */

/** Minimum px the pointer must move before a drag begins. */
const DEAD_ZONE = 5;

// --- Handle management ------------------------------------------------------

/**
 * Create a drag handle element.
 * @returns {HTMLSpanElement}
 */
function createHandle() {
  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.setAttribute('aria-label', 'Drag to reorder');
  handle.setAttribute('role', 'img');
  handle.title = 'Drag to reorder';
  handle.textContent = '⠿';
  return handle;
}

/**
 * Ensure an `<li>` has a `.drag-handle` child. No-ops if one already exists.
 * @param {HTMLLIElement} li
 */
function ensureHandle(li) {
  if (!li.querySelector('.drag-handle')) {
    li.appendChild(createHandle());
  }
}

// --- Helpers ----------------------------------------------------------------

/**
 * Return the `<li>` ancestor of `node`, scoped to `list`.
 * @param {HTMLElement} list
 * @param {EventTarget | null} target
 * @returns {HTMLLIElement | null}
 */
function liFromTarget(list, target) {
  if (!(target instanceof HTMLElement)) return null;
  const li = target.closest('li');
  return li?.parentElement === list ? li : null;
}

/**
 * Return the `<li>` under the given viewport coordinates, ignoring `skip`.
 * @param {HTMLElement} list
 * @param {number} clientX
 * @param {number} clientY
 * @param {HTMLLIElement} skip  The currently dragged item (excluded).
 * @returns {HTMLLIElement | null}
 */
function liFromPoint(list, clientX, clientY, skip) {
  for (const li of list.children) {
    if (li === skip || !(li instanceof HTMLElement) || li.tagName !== 'LI') continue;
    const rect = li.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return /** @type {HTMLLIElement} */ (li);
    }
  }
  return null;
}

/**
 * Determine whether the pointer is in the first or second half of `el`.
 * Returns `'before'` or `'after'`.
 * @param {HTMLElement} el
 * @param {number} clientX
 * @returns {'before' | 'after'}
 */
function dropPosition(el, clientX) {
  const rect = el.getBoundingClientRect();
  const midX = rect.left + rect.width / 2;
  return clientX < midX ? 'before' : 'after';
}

/**
 * Clear all drop-indicator attributes from every `<li>` in the list.
 * @param {HTMLElement} list
 */
function clearIndicators(list) {
  for (const li of list.querySelectorAll('li[data-drop]')) {
    delete li.dataset.drop;
  }
}

// --- Init -------------------------------------------------------------------

/**
 * Initialise handle-gated drag-and-drop reordering on `list`.
 * @param {HTMLElement} list  The `<ul>` container element.
 */
export function initDrag(list) {
  /** @type {HTMLLIElement | null} */
  let draggedItem = null;
  /** @type {{ x: number, y: number } | null} */
  let pointerOrigin = null;
  /** Whether we've committed to a drag (passed the dead-zone threshold). */
  let dragging = false;
  /** @type {HTMLLIElement | null} Current drop-indicator target. */
  let currentDropTarget = null;
  /** @type {'before' | 'after' | null} Current drop-indicator position. */
  let currentDropPosition = null;

  function cleanup() {
    if (draggedItem) {
      delete draggedItem.dataset.dragging;
    }
    delete document.documentElement.dataset.dragging;
    draggedItem = null;
    pointerOrigin = null;
    dragging = false;
    currentDropTarget = null;
    currentDropPosition = null;
    clearIndicators(list);
  }

  // Inject handles into all existing items.
  for (const li of list.children) {
    ensureHandle(li);
  }

  // Inject handles into any items added later.
  const childObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      for (const node of m.addedNodes) {
        if (node instanceof HTMLElement && node.tagName === 'LI') {
          ensureHandle(node);
        }
      }
    }
  });
  childObserver.observe(list, { childList: true });

  // --- Pointer down on handle: begin tracking -------------------------------

  list.addEventListener('pointerdown', (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    if (!e.target.classList.contains('drag-handle')) return;

    const li = liFromTarget(list, e.target);
    if (!li) return;

    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);

    draggedItem = li;
    pointerOrigin = { x: e.clientX, y: e.clientY };
    dragging = false;
  });

  // --- Pointer move: commit to drag once past dead-zone ---------------------

  list.addEventListener('pointermove', (e) => {
    if (!draggedItem || !pointerOrigin) return;

    if (!dragging) {
      const dx = e.clientX - pointerOrigin.x;
      const dy = e.clientY - pointerOrigin.y;
      if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) return;

      // Commit to the drag.
      dragging = true;
      draggedItem.dataset.dragging = '';
      document.documentElement.dataset.dragging = '';
    }

    // Find the <li> under the pointer (excluding the dragged one).
    const target = liFromPoint(list, e.clientX, e.clientY, draggedItem);
    const pos = target ? dropPosition(target, e.clientX) : null;

    // Only touch the DOM when the target or position actually changed.
    if (target !== currentDropTarget || pos !== currentDropPosition) {
      clearIndicators(list);
      if (target) {
        target.dataset.drop = pos;
      }
      currentDropTarget = target;
      currentDropPosition = pos;
    }
  });

  // --- Pointer up: finalise or cancel ---------------------------------------

  list.addEventListener('pointerup', (e) => {
    if (!draggedItem) return;

    if (dragging) {
      const target = liFromPoint(list, e.clientX, e.clientY, draggedItem);
      if (target) {
        const pos = dropPosition(target, e.clientX);
        if (pos === 'before') {
          list.insertBefore(draggedItem, target);
        } else {
          list.insertBefore(draggedItem, target.nextElementSibling);
        }
      }
    }

    cleanup();
  });

  // --- Pointer cancel (e.g. system gesture) ---------------------------------

  list.addEventListener('pointercancel', () => {
    cleanup();
  });
}
