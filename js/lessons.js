/*
  lessons.js
  ----------
  Drives the guided Lesson flow for a Study module: Read Lesson -> Key
  Takeaways -> Exam Tips -> Common Mistakes -> Diagram -> Knowledge Check
  -> Practice (Flashcards / Mini Quiz) -> Module Complete.

  Flashcards and the Mini Quiz are NOT reimplemented here — this hands off
  to the existing flashcards.js/quiz-engine.js views (selectFlashcardTopic,
  startQuizForModule), the same way study.js already does. Step-sequencing
  decisions (what's next, when is the module "done") are kept in plain
  functions that only read/write this module's step state; the render*
  functions below only ever paint whatever step state has already been
  decided, and never contain scoring or navigation logic themselves.
*/

import { navigateTo } from "./router.js";
import { selectFlashcardTopic } from "./flashcards.js";
import { startQuizForModule } from "./quiz-engine.js";
import { markLessonCompleted, recordKnowledgeCheckAttempt } from "./storage.js";
import { renderStudyModules } from "./study.js";

// ---------- MODULE-PRIVATE STATE ----------
let lessonBank = null;              // full lessons.json, cached after first fetch
let activeModuleId = null;          // which module's lesson flow is currently open
let activeModuleTitle = null;
let currentStepIndex = 0;
let knowledgeCheckAnswers = [];      // parallel to this module's knowledgeCheck array: selected option index, or null

// The flow is the same fixed sequence for every module — only the content
// per step differs. Keeping this as one ordered list is what lets the step
// indicator ("Step 3 of 8") and the progress bar work generically, without
// hardcoding step counts anywhere else.
const STEP_TYPES = [
  "lesson",
  "keyTakeaways",
  "examTips",
  "commonMistakes",
  "diagram",
  "knowledgeCheck",
  "practice",
  "complete",
];

const STEP_LABELS = {
  lesson: "Read Lesson",
  keyTakeaways: "Key Takeaways",
  examTips: "Exam Tips",
  commonMistakes: "Common Mistakes",
  diagram: "Diagram",
  knowledgeCheck: "Knowledge Check",
  practice: "Flashcards & Mini Quiz",
  complete: "Module Complete",
};

/**
 * Fetches lessons.json once and caches it.
 * @returns {Promise<object>}
 */
async function loadLessonBank() {
  if (lessonBank) return lessonBank;

  const response = await fetch("js/data/lessons.json");
  lessonBank = await response.json();
  return lessonBank;
}

/**
 * Starts the guided lesson flow for a specific module — called from the
 * Study view's "Start Lesson" button. Resets flow state back to the
 * first step every time, even if this module's lesson was already
 * completed before, so re-reading a module always starts from the top.
 * @param {string} moduleId
 */
export async function startLessonForModule(moduleId) {
  const bank = await loadLessonBank();
  const moduleData = bank[moduleId];

  activeModuleId = moduleId;
  activeModuleTitle = moduleData.title;
  currentStepIndex = 0;
  knowledgeCheckAnswers = new Array(moduleData.knowledgeCheck.length).fill(null);

  renderCurrentStep();
}

/**
 * Tallies how many Knowledge Check questions were answered correctly and
 * records the result. Called once, when the user leaves the Knowledge
 * Check step — this is a pure calculation over already-collected answers,
 * kept separate from the rendering functions that collected them.
 */
function recordKnowledgeCheckResult() {
  const questions = lessonBank[activeModuleId].knowledgeCheck;
  const correctCount = questions.reduce(
    (count, question, index) => (knowledgeCheckAnswers[index] === question.correctIndex ? count + 1 : count),
    0
  );
  recordKnowledgeCheckAttempt(activeModuleId, activeModuleTitle, correctCount, questions.length);
}

/**
 * Advances to the next step, running any step-specific bookkeeping that
 * needs to happen exactly once when leaving a given step (recording the
 * Knowledge Check result, marking the lesson complete).
 */
function goToNextStep() {
  const stepType = STEP_TYPES[currentStepIndex];

  if (stepType === "knowledgeCheck") {
    recordKnowledgeCheckResult();
  }
  if (stepType === "practice") {
    markLessonCompleted(activeModuleId, activeModuleTitle);
  }

  if (currentStepIndex < STEP_TYPES.length - 1) {
    currentStepIndex++;
    renderCurrentStep();
  }
}

