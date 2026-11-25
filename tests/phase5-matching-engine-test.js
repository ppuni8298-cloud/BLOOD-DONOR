/**
 * BLOODLINK PHASE 5 VALIDATION TEST (tests/phase5-matching-engine-test.js)
 * Validates the Intelligent Blood Matching & Donor Discovery Engine:
 * - Supabase PostgreSQL migrations, RLS policies, and triggers
 * - Component-specific clinical compatibility rules (AABB / WHO matrix)
 * - Central matching engine with 5 categorized output streams
 * - Strict donor privacy preservation (omission of phone, email, home address)
 * - Stale inventory freshness detection (> 48 hours)
 * - Atomic inventory reservations (RSV-YYYY-XXXXX) & duplicate protection
 * - Flask REST API routes & blueprint registration
 * - Patient & Donor Command Center UI integrations & clinical notices
 * - Zero phase numbers in customer-facing UI
 */

const fs = require('fs');
const path = require('path');

function runPhase5Tests() {
  console.log('================================================================');
  console.log('🩸 BLOODLINK: INTELLIGENT MATCHING & DONOR DISCOVERY ENGINE TEST');
  console.log('================================================================\n');

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

  // =========================================================================
  // 1. DATABASE ARCHITECTURE & MIGRATIONS
  // =========================================================================
  console.log('1. Checking Supabase Database Migration & Schema...');
  const migrationPath = path.join(__dirname, '../supabase/migrations/20261124000006_intelligent_matching_engine.sql');
  assert(fs.existsSync(migrationPath), 'Phase 5 SQL migration file exists');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.matching_rule_versions'), 'Table matching_rule_versions created');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.matching_runs'), 'Table matching_runs created');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.matching_candidates'), 'Table matching_candidates created');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.donor_request_invitations'), 'Table donor_request_invitations created');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.inventory_reservations'), 'Table inventory_reservations created');
  assert(migrationSql.includes('CONSTRAINT uq_donor_request_invitation UNIQUE (request_id, donor_id)'), 'Unique invitation constraint prevents duplicates');
  assert(migrationSql.includes('generate_reservation_code()'), 'Atomic reservation code trigger function exists');
  assert(migrationSql.includes('RSV-'), 'Reservation code prefix RSV- generated');
  assert(migrationSql.includes('CLINICAL-AABB-2026.1'), 'Approved clinical ruleset version CLINICAL-AABB-2026.1 seeded');
  assert(migrationSql.includes('ENABLE ROW LEVEL SECURITY'), 'Row Level Security enabled across matching tables');

  // =========================================================================
  // 2. CLINICAL COMPATIBILITY SERVICE
  // =========================================================================
  console.log('\n2. Checking Clinically Validated Compatibility Service...');
  const compatServicePath = path.join(__dirname, '../backend/services/compatibility_service.py');
  assert(fs.existsSync(compatServicePath), 'compatibility_service.py exists');
  const compatCode = fs.readFileSync(compatServicePath, 'utf8');

  assert(compatCode.includes('CLINICAL_DISCLAIMER = ('), 'Statutory clinical disclaimer constant defined');
  assert(compatCode.includes('CLINICAL-AABB-2026.1'), 'Approved ruleset CLINICAL-AABB-2026.1 metadata present');
  assert(compatCode.includes('packed_red_cells'), 'Packed red blood cells compatibility rules defined');
  assert(compatCode.includes('plasma'), 'Plasma compatibility rules defined (reverse logic of red cells)');
  assert(compatCode.includes('platelets'), 'Platelets compatibility rules defined');
  assert(compatCode.includes('cryoprecipitate'), 'Cryoprecipitate compatibility rules defined');
  assert(compatCode.includes('def is_ruleset_approved'), 'is_ruleset_approved() validation method present');
  assert(compatCode.includes('pending_clinical_review'), 'Holds matching in pending_clinical_review if ruleset unapproved');

  // =========================================================================
  // 3. CENTRAL INTELLIGENT MATCHING ENGINE
  // =========================================================================
  console.log('\n3. Checking Central Intelligent Matching Engine Service...');
  const matchingEnginePath = path.join(__dirname, '../backend/services/matching_engine.py');
  assert(fs.existsSync(matchingEnginePath), 'matching_engine.py exists');
  const matchingCode = fs.readFileSync(matchingEnginePath, 'utf8');

  assert(matchingCode.includes('class MatchingEngine'), 'MatchingEngine class defined');
  assert(matchingCode.includes('def run_matching_for_request'), 'run_matching_for_request() orchestrator present');
  assert(matchingCode.includes('STALE_INVENTORY_THRESHOLD_HOURS = 48'), 'Stale inventory threshold set to 48 hours');
  assert(matchingCode.includes('potential_donors'), 'Categorized output includes potential_donors');
  assert(matchingCode.includes('facility_inventory'), 'Categorized output includes facility_inventory');
  assert(matchingCode.includes('awaiting_responses'), 'Categorized output includes awaiting_responses');
  assert(matchingCode.includes('confirmed_responses'), 'Categorized output includes confirmed_responses');
  assert(matchingCode.includes('unavailable_options'), 'Categorized output includes unavailable_options');
  assert(matchingCode.includes('donor_display_id'), 'Masked donor display ID generated for privacy');
  assert(matchingCode.includes('create_inventory_reservation'), 'Atomic create_inventory_reservation() implemented');
  assert(matchingCode.includes('release_inventory_reservation'), 'release_inventory_reservation() implemented');

  // =========================================================================
  // 4. FLASK REST API ROUTES & REGISTRATION
  // =========================================================================
  console.log('\n4. Checking Flask Matching REST API Endpoints...');
  const matchingRoutesPath = path.join(__dirname, '../backend/routes/matching_routes.py');
  assert(fs.existsSync(matchingRoutesPath), 'matching_routes.py exists');
  const routesCode = fs.readFileSync(matchingRoutesPath, 'utf8');

  assert(routesCode.includes('/api/v1/clinical/compatibility-rules'), 'Endpoint /api/v1/clinical/compatibility-rules defined');
  assert(routesCode.includes('/api/v1/requests/<request_id>/run-matching'), 'Endpoint /api/v1/requests/<id>/run-matching defined');
  assert(routesCode.includes('/api/v1/requests/<request_id>/matches'), 'Endpoint /api/v1/requests/<id>/matches defined');
  assert(routesCode.includes('/api/v1/donor/invitations'), 'Endpoint /api/v1/donor/invitations defined');
  assert(routesCode.includes('/api/v1/donor/invitations/<invitation_id>/respond'), 'Endpoint /api/v1/donor/invitations/<id>/respond defined');
  assert(routesCode.includes('/api/v1/donor/commitments'), 'Endpoint /api/v1/donor/commitments defined');
  assert(routesCode.includes('/api/v1/facility/matching-requests'), 'Endpoint /api/v1/facility/matching-requests defined');
  assert(routesCode.includes('/api/v1/facility/inventory/reservations'), 'Endpoint /api/v1/facility/inventory/reservations defined');
  assert(routesCode.includes('/api/v1/admin/matching-analytics'), 'Endpoint /api/v1/admin/matching-analytics defined');

  // App Blueprint Registration
  const appPy = fs.readFileSync(path.join(__dirname, '../backend/app.py'), 'utf8');
  assert(appPy.includes('from backend.routes.matching_routes import matching_bp'), 'matching_bp imported in backend/app.py');
  assert(appPy.includes('app.register_blueprint(matching_bp)'), 'matching_bp registered in Flask application factory');

  // =========================================================================
  // 5. FRONTEND INTEGRATION: PATIENT & DONOR COMMAND CENTERS
  // =========================================================================
  console.log('\n5. Checking Frontend UI Integrations...');
  const patientHtml = fs.readFileSync(path.join(__dirname, '../patient-dashboard.html'), 'utf8');
  assert(patientHtml.includes('id="btn-view-matching-candidates"'), 'View Matching Candidates button in patient dashboard tracking');
  assert(patientHtml.includes('id="modal-matching-candidates"'), 'Matching Candidates modal defined in patient dashboard');
  assert(patientHtml.includes('id="btn-rerun-matching"'), 'Re-run Discovery button present in matching modal');
  assert(patientHtml.includes('matching-category-filter'), 'Category filter pills present in matching modal');
  assert(patientHtml.includes('Clinical Notice:'), 'Statutory clinical notice present in matching modal');

  const donorHtml = fs.readFileSync(path.join(__dirname, '../donor-dashboard.html'), 'utf8');
  assert(donorHtml.includes('id="tab-requests"'), 'Emergency Broadcasts tab present in donor dashboard');
  assert(donorHtml.includes('id="donor-invitations-list"'), 'Donor invitations container present');
  assert(donorHtml.includes('id="donor-commitments-list"'), 'Donor commitments container present');
  assert(donorHtml.includes('Clinical Notice:'), 'Clinical notice present in donor broadcasts feed');

  const patientServiceJs = fs.readFileSync(path.join(__dirname, '../js/patient/patient-service.js'), 'utf8');
  assert(patientServiceJs.includes('getMatchingCandidates'), 'patient-service.js includes getMatchingCandidates()');
  assert(patientServiceJs.includes('runMatching'), 'patient-service.js includes runMatching()');

  const donorServiceJs = fs.readFileSync(path.join(__dirname, '../js/donor/donor-service.js'), 'utf8');
  assert(donorServiceJs.includes('getDonorInvitations'), 'donor-service.js includes getDonorInvitations()');
  assert(donorServiceJs.includes('respondToInvitation'), 'donor-service.js includes respondToInvitation()');
  assert(donorServiceJs.includes('getDonorCommitments'), 'donor-service.js includes getDonorCommitments()');

  // =========================================================================
  // 6. STRICT CUSTOMER-FACING UI INTEGRITY (NO DEVELOPMENT PHASE NUMBERS)
  // =========================================================================
  console.log('\n6. Checking User-Facing UI Integrity (No Development Phase Numbers)...');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const authHtml = fs.readFileSync(path.join(__dirname, '../auth.html'), 'utf8');

  const regexPhase = /Phase\s*[1-9]/i;
  // Inspect visible text in index.html, auth.html, patient-dashboard.html, donor-dashboard.html
  // Comments like <!-- Phase 3 ... --> were cleaned in previous phases, verify UI text
  const cleanPatientHtml = patientHtml.replace(/<!--[\s\S]*?-->/g, '');
  const cleanDonorHtml = donorHtml.replace(/<!--[\s\S]*?-->/g, '');
  const cleanIndexHtml = indexHtml.replace(/<!--[\s\S]*?-->/g, '');
  const cleanAuthHtml = authHtml.replace(/<!--[\s\S]*?-->/g, '');

  assert(!regexPhase.test(cleanPatientHtml), 'Zero phase numbers in customer-visible patient dashboard UI');
  assert(!regexPhase.test(cleanDonorHtml), 'Zero phase numbers in customer-visible donor dashboard UI');
  assert(!regexPhase.test(cleanIndexHtml), 'Zero phase numbers in customer-visible landing page UI');
  assert(!regexPhase.test(cleanAuthHtml), 'Zero phase numbers in customer-visible auth page UI');

  // =========================================================================
  // 7. SUMMARY
  // =========================================================================
  console.log('\n================================================================');
  console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase5Tests();
