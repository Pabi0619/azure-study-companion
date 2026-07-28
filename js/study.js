/*
  study.js
  --------
  Renders the Study view's module browser: one card per AZ-900 domain,
  showing estimated time, difficulty, and live completion status derived
  from actual quiz/exam history — plus shortcuts that jump straight into
  that module's quiz or flashcard deck.
*/

import { getProgress } from "./storage.js";
import { navigateTo } from "./router.js";
import { startQuizForModule } from "./quiz-engine.js";
import { selectFlashcardTopic } from "./flashcards.js";

let moduleList = null; // cached copy of modules.json

/**
 * Fetches modules.json once and caches it. This is the proper source of
 * truth for module metadata — replacing the workaround progress.js used
 * previously (independently counting modules via questions.json).
 * @returns {Promise<object>}
 */
async function loadModuleList() {
  if (moduleList) return moduleList;

  const response = await fetch("js/data/modules.json");
  moduleList = await response.json();
  return moduleList;
}

/**
 * Determines a module's completion status from its attempt history.
 * "Completed" is defined as having scored 80% or higher on at least one
 * attempt — a reasonable, simple threshold rather than requiring a
 * perfect score, since retrying until 100% isn't how most people study.
 * @param {string} moduleId
 * @param {object} progress
 * @returns {{ label: string, statusClass: string }}
 */
function getCompletionStatus(moduleId, progress) {
  const moduleData = progress.moduleProgress[moduleId];

  if (!moduleData || moduleData.attempts.length === 0) {
    return { label: "Not Started", statusClass: "not-started" };
  }

  const bestPercent = Math.max(
    ...moduleData.attempts.map((attempt) => (attempt.score / attempt.total) * 100)
  );
  const roundedBest = Math.round(bestPercent);

  return roundedBest >= 80
    ? { label: `Completed (best ${roundedBest}%)`, statusClass: "completed" }
    : { label: `In Progress (best ${roundedBest}%)`, statusClass: "in-progress" };
}

/**
 * Renders all module cards into #study-module-list. Called on app init
 * AND every time the user navigates to the Study view, so completion
 * status always reflects the latest quiz/exam results — the same
 * live-refresh pattern used for the Dashboard.
 */
export async function renderStudyModules() {
  const modules = await loadModuleList();
  const progress = getProgress();
  const container = document.getElementById("study-module-list");
  container.innerHTML = "";

  Object.entries(modules).forEach(([moduleId, moduleData]) => {
    const status = getCompletionStatus(moduleId, progress);
    const card = buildModuleCard(moduleId, moduleData, status);
    container.appendChild(card);
  });
}

/**
 * Builds a single module card element, including its Take Quiz and
 * Flashcards shortcut buttons.
 * @param {string} moduleId
 * @param {object} moduleData
 * @param {{ label: string, statusClass: string }} status
 * @returns {HTMLElement}
 */
function buildModuleCard(moduleId, moduleData, status) {
  const card = document.createElement("div");
  card.className = "card study-module-card";

  card.innerHTML = `
    <div class="study-module-card__header">
      <h3>${moduleData.title}</h3>
      <span class="study-status study-status--${status.statusClass}">${status.label}</span>
    </div>
    <p class="study-module-card__description">${moduleData.description}</p>
    <div class="study-module-card__meta">
      <span>⏱️ ${moduleData.estimatedMinutes} min</span>
      <span>📊 ${moduleData.difficulty}</span>
    </div>
    <div class="action-grid">
      <button class="btn btn--primary" data-action="quiz">Take Quiz</button>
      <button class="btn btn--secondary" data-action="flashcards">Flashcards</button>
    </div>
  `;

  card.querySelector('[data-action="quiz"]').addEventListener("click", () => {
    navigateTo("quiz");
    startQuizForModule(moduleId);
  });

  card.querySelector('[data-action="flashcards"]').addEventListener("click", () => {
    navigateTo("flashcards");
    selectFlashcardTopic(moduleId);
  });

  return card;
}