/**
 * Moves back to the previous step. No bookkeeping needed here — only
 * forward progress (finishing the Knowledge Check, reaching Practice)
 * triggers a state change.
 */
function goToPreviousStep() {
  if (currentStepIndex > 0) {
    currentStepIndex--;
    renderCurrentStep();
  }
}

/**
 * Renders whichever step is current: updates the step indicator and
 * progress bar, dispatches to the right content renderer, and updates
 * the shared Back/Continue buttons. This is the only function that
 * touches the step-indicator/progress-bar chrome — individual step
 * renderers only ever populate the content container.
 */
function renderCurrentStep() {
  const stepType = STEP_TYPES[currentStepIndex];
  const moduleData = lessonBank[activeModuleId];

  document.getElementById("lesson-module-title").textContent = activeModuleTitle;
  document.getElementById("lesson-step-indicator").textContent =
    `Step ${currentStepIndex + 1} of ${STEP_TYPES.length} · ${STEP_LABELS[stepType]}`;

  const percent = Math.round(((currentStepIndex + 1) / STEP_TYPES.length) * 100);
  const fillEl = document.getElementById("lesson-progress-fill");
  fillEl.style.width = `${percent}%`;
  fillEl.closest(".progress-bar").setAttribute("aria-valuenow", percent);

  const contentEl = document.getElementById("lesson-step-content");
  contentEl.innerHTML = "";

  switch (stepType) {
    case "lesson":
      renderLessonSections(contentEl, moduleData.lesson);
      break;
    case "keyTakeaways":
      renderBulletList(contentEl, "Key Takeaways", moduleData.keyTakeaways);
      break;
    case "examTips":
      renderBulletList(contentEl, "Exam Tips", moduleData.examTips);
      break;
    case "commonMistakes":
      renderCommonMistakes(contentEl, moduleData.commonMistakes);
      break;
    case "diagram":
      renderDiagram(contentEl, moduleData.diagram);
      break;
    case "knowledgeCheck":
      renderKnowledgeCheck(contentEl, moduleData.knowledgeCheck);
      break;
    case "practice":
      renderPracticeStep(contentEl);
      break;
    case "complete":
      renderCompleteStep(contentEl);
      break;
  }

  document.getElementById("lesson-back-btn").disabled = currentStepIndex === 0;

  const continueBtn = document.getElementById("lesson-continue-btn");
  const isLastStep = stepType === "complete";
  continueBtn.classList.toggle("view--hidden", isLastStep);
  if (!isLastStep) {
    continueBtn.textContent = stepType === "practice" ? "Finish Module" : "Continue";
  }
}

/**
 * Renders every lesson section (heading + body) in reading order, as one
 * scrollable step — sections aren't split across multiple steps, since
 * the guided flow already has a dedicated step per concern (lesson,
 * takeaways, tips, mistakes, diagram, check).
 * @param {HTMLElement} container
 * @param {{ sections: Array<{ heading: string, body: string }> }} lesson
 */
function renderLessonSections(container, lesson) {
  lesson.sections.forEach((section) => {
    const heading = document.createElement("h2");
    heading.className = "lesson-section__heading";
    heading.textContent = section.heading;

    const body = document.createElement("p");
    body.className = "lesson-section__body";
    body.textContent = section.body;

    container.appendChild(heading);
    container.appendChild(body);
  });
}

/**
 * Renders a simple headed bullet list — shared by the Key Takeaways and
 * Exam Tips steps, since both are just "a heading plus a list of strings."
 * @param {HTMLElement} container
 * @param {string} heading
 * @param {string[]} items
 */
function renderBulletList(container, heading, items) {
  const headingEl = document.createElement("h2");
  headingEl.textContent = heading;
  container.appendChild(headingEl);

  const list = document.createElement("ul");
  list.className = "lesson-bullet-list";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });

  container.appendChild(list);
}

/**
 * Renders each mistake/correction pair as its own callout, so the wrong
 * assumption and the correction are visually distinct at a glance.
 * @param {HTMLElement} container
 * @param {Array<{ mistake: string, correction: string }>} mistakes
 */
