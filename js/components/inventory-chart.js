/**
 * BLOODLINK - INVENTORY & ANALYTICS CHARTS (inventory-chart.js)
 * Visualizes regional blood bank reserves and donation trends via Chart.js.
 * Dynamically reacts to theme adjustments (light/dark mode).
 */

(function () {
  'use strict';

  let inventoryChart = null;
  let trendsChart = null;

  function getThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      textColor: isDark ? '#A0A6B2' : '#5F6368',
      gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      tooltipBg: isDark ? '#1C1E24' : '#FFFFFF',
      tooltipText: isDark ? '#F8F9FA' : '#202124'
    };
  }

  function initCharts() {
    if (!window.Chart) return;

    const inventoryCanvas = document.getElementById('inventory-chart-canvas');
    const trendsCanvas = document.getElementById('trends-chart-canvas');

    const theme = getThemeColors();

    // 1. Regional Blood Bank Inventory Distribution Chart
    if (inventoryCanvas) {
      const bloodTypes = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
      // Sample units available in network hubs
      const units = [42, 185, 58, 210, 36, 145, 18, 72];
      // Colors: Critical in red, optimal in soft red/accent
      const barColors = units.map((u) => {
        if (u < 50) return '#C71932'; // Urgent / Low stock
        if (u < 100) return '#F59E0B'; // Moderate
        return '#10B981'; // Optimal
      });

      inventoryChart = new window.Chart(inventoryCanvas, {
        type: 'bar',
        data: {
          labels: bloodTypes,
          datasets: [
            {
              label: 'Reserve Units Available (Demo Data)',
              data: units,
              backgroundColor: barColors,
              borderRadius: 6,
              borderSkipped: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: theme.tooltipBg,
              titleColor: theme.tooltipText,
              bodyColor: theme.tooltipText,
              borderColor: 'rgba(199, 25, 50, 0.2)',
              borderWidth: 1,
              padding: 10,
              callbacks: {
                label: function (context) {
                  const val = context.raw;
                  const status = val < 50 ? '⚠️ Critical' : val < 100 ? '⚡ Moderate' : '✅ Optimal';
                  return `${val} Units (${status})`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                color: theme.textColor,
                font: { family: 'Plus Jakarta Sans', weight: '600' }
              }
            },
            y: {
              grid: { color: theme.gridColor },
              ticks: { color: theme.textColor }
            }
          }
        }
      });
    }

    // 2. Donation Trend Analytics Chart
    if (trendsCanvas) {
      const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
      const donations = [840, 920, 1150, 1340, 1580, 1820];
      const emergencyFulfilled = [120, 145, 210, 290, 380, 440];

      trendsChart = new window.Chart(trendsCanvas, {
        type: 'line',
        data: {
          labels: months,
          datasets: [
            {
              label: 'Completed Donations',
              data: donations,
              borderColor: '#C71932',
              backgroundColor: 'rgba(199, 25, 50, 0.1)',
              fill: true,
              tension: 0.4,
              borderWidth: 3,
              pointBackgroundColor: '#C71932',
              pointRadius: 4
            },
            {
              label: 'Emergency Matches',
              data: emergencyFulfilled,
              borderColor: '#10B981',
              backgroundColor: 'transparent',
              borderDash: [5, 5],
              tension: 0.4,
              borderWidth: 2,
              pointBackgroundColor: '#10B981',
              pointRadius: 3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                color: theme.textColor,
                font: { family: 'Plus Jakarta Sans', size: 12 }
              }
            },
            tooltip: {
              backgroundColor: theme.tooltipBg,
              titleColor: theme.tooltipText,
              bodyColor: theme.tooltipText,
              borderColor: 'rgba(199, 25, 50, 0.2)',
              borderWidth: 1,
              padding: 10
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: theme.textColor }
            },
            y: {
              grid: { color: theme.gridColor },
              ticks: { color: theme.textColor }
            }
          }
        }
      });
    }

    // Update charts on theme change
    window.addEventListener('bloodlink:themechange', () => {
      const colors = getThemeColors();
      [inventoryChart, trendsChart].forEach((chart) => {
        if (!chart) return;
        chart.options.scales.x.ticks.color = colors.textColor;
        chart.options.scales.y.ticks.color = colors.textColor;
        chart.options.scales.y.grid.color = colors.gridColor;
        chart.update();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCharts);
  } else {
    initCharts();
  }
})();
