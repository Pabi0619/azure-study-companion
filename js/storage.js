/*
  storage.js
  ----------
  The ONLY module allowed to talk to localStorage directly. Every other
  file (quiz-engine.js, flashcards.js, progress.js, notes.js, main.js)
  should go through the functions exported here.

  Why this matters: if we ever swap localStorage for IndexedDB or a real
  backend, this is the only file that changes. Nothing else in the app
  needs to know or care how progress is actually stored.
*/

const STORAGE_KEY = "azureStudyCompanion.progress";
const SETTINGS_STORAGE_KEY = "azureStudyCompanion.settings";
const NOTES_STORAGE_KEY = "azureStudyCompanion.notes";

/**
 * Defines the shape of progress data. This is the single source of truth
 * for "what does progress mean in this app" — quiz-engine.js, progress.js,
 * etc. will all read/write fields defined here as those features are built.
 * @returns {object} a fresh default progress object
 */
function getDefaultProgress() {
  return {
    streak: {
      count: 0,
      lastStudyDate: null, // ISO date string, e.g. "2026-07-27"
    },
    quizzesCompleted: 0,
    examsCompleted: 0,
    moduleProgress: {}, // populated per-module in later steps, e.g. { "cloud-concepts": { completed: true } }
    weakTopics: [],
    timeSpentMinutes: 0,
    flashcards: {
      masteredIds: [],   // array of card IDs the user has marked as mastered
      bookmarkedIds: [], // array of card IDs the user has bookmarked
    },
    dailyActivity: {
      date: null,   // ISO date string this count applies to, e.g. "2026-07-28"
      minutes: 0,   // minutes studied on that date, reset whenever the date rolls over
    },
  };
}

/**
 * Reads progress from localStorage. If nothing is stored yet, or the stored
 * data is corrupted/unreadable, returns a fresh default object instead of
 * crashing — the app should always be able to get a usable progress object.
 * @returns {object}
 */
export function getProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return getDefaultProgress();
  }

  try {
    const stored = JSON.parse(raw);
    return mergeWithDefaults(stored);
  } catch (error) {
    console.error("Stored progress was corrupted, resetting to defaults.", error);
    return getDefaultProgress();
  }
}

/**
 * Merges previously-saved progress on top of a fresh default object.
 *
 * Why this exists: if progress was saved before a new field existed (e.g.
 * someone tested the app during Step 7, before "flashcards" was added to
 * the schema), the stored JSON simply won't have that field. Reading
 * `stored.flashcards.masteredIds` directly would throw. Merging onto
 * defaults guarantees every field the app expects is always present,
 * even for progress saved by an earlier version of the app.
 * @param {object} stored
 * @returns {object}
 */
function mergeWithDefaults(stored) {
  const defaults = getDefaultProgress();

  return {
    ...defaults,
    ...stored,
    streak: { ...defaults.streak, ...stored.streak },
    flashcards: { ...defaults.flashcards, ...stored.flashcards },
    dailyActivity: { ...defaults.dailyActivity, ...stored.dailyActivity },
  };
}

/**
 * Persists a progress object to localStorage, overwriting whatever was there.
 * @param {object} progress
 */
export function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

/**
 * Wipes all saved progress and returns a fresh default object.
 * Will be hooked up to a "Reset Progress" button in the Settings view.
 * @returns {object}
 */
export function resetProgress() {
  localStorage.removeItem(STORAGE_KEY);
  return getDefaultProgress();
}

/**
 * Updates the study streak based on today's date vs. the last recorded
 * study date. Call this once per app load.
 *
 * Logic:
 * - Same day as last visit -> streak unchanged (don't double-count a day)
 * - Exactly one day after last visit -> streak increments
 * - Any bigger gap (or first-ever visit) -> streak resets to 1
 * @returns {object} the updated progress object (already saved)
 */
