/*
  progress.js
  -----------
  The "smart rules" layer for progress. storage.js only knows how to save
  and load raw data (attempt history, streak, flashcard state) — this file
  knows what that data MEANS: which topic is weakest, what percentage of
  the course is complete, how to display the streak.
*/

import { getProgress, incrementTimeSpent, getSettings, getTodayMinutesStudied } from "./storage.js";

let totalModuleCount = null; // cached after first calculation

/**
 * Fetches modules.json just to count how many modules exist in total.
 * Cached after the first call. This is now the proper source of truth
 * for module metadata (added in the Study Modules feature) — replacing
 * an earlier workaround that counted modules via questions.json instead.
 * @returns {Promise<number>}
 */
async function getTotalModuleCount() {
  if (totalModuleCount !== null) return totalModuleCount;

  const response = await fetch("js/data/modules.json");
  const modules = await response.json();
  totalModuleCount = Object.keys(modules).length;
  return totalModuleCount;
}

/**
 * Calculates the weakest and strongest topics based on average quiz score
 * per module. A module's average is (total correct / total questions)
 * across ALL attempts on that module, not just the most recent one.
 * @param {object} progress
 * @returns {{ weakestTopic: string|null, strongestTopic: string|null }}
 */
function calculateWeakAndStrongTopics(progress) {
  const attemptedModules = Object.values(progress.moduleProgress).filter(
    (moduleData) => moduleData.attempts.length > 0
  );

  if (attemptedModules.length === 0) {
    return { weakestTopic: null, strongestTopic: null };
  }

  const averages = attemptedModules.map((moduleData) => {
    const totalCorrect = moduleData.attempts.reduce((sum, attempt) => sum + attempt.score, 0);
    const totalQuestions = moduleData.attempts.reduce((sum, attempt) => sum + attempt.total, 0);
    return {
      title: moduleData.title,
      averagePercent: (totalCorrect / totalQuestions) * 100,
    };
  });

  const weakest = averages.reduce((lowest, current) =>
    current.averagePercent < lowest.averagePercent ? current : lowest
  );
  const strongest = averages.reduce((highest, current) =>
    current.averagePercent > highest.averagePercent ? current : highest
  );

  return { weakestTopic: weakest.title, strongestTopic: strongest.title };
}

/**
 * Calculates what percentage of available modules have been attempted
 * at least once.
 * @param {object} progress
 * @returns {Promise<number>} a whole-number percentage, 0-100
 */
async function calculateOverallPercentage(progress) {
  const totalModules = await getTotalModuleCount();
  if (totalModules === 0) return 0;

  const attemptedModuleCount = Object.keys(progress.moduleProgress).length;
  return Math.round((attemptedModuleCount / totalModules) * 100);
}

/**
 * Reads current progress, calculates derived stats, and writes them into
 * the dashboard's DOM elements. Called on app load AND every time the
 * user navigates to the Dashboard view, so the numbers are always current.
 */
export async function renderDashboardStats() {
  const progress = getProgress();
  const { weakestTopic } = calculateWeakAndStrongTopics(progress);
  const percent = await calculateOverallPercentage(progress);

  document.getElementById("stat-streak").textContent =
    `${progress.streak.count} day${progress.streak.count === 1 ? "" : "s"}`;
  document.getElementById("stat-quizzes").textContent = progress.quizzesCompleted;
  document.getElementById("stat-weak-topic").textContent = weakestTopic || "—";

  document.getElementById("progress-percent").textContent = `${percent}%`;

  const fillEl = document.getElementById("progress-bar-fill");
  fillEl.style.width = `${percent}%`;
  // Keep the ARIA value in sync with the visual width — screen readers
  // rely on aria-valuenow, not the CSS width, to announce progress.
  fillEl.closest(".progress-bar").setAttribute("aria-valuenow", percent);

  renderDailyGoalBanner();
}

/**
 * Compares today's studied minutes against the saved daily goal and
 * shows an encouraging, always-visible nudge on the Dashboard — the
 * closest thing to a "reminder" a purely static, backend-less app can
 * offer, since real push notifications would need a server to deliver
 * them even when the app isn't open.
 */
function renderDailyGoalBanner() {
  const { dailyGoalMinutes } = getSettings();
  const minutesToday = getTodayMinutesStudied();
  const bannerEl = document.getElementById("daily-goal-banner");

  if (minutesToday >= dailyGoalMinutes) {
    bannerEl.textContent = `🎉 Nice work — you've hit today's ${dailyGoalMinutes}-minute study goal!`;
    bannerEl.classList.add("is-complete");
  } else if (minutesToday === 0) {
    bannerEl.textContent = `You haven't studied yet today. Aim for ${dailyGoalMinutes} minutes — jump into a quiz or flashcards to get started.`;
    bannerEl.classList.remove("is-complete");
  } else {
    const remaining = dailyGoalMinutes - minutesToday;
    bannerEl.textContent = `You're ${minutesToday}/${dailyGoalMinutes} minutes into today's goal — ${remaining} to go.`;
    bannerEl.classList.remove("is-complete");
  }
}

/**
 * Starts a background timer that adds 1 minute to timeSpentMinutes for
 * every full minute the app stays open. Intentionally simple: no
 * pause-on-inactivity detection yet — that's a reasonable future
 * enhancement, not a Version 1 requirement.
 */
export function startSessionTimer() {
  const oneMinute = 60 * 1000;
  setInterval(() => {
    incrementTimeSpent(1);
  }, oneMinute);
}