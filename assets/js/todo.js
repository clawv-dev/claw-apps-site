// To-do list page: add, rename, mark done, delete, and drag to reorder.
// Data lives in the `todo_tasks` table of the shared Supabase project; the
// database only returns rows owned by the signed-in user.
import { supabaseClient, requireFullySignedIn, signOutAndGoToLogin } from './session.js';

const LOGIN_PAGE_PATH = '../login.html';
const TASKS_TABLE = 'todo_tasks';
// Gap left between neighbouring tasks' sort_order values, so a dragged task can
// be placed between two others by taking the midpoint without touching them.
const SORT_ORDER_GAP = 1000;
// When repeated midpoint inserts squeeze two neighbours this close together,
// all open tasks are renumbered with fresh gaps.
const MINIMUM_SORT_ORDER_GAP = 0.001;

const openList = document.getElementById('open-task-list');
const doneList = document.getElementById('done-task-list');
const doneSection = document.getElementById('done-section');
const emptyMessage = document.getElementById('empty-message');
const statusMessage = document.getElementById('status-message');

/** @type {{id: string, title: string, is_done: boolean, sort_order: number}[]} */
let tasks = [];

function openTasksInOrder() {
  return tasks.filter((task) => !task.is_done).sort((a, b) => a.sort_order - b.sort_order);
}

function showStatus(text) {
  statusMessage.textContent = text;
}

// Runs a database call; on failure shows the error and reloads from the
// database so the screen never shows something that was not saved.
async function saveOrReload(databaseCall, failureText) {
  const { data, error } = await databaseCall;
  // The database rules silently skip rows this session may not change (for
  // example after the sign-in has expired), so "no rows came back" is a failure.
  const nothingChanged = !error && (!data || data.length === 0);
  if (error || nothingChanged) {
    const reason = error ? error.message : 'nothing was changed; try signing in again';
    showStatus(`${failureText} (${reason})`);
    await loadTasks();
    return false;
  }
  showStatus('');
  return true;
}

async function loadTasks() {
  const { data, error } = await supabaseClient
    .from(TASKS_TABLE)
    .select('id, title, is_done, sort_order')
    .order('sort_order', { ascending: true });
  if (error) {
    showStatus(`Could not load tasks (${error.message})`);
    return;
  }
  tasks = data;
  renderTasks();
}

async function addTask(title) {
  const openTasks = openTasksInOrder();
  const lastSortOrder = openTasks.length ? openTasks[openTasks.length - 1].sort_order : 0;
  const { data, error } = await supabaseClient
    .from(TASKS_TABLE)
    .insert({ title, sort_order: lastSortOrder + SORT_ORDER_GAP })
    .select('id, title, is_done, sort_order')
    .single();
  if (error) {
    showStatus(`Could not add the task (${error.message})`);
    return false;
  }
  showStatus('');
  tasks.push(data);
  renderTasks();
  return true;
}

async function setTaskDone(task, isDone) {
  task.is_done = isDone;
  if (!isDone) {
    // A task that is re-opened goes to the bottom of the open list.
    const openTasks = openTasksInOrder().filter((other) => other.id !== task.id);
    const lastSortOrder = openTasks.length ? openTasks[openTasks.length - 1].sort_order : 0;
    task.sort_order = lastSortOrder + SORT_ORDER_GAP;
  }
  renderTasks();
  await saveOrReload(
    supabaseClient
      .from(TASKS_TABLE)
      .update({
        is_done: isDone,
        done_at: isDone ? new Date().toISOString() : null,
        sort_order: task.sort_order,
      })
      .eq('id', task.id)
      .select('id'),
    'Could not save that change',
  );
}

async function renameTask(task, newTitle) {
  task.title = newTitle;
  renderTasks();
  await saveOrReload(
    supabaseClient.from(TASKS_TABLE).update({ title: newTitle }).eq('id', task.id)
      .select('id'),
    'Could not rename the task',
  );
}

