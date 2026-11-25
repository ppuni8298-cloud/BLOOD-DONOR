/**
 * BLOODLINK - PATIENT EMERGENCY 3D PULSE VISUALIZER (patient-3d-pulse.js)
 * Lightweight, non-distracting Three.js medical simulation for the emergency overview.
 * Features an authentic biconcave erythrocyte with subtle vitality pulse,
 * bio-element drift, mouse parallax, and performance-minded IntersectionObserver pause.
 */

(function () {
  'use strict';

  function isWebGLSupported() {
    try {
      const canvas = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
    } catch (e) {
      return false;
    }
  }

  function initPatient3DPulse() {
    const container = document.getElementById('patient-3d-pulse-viewport');
    if (!container) return;

    if (!window.THREE || !isWebGLSupported()) {
      container.innerHTML = `
        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
          <div style="width: 80px; height: 80px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #FF4D6D 0%, #C71932 60%, #4A0812 100%); box-shadow: 0 0 20px rgba(199,25,50,0.35); animation: live-pulse 3s infinite;"></div>
        </div>
      `;
      return;
    }

    const THREE = window.THREE;
    const width = container.clientWidth || 220;
    const height = container.clientHeight || 180;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 7.5);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Evans-Fung Biconcave Erythrocyte Geometry
    function createErythrocyteGeometry(radius = 1.8, segments = 50) {
      const points = [];
      const R = radius;
      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const x = u * R;
        const rNorm = x / R;
        let y = 0.5 * Math.sqrt(Math.max(0, 1 - rNorm * rNorm)) *
          (0.207 + 2.003 * rNorm * rNorm - 1.123 * Math.pow(rNorm, 4));
        points.push(new THREE.Vector2(x, y));
      }
      return new THREE.LatheGeometry(points, 50);
    }

    const cellGeo = createErythrocyteGeometry(1.6);
    const cellMat = new THREE.MeshPhysicalMaterial({
      color: 0xC71932,
      emissive: 0x33040A,
      roughness: 0.25,
      metalness: 0.05,
      clearcoat: 0.8,
      clearcoatRoughness: 0.15,
      transmission: 0.35,
      thickness: 1.2
    });

    const mainCell = new THREE.Mesh(cellGeo, cellMat);
    mainCell.rotation.x = 0.45;
    mainCell.rotation.z = -0.2;
    scene.add(mainCell);

    // 3. Ambient Plasma Particles
    const particleCount = 24;
    const partGeo = new THREE.BufferGeometry();
    const partPos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      partPos[i] = (Math.random() - 0.5) * 8;
      partPos[i + 1] = (Math.random() - 0.5) * 6;
      partPos[i + 2] = (Math.random() - 0.5) * 5;
    }
    partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
    const partMat = new THREE.PointsMaterial({
      color: 0xFF4D6D,
      size: 0.08,
      transparent: true,
      opacity: 0.6
    });
    const particles = new THREE.Points(partGeo, partMat);
    scene.add(particles);

    // 4. Clinical Lighting
    const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xFFFFFF, 1.2);
    dirLight.position.set(4, 5, 5);
    scene.add(dirLight);

    const rimLight = new THREE.PointLight(0xFF2D4E, 2.0, 15);
    rimLight.position.set(-3, -2, -2);
    scene.add(rimLight);

    // 5. Parallax & Lifecycle Controls
    let mouseX = 0, mouseY = 0;
    let targetX = 0, targetY = 0;
    let isVisible = true;
    let animId = null;

    function onMouseMove(e) {
      const rect = container.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 0.8;
      mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 0.8;
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        isVisible = entry.isIntersecting;
        if (isVisible && !animId) {
          clock.start();
          animate();
        }
      });
    }, { threshold: 0.1 });
    observer.observe(container);

    // 6. Animation Loop
    const clock = new THREE.Clock();

    function animate() {
      if (!isVisible) {
        animId = null;
        return;
      }
      animId = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();

      // Subtle vital pulse (approx 65 bpm resting rhythm)
      const pulse = 1 + Math.sin(elapsedTime * 2.2) * 0.035;
      mainCell.scale.set(pulse, pulse, pulse);

      // Smooth rotation
      mainCell.rotation.y = elapsedTime * 0.45;
      mainCell.rotation.x = 0.4 + Math.sin(elapsedTime * 0.6) * 0.08;

      // Particle drift
      particles.rotation.y = elapsedTime * 0.06;

      // Inertial mouse follow
      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;
      scene.rotation.y = targetX * 0.6;
      scene.rotation.x = targetY * 0.4;

      renderer.render(scene, camera);
    }

    animate();

    function onResize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    }
    window.addEventListener('resize', onResize);
  }

  window.BloodLinkPatientPulse = {
    init: initPatient3DPulse,
    isWebGLSupported
  };

  document.addEventListener('DOMContentLoaded', () => {
    initPatient3DPulse();
  });
})();
