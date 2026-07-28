/*
  exam.js
  -------
  Logic for the Practice Exam feature: pulls a mixed set of questions
  across all modules, lets the user navigate freely and change answers
  (unlike Quiz mode's immediate-feedback-then-lock behavior), runs a
  countdown timer, and — only after submission — shows a score, a
  performance-by-topic breakdown, and a full answer review.
*/

import { recordExamAttempt } from "./storage.js";

const EXAM_LENGTH_OPTIONS = [10, 20, 30]; // number of questions offered per exam
const SECONDS_PER_QUESTION = 60; // 1 minute per question, a reasonable practice pace

// ---------- MODULE-PRIVATE STATE ----------
let questionBank = null;        // cached copy of questions.json (same tradeoff noted in progress.js: a small independent fetch, cached after first use)
let examQuestions = [];         // flat list of { ...question, moduleId, moduleTitle }
let userAnswers = [];           // parallel array to examQuestions: selected option index, or null if unanswered
let currentIndex = 0;
let timerSecondsRemaining = 0;
let timerIntervalId = null;

/**
 * Fetches questions.json once and caches it.
 * @returns {Promise<object>}
 */
async function loadQuestionBank() {
  if (questionBank) return questionBank;

  const response = await fetch("js/data/questions.json");
  questionBank = await response.json();
  return questionBank;
}

/**
 * Fisher-Yates shuffle — same correct algorithm used in quiz-engine.js
 * and flashcards.js.
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
 * Renders one button per exam length option (10/20/30 questions) into
 * #exam-start. Call once when the Practice Exam view is first needed.
 */
export async function initExamStartScreen() {
  await loadQuestionBank();
  const container = document.getElementById("exam-start");
  container.innerHTML = "";

  EXAM_LENGTH_OPTIONS.forEach((length) => {
    const button = document.createElement("button");
    button.className = "btn btn--secondary module-grid__item";
    const minutes = Math.round((length * SECONDS_PER_QUESTION) / 60);
    button.textContent = `${length} Questions (${minutes} min)`;
    button.addEventListener("click", () => startExam(length));
    container.appendChild(button);
  });
}

/**
 * Builds a mixed-topic question pool by pulling questions from every
 * module, tagging each with which module it came from (needed later for
 * the performance-by-topic breakdown), then shuffling and trimming to
 * the requested length.
 * @param {number} length
 * @returns {Array}
 */
function buildMixedQuestionPool(length) {
  const allTaggedQuestions = Object.entries(questionBank).flatMap(([moduleId, moduleData]) =>
    moduleData.questions.map((question) => ({
      ...question,
      moduleId,
      moduleTitle: moduleData.title,
    }))
  );

  const shuffled = shuffle(allTaggedQuestions);
  return shuffled.slice(0, Math.min(length, shuffled.length));
}

/**
 * Begins a new exam: builds the question pool, resets all exam state,
 * starts the countdown timer, and shows the first question.
 * @param {number} length - how many questions this exam should contain
 */
function startExam(length) {
  examQuestions = buildMixedQuestionPool(length);
  userAnswers = new Array(examQuestions.length).fill(null);
  currentIndex = 0;
  timerSecondsRemaining = length * SECONDS_PER_QUESTION;

  document.getElementById("exam-start").classList.add("view--hidden");
  document.getElementById("exam-results").classList.add("view--hidden");
  document.getElementById("exam-review").classList.add("view--hidden");
  document.getElementById("exam-active").classList.remove("view--hidden");

  startTimer();
  renderCurrentQuestion();
}

/**
 * Starts the countdown timer, updating the display every second and
 * auto-submitting the exam if time runs out.
 */
function startTimer() {
  stopTimer(); // safety: ensure no previous timer is still running

  updateTimerDisplay();
  timerIntervalId = setInterval(() => {
    timerSecondsRemaining--;
    updateTimerDisplay();

    if (timerSecondsRemaining <= 0) {
      stopTimer();
      submitExam();
    }
  }, 1000);
}

/**
 * Stops the countdown timer. MUST be called before starting a new one,
 * and when the exam ends — otherwise setInterval keeps running forever
 * in the background, silently corrupting future countdowns.
 */
function stopTimer() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

/**
 * Formats the remaining seconds as mm:ss and writes it to the timer
 * display, adding a warning style in the final minute.
 */
function updateTimerDisplay() {
  const minutes = Math.floor(timerSecondsRemaining / 60);
  const seconds = timerSecondsRemaining % 60;
  const display = `${minutes}:${String(seconds).padStart(2, "0")}`;

  const timerEl = document.getElementById("exam-timer");
  timerEl.textContent = display;
  timerEl.classList.toggle("is-low-time", timerSecondsRemaining <= 60);
}

/**
 * Renders the question at currentIndex, restoring the previously
 * selected answer (if any) so navigating back and forth doesn't lose
 * the user's progress.
 */
function renderCurrentQuestion() {
  const question = examQuestions[currentIndex];

  document.getElementById("exam-progress").textContent =
    `Question ${currentIndex + 1} of ${examQuestions.length}`;
  document.getElementById("exam-question-text").textContent = question.question;

  const optionsContainer = document.getElementById("exam-options");
  optionsContainer.innerHTML = "";

  const selectedIndex = userAnswers[currentIndex];

  question.options.forEach((optionText, index) => {
    const optionButton = document.createElement("button");
    optionButton.className = "quiz-option";
    optionButton.textContent = optionText;
    optionButton.setAttribute("role", "radio");

    const isSelected = index === selectedIndex;
    optionButton.classList.toggle("quiz-option--selected", isSelected);
    optionButton.setAttribute("aria-checked", String(isSelected));

    // No immediate feedback: selecting just records the answer and
    // re-renders — nothing reveals correct/incorrect until submission.
    optionButton.addEventListener("click", () => {
      userAnswers[currentIndex] = index;
      renderCurrentQuestion();
    });

    optionsContainer.appendChild(optionButton);
  });

  // Disable Previous on the first question, and swap Next for Submit visibility on the last
  document.getElementById("exam-prev-btn").disabled = currentIndex === 0;
  document.getElementById("exam-next-btn").disabled = currentIndex === examQuestions.length - 1;
}

