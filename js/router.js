/*
  router.js
  ---------
  Handles switching between views (Dashboard, Study, Flashcards, etc.) and
  keeping the sidebar's "active" highlight in sync.

  This is generic on purpose: it doesn't hardcode view names, so adding a
  new view later only requires HTML changes (a new <section data-view="...">
  and a new nav button) — no changes needed here.
*/

import { setCurrentView } from "./state.js";

/**
 * Switches the visible view to the one matching viewName, and updates
 * the sidebar to highlight the corresponding nav item.
 * @param {string} viewName - must match a data-view attribute value in the HTML
 */
export function navigateTo(viewName) {
  showView(viewName);
  highlightNavItem(viewName);
  setCurrentView(viewName);
}

/**
 * Hides every [data-view] section except the one matching viewName.
 * @param {string} viewName
 */
function showView(viewName) {
  const allViews = document.querySelectorAll("[data-view]");

  allViews.forEach((section) => {
    if (section.dataset.view === viewName) {
      section.classList.remove("view--hidden");
    } else {
      section.classList.add("view--hidden");
    }
  });
}

/**
 * Adds the "is-active" class to the sidebar nav button matching viewName,
 * and removes it from all others.
 * @param {string} viewName
 */
function highlightNavItem(viewName) {
  const allNavItems = document.querySelectorAll("[data-nav-target]");

  allNavItems.forEach((button) => {
    // Only sidebar buttons live inside <nav> — dashboard shortcut buttons
    // share the same data-nav-target attribute but shouldn't get highlighted.
    const isSidebarButton = button.closest(".sidebar") !== null;

    if (isSidebarButton) {
      button.classList.toggle("is-active", button.dataset.navTarget === viewName);
    }
  });
}
