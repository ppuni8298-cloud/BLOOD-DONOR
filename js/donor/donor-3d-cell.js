/**
 * BLOODLINK - DONOR COMMAND CENTER 3D ERYTHROCYTE ENGINE (donor-3d-cell.js)
 * Lightweight, optimized Three.js simulation for the donor dashboard welcome card.
 * Features realistic Evans-Fung biconcave red blood cell geometry, bio-particles,
 * interactive card parallax, and biological rim lighting.
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

  function initDonor3DCell() {
    const container = document.getElementById('donor-3d-cell-viewport');
    if (!container) return;

    if (!window.THREE || !isWebGLSupported()) {
      container.innerHTML = `
        <div class="donor-cell-fallback" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
          <div style="width: 90px; height: 90px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #FF4D6D 0%, #C71932 55%, #660C1A 95%); box-shadow: 0 0 25px rgba(199,25,50,0.4), inset -6px -6px 15px rgba(0,0,0,0.5); animation: float-card 6s ease-in-out infinite;"></div>
        </div>
      `;
      return;
    }

    const THREE = window.THREE;
    const width = container.clientWidth || 220;
    const height = container.clientHeight || 180;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    camera.position.set(0, 0, 7.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(canvas);

    // 2. Realistic Evans-Fung Biconcave Geometry
    function createErythrocyteGeometry(radius = 1.4, segments = 44) {
      const points = [];
      const samples = 28;
      const D0 = 0.38;
      const c0 = 0.81;
      const c2 = 7.83;
      const c4 = -4.39;

      // Top profile curve (r=0 to r=radius)
      for (let i = 0; i <= samples; i++) {
        const u = i / samples;
        const r = u * radius;
        const term1 = Math.sqrt(Math.max(0, 1 - u * u));
        const term2 = c0 + c2 * (u * u) + c4 * Math.pow(u, 4);
        const y = D0 * term1 * term2;
        points.push(new THREE.Vector2(Math.max(0.001, r), y));
      }

      // Bottom profile curve (r=radius to r=0)
      for (let i = samples; i >= 0; i--) {
        const u = i / samples;
        const r = u * radius;
        const term1 = Math.sqrt(Math.max(0, 1 - u * u));
        const term2 = c0 + c2 * (u * u) + c4 * Math.pow(u, 4);
        const y = -D0 * term1 * term2;
        points.push(new THREE.Vector2(Math.max(0.001, r), y));
      }

      const geom = new THREE.LatheGeometry(points, segments);
      geom.computeVertexNormals();
      return geom;
    }

    // Material with biological sheen and subsurface scattering feel
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xC71932,
      emissive: 0x3d060e,
      roughness: 0.22,
      metalness: 0.04,
      clearcoat: 0.65,
      clearcoatRoughness: 0.15,
      sheen: 1.0,
      sheenColor: 0xff4d6d,
      sheenRoughness: 0.25,
      transmission: 0.1,
      ior: 1.38
    });

    const group = new THREE.Group();
    scene.add(group);

    // Main central red blood cell
    const mainGeom = createErythrocyteGeometry(1.4, 48);
    const mainCell = new THREE.Mesh(mainGeom, material);
    mainCell.position.set(0.1, 0, 0);
    mainCell.rotation.set(0.5, 0.4, 0.2);
    group.add(mainCell);

    // Mini satellite cell 1
    const satGeom = createErythrocyteGeometry(0.8, 32);
    const satMaterial = material.clone();
    satMaterial.roughness = 0.35;
    const satCell1 = new THREE.Mesh(satGeom, satMaterial);
    satCell1.position.set(-1.8, 0.9, -1.8);
    satCell1.rotation.set(0.8, -0.5, 0.3);
    satCell1.scale.setScalar(0.48);
    group.add(satCell1);

    // Mini satellite cell 2
    const satCell2 = new THREE.Mesh(satGeom, satMaterial);
    satCell2.position.set(1.9, -0.8, -1.5);
    satCell2.rotation.set(-0.6, 0.6, -0.2);
    satCell2.scale.setScalar(0.42);
    group.add(satCell2);

    // 3. Ambient Plasma Particles
    const pCount = 36;
    const pPositions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPositions[i * 3] = (Math.random() - 0.5) * 8;
      pPositions[i * 3 + 1] = (Math.random() - 0.5) * 6;
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
    }
    const pGeom = new THREE.BufferGeometry();
    pGeom.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));

    const pMat = new THREE.PointsMaterial({
      size: 0.14,
      color: 0xff4d6d,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(pGeom, pMat);
    scene.add(particles);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0x380b12, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(4, 5, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xff2d4e, 2.0);
    rimLight.position.set(-4, -3, -4);
    scene.add(rimLight);

    // 5. Card Mouse Parallax
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const cardEl = container.closest('.dashboard-header-card') || container;

    cardEl.addEventListener('mousemove', (e) => {
      const rect = cardEl.getBoundingClientRect();
      mouse.targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      mouse.targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    }, { passive: true });

    cardEl.addEventListener('mouseleave', () => {
      mouse.targetX = 0;
      mouse.targetY = 0;
    });

    // 6. Animation Loop
    let clock = new THREE.Clock();
    let isVisible = true;

    const observer = new IntersectionObserver((entries) => {
      isVisible = entries[0].isIntersecting && !document.hidden;
    }, { threshold: 0.1 });
    observer.observe(container);

    document.addEventListener('visibilitychange', () => {
      isVisible = !document.hidden;
    });

    function animate() {
      requestAnimationFrame(animate);
      if (!isVisible) return;

      const elapsed = clock.getElapsedTime();

      // Smooth inertia
      mouse.x += (mouse.targetX - mouse.x) * 0.06;
      mouse.y += (mouse.targetY - mouse.y) * 0.06;

      // Rotate and float main erythrocyte
      mainCell.rotation.y += 0.005;
      mainCell.rotation.x = 0.5 + Math.sin(elapsed * 0.9) * 0.1 + mouse.y * 0.2;
      mainCell.rotation.z = 0.2 + Math.cos(elapsed * 0.7) * 0.08 + mouse.x * 0.2;
      mainCell.position.y = Math.sin(elapsed * 1.3) * 0.08;

      // Animate satellite cells
      satCell1.rotation.y -= 0.006;
      satCell1.position.y = 0.9 + Math.sin(elapsed * 1.1 + 1) * 0.12;

      satCell2.rotation.y += 0.005;
      satCell2.position.y = -0.8 + Math.cos(elapsed * 1.2 + 2) * 0.12;

      // Float group with mouse
      group.position.x = mouse.x * 0.35;
      group.position.y = -mouse.y * 0.25;

      particles.rotation.y = elapsed * 0.02;

      renderer.render(scene, camera);
    }

    animate();

    // 7. Resize handler
    function onResize() {
      const w = container.clientWidth || 220;
      const h = container.clientHeight || 180;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
    window.addEventListener('resize', onResize);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDonor3DCell);
  } else {
    initDonor3DCell();
  }

  window.BloodLinkDonor3D = { init: initDonor3DCell };
})();