async function deleteTask(task) {
  if (!window.confirm(`Delete "${task.title}"?`)) return;
  tasks = tasks.filter((other) => other.id !== task.id);
  renderTasks();
  await saveOrReload(
    supabaseClient.from(TASKS_TABLE).delete().eq('id', task.id)
      .select('id'),
    'Could not delete the task',
  );
}

// Order saves run one after another. Holding an arrow key fires many moves
// quickly; if their saves overlapped, an older position could land last.
let pendingOrderSaves = Promise.resolve();
function queueOrderSave(movedRow) {
  pendingOrderSaves = pendingOrderSaves.then(() => saveOrderAfterMove(movedRow));
}

// Called after a row has been moved in the page. Works out the moved task's new
// sort_order from the rows now above and below it, and saves it.
async function saveOrderAfterMove(movedRow) {
  if (!movedRow.isConnected) return; // The list was redrawn since this move.
  const taskForRow = (row) => (row ? tasks.find((task) => task.id === row.dataset.taskId) : null);
  const movedTask = taskForRow(movedRow);
  const taskAbove = taskForRow(movedRow.previousElementSibling);
  const taskBelow = taskForRow(movedRow.nextElementSibling);

  if (taskAbove && taskBelow) {
    if (taskBelow.sort_order - taskAbove.sort_order < MINIMUM_SORT_ORDER_GAP) {
      await renumberOpenTasksFromPageOrder();
      return;
    }
    movedTask.sort_order = (taskAbove.sort_order + taskBelow.sort_order) / 2;
  } else if (taskAbove) {
    movedTask.sort_order = taskAbove.sort_order + SORT_ORDER_GAP;
  } else if (taskBelow) {
    movedTask.sort_order = taskBelow.sort_order - SORT_ORDER_GAP;
  } else {
    return; // Only task in the list; nothing to reorder.
  }

  await saveOrReload(
    supabaseClient
      .from(TASKS_TABLE)
      .update({ sort_order: movedTask.sort_order })
      .eq('id', movedTask.id)
      .select('id'),
    'Could not save the new order',
  );
}

async function renumberOpenTasksFromPageOrder() {
  const rows = [...openList.querySelectorAll('.task-row')];
  const updates = rows.map((row, index) => {
    const task = tasks.find((candidate) => candidate.id === row.dataset.taskId);
    task.sort_order = (index + 1) * SORT_ORDER_GAP;
    return supabaseClient
      .from(TASKS_TABLE)
      .update({ sort_order: task.sort_order })
      .eq('id', task.id)
      .select('id');
  });
  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error || !result.data || result.data.length === 0);
  if (failed) {
    showStatus('Could not save the new order; try signing in again');
    await loadTasks();
  }
}

// ---- Drag to reorder -------------------------------------------------------
// Pointer events cover mouse, touch and pen with one code path. The row is
// moved in the page as the pointer crosses the middle of a neighbouring row;
// the new order is saved once, when the pointer is released.

function startDrag(pointerDownEvent, row) {
  if (pointerDownEvent.pointerType === 'mouse' && pointerDownEvent.button !== 0) return;
  pointerDownEvent.preventDefault();
  row.classList.add('is-dragging');
  const rowBelowAtStart = row.nextElementSibling;

  const moveRowUnderPointer = (event) => {
    const otherRows = [...openList.querySelectorAll('.task-row:not(.is-dragging)')];
    const rowBelowPointer = otherRows.find((other) => {
      const box = other.getBoundingClientRect();
      return event.clientY < box.top + box.height / 2;
    });
    // Only touch the page when the position actually changes.
    if (rowBelowPointer) {
      if (row.nextElementSibling !== rowBelowPointer) openList.insertBefore(row, rowBelowPointer);
    } else if (openList.lastElementChild !== row) {
      openList.appendChild(row);
    }
  };

  const finishDrag = () => {
    document.removeEventListener('pointermove', moveRowUnderPointer);
    document.removeEventListener('pointerup', finishDrag);
    document.removeEventListener('pointercancel', finishDrag);
    row.classList.remove('is-dragging');
    // A plain click on the handle moves nothing, so there is nothing to save.
    if (row.nextElementSibling !== rowBelowAtStart) queueOrderSave(row);
  };

  document.addEventListener('pointermove', moveRowUnderPointer);
  document.addEventListener('pointerup', finishDrag);
  document.addEventListener('pointercancel', finishDrag);
}

