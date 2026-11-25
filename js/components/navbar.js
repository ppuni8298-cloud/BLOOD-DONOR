/**
 * BLOODLINK - NAVBAR & NAVIGATION CONTROLLER (navbar.js)
 * Manages sticky frosted glass header, mobile navigation drawer,
 * scrollspy, and active link states.
 */

(function () {
  'use strict';

  function initNavbar() {
    const navbar = document.querySelector('.navbar-wrapper');
    const mobileBtn = document.querySelector('.mobile-toggle-btn');
    const mobileDrawer = document.querySelector('.mobile-drawer');
    const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');

    if (!navbar) return;

    // 1. Scroll listener for frosted glass elevation
    function onScroll() {
      if (window.scrollY > 30) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // 2. Mobile drawer toggle
    if (mobileBtn && mobileDrawer) {
      mobileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = mobileDrawer.classList.toggle('open');
        mobileBtn.setAttribute('aria-expanded', isOpen);

        // Update hamburger icon state if svg present
        const icon = mobileBtn.querySelector('i, svg');
        if (icon && window.lucide) {
          // Re-render lucide icon
          window.lucide.createIcons();
        }
      });

      // Close drawer on clicking outside
      document.addEventListener('click', (e) => {
        if (!mobileDrawer.contains(e.target) && !mobileBtn.contains(e.target)) {
          mobileDrawer.classList.remove('open');
          mobileBtn.setAttribute('aria-expanded', 'false');
        }
      });

      // Close drawer on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          mobileDrawer.classList.remove('open');
          mobileBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // 3. Smooth scrolling for internal anchor links & active state
    navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');

        // Close mobile drawer on link click
        if (mobileDrawer) {
          mobileDrawer.classList.remove('open');
        }

        if (href && href.startsWith('#') && href.length > 1) {
          const target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            const navOffset = 80;
            const targetPos = target.getBoundingClientRect().top + window.pageYOffset - navOffset;
            window.scrollTo({
              top: targetPos,
              behavior: 'smooth'
            });

            // Update active state
            navLinks.forEach((l) => l.classList.remove('active'));
            link.classList.add('active');
          }
        }
      });
    });

    // 4. ScrollSpy for sections
    const sections = document.querySelectorAll('section[id]');
    function updateScrollSpy() {
      const scrollY = window.pageYOffset;

      sections.forEach((current) => {
        const sectionHeight = current.offsetHeight;
        const sectionTop = current.offsetTop - 120;
        const sectionId = current.getAttribute('id');

        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
          navLinks.forEach((link) => {
            if (link.getAttribute('href') === `#${sectionId}`) {
              link.classList.add('active');
            } else if (link.getAttribute('href')?.startsWith('#')) {
              link.classList.remove('active');
            }
          });
        }
      });
    }

    window.addEventListener('scroll', updateScrollSpy, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavbar);
  } else {
    initNavbar();
  }
})();
