/*
  quiz-engine.js
  --------------
  All logic for the Quiz feature: loading questions per module, shuffling,
  rendering one question at a time, immediate feedback, scoring, and
  retrying incorrectly-answered questions.

  Quiz-specific state (current question list, index, score) lives in this
  module's own closure — it's only relevant while a quiz is in progress,
  so it doesn't belong in the app-wide state.js.
*/

import { getProgress, saveProgress } from "./storage.js";

// ---------- MODULE-PRIVATE STATE ----------
let questionBank = null;       // full questions.json, cached after first fetch
let activeModuleId = null;     // which module's quiz is currently running
let currentQuestions = [];     // shuffled questions for this quiz attempt
let currentIndex = 0;          // which question we're on
let score = 0;
let incorrectQuestions = [];   // full question objects answered wrong, for retry

/**
 * Fetches questions.json once and caches it. Subsequent calls reuse the
 * cached copy instead of re-fetching from disk every time.
 * @returns {Promise<object>}
 */
async function loadQuestionBank() {
  if (questionBank) return questionBank;

  const response = await fetch("js/data/questions.json");
  questionBank = await response.json();
  return questionBank;
}

/**
 * Renders one button per module into #quiz-module-select, based on the
 * modules present in questions.json. Call once when the Quiz view is
 * first needed.
 */
export async function initQuizModuleSelector() {
  const bank = await loadQuestionBank();
  const container = document.getElementById("quiz-module-select");
  container.innerHTML = ""; // clear in case this is called more than once

  Object.entries(bank).forEach(([moduleId, moduleData]) => {
    const button = document.createElement("button");
    button.className = "btn btn--secondary module-grid__item";
    button.textContent = `${moduleData.title} (${moduleData.questions.length} questions)`;
    button.addEventListener("click", () => startQuiz(moduleId));
    container.appendChild(button);
  });
}

/**
 * Randomly reorders an array using the Fisher-Yates algorithm.
 * (Not array.sort(() => Math.random() - 0.5) — that trick produces a
 * statistically biased shuffle, not a true random permutation.)
 * @param {Array} array
 * @returns {Array} a new shuffled array (original is not mutated)
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
 * Begins a quiz for the given module: resets quiz state, shuffles
 * questions, and shows the first one.
 * @param {string} moduleId
 */
function startQuiz(moduleId) {
  activeModuleId = moduleId;
  currentQuestions = shuffle(questionBank[moduleId].questions);
  currentIndex = 0;
  score = 0;
  incorrectQuestions = [];

  document.getElementById("quiz-module-select").classList.add("view--hidden");
  document.getElementById("quiz-results").classList.add("view--hidden");
  document.getElementById("quiz-active").classList.remove("view--hidden");

  renderCurrentQuestion();
}

/**
 * Renders the question at currentIndex: question text, shuffled options,
 * and resets the feedback/next-button areas for a clean question state.
 */
function renderCurrentQuestion() {
  const question = currentQuestions[currentIndex];

  document.getElementById("quiz-progress").textContent =
    `Question ${currentIndex + 1} of ${currentQuestions.length}`;
  document.getElementById("quiz-question-text").textContent = question.question;

  const optionsContainer = document.getElementById("quiz-options");
  optionsContainer.innerHTML = "";

  question.options.forEach((optionText, index) => {
    const optionButton = document.createElement("button");
    optionButton.className = "quiz-option";
    optionButton.textContent = optionText;
    optionButton.setAttribute("role", "radio");
    optionButton.setAttribute("aria-checked", "false");
    optionButton.addEventListener("click", () => handleAnswerSelect(index, optionButton));
    optionsContainer.appendChild(optionButton);
  });

  // Reset feedback and Next button for the new question
  document.getElementById("quiz-feedback").classList.add("view--hidden");
  document.getElementById("quiz-next-btn").classList.add("view--hidden");
}

/**
 * Handles a user selecting an answer option: locks in the choice, marks
 * correct/incorrect visually, shows the explanation, and updates score.
 * @param {number} selectedIndex
 * @param {HTMLElement} selectedButton
 */