export function updateStreakForToday() {
  const progress = getProgress();
  const today = new Date().toISOString().split("T")[0]; // "2026-07-27"
  const lastDate = progress.streak.lastStudyDate;

  if (lastDate === today) {
    // Already counted today — no change needed.
    return progress;
  }

  const isConsecutiveDay = wasYesterday(lastDate, today);
  progress.streak.count = isConsecutiveDay ? progress.streak.count + 1 : 1;
  progress.streak.lastStudyDate = today;

  saveProgress(progress);
  return progress;
}

/**
 * Adds one attempt record to a module's history. Shared by both
 * recordQuizAttempt and recordExamAttempt — the only difference between
 * those two is what they increment (quizzesCompleted vs examsCompleted)
 * and whether one module or several are touched in a single call.
 * @param {object} progress
 * @param {string} moduleId
 * @param {string} moduleTitle
 * @param {number} score
 * @param {number} total
 */
function addModuleAttempt(progress, moduleId, moduleTitle, score, total) {
  if (!progress.moduleProgress[moduleId]) {
    progress.moduleProgress[moduleId] = { title: moduleTitle, attempts: [] };
  }

  progress.moduleProgress[moduleId].title = moduleTitle;
  progress.moduleProgress[moduleId].attempts.push({
    score,
    total,
    date: new Date().toISOString(),
  });
}

/**
 * Records the result of a completed quiz attempt against a specific module.
 * Keeps the FULL history of attempts (not just a running average), so
 * progress.js can calculate weak/strong topics, trends, etc. from real data
 * rather than a single number that's already lost information.
 * @param {string} moduleId
 * @param {string} moduleTitle - stored alongside so progress.js doesn't need
 *   a separate lookup just to display a human-readable name
 * @param {number} score - number of correct answers
 * @param {number} total - total number of questions in that attempt
 */
export function recordQuizAttempt(moduleId, moduleTitle, score, total) {
  const progress = getProgress();
  addModuleAttempt(progress, moduleId, moduleTitle, score, total);
  progress.quizzesCompleted++;
  saveProgress(progress);
}

/**
 * Records the result of a completed practice exam, which typically spans
 * several modules at once. Each module's portion of the exam is recorded
 * as its own attempt (so weak/strong topic calculations stay accurate),
 * but the whole exam only counts once toward examsCompleted — not once
 * per module it happened to touch.
 * @param {Array<{moduleId: string, moduleTitle: string, score: number, total: number}>} moduleBreakdown
 */
export function recordExamAttempt(moduleBreakdown) {
  const progress = getProgress();

  moduleBreakdown.forEach(({ moduleId, moduleTitle, score, total }) => {
    addModuleAttempt(progress, moduleId, moduleTitle, score, total);
  });

  progress.examsCompleted++;
  saveProgress(progress);
}

/**
 * Adds to the running total of minutes spent studying, and to today's
 * activity count used for the daily goal banner. Called periodically
 * while the app is open (see progress.js's session timer).
 * @param {number} minutes
 */
export function incrementTimeSpent(minutes) {
  const progress = getProgress();
  progress.timeSpentMinutes += minutes;

  const today = new Date().toISOString().split("T")[0];
  if (progress.dailyActivity.date !== today) {
    progress.dailyActivity.date = today;
    progress.dailyActivity.minutes = 0;
  }
  progress.dailyActivity.minutes += minutes;

  saveProgress(progress);
}

/**
 * Returns how many minutes have been studied today, or 0 if no activity
 * has been recorded yet today (including if the last recorded activity
 * was on an earlier date).
 * @returns {number}
 */
export function getTodayMinutesStudied() {
  const progress = getProgress();
  const today = new Date().toISOString().split("T")[0];
  return progress.dailyActivity.date === today ? progress.dailyActivity.minutes : 0;
}

/**
 * Toggles whether a flashcard is marked as "mastered." Adds it to the
 * list if not present, removes it if already there.
 * @param {string} cardId
 * @returns {boolean} the new mastered state (true if now mastered)
 */
