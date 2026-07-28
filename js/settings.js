/*
  settings.js
  -----------
  Logic for the Settings view: theme toggle, daily study goal, and
  resetting all saved progress. As with every other feature module, all
  persistence goes through storage.js rather than touching localStorage
  directly here.
*/

import { getSettings, saveTheme, saveDailyGoal, resetProgress } from "./storage.js";
import { renderDashboardStats } from "./progress.js";
import { renderStudyModules } from "./study.js";

const THEME_LABELS = {
  dark: "🌙 Dark",
  light: "☀️ Light",
};

/**
 * Applies the saved theme to the document root. Exported separately from
 * initSettingsControls so main.js can call it immediately on app init —
 * before the Settings view has ever been opened — avoiding a flash of the
 * wrong theme on load.
 */
export function applyStoredTheme() {
  const { theme } = getSettings();
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Updates the theme toggle button's label to reflect the given theme.
 * @param {string} theme
 */
function updateThemeButtonLabel(theme) {
  document.getElementById("theme-toggle-btn").textContent = THEME_LABELS[theme];
}

/**
 * Flips between the light and dark themes, persists the choice, and
 * updates the toggle button's label to match.
 */
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  const nextTheme = currentTheme === "dark" ? "light" : "dark";

  document.documentElement.setAttribute("data-theme", nextTheme);
  saveTheme(nextTheme);
  updateThemeButtonLabel(nextTheme);
}

/**
 * Fills the daily goal input with the saved value. Called on init and
 * again after a progress reset (the goal itself isn't reset, but this
 * keeps the input in sync in case it was ever left in a stale state).
 */
function loadDailyGoalInput() {
  const { dailyGoalMinutes } = getSettings();
  document.getElementById("daily-goal-input").value = dailyGoalMinutes;
}

/**
 * Validates and saves the daily goal entered by the user, then shows a
 * brief confirmation message.
 */
function handleDailyGoalSave() {
  const input = document.getElementById("daily-goal-input");
  const minutes = Number(input.value);
  const statusEl = document.getElementById("daily-goal-status");

  if (!Number.isFinite(minutes) || minutes <= 0) {
    statusEl.textContent = "Enter a positive number of minutes first.";
    return;
  }

  saveDailyGoal(minutes);
  statusEl.textContent = `Saved — daily goal is now ${minutes} minutes.`;
}

/**
 * Wipes all saved progress after a confirmation prompt, then re-renders
 * every view that displays progress-derived data so the reset is
 * reflected immediately, without requiring a page reload.
 */
function handleResetProgress() {
  const confirmed = window.confirm(
    "This will permanently erase your study streak, quiz/exam history, and flashcard mastered/bookmarked state. This cannot be undone. Continue?"
  );
  if (!confirmed) return;

  resetProgress();
  renderDashboardStats();
  renderStudyModules();

  document.getElementById("daily-goal-status").textContent = "All progress has been reset.";
}

/**
 * Wires up all Settings view controls and syncs them to saved state.
 * Call once on app init.
 */
export function initSettingsControls() {
  const { theme } = getSettings();
  updateThemeButtonLabel(theme);
  loadDailyGoalInput();

  document.getElementById("theme-toggle-btn").addEventListener("click", toggleTheme);
  document.getElementById("daily-goal-save-btn").addEventListener("click", handleDailyGoalSave);
  document.getElementById("reset-progress-btn").addEventListener("click", handleResetProgress);
}
