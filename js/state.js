/*
  state.js
  --------
  Centralized in-memory application state (things that reset on page reload,
  as opposed to persisted progress, which lives in storage.js).

  Right now this only tracks the current view, but this is the module where
  transient state for quizzes, flashcards, and exams will live too — keeping
  it in one place instead of scattered global variables across files.
*/

// Private to this module — nothing outside can reach in and mutate it directly.
let currentView = "dashboard";

/**
 * Returns the name of the view currently being shown.
 * @returns {string}
 */
export function getCurrentView() {
  return currentView;
}

/**
 * Updates which view is considered "current."
 * Kept as a function (not a direct export of the variable) so that in future
 * we have one place to hook into view changes (e.g. tracking time spent per view).
 * @param {string} viewName
 */
export function setCurrentView(viewName) {
  currentView = viewName;
}
