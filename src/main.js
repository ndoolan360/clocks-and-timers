import '../components/analog-clock/analog-clock.js';
import '../components/countdown-timer/countdown-timer.js';
import '../components/pomodoro-timer/pomodoro-timer.js';
import {
  unlockAudio,
  registerAlarmStartEvents,
  registerAlarmStopEvents,
} from './alarm.js';
import { loadStorage, saveStorage } from './storage.js';
import { initDrag } from './drag.js';


const list = document.getElementById('clocks-and-timers');

// Audio set-up
unlockAudio();
registerAlarmStartEvents(list, ['timer-finished']);
registerAlarmStopEvents(list, ['timer-started', 'timer-paused', 'timer-removed', 'pomodoro-removed']);

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
  attributeFilter: ['duration', 'timezone', 'work', 'short-break', 'long-break', 'rounds'],
});

// Listen for custom events to remove clocks and timers from the list
list.addEventListener('clock-removed', (e) => {
  e.target.closest('li')?.remove();
});

list.addEventListener('timer-removed', (e) => {
  e.target.closest('li')?.remove();
});

list.addEventListener('pomodoro-removed', (e) => {
  e.target.closest('li')?.remove();
});

// Set up buttons to add clocks and timers
const addClockBtn = document.getElementById('add-clock');
const addTimerBtn = document.getElementById('add-timer');
const addPomodoroBtn = document.getElementById('add-pomodoro');
addClockBtn.addEventListener('click', () => {
  const li = document.createElement('li');
  li.innerHTML = `<analog-clock></analog-clock>`;
  list.appendChild(li);
});
addTimerBtn.addEventListener('click', () => {
  const li = document.createElement('li');
  li.innerHTML = `<countdown-timer duration="300"></countdown-timer>`;
  list.appendChild(li);
});
addPomodoroBtn.addEventListener('click', () => {
  const li = document.createElement('li');
  li.innerHTML = `<pomodoro-timer></pomodoro-timer>`;
  list.appendChild(li);
});
addClockBtn.disabled = false;
addTimerBtn.disabled = false;
addPomodoroBtn.disabled = false;