// Keyboard alternative to dragging: arrow up / down on the drag handle.
function moveRowWithKeyboard(keyEvent, row, handle) {
  if (keyEvent.key === 'ArrowUp' && row.previousElementSibling) {
    openList.insertBefore(row, row.previousElementSibling);
  } else if (keyEvent.key === 'ArrowDown' && row.nextElementSibling) {
    openList.insertBefore(row.nextElementSibling, row);
  } else {
    return;
  }
  keyEvent.preventDefault();
  handle.focus();
  queueOrderSave(row);
}

// ---- Rendering -------------------------------------------------------------

function makeButton(className, label, text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.textContent = text;
  return button;
}

function startRename(task, titleElement) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'task-title-input';
  input.value = task.title;
  input.maxLength = 500;
  titleElement.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = (shouldSave) => {
    if (finished) return;
    finished = true;
    const newTitle = input.value.trim();
    if (shouldSave && newTitle && newTitle !== task.title) {
      renameTask(task, newTitle);
    } else {
      renderTasks();
    }
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finish(true);
    if (event.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

function buildTaskRow(task) {
  const row = document.createElement('li');
  row.className = 'task-row';
  row.dataset.taskId = task.id;

  if (!task.is_done) {
    const handle = makeButton(
      'drag-handle',
      `Reorder "${task.title}" (drag, or use the arrow keys)`,
      '⠿',
    );
    handle.addEventListener('pointerdown', (event) => startDrag(event, row));
    handle.addEventListener('keydown', (event) => moveRowWithKeyboard(event, row, handle));
    row.append(handle);
  }

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.is_done;
  checkbox.setAttribute('aria-label', `Mark "${task.title}" as ${task.is_done ? 'not done' : 'done'}`);
  checkbox.addEventListener('change', () => setTaskDone(task, checkbox.checked));

  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;

  const renameButton = makeButton('icon-button', `Rename "${task.title}"`, '✎');
  renameButton.addEventListener('click', () => startRename(task, title));

  const deleteButton = makeButton('icon-button', `Delete "${task.title}"`, '✕');
  deleteButton.addEventListener('click', () => deleteTask(task));

  row.append(checkbox, title, renameButton, deleteButton);
  return row;
}

function renderTasks() {
  const openTasks = openTasksInOrder();
  const doneTasks = tasks.filter((task) => task.is_done);
  openList.replaceChildren(...openTasks.map(buildTaskRow));
  doneList.replaceChildren(...doneTasks.map(buildTaskRow));
  emptyMessage.hidden = openTasks.length > 0;
  doneSection.hidden = doneTasks.length === 0;
  document.getElementById('done-count').textContent = String(doneTasks.length);
}

// ---- Page start ------------------------------------------------------------

if (await requireFullySignedIn(LOGIN_PAGE_PATH)) {
  document.getElementById('page-content').hidden = false;

  document.getElementById('add-task-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('new-task-title');
    const title = input.value.trim();
    if (!title) return;
    // Keep the typed text if the save fails, so it is not lost.
    addTask(title).then((wasSaved) => {
      if (wasSaved && input.value.trim() === title) input.value = '';
    });
  });

  document
    .getElementById('sign-out-button')
    .addEventListener('click', () => signOutAndGoToLogin(LOGIN_PAGE_PATH));

  await loadTasks();
}
