/**
 * BLOODLINK - 3D ERYTHROCYTE SIMULATION ENGINE (hero-scene.js)
 * High-fidelity Three.js scene featuring mathematically realistic biconcave
 * red blood cells (erythrocytes) using the Evans-Fung biomechanical equation,
 * bio-particles, multi-source lighting, and mouse-responsive inertia.
 */

(function () {
  'use strict';

  // Check if WebGL is supported
  function isWebGLAvailable() {
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

  // Fallback handler if WebGL is unavailable
  function activateFallback() {
    const fallbackVisual = document.querySelector('.hero-fallback-visual');
    if (fallbackVisual) {
      fallbackVisual.style.display = 'block';
    }
    console.warn('BloodLink: WebGL is unavailable on this device. Displaying optimized CSS fallback visual.');
  }

  // Wait until DOM and Three.js are available
  function initHeroScene() {
    const container = document.getElementById('hero-canvas-container');
    if (!container) return;

    if (!window.THREE || !isWebGLAvailable()) {
      activateFallback();
      return;
    }

    const THREE = window.THREE;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 14);

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
    canvas.id = 'hero-webgl-canvas';
    container.appendChild(canvas);

    // ==========================================================================
    // 1. BIOMECHANICAL BICONCAVE RED BLOOD CELL GEOMETRY (Evans-Fung Formula)
    // ==========================================================================
    function createErythrocyteGeometry(radius = 2.4, segments = 56) {
      const points = [];
      const samples = 36;
      const D0 = 0.38; // Thickness scale factor
      const c0 = 0.81;
      const c2 = 7.83;
      const c4 = -4.39;

      // Generate upper surface from center (r=0) to outer rim (r=radius)
      for (let i = 0; i <= samples; i++) {
        const u = i / samples; // Normalized radius [0, 1]
        const r = u * radius;

        // Evans-Fung formula for half-thickness D(r)
        const term1 = Math.sqrt(Math.max(0, 1 - u * u));
        const term2 = c0 + c2 * (u * u) + c4 * Math.pow(u, 4);
        const y = D0 * term1 * term2;

        points.push(new THREE.Vector2(Math.max(0.001, r), y));
      }

      // Generate lower surface from rim (r=radius) back to center (r=0)
      for (let i = samples; i >= 0; i--) {
        const u = i / samples;
        const r = u * radius;

        const term1 = Math.sqrt(Math.max(0, 1 - u * u));
        const term2 = c0 + c2 * (u * u) + c4 * Math.pow(u, 4);
        const y = -D0 * term1 * term2;

        points.push(new THREE.Vector2(Math.max(0.001, r), y));
      }

      // Create geometry by revolving points 360 degrees around Y axis
      const geometry = new THREE.LatheGeometry(points, segments);
      geometry.computeVertexNormals();
      return geometry;
    }

    // Shared realistic erythrocyte material
    const erythrocyteMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xC71932,
      emissive: 0x3d060e,
      roughness: 0.24,
      metalness: 0.05,
      clearcoat: 0.65,
      clearcoatRoughness: 0.15,
      sheen: 1.0,
      sheenColor: 0xff4d6d,
      sheenRoughness: 0.3,
      transmission: 0.12,
      ior: 1.38,
      reflectivity: 0.5
    });

    // Secondary material for background cells to add depth
    const satelliteMaterial = erythrocyteMaterial.clone();
    satelliteMaterial.roughness = 0.35;
    satelliteMaterial.transmission = 0.05;

    // ==========================================================================
    // 2. SCENE COMPOSITION: CENTRAL CELL & SATELLITES
    // ==========================================================================
    const cellGroup = new THREE.Group();
    scene.add(cellGroup);

    // Primary central red blood cell
    const mainGeometry = createErythrocyteGeometry(2.6, 64);
    const mainCell = new THREE.Mesh(mainGeometry, erythrocyteMaterial);

    // Place main cell slightly to the right on desktop, centered on mobile
    const isMobile = window.innerWidth < 1024;
    mainCell.position.set(isMobile ? 0 : 2.4, isMobile ? -0.8 : 0.2, 0);
    mainCell.rotation.set(0.6, 0.4, 0.35);
    cellGroup.add(mainCell);

    // Satellite cells array with position, rotation speeds, and floating offsets
    const satellites = [];
    const satelliteCount = isMobile ? 4 : 7;
    const satelliteGeom = createErythrocyteGeometry(1.6, 42);

    const satelliteConfigs = [
      { pos: [-4.8, 2.8, -3.5], rot: [0.8, -0.4, 0.2], scale: 0.55, speed: 0.004 },
      { pos: [5.2, 3.2, -4.0], rot: [-0.6, 0.8, -0.3], scale: 0.48, speed: 0.005 },
      { pos: [-3.8, -2.5, -2.0], rot: [0.3, 0.6, 0.7], scale: 0.62, speed: 0.0035 },
      { pos: [4.4, -2.8, -1.8], rot: [-0.5, -0.4, 0.5], scale: 0.58, speed: 0.0045 },
      { pos: [-1.2, 4.0, -5.0], rot: [0.4, 0.2, -0.6], scale: 0.38, speed: 0.003 },
      { pos: [1.8, -4.2, -4.5], rot: [-0.3, 0.5, 0.4], scale: 0.42, speed: 0.004 },
      { pos: [-5.5, -0.2, -6.0], rot: [0.2, -0.7, 0.3], scale: 0.35, speed: 0.003 }
    ];

    for (let i = 0; i < satelliteCount; i++) {
      const cfg = satelliteConfigs[i];
      const satMesh = new THREE.Mesh(satelliteGeom, satelliteMaterial);
      satMesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      satMesh.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
      satMesh.scale.setScalar(cfg.scale);

      cellGroup.add(satMesh);
      satellites.push({
        mesh: satMesh,
        initialY: cfg.pos[1],
        initialX: cfg.pos[0],
        rotSpeedX: (Math.random() - 0.5) * 0.006,
        rotSpeedY: cfg.speed,
        floatFreq: 0.0012 + Math.random() * 0.0008,
        floatPhase: Math.random() * Math.PI * 2
      });
    }

    // ==========================================================================
    // 3. SUBTLE GLOWING BIO-PARTICLES (Plasma field)
    // ==========================================================================
    const particleCount = isMobile ? 80 : 160;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleScales = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 24;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 16;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 14 - 2;
      particleScales[i] = Math.random() * 0.8 + 0.2;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    // Custom circle texture for soft bio-particles
    const particleCanvas = document.createElement('canvas');
    particleCanvas.width = 32;
    particleCanvas.height = 32;
    const pCtx = particleCanvas.getContext('2d');
    const pGrad = pCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    pGrad.addColorStop(0, 'rgba(255, 77, 109, 0.9)');
    pGrad.addColorStop(0.4, 'rgba(199, 25, 50, 0.4)');
    pGrad.addColorStop(1, 'rgba(199, 25, 50, 0)');
    pCtx.fillStyle = pGrad;
    pCtx.fillRect(0, 0, 32, 32);

    const particleTexture = new THREE.CanvasTexture(particleCanvas);

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.45,
      map: particleTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.65
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // ==========================================================================
    // 4. MULTI-SOURCE CINEMATIC LIGHTING
    // ==========================================================================
    // Soft red ambient tone
    const ambientLight = new THREE.AmbientLight(0x380b12, 1.4);
    scene.add(ambientLight);

    // Primary Key Light (bright crisp specular)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(6, 8, 8);
    scene.add(keyLight);

    // Rim / Backlight for organic cellular glow
    const rimLight = new THREE.DirectionalLight(0xff2d4e, 2.2);
    rimLight.position.set(-6, -4, -6);
    scene.add(rimLight);

    // Warm Fill Light
    const fillLight = new THREE.PointLight(0xff4d6d, 1.2, 18);
    fillLight.position.set(0, 3, 4);
    scene.add(fillLight);

    // Dynamic light responding to theme
    window.addEventListener('bloodlink:themechange', (e) => {
      const isDark = e.detail && e.detail.theme === 'dark';
      ambientLight.color.setHex(isDark ? 0x220509 : 0x380b12);
      ambientLight.intensity = isDark ? 1.0 : 1.4;
      keyLight.intensity = isDark ? 1.2 : 1.4;
      rimLight.intensity = isDark ? 2.6 : 2.2;
    });

    // ==========================================================================
    // 5. MOUSE PARALLAX & INTERACTIVE INERTIA
    // ==========================================================================
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const windowHalfX = window.innerWidth / 2;
    const windowHalfY = window.innerHeight / 2;

    function onMouseMove(event) {
      mouse.targetX = (event.clientX - windowHalfX) / windowHalfX;
      mouse.targetY = (event.clientY - windowHalfY) / windowHalfY;
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true });

    // Touch support for mobile tilt
    window.addEventListener('touchmove', (event) => {
      if (event.touches.length > 0) {
        mouse.targetX = (event.touches[0].clientX - windowHalfX) / windowHalfX;
        mouse.targetY = (event.touches[0].clientY - windowHalfY) / windowHalfY;
      }
    }, { passive: true });

    // ==========================================================================
    // 6. ANIMATION LOOP & VISIBILITY OPTIMIZATION
    // ==========================================================================
    let isPageVisible = true;
    document.addEventListener('visibilitychange', () => {
      isPageVisible = !document.hidden;
    });

    let clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);

      if (!isPageVisible) return;

      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      // Smooth mouse damping (Lerp)
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      // Rotate and gently float main central cell
      mainCell.rotation.y += 0.0035;
      mainCell.rotation.x = 0.5 + Math.sin(elapsedTime * 0.7) * 0.12 + mouse.y * 0.25;
      mainCell.rotation.z = 0.35 + Math.cos(elapsedTime * 0.5) * 0.08 + mouse.x * 0.25;
      mainCell.position.y = (isMobile ? -0.8 : 0.2) + Math.sin(elapsedTime * 1.1) * 0.18;

      // Animate satellite cells
      for (let i = 0; i < satellites.length; i++) {
        const sat = satellites[i];
        sat.mesh.rotation.y += sat.rotSpeedY;
        sat.mesh.rotation.x += sat.rotSpeedX;
        sat.mesh.position.y = sat.initialY + Math.sin(elapsedTime * 1.2 + sat.floatPhase) * 0.25;
        sat.mesh.position.x = sat.initialX + Math.cos(elapsedTime * 0.8 + sat.floatPhase) * 0.15;
      }

      // Parallax whole cell group slightly with mouse
      cellGroup.position.x = mouse.x * 0.75;
      cellGroup.position.y = -mouse.y * 0.75;

      // Animate bio-particles drifting
      particles.rotation.y = elapsedTime * 0.02;
      particles.rotation.x = Math.sin(elapsedTime * 0.015) * 0.05;

      renderer.render(scene, camera);
    }

    animate();

    // ==========================================================================
    // 7. RESPONSIVE RESIZE HANDLER
    // ==========================================================================
    function onWindowResize() {
      const newWidth = container.clientWidth || window.innerWidth;
      const newHeight = container.clientHeight || window.innerHeight;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();

      renderer.setSize(newWidth, newHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const mobileNow = window.innerWidth < 1024;
      mainCell.position.x = mobileNow ? 0 : 2.4;
      mainCell.position.y = mobileNow ? -0.8 : 0.2;
    }

    window.addEventListener('resize', onWindowResize);
  }

  // Initialize once window loads
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initHeroScene, 100);
  } else {
    window.addEventListener('DOMContentLoaded', initHeroScene);
  }
})();
