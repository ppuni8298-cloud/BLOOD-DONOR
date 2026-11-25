/**
 * BLOODLINK PHASE 3 VALIDATION TEST (tests/phase3-command-center-test.js)
 * Validates Donor Command Center frontend structure, 3D erythrocyte engine,
 * client services, SQL migration, and non-destructive preservation of Phase 1 & 2.
 */

const fs = require('fs');
const path = require('path');

function runPhase3Tests() {
  console.log('====================================================');
  console.log('🩸 BLOODLINK PHASE 3: DONOR COMMAND CENTER VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Check Landing Page Integrity (Must NOT be overwritten or corrupted)
  console.log('1. Checking Landing Page & Phase 1/2 Preservation...');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert(indexHtml.includes('hero-canvas-container'), 'Landing page Three.js hero canvas preserved');
  assert(indexHtml.includes('BloodLink'), 'Landing page BloodLink branding intact');
  assert(indexHtml.includes('One Donation. Three Lives. One Connected Network.'), 'Tagline preserved');

  // 2. Check Donor Command Center HTML
  console.log('\n2. Checking Donor Command Center HTML Structure...');
  const donorHtmlPath = path.join(__dirname, '../donor-dashboard.html');
  assert(fs.existsSync(donorHtmlPath), 'donor-dashboard.html exists');
  const donorHtml = fs.readFileSync(donorHtmlPath, 'utf8');

  // 3D Canvas Viewport
  assert(donorHtml.includes('donor-3d-cell-viewport'), '3D erythrocyte canvas viewport present');
  assert(donorHtml.includes('js/donor/donor-3d-cell.js'), 'Three.js 3D cell script referenced');

  // All 9 Tabs in Sidebar & Main panels
  const expectedTabs = [
    'overview',
    'profile',
    'history',
    'appointments',
    'requests',
    'digital-id',
    'certificates',
    'notifications',
    'settings'
  ];
  expectedTabs.forEach(tab => {
    assert(donorHtml.includes(`data-tab="tab-${tab}"`), `Sidebar navigation contains tab: tab-${tab}`);
    assert(donorHtml.includes(`id="tab-${tab}"`), `Tab panel exists for: tab-${tab}`);
  });

  // 3-state availability switcher
  assert(donorHtml.includes('data-state="available"'), 'Availability switcher has "available" state');
  assert(donorHtml.includes('data-state="temporarily_unavailable"'), 'Availability switcher has "temporarily_unavailable" state');
  assert(donorHtml.includes('data-state="not_accepting_requests"'), 'Availability switcher has "not_accepting_requests" state');

  // Digital ID Pass & Certificate Modal
  assert(donorHtml.includes('class="digital-donor-pass"'), 'Digital Donor ID Pass element present');
  assert(donorHtml.includes('id="modal-certificate-viewer"'), 'Clinical Certificate modal present');
  assert(donorHtml.includes('id="printable-certificate"'), 'Printable certificate container present');

  // 3. Check CSS Styling Architecture
  console.log('\n3. Checking Donor Command Center CSS Architecture...');
  const cssPath = path.join(__dirname, '../css/donor-command-center.css');
  assert(fs.existsSync(cssPath), 'css/donor-command-center.css exists');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  assert(cssContent.includes('.donor-sidebar'), 'Sidebar styles defined');
  assert(cssContent.includes('.availability-btn-card'), 'Availability card styles defined');
  assert(cssContent.includes('.digital-donor-pass'), 'Apple Wallet style pass styles defined');
  assert(cssContent.includes('@media print'), 'Printable certificate CSS rules present');

  // 4. Check 3D Three.js Erythrocyte Engine
  console.log('\n4. Checking Three.js 3D Cell Visualizer...');
  const cellJsPath = path.join(__dirname, '../js/donor/donor-3d-cell.js');
  assert(fs.existsSync(cellJsPath), 'js/donor/donor-3d-cell.js exists');
  const cellJsContent = fs.readFileSync(cellJsPath, 'utf8');
  assert(cellJsContent.includes('initDonor3DCell'), '3D Cell visualizer initializer implemented');
  assert(cellJsContent.includes('THREE.LatheGeometry'), 'Parametric biconcave erythrocyte geometry implemented');
  assert(cellJsContent.includes('THREE.MeshPhysicalMaterial'), 'Photorealistic MeshPhysicalMaterial used');
  assert(cellJsContent.includes('IntersectionObserver'), 'IntersectionObserver used for rendering performance');
  assert(cellJsContent.includes('isWebGLSupported'), 'Graceful WebGL fallback supported');

  // 5. Check Donor Client Service & Controller
  console.log('\n5. Checking Donor Client Service and Command Center Controller...');
  const servicePath = path.join(__dirname, '../js/donor/donor-service.js');
  const controllerPath = path.join(__dirname, '../js/donor/donor-command-center.js');
  assert(fs.existsSync(servicePath), 'js/donor/donor-service.js exists');
  assert(fs.existsSync(controllerPath), 'js/donor/donor-command-center.js exists');

  const serviceContent = fs.readFileSync(servicePath, 'utf8');
  assert(serviceContent.includes('getDonorFullProfile'), 'Service implements getDonorFullProfile');
  assert(serviceContent.includes('setAvailability'), 'Service implements setAvailability');
  assert(serviceContent.includes('bookAppointment'), 'Service implements bookAppointment');
  assert(serviceContent.includes('cancelAppointment'), 'Service implements cancelAppointment');
  assert(serviceContent.includes('uploadAvatar'), 'Service implements uploadAvatar with file validation');

  const controllerContent = fs.readFileSync(controllerPath, 'utf8');
  assert(controllerContent.includes('computeDonorStatistics'), 'Controller computes donor statistics (units, lives * 3)');
  assert(controllerContent.includes('setupAvailabilitySwitcher'), 'Controller manages 3-state availability sync');
  assert(controllerContent.includes('setupTabNavigation'), 'Controller manages deep tab navigation');

  // 6. Check Database Migration
  console.log('\n6. Checking Supabase SQL Migration (Phase 3)...');
  const migrationPath = path.join(__dirname, '../supabase/migrations/20261124000004_donor_command_center.sql');
  assert(fs.existsSync(migrationPath), 'Migration 20261124000004_donor_command_center.sql exists');
  const migrationContent = fs.readFileSync(migrationPath, 'utf8');
  assert(migrationContent.includes('CREATE TABLE IF NOT EXISTS public.donations'), 'donations table defined');
  assert(migrationContent.includes('CREATE TABLE IF NOT EXISTS public.donation_camps'), 'donation_camps table defined');
  assert(migrationContent.includes('CREATE TABLE IF NOT EXISTS public.appointments'), 'appointments table defined');
  assert(migrationContent.includes('CREATE TABLE IF NOT EXISTS public.notifications'), 'notifications table defined');
  assert(migrationContent.includes('Organizations can insert donations'), 'RLS policy: only organizations can insert donations');
  assert(migrationContent.includes('Organizations can update donation verification'), 'RLS policy: only organizations can verify donations');

  console.log('\n----------------------------------------------------');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🌟 ALL PHASE 3 FRONTEND & SCHEMA CHECKS PASSED!\n');
  }
}

runPhase3Tests();
