/*
  notes.js
  --------
  Logic for the Notes view: a single freeform notebook, autosaved to
  localStorage (via storage.js) as the user types, so there's no explicit
  save button to remember to click.
*/

import { getNotes, saveNotes } from "./storage.js";

const AUTOSAVE_DELAY_MS = 500;
let autosaveTimeoutId = null;
let hideSavedTimeoutId = null;

/**
 * Persists the current notes text and briefly shows a "Saved" indicator
 * that fades away on its own.
 * @param {string} text
 */
function handleAutosave(text) {
  saveNotes(text);

  const statusEl = document.getElementById("notes-save-status");
  statusEl.textContent = "Saved";

  clearTimeout(hideSavedTimeoutId);
  hideSavedTimeoutId = setTimeout(() => {
    statusEl.textContent = "";
  }, 1500);
}

/**
 * Loads any previously saved notes into the textarea and wires up
 * debounced autosaving on every keystroke. Call once on app init.
 */
export function initNotes() {
  const textarea = document.getElementById("notes-textarea");
  textarea.value = getNotes();

  textarea.addEventListener("input", () => {
    clearTimeout(autosaveTimeoutId);
    autosaveTimeoutId = setTimeout(() => handleAutosave(textarea.value), AUTOSAVE_DELAY_MS);
  });
}
