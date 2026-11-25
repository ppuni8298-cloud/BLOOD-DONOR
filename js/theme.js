/**
 * BLOODLINK - THEME MANAGER (theme.js)
 * Manages light and dark theme switching with localStorage persistence
 * and system preference detection.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'bloodlink_theme';
  const htmlEl = document.documentElement;

  // Detect initial theme preference
  function getInitialTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
    // Default to light theme as required by specification
    return 'light';
  }

  // Apply theme to document
  function applyTheme(theme) {
    htmlEl.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);

    // Dispatch custom event for 3D canvas and Chart.js to react if needed
    window.dispatchEvent(new CustomEvent('bloodlink:themechange', { detail: { theme } }));
  }

  // Initialize theme immediately to prevent flash of wrong theme
  const initialTheme = getInitialTheme();
  applyTheme(initialTheme);

  // Bind theme toggle buttons once DOM is loaded
  document.addEventListener('DOMContentLoaded', () => {
    const toggleButtons = document.querySelectorAll('.theme-toggle-btn');

    toggleButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const currentTheme = htmlEl.getAttribute('data-theme') || 'light';
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);

        if (window.BloodLinkToast) {
          window.BloodLinkToast.info(
            `Switched to ${nextTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}`
          );
        }
      });
    });
  });

  // Expose helper on window
  window.BloodLinkTheme = {
    getTheme: () => htmlEl.getAttribute('data-theme') || 'light',
    setTheme: applyTheme,
    toggle: () => {
      const current = htmlEl.getAttribute('data-theme') || 'light';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    }
  };
})();
