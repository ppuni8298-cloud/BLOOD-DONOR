/**
 * BLOODLINK PHASE 4 VALIDATION TEST (tests/phase4-patient-portal-test.js)
 * Validates Patient Emergency Command Center, live tracking timeline,
 * request form, 3D medical visual, client service, and SQL migration.
 */

const fs = require('fs');
const path = require('path');

function runPhase4Tests() {
  console.log('====================================================');
  console.log('🩸 BLOODLINK PHASE 4: PATIENT EMERGENCY PORTAL VERIFICATION');
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

  // 1. Regression Checks: Landing Page & Donor Dashboard
  console.log('1. Checking Landing Page & Donor Command Center Preservation...');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert(indexHtml.includes('hero-canvas-container'), 'Landing page Three.js hero canvas preserved');
  assert(indexHtml.includes('One Donation. Three Lives. One Connected Network.'), 'Tagline preserved');

  const donorHtml = fs.readFileSync(path.join(__dirname, '../donor-dashboard.html'), 'utf8');
  assert(donorHtml.includes('donor-3d-cell-viewport'), 'Donor dashboard 3D cell viewport intact');
  assert(donorHtml.includes('data-tab="tab-overview"'), 'Donor dashboard navigation intact');

  // 2. Patient Command Center HTML Structure
  console.log('\n2. Checking Patient Dashboard HTML Structure...');
  const patientHtmlPath = path.join(__dirname, '../patient-dashboard.html');
  assert(fs.existsSync(patientHtmlPath), 'patient-dashboard.html exists');
  const patientHtml = fs.readFileSync(patientHtmlPath, 'utf8');

  // No phase numbers in user-facing UI
  assert(!patientHtml.includes('Phase 4'), 'No "Phase 4" displayed anywhere on patient dashboard UI');

  // 3D Canvas
  assert(patientHtml.includes('id="patient-3d-pulse-viewport"'), '3D pulse viewport present in Emergency Overview');
  assert(patientHtml.includes('js/patient/patient-3d-pulse.js'), 'Three.js 3D pulse script referenced');

  // All 9 Tabs in Sidebar & Main panels
  const expectedTabs = [
    'overview',
    'create-request',
    'active-requests',
    'tracking',
    'facilities',
    'history',
    'notifications',
    'profile',
    'settings'
  ];
  expectedTabs.forEach(tab => {
    assert(patientHtml.includes(`data-tab="tab-${tab}"`), `Sidebar contains tab: tab-${tab}`);
    assert(patientHtml.includes(`id="tab-${tab}"`), `Tab panel exists for: tab-${tab}`);
  });

  // Emergency Request Form & Fields
  assert(patientHtml.includes('id="emergency-blood-request-form"'), 'Emergency blood request form present');
  assert(patientHtml.includes('id="form-patient-name"'), 'Patient name input present');
  assert(patientHtml.includes('id="form-blood-group"'), 'Blood group selector present');
  assert(patientHtml.includes('id="form-blood-component"'), 'Blood component selector present');
  assert(patientHtml.includes('id="form-units-needed"'), 'Units needed input present');
  assert(patientHtml.includes('id="form-hospital-name"'), 'Hospital name input present');
  assert(patientHtml.includes('id="form-hospital-city"'), 'Hospital city input present');
  assert(patientHtml.includes('id="form-hospital-address"'), 'Hospital address input present');
  assert(patientHtml.includes('id="form-required-datetime"'), 'Required datetime input present');
  assert(patientHtml.includes('id="form-clinical-reason"'), 'Clinical reason textarea present');
  assert(patientHtml.includes('id="form-consent-check"'), 'Consent & declaration checkbox present');

  // Clinical Disclaimer Notice
  assert(patientHtml.includes('CLINICAL BLOOD COMPATIBILITY NOTICE'), 'Clinical compatibility notice heading present');
  assert(patientHtml.includes('Selecting a blood group or component does not establish transfusion compatibility'), 'Clear clinical disclaimer text present');

  // Live Tracking & Stepper
  assert(patientHtml.includes('id="tracking-stepper-container"'), 'Tracking stepper container present');
  assert(patientHtml.includes('id="tracking-timeline-events"'), 'Tracking timeline events container present');

  // Modals & Printable Summary Report
  assert(patientHtml.includes('id="modal-cancel-request"'), 'Cancel request modal present');
  assert(patientHtml.includes('id="modal-request-report"'), 'Request report modal present');
  assert(patientHtml.includes('id="printable-request-summary"'), 'Printable clinical summary container present');

  // Preserved Phase 2 Security Tokens
  assert(patientHtml.includes('BloodLinkSession.requireAuth'), 'BloodLinkSession.requireAuth present');
  assert(patientHtml.includes('patient'), 'Patient role restriction present');
  assert(patientHtml.includes('btn-logout'), 'btn-logout present');
  assert(patientHtml.includes('@supabase/supabase-js'), 'Supabase SDK referenced');

  // 3. CSS Stylesheet Architecture
  console.log('\n3. Checking Patient Command Center CSS...');
  const cssPath = path.join(__dirname, '../css/patient-command-center.css');
  assert(fs.existsSync(cssPath), 'css/patient-command-center.css exists');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  assert(cssContent.includes('.patient-sidebar'), 'Patient sidebar styles defined');
  assert(cssContent.includes('.tracking-stepper'), 'Tracking stepper styles defined');
  assert(cssContent.includes('.emergency-form-container'), 'Emergency form container defined');
  assert(cssContent.includes('@media print'), 'Printable summary CSS rules present');

  // 4. Three.js 3D Pulse Visualizer
  console.log('\n4. Checking Three.js 3D Pulse Visualizer...');
  const pulseJsPath = path.join(__dirname, '../js/patient/patient-3d-pulse.js');
  assert(fs.existsSync(pulseJsPath), 'js/patient/patient-3d-pulse.js exists');
  const pulseJs = fs.readFileSync(pulseJsPath, 'utf8');
  assert(pulseJs.includes('initPatient3DPulse'), '3D pulse initializer implemented');
  assert(pulseJs.includes('THREE.LatheGeometry'), 'Parametric biconcave geometry used');
  assert(pulseJs.includes('THREE.MeshPhysicalMaterial'), 'Physical shader material used');
  assert(pulseJs.includes('IntersectionObserver'), 'IntersectionObserver used for rendering performance');
  assert(pulseJs.includes('isWebGLSupported'), 'WebGL fallback supported');

  // 5. Patient Service & Controller Scripts
  console.log('\n5. Checking Patient Service & Controller...');
  const servicePath = path.join(__dirname, '../js/patient/patient-service.js');
  const controllerPath = path.join(__dirname, '../js/patient/patient-command-center.js');
  assert(fs.existsSync(servicePath), 'js/patient/patient-service.js exists');
  assert(fs.existsSync(controllerPath), 'js/patient/patient-command-center.js exists');

  const serviceContent = fs.readFileSync(servicePath, 'utf8');
  assert(serviceContent.includes('getPatientDashboard'), 'Service implements getPatientDashboard');
  assert(serviceContent.includes('createRequest'), 'Service implements createRequest');
  assert(serviceContent.includes('getMyRequests'), 'Service implements getMyRequests');
  assert(serviceContent.includes('cancelRequest'), 'Service implements cancelRequest');
  assert(serviceContent.includes('getFacilities'), 'Service implements getFacilities');

  const controllerContent = fs.readFileSync(controllerPath, 'utf8');
  assert(controllerContent.includes('setupTabNavigation'), 'Controller handles 9-tab navigation');
  assert(controllerContent.includes('setupRequestForm'), 'Controller handles emergency request submission');
  assert(controllerContent.includes('renderTrackingView'), 'Controller renders live request tracking');
  assert(controllerContent.includes('setupFacilitySearch'), 'Controller handles facility search & filtering');

  // 6. Supabase SQL Migration (Phase 4)
  console.log('\n6. Checking Supabase SQL Migration (Phase 4)...');
  const migrationPath = path.join(__dirname, '../supabase/migrations/20261124000005_patient_emergency_portal.sql');
  assert(fs.existsSync(migrationPath), 'Migration 20261124000005_patient_emergency_portal.sql exists');
  const migrationContent = fs.readFileSync(migrationPath, 'utf8');
  assert(migrationContent.includes('CREATE TABLE IF NOT EXISTS public.blood_requests'), 'blood_requests table defined');
  assert(migrationContent.includes('CREATE TABLE IF NOT EXISTS public.blood_request_events'), 'blood_request_events table defined');
  assert(migrationContent.includes('CREATE TABLE IF NOT EXISTS public.request_responses'), 'request_responses table defined');
  assert(migrationContent.includes('CREATE TABLE IF NOT EXISTS public.facility_inventory'), 'facility_inventory table defined');
  assert(migrationContent.includes('Patients can create blood requests'), 'RLS: Patients can create blood requests');
  assert(migrationContent.includes('Patients can cancel own blood requests'), 'RLS: Patients can cancel own blood requests');
  assert(migrationContent.includes('Authorized organizations can update request status'), 'RLS: Authorized organizations can update request status');

  console.log('\n----------------------------------------------------');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🌟 ALL PHASE 4 ARCHITECTURAL & FRONTEND CHECKS PASSED!\n');
  }
}

runPhase4Tests();