export function toggleCardMastered(cardId) {
  const progress = getProgress();
  const { masteredIds } = progress.flashcards;
  const index = masteredIds.indexOf(cardId);

  if (index === -1) {
    masteredIds.push(cardId);
  } else {
    masteredIds.splice(index, 1);
  }

  saveProgress(progress);
  return index === -1; // true if we just added it (now mastered)
}

/**
 * Toggles whether a flashcard is bookmarked, same pattern as toggleCardMastered.
 * @param {string} cardId
 * @returns {boolean} the new bookmarked state (true if now bookmarked)
 */
export function toggleCardBookmarked(cardId) {
  const progress = getProgress();
  const { bookmarkedIds } = progress.flashcards;
  const index = bookmarkedIds.indexOf(cardId);

  if (index === -1) {
    bookmarkedIds.push(cardId);
  } else {
    bookmarkedIds.splice(index, 1);
  }

  saveProgress(progress);
  return index === -1;
}

/**
 * Checks whether a given card ID is currently mastered or bookmarked.
 * Used when rendering a card, to reflect its saved state immediately.
 * @param {string} cardId
 * @returns {{ isMastered: boolean, isBookmarked: boolean }}
 */
export function getCardState(cardId) {
  const progress = getProgress();
  return {
    isMastered: progress.flashcards.masteredIds.includes(cardId),
    isBookmarked: progress.flashcards.bookmarkedIds.includes(cardId),
  };
}

/**
 * Checks whether `previousDateStr` is exactly one calendar day before `todayStr`.
 * @param {string|null} previousDateStr - ISO date string, or null if no prior visit
 * @param {string} todayStr - ISO date string for today
 * @returns {boolean}
 */
function wasYesterday(previousDateStr, todayStr) {
  if (!previousDateStr) return false;

  const previous = new Date(previousDateStr);
  const today = new Date(todayStr);
  const msInOneDay = 1000 * 60 * 60 * 24;

  const dayDifference = Math.round((today - previous) / msInOneDay);
  return dayDifference === 1;
}

/**
 * Defines the shape of app settings (theme, daily study goal). Kept in a
 * separate localStorage key from progress on purpose: "Reset Progress"
 * should clear study history without silently reverting a user's theme
 * or goal preference.
 * @returns {object} a fresh default settings object
 */
function getDefaultSettings() {
  return {
    theme: "dark",
    dailyGoalMinutes: 20,
  };
}

/**
 * Reads settings from localStorage, falling back to defaults if nothing
 * is stored yet or the stored data is corrupted.
 * @returns {object}
 */
export function getSettings() {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);

  if (!raw) {
    return getDefaultSettings();
  }

  try {
    return { ...getDefaultSettings(), ...JSON.parse(raw) };
  } catch (error) {
    console.error("Stored settings were corrupted, resetting to defaults.", error);
    return getDefaultSettings();
  }
}

/**
 * Persists a settings object to localStorage, overwriting whatever was there.
 * @param {object} settings
 */
function saveSettings(settings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

/**
 * Updates and persists the theme preference ("dark" or "light").
 * @param {string} theme
 */
export function saveTheme(theme) {
  const settings = getSettings();
  settings.theme = theme;
  saveSettings(settings);
}

/**
 * Updates and persists the daily study goal, in minutes.
 * @param {number} minutes
 */
export function saveDailyGoal(minutes) {
  const settings = getSettings();
  settings.dailyGoalMinutes = minutes;
  saveSettings(settings);
}

/**
 * Reads the user's freeform notes. Notes are a single plain-text blob
 * (not JSON) since there's only ever one notebook, kept in its own
 * localStorage key so a progress reset doesn't wipe them.
 * @returns {string}
 */
export function getNotes() {
  return localStorage.getItem(NOTES_STORAGE_KEY) || "";
}

/**
 * Persists the user's notes, overwriting whatever was there.
 * @param {string} text
 */
export function saveNotes(text) {
  localStorage.setItem(NOTES_STORAGE_KEY, text);
}