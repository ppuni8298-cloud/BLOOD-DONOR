/**
 * BLOODLINK - STATS ANIMATED COUNTER (stats-counter.js)
 * Smoothly counts up numeric statistics when scrolled into view.
 * Displays clear demonstration identifiers as required.
 */

(function () {
  'use strict';

  function initStatsCounters() {
    const statCards = document.querySelectorAll('.stat-card');
    if (!statCards.length) return;

    let hasAnimated = false;

    function animateValue(element, start, end, duration, prefix = '', suffix = '') {
      let startTimestamp = null;

      const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // Easing: easeOutExpo
        const easeOut = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const current = Math.floor(easeOut * (end - start) + start);

        element.textContent = `${prefix}${current.toLocaleString()}${suffix}`;

        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          element.textContent = `${prefix}${end.toLocaleString()}${suffix}`;
        }
      };

      window.requestAnimationFrame(step);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated) {
            hasAnimated = true;

            statCards.forEach((card) => {
              const numEl = card.querySelector('.stat-number');
              if (numEl) {
                const target = parseInt(numEl.getAttribute('data-target') || '0', 10);
                const prefix = numEl.getAttribute('data-prefix') || '';
                const suffix = numEl.getAttribute('data-suffix') || '';

                animateValue(numEl, 0, target, 2000, prefix, suffix);
              }
            });
          }
        });
      },
      { threshold: 0.3 }
    );

    const statsSection = document.querySelector('#stats-section') || statCards[0];
    if (statsSection) {
      observer.observe(statsSection);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStatsCounters);
  } else {
    initStatsCounters();
  }
})();