function renderCommonMistakes(container, mistakes) {
  const headingEl = document.createElement("h2");
  headingEl.textContent = "Common Mistakes";
  container.appendChild(headingEl);

  mistakes.forEach(({ mistake, correction }) => {
    const item = document.createElement("div");
    item.className = "lesson-mistake";

    const wrongEl = document.createElement("p");
    wrongEl.className = "lesson-mistake__wrong";
    wrongEl.textContent = `✗ ${mistake}`;

    const rightEl = document.createElement("p");
    rightEl.className = "lesson-mistake__right";
    rightEl.textContent = `✓ ${correction}`;

    item.appendChild(wrongEl);
    item.appendChild(rightEl);
    container.appendChild(item);
  });
}

/**
 * Renders the module's diagram. The SVG markup is authored, trusted
 * content shipped in lessons.json — never user input — so innerHTML is
 * safe here. This is the one deliberate exception to the
 * textContent-everywhere pattern used for every other dynamic string in
 * this app, since actually rendering an SVG requires inserting real
 * markup rather than escaped text.
 *
 * Accessibility: the SVG itself is marked role="img" with a short
 * aria-label (the diagram's title), so assistive tech announces it as one
 * described image instead of reading its internal <text> nodes one at a
 * time. The full descriptive explanation lives in a normal, visible
 * <figcaption> — read naturally by everyone, with no duplicate
 * announcement, since it sits outside the labelled container.
 * @param {HTMLElement} container
 * @param {{ title: string, svg: string, caption: string }} diagram
 */
function renderDiagram(container, diagram) {
  const headingEl = document.createElement("h2");
  headingEl.textContent = diagram.title;
  container.appendChild(headingEl);

  const figure = document.createElement("figure");
  figure.className = "lesson-diagram";

  const svgContainer = document.createElement("div");
  svgContainer.className = "lesson-diagram__svg";
  svgContainer.setAttribute("role", "img");
  svgContainer.setAttribute("aria-label", diagram.title);
  svgContainer.innerHTML = diagram.svg;
  figure.appendChild(svgContainer);

  const caption = document.createElement("figcaption");
  caption.className = "lesson-diagram__caption";
  caption.textContent = diagram.caption;
  figure.appendChild(caption);

  container.appendChild(figure);
}

/**
 * Renders the Knowledge Check: a handful of quick, ungraded questions.
 * All questions are shown at once (not one-at-a-time like the graded
 * Mini Quiz) since this is a low-stakes recall check, not a gate — the
 * shared Continue button works regardless of whether every question has
 * been answered. Reuses the existing .quiz-option / .quiz-feedback
 * classes rather than inventing new question UI.
 * @param {HTMLElement} container
 * @param {Array<{ question: string, options: string[], correctIndex: number, explanation: string }>} questions
 */
function renderKnowledgeCheck(container, questions) {
  const headingEl = document.createElement("h2");
  headingEl.textContent = "Knowledge Check";
  container.appendChild(headingEl);

  const introEl = document.createElement("p");
  introEl.className = "lesson-knowledge-check__intro";
  introEl.textContent = "A quick, ungraded check — see how much stuck before moving on.";
  container.appendChild(introEl);

  questions.forEach((question, questionIndex) => {
    const card = document.createElement("div");
    card.className = "lesson-knowledge-check__question";

    const questionText = document.createElement("p");
    questionText.className = "lesson-knowledge-check__question-text";
    questionText.textContent = question.question;
    card.appendChild(questionText);

    const optionsContainer = document.createElement("div");
    optionsContainer.className = "quiz-options";

    question.options.forEach((optionText, optionIndex) => {
      const optionButton = document.createElement("button");
      optionButton.className = "quiz-option";
      optionButton.textContent = optionText;
      optionButton.addEventListener("click", () =>
        handleKnowledgeCheckAnswer(questionIndex, optionIndex, question, card)
      );
      optionsContainer.appendChild(optionButton);
    });

    card.appendChild(optionsContainer);
    container.appendChild(card);
  });
}

