/*
  flashcards.js
  -------------
  Logic for the Flashcards feature: loading the card bank, filtering by
  topic, shuffling, flipping, and marking cards mastered/bookmarked.

  As with quiz-engine.js, deck-browsing state (current deck, current index,
  flipped state) lives in this module's own closure — it's only relevant
  while someone is actively browsing flashcards.
*/

import { toggleCardMastered, toggleCardBookmarked, getCardState } from "./storage.js";

const ALL_TOPICS_VALUE = "all";

// ---------- MODULE-PRIVATE STATE ----------
let cardBank = null;      // full flashcards.json, cached after first fetch
let currentDeck = [];     // the cards currently being browsed (after topic filter + shuffle)
let currentIndex = 0;
let isFlipped = false;

/**
 * Fetches flashcards.json once and caches it.
 * @returns {Promise<object>}
 */
async function loadCardBank() {
  if (cardBank) return cardBank;

  const response = await fetch("js/data/flashcards.json");
  cardBank = await response.json();
  return cardBank;
}

/**
 * Fisher-Yates shuffle — same correct algorithm used in quiz-engine.js.
 * Duplicating this small function per-file (rather than importing it from
 * one place) is a reasonable tradeoff at this size; if a third feature
 * needed shuffling, that would be the signal to extract a shared utils.js.
 * @param {Array} array
 * @returns {Array} new shuffled array
 */
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Builds the flat list of all cards across all modules, tagging each with
 * its module title (useful if we show topic labels later).
 * @param {object} bank
 * @returns {Array}
 */
function getAllCards(bank) {
  return Object.values(bank).flatMap((moduleData) => moduleData.cards);
}

/**
 * Populates the topic filter dropdown with "All Topics" plus one option
 * per module, and wires up its change handler. Called once on init.
 */
export async function initFlashcardFilter() {
  const bank = await loadCardBank();
  const select = document.getElementById("flashcard-topic-filter");

  const allOption = document.createElement("option");
  allOption.value = ALL_TOPICS_VALUE;
  allOption.textContent = "All Topics";
  select.appendChild(allOption);

  Object.entries(bank).forEach(([moduleId, moduleData]) => {
    const option = document.createElement("option");
    option.value = moduleId;
    option.textContent = moduleData.title;
    select.appendChild(option);
  });

  select.addEventListener("change", () => loadDeck(select.value));

  // Load the default ("All Topics") deck immediately so the view isn't empty
  loadDeck(ALL_TOPICS_VALUE);
}

/**
 * Jumps the flashcard deck directly to a specific topic — used by the
 * Study view so clicking "Flashcards" on a module card shows that
 * module's cards immediately, keeping the dropdown filter in sync too.
 * @param {string} moduleId
 */
export async function selectFlashcardTopic(moduleId) {
  await loadCardBank();
  document.getElementById("flashcard-topic-filter").value = moduleId;
  loadDeck(moduleId);
}

/**
 * Loads a fresh, shuffled deck based on the selected topic filter.
 * @param {string} filterValue - a module ID, or ALL_TOPICS_VALUE
 */
function loadDeck(filterValue) {
  const sourceCards =
    filterValue === ALL_TOPICS_VALUE ? getAllCards(cardBank) : cardBank[filterValue].cards;

  currentDeck = shuffle(sourceCards);
  currentIndex = 0;
  isFlipped = false;

  renderCurrentCard();
}

/**
 * Renders the card at currentIndex: front/back text, mastered/bookmark
 * button states, and resets flip state so each new card starts front-up.
 */
function renderCurrentCard() {
  const card = currentDeck[currentIndex];

  document.getElementById("flashcard-front-text").textContent = card.front;
  document.getElementById("flashcard-back-text").textContent = card.back;
  document.getElementById("flashcard-progress").textContent =
    `Card ${currentIndex + 1} of ${currentDeck.length}`;

  // Always show the front when arriving at a new card
  isFlipped = false;
  document.getElementById("flashcard-inner").classList.remove("is-flipped");

  renderCardActionStates(card.id);
}

/**
 * Updates the Mastered/Bookmark button labels and active styling to
 * reflect the saved state for the given card ID.
 * @param {string} cardId
 */
function renderCardActionStates(cardId) {
  const { isMastered, isBookmarked } = getCardState(cardId);

  const masteredBtn = document.getElementById("flashcard-mastered-btn");
  masteredBtn.textContent = isMastered ? "★ Mastered" : "☆ Mark as Mastered";
  masteredBtn.classList.toggle("is-active", isMastered);

  const bookmarkBtn = document.getElementById("flashcard-bookmark-btn");
  bookmarkBtn.textContent = isBookmarked ? "🔖 Bookmarked" : "🔖 Bookmark";
  bookmarkBtn.classList.toggle("is-active", isBookmarked);
}

/**
 * Flips the current card by toggling a CSS class; the actual 3D flip
 * animation is defined in animations.css.
 */
function flipCard() {
  isFlipped = !isFlipped;
  document.getElementById("flashcard-inner").classList.toggle("is-flipped", isFlipped);
}

/**
 * Moves to the next card, wrapping around to the start at the end of the deck.
 */
function goToNextCard() {
  currentIndex = (currentIndex + 1) % currentDeck.length;
  renderCurrentCard();
}

/**
 * Moves to the previous card, wrapping around to the end if at the start.
 */
function goToPreviousCard() {
  currentIndex = (currentIndex - 1 + currentDeck.length) % currentDeck.length;
  renderCurrentCard();
}

/**
 * Re-shuffles the current deck (respecting whatever topic filter is active)
 * and starts back at the first card.
 */
function reshuffleDeck() {
  currentDeck = shuffle(currentDeck);
  currentIndex = 0;
  renderCurrentCard();
}

/**
 * Toggles mastered state for the current card and refreshes button display.
 */
function handleMasteredToggle() {
  const card = currentDeck[currentIndex];
  toggleCardMastered(card.id);
  renderCardActionStates(card.id);
}

/**
 * Toggles bookmarked state for the current card and refreshes button display.
 */
function handleBookmarkToggle() {
  const card = currentDeck[currentIndex];
  toggleCardBookmarked(card.id);
  renderCardActionStates(card.id);
}

/**
 * Wires up all the static flashcard controls. Call once on app init.
 */
export function initFlashcardControls() {
  document.getElementById("flashcard").addEventListener("click", flipCard);
  document.getElementById("flashcard-next-btn").addEventListener("click", goToNextCard);
  document.getElementById("flashcard-prev-btn").addEventListener("click", goToPreviousCard);
  document.getElementById("flashcard-shuffle-btn").addEventListener("click", reshuffleDeck);
  document.getElementById("flashcard-mastered-btn").addEventListener("click", handleMasteredToggle);
  document.getElementById("flashcard-bookmark-btn").addEventListener("click", handleBookmarkToggle);
}