function handleAnswerSelect(selectedIndex, selectedButton) {
  const question = currentQuestions[currentIndex];
  const isCorrect = selectedIndex === question.correctIndex;

  // Disable all options immediately so the user can't change or double-submit their answer
  const allOptionButtons = document.querySelectorAll(".quiz-option");
  allOptionButtons.forEach((button, index) => {
    button.disabled = true;
    if (index === question.correctIndex) {
      button.classList.add("quiz-option--correct");
    }
  });

  if (isCorrect) {
    score++;
    selectedButton.setAttribute("aria-checked", "true");
  } else {
    selectedButton.classList.add("quiz-option--incorrect");
    incorrectQuestions.push(question);
  }

  showFeedback(isCorrect, question.explanation);
}

/**
 * Displays the feedback panel (correct/incorrect + explanation) and
 * reveals the Next button so the user can proceed at their own pace.
 * @param {boolean} isCorrect
 * @param {string} explanation
 */
function showFeedback(isCorrect, explanation) {
  const feedbackEl = document.getElementById("quiz-feedback");
  const statusEl = document.getElementById("quiz-feedback-status");
  const explanationEl = document.getElementById("quiz-feedback-explanation");

  statusEl.textContent = isCorrect ? "✅ Correct" : "❌ Incorrect";
  statusEl.className = `quiz-feedback__status ${isCorrect ? "is-correct" : "is-incorrect"}`;
  explanationEl.textContent = explanation;

  feedbackEl.classList.remove("view--hidden");
  document.getElementById("quiz-next-btn").classList.remove("view--hidden");
}

/**
 * Advances to the next question, or shows results if this was the last one.
 */
function goToNextQuestion() {
  currentIndex++;

  if (currentIndex < currentQuestions.length) {
    renderCurrentQuestion();
  } else {
    finishQuiz();
  }
}

/**
 * Called when all questions have been answered: records the result in
 * localStorage via storage.js, and shows the results screen.
 */
function finishQuiz() {
  document.getElementById("quiz-active").classList.add("view--hidden");
  document.getElementById("quiz-results").classList.remove("view--hidden");
  document.getElementById("quiz-score-text").textContent =
    `You scored ${score} out of ${currentQuestions.length}.`;

  // Only offer retry if there's actually something to retry
  const retryButton = document.getElementById("quiz-retry-incorrect-btn");
  retryButton.classList.toggle("view--hidden", incorrectQuestions.length === 0);

  recordQuizCompletion();
}

/**
 * Updates persisted progress: increments quizzesCompleted.
 * Deeper per-module/per-topic tracking (weak topics, time spent) is
 * built out fully in the Progress Tracking step — this is the minimal
 * hook needed now so quiz completions aren't lost.
 */
function recordQuizCompletion() {
  const progress = getProgress();
  progress.quizzesCompleted++;
  saveProgress(progress);
}

/**
 * Restarts the quiz using only the questions that were answered
 * incorrectly in the previous attempt.
 */
function retryIncorrectQuestions() {
  currentQuestions = shuffle(incorrectQuestions);
  currentIndex = 0;
  score = 0;
  incorrectQuestions = [];

  document.getElementById("quiz-results").classList.add("view--hidden");
  document.getElementById("quiz-active").classList.remove("view--hidden");

  renderCurrentQuestion();
}

/**
 * Returns to the module selection screen.
 */
function backToModuleSelect() {
  document.getElementById("quiz-results").classList.add("view--hidden");
  document.getElementById("quiz-active").classList.add("view--hidden");
  document.getElementById("quiz-module-select").classList.remove("view--hidden");
}

/**
 * Wires up the static buttons that exist once in the HTML (Next,
 * Retry Incorrect, Back to Modules). Call once on app init.
 */
export function initQuizControls() {
  document.getElementById("quiz-next-btn").addEventListener("click", goToNextQuestion);
  document.getElementById("quiz-retry-incorrect-btn").addEventListener("click", retryIncorrectQuestions);
  document.getElementById("quiz-back-to-modules-btn").addEventListener("click", backToModuleSelect);
}