/*
  main.js
  -------
  Entry point for the app. Loaded as a module from index.html.
  Responsible for wiring things together on page load — not for
  containing feature logic itself (that lives in router.js, state.js, etc.)
*/

import { navigateTo } from "./router.js";
import { updateStreakForToday, getProgress } from "./storage.js";
import { initQuizModuleSelector, initQuizControls } from "./quiz-engine.js";
import { initFlashcardFilter, initFlashcardControls } from "./flashcards.js";

/**
 * Reads current progress and writes the values into the dashboard's
 * stat elements. Kept simple for now — full weak-topic calculation
 * and quiz-driven stats arrive in the Progress Tracking step.
 */
function renderDashboardStats() {
  const progress = getProgress();

  document.getElementById("stat-streak").textContent = `${progress.streak.count} day${progress.streak.count === 1 ? "" : "s"}`;
  document.getElementById("stat-quizzes").textContent = progress.quizzesCompleted;
  document.getElementById("stat-weak-topic").textContent =
    progress.weakTopics.length > 0 ? progress.weakTopics[0] : "—";
}

/**
 * Sets up a single click listener on the whole document (event delegation)
 * rather than attaching one listener per button. This automatically covers
 * both sidebar nav buttons and dashboard shortcut buttons, since both use
 * the same data-nav-target attribute — and it will keep working even if
 * more nav-triggering buttons are added later.
 */
function initNavigation() {
  document.addEventListener("click", (event) => {
    const navButton = event.target.closest("[data-nav-target]");

    // If the click wasn't on (or inside) a nav-target button, ignore it.
    if (!navButton) return;

    const targetView = navButton.dataset.navTarget;
    navigateTo(targetView);
  });
}

/**
 * Runs once when the app first loads. Ensures the initial view state
 * (Dashboard) is properly synced, even though the HTML already shows
 * it by default — this keeps state.js and the DOM guaranteed to agree.
 */
function initApp() {
  initNavigation();
  updateStreakForToday();
  renderDashboardStats();
  initQuizModuleSelector();
  initQuizControls();
  initFlashcardFilter();
  initFlashcardControls();
  navigateTo("dashboard");
}

// Kick things off once the DOM is ready.
document.addEventListener("DOMContentLoaded", initApp);