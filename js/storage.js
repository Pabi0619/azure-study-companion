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
    moduleProgress: {}, // populated per-module in later steps, e.g. { "cloud-concepts": { completed: true } }
    weakTopics: [],
    timeSpentMinutes: 0,
    flashcards: {
      masteredIds: [],   // array of card IDs the user has marked as mastered
      bookmarkedIds: [], // array of card IDs the user has bookmarked
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