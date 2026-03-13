import '../components/analog-clock/analog-clock.js';
import '../components/countdown-timer/countdown-timer.js';
import '../components/pomodoro-timer/pomodoro-timer.js';
import '../components/stopwatch-clock/stopwatch-clock.js';
import {
  unlockAudio,
  registerAlarmStartEvents,
  registerAlarmStopEvents,
} from './alarm.js';
import { loadStorage, saveStorage } from './storage.js';
import { initDrag } from './drag.js';

/**
 * Set of supported widgets, with their tag names and attributes.
 * @type {{ tag: string, attributes?: string[] }[]} WidgetList
 */
export const WIDGETS = [
  {
    tag: 'analog-clock',
    attributes: ['timezone'],
  },
  {
    tag: 'countdown-timer',
    attributes: ['duration'],
  },
  {
    tag: 'pomodoro-timer',
    attributes: ['work', 'short-break', 'long-break', 'rounds'],
  },
  { tag: 'stopwatch-clock' },
]

// The <ul> container for the list of widgets.
const list = document.getElementById('clocks-and-timers');

// Audio set-up
unlockAudio();
registerAlarmStartEvents(list, ['timer-finished']);
registerAlarmStopEvents(list, ['timer-started', 'timer-paused', 'widget-removed']);

// Listen for removal event
list.addEventListener('widget-removed', (e) => {
  e.target.closest('li')?.remove();
});

// Initialise from storage
const restored = loadStorage(list);
if (!restored) {
  // Add a default clock if there was nothing in storage
  const li = document.createElement('li');
  li.innerHTML = `<analog-clock></analog-clock>`;
  list.appendChild(li);
  saveStorage(list);
}

// Drag-and-drop reordering
initDrag(list);

// Save on changes to the list of widgets
const observer = new MutationObserver(() => saveStorage(list));
observer.observe(list, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: WIDGETS.flatMap(w => w.attributes),
});

for (const { tag } of WIDGETS) {
  const addBtn = document.getElementById(`add-${tag}`);
  if (!addBtn) {
    console.warn(`No add button found for ${tag}, skipping widget initialisation`);
    continue;
  }

  addBtn.addEventListener('click', () => {
    const li = document.createElement('li');
    li.innerHTML = `<${tag}></${tag}>`;
    list.appendChild(li);
  });
  addBtn.disabled = false;
}
