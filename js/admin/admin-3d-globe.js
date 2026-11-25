/**
 * BLOODLINK SUPER ADMIN 3D NETWORK TELEMETRY (admin-3d-globe.js)
 * Lightweight, high-performance Three.js simulation rendering an interconnected
 * regional healthcare network with pulsating trauma nodes and cold-chain dispatch arcs.
 */

window.BloodLinkAdmin3DGlobe = (function() {
  'use strict';

  let scene, camera, renderer, globeGroup, animFrameId;
  let mouseX = 0, mouseY = 0, targetX = 0, targetY = 0;
  let isInitialized = false;

  function init(containerId = 'admin-3d-globe-viewport') {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Detect WebGL capability
    if (!hasWebGL()) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-primary);font-size:0.8rem;font-weight:700;">Active Platform Telemetry Online</div>';
      return;
    }

    const width = container.clientWidth || 280;
    const height = container.clientHeight || 180;

    // Scene setup
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 24;

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // 1. Core Wireframe Network Sphere
    const sphereGeo = new THREE.IcosahedronGeometry(7, 2);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0xC71932,
      wireframe: true,
      transparent: true,
      opacity: 0.22
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    globeGroup.add(sphereMesh);

    // 2. Healthcare Facility Hub Nodes (Trauma centers & Blood banks)
    const nodeCoords = [
      { lat: 0.2, lon: 0.4, size: 0.45, color: 0xC71932 },
      { lat: -0.3, lon: 0.8, size: 0.35, color: 0x8F1025 },
      { lat: 0.6, lon: -0.5, size: 0.4, color: 0xC71932 },
      { lat: -0.5, lon: -0.7, size: 0.35, color: 0x10B981 },
      { lat: 0.8, lon: 0.1, size: 0.3, color: 0xF59E0B },
      { lat: -0.1, lon: -0.2, size: 0.5, color: 0xC71932 },
      { lat: 0.4, lon: 1.1, size: 0.35, color: 0x10B981 }
    ];

    const nodesGroup = new THREE.Group();
    const nodeGeo = new THREE.SphereGeometry(0.35, 12, 12);

    nodeCoords.forEach(coord => {
      const mat = new THREE.MeshBasicMaterial({
        color: coord.color,
        transparent: true,
        opacity: 0.85
      });
      const node = new THREE.Mesh(nodeGeo, mat);
      const r = 7.1;
      node.position.x = r * Math.cos(coord.lat) * Math.sin(coord.lon);
      node.position.y = r * Math.sin(coord.lat);
      node.position.z = r * Math.cos(coord.lat) * Math.cos(coord.lon);
      nodesGroup.add(node);
    });
    globeGroup.add(nodesGroup);

    // 3. Cold-Chain Dispatch Arcs
    const arcsGroup = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const start = nodesGroup.children[i % nodesGroup.children.length].position;
      const end = nodesGroup.children[(i + 2) % nodesGroup.children.length].position;
      const mid = start.clone().add(end).multiplyScalar(0.5);
      mid.multiplyScalar(1.35); // elevate arc above globe

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const points = curve.getPoints(24);
      const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
      const arcMat = new THREE.LineBasicMaterial({
        color: 0xC71932,
        transparent: true,
        opacity: 0.45
      });
      const arcLine = new THREE.Line(arcGeo, arcMat);
      arcsGroup.add(arcLine);
    }
    globeGroup.add(arcsGroup);

    // 4. Ambient Telemetry Particles
    const partGeo = new THREE.BufferGeometry();
    const partCount = 45;
    const partPositions = new Float32Array(partCount * 3);
    for (let i = 0; i < partCount * 3; i += 3) {
      partPositions[i] = (Math.random() - 0.5) * 22;
      partPositions[i + 1] = (Math.random() - 0.5) * 16;
      partPositions[i + 2] = (Math.random() - 0.5) * 14;
    }
    partGeo.setAttribute('position', new THREE.BufferAttribute(partPositions, 3));
    const partMat = new THREE.PointsMaterial({
      size: 0.4,
      color: 0xC71932,
      transparent: true,
      opacity: 0.35
    });
    const particles = new THREE.Points(partGeo, partMat);
    scene.add(particles);

    // Mouse tilt tracking
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize);

    isInitialized = true;
    animate();
  }

  function onMouseMove(e) {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  function onResize() {
    const container = document.getElementById('admin-3d-globe-viewport');
    if (!container || !renderer || !camera) return;
    const w = container.clientWidth || 280;
    const h = container.clientHeight || 180;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function animate() {
    animFrameId = requestAnimationFrame(animate);

    if (globeGroup) {
      globeGroup.rotation.y += 0.005;
      globeGroup.rotation.x += 0.002;

      // Inertia parallax damping
      targetX += (mouseX * 0.3 - targetX) * 0.05;
      targetY += (mouseY * 0.3 - targetY) * 0.05;

      globeGroup.rotation.y += targetX * 0.02;
      globeGroup.rotation.x += targetY * 0.02;
    }

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  function hasWebGL() {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  function cleanup() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('resize', onResize);
    isInitialized = false;
  }

  return {
    init,
    cleanup
  };
})();