/**
 * Records the selected answer for one Knowledge Check question and shows
 * inline correct/incorrect feedback, the same visual pattern used by the
 * graded quiz — but this only updates local UI state and the
 * knowledgeCheckAnswers array; the actual scoring happens later, in
 * recordKnowledgeCheckResult, when the user leaves the step.
 * @param {number} questionIndex
 * @param {number} selectedIndex
 * @param {object} question
 * @param {HTMLElement} cardEl
 */
function handleKnowledgeCheckAnswer(questionIndex, selectedIndex, question, cardEl) {
  knowledgeCheckAnswers[questionIndex] = selectedIndex;
  const isCorrect = selectedIndex === question.correctIndex;

  const optionButtons = cardEl.querySelectorAll(".quiz-option");
  optionButtons.forEach((button, index) => {
    button.disabled = true;
    if (index === question.correctIndex) {
      button.classList.add("quiz-option--correct");
    }
  });
  if (!isCorrect) {
    optionButtons[selectedIndex].classList.add("quiz-option--incorrect");
  }

  const feedback = document.createElement("p");
  feedback.className = "quiz-feedback__explanation lesson-knowledge-check__explanation";
  feedback.textContent = question.explanation;
  cardEl.appendChild(feedback);
}

/**
 * Renders the Practice step: shortcuts into the existing Flashcards and
 * Mini Quiz views for this module. These are suggestions, not a hard
 * gate — Continue always works from here too, same as the existing
 * Take Quiz / Flashcards shortcuts on the Study module cards are already
 * optional rather than mandatory.
 * @param {HTMLElement} container
 */
function renderPracticeStep(container) {
  const headingEl = document.createElement("h2");
  headingEl.textContent = "Practice What You Learned";
  container.appendChild(headingEl);

  const introEl = document.createElement("p");
  introEl.textContent = "Reinforce this module with flashcards and a short quiz before wrapping up.";
  container.appendChild(introEl);

  const actionsEl = document.createElement("div");
  actionsEl.className = "action-grid lesson-practice-actions";

  const flashcardsBtn = document.createElement("button");
  flashcardsBtn.className = "btn btn--secondary";
  flashcardsBtn.textContent = "Review Flashcards";
  flashcardsBtn.addEventListener("click", () => {
    navigateTo("flashcards");
    selectFlashcardTopic(activeModuleId);
  });

  const quizBtn = document.createElement("button");
  quizBtn.className = "btn btn--secondary";
  quizBtn.textContent = "Take the Mini Quiz";
  quizBtn.addEventListener("click", () => {
    navigateTo("quiz");
    startQuizForModule(activeModuleId);
  });

  actionsEl.appendChild(flashcardsBtn);
  actionsEl.appendChild(quizBtn);
  container.appendChild(actionsEl);

  const hintEl = document.createElement("p");
  hintEl.className = "settings-hint";
  hintEl.textContent = "When you're done, come back to Study and reopen this module — or just hit Continue below.";
  container.appendChild(hintEl);
}

/**
 * Renders the final Module Complete screen. Lesson completion is already
 * recorded by the time this renders (goToNextStep marks it complete when
 * leaving the Practice step), so this is purely a congratulatory screen.
 * @param {HTMLElement} container
 */
function renderCompleteStep(container) {
  const headingEl = document.createElement("h2");
  headingEl.textContent = "🎉 Module Complete";
  container.appendChild(headingEl);

  const messageEl = document.createElement("p");
  messageEl.textContent = `Nice work — you've completed the ${activeModuleTitle} module.`;
  container.appendChild(messageEl);

  const actionsEl = document.createElement("div");
  actionsEl.className = "action-grid";

  const backBtn = document.createElement("button");
  backBtn.className = "btn btn--primary";
  backBtn.textContent = "Back to Study Modules";
  backBtn.addEventListener("click", () => {
    navigateTo("study");
    renderStudyModules();
  });

  actionsEl.appendChild(backBtn);
  container.appendChild(actionsEl);
}

/**
 * Wires up the shared Back/Continue navigation buttons. Call once on
 * app init.
 */
export function initLessonControls() {
  document.getElementById("lesson-back-btn").addEventListener("click", goToPreviousStep);
  document.getElementById("lesson-continue-btn").addEventListener("click", goToNextStep);
}
