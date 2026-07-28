/*
  main.js
  -------
  Entry point for the app. Loaded as a module from index.html.
  Responsible for wiring things together on page load — not for
  containing feature logic itself (that lives in router.js, state.js, etc.)
*/

import { navigateTo } from "./router.js";
import { updateStreakForToday } from "./storage.js";
import { initQuizModuleSelector, initQuizControls } from "./quiz-engine.js";
import { initFlashcardFilter, initFlashcardControls } from "./flashcards.js";
import { renderDashboardStats, startSessionTimer } from "./progress.js";
import { initExamStartScreen, initExamControls } from "./exam.js";
import { renderStudyModules } from "./study.js";
import { applyStoredTheme, initSettingsControls } from "./settings.js";

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

    // Dashboard stats and Study completion status can both change from
    // anywhere in the app — recalculate whenever those views are opened,
    // rather than only once when the page first loads.
    if (targetView === "dashboard") {
      renderDashboardStats();
    }
    if (targetView === "study") {
      renderStudyModules();
    }
  });
}

/**
 * Runs once when the app first loads. Ensures the initial view state
 * (Dashboard) is properly synced, even though the HTML already shows
 * it by default — this keeps state.js and the DOM guaranteed to agree.
 */
function initApp() {
  applyStoredTheme();
  initNavigation();
  updateStreakForToday();
  renderDashboardStats();
  startSessionTimer();
  initQuizModuleSelector();
  initQuizControls();
  initFlashcardFilter();
  initFlashcardControls();
  initExamStartScreen();
  initExamControls();
  initSettingsControls();
  renderStudyModules();
  navigateTo("dashboard");
}

// Kick things off once the DOM is ready.
document.addEventListener("DOMContentLoaded", initApp);