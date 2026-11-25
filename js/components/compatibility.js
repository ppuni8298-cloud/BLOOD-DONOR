/**
 * BLOODLINK - INTERACTIVE BLOOD COMPATIBILITY ENGINE (compatibility.js)
 * Implements real-world ABO and Rh factor transfusion rules for red blood cells.
 * Supports interactive donor and recipient exploration.
 */

(function () {
  'use strict';

  // Transfusion matrix based on international red blood cell compatibility
  const COMPATIBILITY_RULES = {
    'O-': {
      canDonateTo: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
      canReceiveFrom: ['O-'],
      badge: 'Universal Red Cell Donor',
      note: 'Crucial in trauma emergencies when the patient blood type is unknown.'
    },
    'O+': {
      canDonateTo: ['O+', 'A+', 'B+', 'AB+'],
      canReceiveFrom: ['O-', 'O+'],
      badge: 'High Demand Type',
      note: 'The most commonly requested blood group in acute surgical care.'
    },
    'A-': {
      canDonateTo: ['A-', 'A+', 'AB-', 'AB+'],
      canReceiveFrom: ['O-', 'A-'],
      badge: 'Rare Compatible Group',
      note: 'Essential for A- and AB- patients requiring Rh-negative units.'
    },
    'A+': {
      canDonateTo: ['A+', 'AB+'],
      canReceiveFrom: ['O-', 'O+', 'A-', 'A+'],
      badge: 'Core Hospital Blood Type',
      note: 'Represents approximately 36% of the clinical hospital requirements.'
    },
    'B-': {
      canDonateTo: ['B-', 'B+', 'AB-', 'AB+'],
      canReceiveFrom: ['O-', 'B-'],
      badge: 'Specialized Donor Need',
      note: 'Only 1.5% of donors have B-, making targeted outreach vital.'
    },
    'B+': {
      canDonateTo: ['B+', 'AB+'],
      canReceiveFrom: ['O-', 'O+', 'B-', 'B+'],
      badge: 'Significant Need',
      note: 'Frequent requirement for thalassemia, sickle cell and oncology patients.'
    },
    'AB-': {
      canDonateTo: ['AB-', 'AB+'],
      canReceiveFrom: ['O-', 'A-', 'B-', 'AB-'],
      badge: 'Rarest Blood Group',
      note: 'Occurs in under 1% of population; also valuable for plasma donation.'
    },
    'AB+': {
      canDonateTo: ['AB+'],
      canReceiveFrom: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
      badge: 'Universal Recipient',
      note: 'Can safely receive red blood cells from any ABO/Rh blood group.'
    }
  };

  function initCompatibilityWidget() {
    const selector = document.querySelector('.blood-group-selector');
    const donateContainer = document.querySelector('#compat-donate-tags');
    const receiveContainer = document.querySelector('#compat-receive-tags');
    const badgeEl = document.querySelector('#compat-badge');
    const noteEl = document.querySelector('#compat-note');
    const currentTypeEl = document.querySelector('#compat-current-type');

    if (!selector) return;

    function renderCompatibility(bloodType) {
      const data = COMPATIBILITY_RULES[bloodType];
      if (!data) return;

      if (currentTypeEl) currentTypeEl.textContent = bloodType;
      if (badgeEl) badgeEl.textContent = data.badge;
      if (noteEl) noteEl.textContent = data.note;

      // Render Can Donate To
      if (donateContainer) {
        donateContainer.innerHTML = data.canDonateTo
          .map(
            (type) => `<span class="compat-pill match ${type === bloodType ? 'selected' : ''}">${type}</span>`
          )
          .join('');
      }

      // Render Can Receive From
      if (receiveContainer) {
        receiveContainer.innerHTML = data.canReceiveFrom
          .map(
            (type) => `<span class="compat-pill match ${type === bloodType ? 'selected' : ''}">${type}</span>`
          )
          .join('');
      }
    }

    // Bind click events on blood buttons
    const buttons = selector.querySelectorAll('.blood-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const selectedType = btn.getAttribute('data-type') || btn.textContent.trim();
        renderCompatibility(selectedType);

        if (window.BloodLinkToast) {
          window.BloodLinkToast.info(
            `Viewing compatibility matrix for ${selectedType} (${COMPATIBILITY_RULES[selectedType].badge})`
          );
        }
      });
    });

    // Initial render with O- (Universal Donor)
    renderCompatibility('O-');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompatibilityWidget);
  } else {
    initCompatibilityWidget();
  }
})();