function goToNextQuestion() {
  if (currentIndex < examQuestions.length - 1) {
    currentIndex++;
    renderCurrentQuestion();
  }
}

function goToPreviousQuestion() {
  if (currentIndex > 0) {
    currentIndex--;
    renderCurrentQuestion();
  }
}

/**
 * Ends the exam (whether by manual submission or timer expiry): stops
 * the timer, calculates the score and per-topic breakdown, persists the
 * result, and shows the results screen.
 */
function submitExam() {
  stopTimer();

  const { totalCorrect, breakdownByModule } = scoreExam();

  document.getElementById("exam-active").classList.add("view--hidden");
  document.getElementById("exam-results").classList.remove("view--hidden");

  document.getElementById("exam-score-text").textContent =
    `You scored ${totalCorrect} out of ${examQuestions.length}.`;

  const secondsUsed = examQuestions.length * SECONDS_PER_QUESTION - timerSecondsRemaining;
  const minutesUsed = Math.round(secondsUsed / 60);
  document.getElementById("exam-time-taken").textContent = `Time used: ${minutesUsed} minute${minutesUsed === 1 ? "" : "s"}.`;

  renderTopicBreakdown(breakdownByModule);
  recordExamAttempt(Object.values(breakdownByModule));
}

/**
 * Calculates the total correct count and a per-module breakdown of
 * correct/total, based on the user's recorded answers.
 * @returns {{ totalCorrect: number, breakdownByModule: object }}
 */
function scoreExam() {
  let totalCorrect = 0;
  const breakdownByModule = {}; // keyed by moduleId: { moduleId, moduleTitle, score, total }

  examQuestions.forEach((question, index) => {
    const isCorrect = userAnswers[index] === question.correctIndex;
    if (isCorrect) totalCorrect++;

    if (!breakdownByModule[question.moduleId]) {
      breakdownByModule[question.moduleId] = {
        moduleId: question.moduleId,
        moduleTitle: question.moduleTitle,
        score: 0,
        total: 0,
      };
    }

    breakdownByModule[question.moduleId].total++;
    if (isCorrect) breakdownByModule[question.moduleId].score++;
  });

  return { totalCorrect, breakdownByModule };
}

/**
 * Renders a simple bar-per-topic view of exam performance.
 * @param {object} breakdownByModule
 */
function renderTopicBreakdown(breakdownByModule) {
  const container = document.getElementById("exam-topic-breakdown");
  container.innerHTML = "";

  Object.values(breakdownByModule).forEach(({ moduleTitle, score, total }) => {
    const percent = Math.round((score / total) * 100);

    const row = document.createElement("div");
    row.className = "exam-breakdown__row";
    row.innerHTML = `
      <div class="exam-breakdown__label">
        <span>${moduleTitle}</span>
        <span>${score}/${total}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-bar__fill" style="width: ${percent}%;"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

/**
 * Builds the full read-only review screen: every question, the user's
 * answer, the correct answer if they got it wrong, and the explanation.
 */
function renderReviewScreen() {
  const container = document.getElementById("exam-review-list");
  container.innerHTML = "";

  examQuestions.forEach((question, index) => {
    const selectedIndex = userAnswers[index];
    const isCorrect = selectedIndex === question.correctIndex;
    const wasAnswered = selectedIndex !== null;

    const item = document.createElement("div");
    item.className = "card exam-review-item";

    const yourAnswerText = wasAnswered ? question.options[selectedIndex] : "(not answered)";
    const correctAnswerText = question.options[question.correctIndex];

    item.innerHTML = `
      <p class="exam-review-item__topic">${question.moduleTitle} — Question ${index + 1}</p>
      <h3>${question.question}</h3>
      <p class="quiz-feedback__status ${isCorrect ? "is-correct" : "is-incorrect"}">
        ${isCorrect ? "✅ Correct" : "❌ Incorrect"}
      </p>
      <p>Your answer: ${yourAnswerText}</p>
      ${!isCorrect ? `<p>Correct answer: ${correctAnswerText}</p>` : ""}
      <p class="quiz-feedback__explanation">${question.explanation}</p>
    `;
    container.appendChild(item);
  });
}

/**
 * Wires up all the static exam controls. Call once on app init.
 */
export function initExamControls() {
  document.getElementById("exam-next-btn").addEventListener("click", goToNextQuestion);
  document.getElementById("exam-prev-btn").addEventListener("click", goToPreviousQuestion);
  document.getElementById("exam-submit-btn").addEventListener("click", submitExam);

  document.getElementById("exam-review-btn").addEventListener("click", () => {
    document.getElementById("exam-results").classList.add("view--hidden");
    document.getElementById("exam-review").classList.remove("view--hidden");
    renderReviewScreen();
  });

  document.getElementById("exam-review-back-btn").addEventListener("click", () => {
    document.getElementById("exam-review").classList.add("view--hidden");
    document.getElementById("exam-results").classList.remove("view--hidden");
  });

  document.getElementById("exam-restart-btn").addEventListener("click", () => {
    document.getElementById("exam-results").classList.add("view--hidden");
    document.getElementById("exam-start").classList.remove("view--hidden");
  });
}