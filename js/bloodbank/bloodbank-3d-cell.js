/**
 * BLOODLINK - BLOOD BANK COMMAND CENTER 3D ERYTHROCYTE ENGINE (bloodbank-3d-cell.js)
 * High-fidelity Three.js micro-simulation for the blood bank command center welcome card.
 * Uses Evans-Fung biomechanical parametric biconcave erythrocyte geometry,
 * cold-chain amber/blue specular accents, and smooth rotation.
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

  function initBloodbank3DCell() {
    const container = document.getElementById('bloodbank-3d-cell-viewport');
    if (!container) return;

    if (!window.THREE || !isWebGLSupported()) {
      container.innerHTML = `
        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
          <div style="width: 85px; height: 85px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #F59E0B 0%, #C71932 55%, #660C1A 95%); box-shadow: 0 0 25px rgba(245,158,11,0.4); animation: float-card 6s ease-in-out infinite;"></div>
        </div>
      `;
      return;
    }

    const THREE = window.THREE;
    const width = container.clientWidth || 200;
    const height = container.clientHeight || 160;

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

    // Evans-Fung Biconcave Geometry
    function createErythrocyteGeometry(radius, segments) {
      const R = radius || 2.0;
      const pts = [];
      const steps = segments || 48;
      const c0 = 0.81, c1 = 7.83, c2 = -4.39;

      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const r = u * R;
        const u2 = u * u;
        let y = 0.5 * Math.sqrt(Math.max(0, 1 - u2)) * (c0 + c1 * u2 + c2 * u2 * u2) * 0.28;
        if (isNaN(y)) y = 0;
        pts.push(new THREE.Vector2(Math.max(0.001, r), y));
      }

      for (let i = steps; i >= 0; i--) {
        const u = i / steps;
        const r = u * R;
        const u2 = u * u;
        let y = -0.5 * Math.sqrt(Math.max(0, 1 - u2)) * (c0 + c1 * u2 + c2 * u2 * u2) * 0.28;
        if (isNaN(y)) y = 0;
        pts.push(new THREE.Vector2(Math.max(0.001, r), y));
      }

      const geom = new THREE.LatheGeometry(pts, 48);
      geom.computeVertexNormals();
      return geom;
    }

    const cellGeom = createErythrocyteGeometry(2.1, 40);

    const cellMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xC71932,
      emissive: 0x5C1100,
      emissiveIntensity: 0.25,
      roughness: 0.24,
      metalness: 0.15,
      clearcoat: 0.75,
      clearcoatRoughness: 0.15,
      transmission: 0.4,
      thickness: 1.2
    });

    const cellMesh = new THREE.Mesh(cellGeom, cellMaterial);
    cellMesh.rotation.x = 0.45;
    cellMesh.rotation.y = 0.25;
    scene.add(cellMesh);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xf59e0b, 2.0);
    keyLight.position.set(4, 5, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x0284c7, 1.8);
    rimLight.position.set(-4, -3, -3);
    scene.add(rimLight);

    // Animation Loop
    let clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      cellMesh.rotation.y = elapsedTime * 0.4;
      cellMesh.rotation.x = Math.sin(elapsedTime * 0.35) * 0.3 + 0.3;
      cellMesh.position.y = Math.sin(elapsedTime * 0.75) * 0.1;

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBloodbank3DCell);
  } else {
    initBloodbank3DCell();
  }

  window.initBloodbank3DCell = initBloodbank3DCell;
})();
