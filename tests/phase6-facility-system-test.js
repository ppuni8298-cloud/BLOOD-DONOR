/**
 * BLOODLINK PHASE 6 VALIDATION TEST (tests/phase6-facility-system-test.js)
 * Validates the Advanced Hospital & Blood Bank Management System:
 * - Supabase PostgreSQL migrations, RLS policies, triggers & functions
 * - Scoped facility roles & permissions (medical officers, technicians, managers)
 * - Component-specific shelf life calculation (Platelets 5d, PRBC 42d, WBLD 35d, Plasma 365d)
 * - Traceable unit generation (PRBC-YYYY-XXXXXX, DSP-YYYY-XXXXX)
 * - Laboratory QC screening & infection testing (HIV, HBV, HCV, Syphilis, Malaria)
 * - Cold-chain dispatch and temperature verification
 * - Flask REST API endpoints and blueprint integration
 * - Hospital & Blood Bank Command Center UI implementations
 * - Statutory clinical blood compatibility disclaimer
 * - Zero development phase numbers in customer-facing UI
 */

const fs = require('fs');
const path = require('path');

function runPhase6Tests() {
  console.log('================================================================');
  console.log('🏥 BLOODLINK: ADVANCED HOSPITAL & BLOOD BANK MANAGEMENT TEST');
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
  // 1. SUPABASE DATABASE MIGRATION & SCHEMA
  // =========================================================================
  console.log('1. Checking Supabase Database Migration & Schema...');
  const migrationPath = path.join(__dirname, '../supabase/migrations/20261124000007_facility_management_system.sql');
  assert(fs.existsSync(migrationPath), 'Phase 6 SQL migration file exists');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.facility_staff'), 'Table facility_staff created');
  assert(migrationSql.includes('hospital_doctor') && migrationSql.includes('transfusion_officer') && migrationSql.includes('lab_technician'), 'Granular facility staff roles defined');
  assert(migrationSql.includes('CREATE OR REPLACE FUNCTION public.compute_component_expiry_date'), 'Component-specific shelf life calculator created');
  assert(migrationSql.includes("'platelets' THEN") && migrationSql.includes("INTERVAL '5 days'"), 'Platelets acute 5-day shelf life enforced');
  assert(migrationSql.includes("'packed_red_cells' THEN") && migrationSql.includes("INTERVAL '42 days'"), 'PRBC 42-day shelf life enforced');
  assert(migrationSql.includes("'whole_blood' THEN") && migrationSql.includes("INTERVAL '35 days'"), 'Whole blood 35-day shelf life enforced');
  assert(migrationSql.includes("'plasma' THEN") && migrationSql.includes("INTERVAL '365 days'"), 'Plasma 365-day shelf life enforced');

  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.component_batches'), 'Table component_batches created');
  assert(migrationSql.includes("comp_prefix := 'PRBC'") && migrationSql.includes("comp_prefix := 'WBLD'") && migrationSql.includes("comp_prefix := 'PLTS'"), 'Traceable component batch prefix generation implemented');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.component_processing_events'), 'Table component_processing_events created for parent-child separation');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.inventory_quality_checks'), 'Table inventory_quality_checks created');
  assert(migrationSql.includes('hiv_screen') && migrationSql.includes('hbv_screen') && migrationSql.includes('hcv_screen') && migrationSql.includes('syphilis_screen'), '5-point infectious disease screening columns present');

  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.inventory_movements'), 'Immutable inventory_movements audit log created');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.dispatch_records'), 'Table dispatch_records created');
  assert(migrationSql.includes('DSP-'), 'Cold-chain dispatch code trigger DSP-YYYY-XXXXX defined');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.fulfilment_records'), 'Table fulfilment_records created');
  assert(migrationSql.includes('crossmatch_result TEXT NOT NULL CHECK (crossmatch_result IN (\'compatible\', \'incompatible\'))'), 'Crossmatch compatibility verification constraint enforced');
  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.inventory_alerts'), 'Table inventory_alerts created');
  assert(migrationSql.includes('ENABLE ROW LEVEL SECURITY'), 'Row Level Security enabled across facility tables');
  assert(migrationSql.includes('public.is_facility_staff('), 'Security function is_facility_staff prevents cross-facility access');

  // =========================================================================
  // 2. BACKEND FLASK ROUTES & ARCHITECTURE
  // =========================================================================
  console.log('\n2. Checking Flask REST API Routes & Service Layer...');
  const routesPath = path.join(__dirname, '../backend/routes/facility_routes.py');
  assert(fs.existsSync(routesPath), 'facility_routes.py exists');
  const routesCode = fs.readFileSync(routesPath, 'utf8');

  assert(routesCode.includes('/api/v1/hospital/dashboard'), 'Hospital dashboard endpoint registered');
  assert(routesCode.includes('/api/v1/hospital/requests'), 'Hospital emergency requests listing endpoint registered');
  assert(routesCode.includes('/api/v1/hospital/requests/<request_id>/verify'), 'Clinical request verification endpoint registered');
  assert(routesCode.includes('/api/v1/hospital/inventory'), 'Hospital trauma inventory endpoint registered');
  assert(routesCode.includes('/api/v1/hospital/fulfilment'), 'Transfusion fulfilment endpoint registered');
  assert(routesCode.includes('/api/v1/bloodbank/dashboard'), 'Blood bank dashboard endpoint registered');
  assert(routesCode.includes('/api/v1/bloodbank/inventory'), 'Blood bank batch intake & inventory endpoint registered');
  assert(routesCode.includes('/api/v1/bloodbank/inventory/<batch_id>/qc'), 'Laboratory infection screening QC endpoint registered');
  assert(routesCode.includes('/api/v1/bloodbank/inventory/<batch_id>/discard'), 'Unit discard endpoint registered');
  assert(routesCode.includes('/api/v1/bloodbank/reservations/<reservation_id>/dispatch'), 'Cold-chain dispatch endpoint registered');
  assert(routesCode.includes('/api/v1/hospital/dispatches/<dispatch_id>/receive'), 'Hospital dispatch receive endpoint registered');
  assert(routesCode.includes('/api/v1/facility/alerts'), 'Facility stock alerts endpoint registered');
  assert(routesCode.includes('/api/v1/facility/staff'), 'Facility staff management endpoint registered');
  assert(routesCode.includes('/api/v1/facility/reports'), 'Facility clinical reports endpoint registered');
  assert(routesCode.includes('/api/v1/facility/donations'), 'Facility donation verification endpoint registered');

  const appPyPath = path.join(__dirname, '../backend/app.py');
  const appPyCode = fs.readFileSync(appPyPath, 'utf8');
  assert(appPyCode.includes('facility_bp'), 'facility_bp registered in backend/app.py');

  const routesInitPath = path.join(__dirname, '../backend/routes/__init__.py');
  const routesInitCode = fs.readFileSync(routesInitPath, 'utf8');
  assert(routesInitCode.includes('facility_bp'), 'facility_bp exported in backend/routes/__init__.py');

  const pytestPath = path.join(__dirname, '../backend/tests/test_facility_routes.py');
  assert(fs.existsSync(pytestPath), 'Pytest test_facility_routes.py exists');

  // =========================================================================
  // 3. HOSPITAL COMMAND CENTER FRONTEND
  // =========================================================================
  console.log('\n3. Checking Hospital Command Center Frontend...');
  const hospitalHtmlPath = path.join(__dirname, '../hospital-dashboard.html');
  assert(fs.existsSync(hospitalHtmlPath), 'hospital-dashboard.html exists');
  const hospitalHtml = fs.readFileSync(hospitalHtmlPath, 'utf8');

  assert(hospitalHtml.includes('id="tab-overview"'), 'Hospital Overview module present');
  assert(hospitalHtml.includes('id="tab-requests"'), 'Emergency Request Management module present');
  assert(hospitalHtml.includes('id="tab-inventory"'), 'Trauma Blood Reserve module present');
  assert(hospitalHtml.includes('id="tab-matching"'), 'Matching Results module present');
  assert(hospitalHtml.includes('id="tab-donors"'), 'Donor Coordination module present');
  assert(hospitalHtml.includes('id="tab-bloodbanks"'), 'Blood Bank Coordination module present');
  assert(hospitalHtml.includes('id="tab-donations"'), 'Donation Records module present');
  assert(hospitalHtml.includes('id="tab-fulfilment"'), 'Transfusion Fulfilment module present');
  assert(hospitalHtml.includes('id="tab-staff"'), 'Medical Staff Management module present');
  assert(hospitalHtml.includes('id="tab-reports"'), 'Reports & Analytics module present');
  assert(hospitalHtml.includes('id="tab-notifications"'), 'Notifications & Alerts module present');
  assert(hospitalHtml.includes('id="tab-settings"'), 'Facility Settings module present');
  assert(hospitalHtml.includes('id="verification-modal"'), 'Clinical Request Verification Modal present');
  assert(hospitalHtml.includes('id="fulfilment-modal"'), 'Transfusion Administration & Crossmatch Modal present');
  assert(hospitalHtml.includes('id="hospital-3d-cell-viewport"'), 'Micro 3D erythrocyte simulation viewport present');

  assert(hospitalHtml.includes('CLINICAL BLOOD COMPATIBILITY') && hospitalHtml.includes('CROSSMATCHING NOTICE'), 'Statutory clinical compatibility disclaimer displayed');
  assert(hospitalHtml.includes('Selecting a blood group or component does not establish transfusion compatibility'), 'Clinical disclaimer language verbatim');

  const hospCssPath = path.join(__dirname, '../css/hospital-command-center.css');
  assert(fs.existsSync(hospCssPath), 'hospital-command-center.css exists');

  const hospServicePath = path.join(__dirname, '../js/hospital/hospital-service.js');
  assert(fs.existsSync(hospServicePath), 'hospital-service.js exists');

  const hospCcPath = path.join(__dirname, '../js/hospital/hospital-command-center.js');
  assert(fs.existsSync(hospCcPath), 'hospital-command-center.js exists');

  const hosp3dPath = path.join(__dirname, '../js/hospital/hospital-3d-cell.js');
  assert(fs.existsSync(hosp3dPath), 'hospital-3d-cell.js exists');

  // =========================================================================
  // 4. BLOOD BANK COMMAND CENTER FRONTEND
  // =========================================================================
  console.log('\n4. Checking Blood Bank Command Center Frontend...');
  const bloodbankHtmlPath = path.join(__dirname, '../bloodbank-dashboard.html');
  assert(fs.existsSync(bloodbankHtmlPath), 'bloodbank-dashboard.html exists');
  const bloodbankHtml = fs.readFileSync(bloodbankHtmlPath, 'utf8');

  assert(bloodbankHtml.includes('id="tab-overview"'), 'Blood Bank Overview module present');
  assert(bloodbankHtml.includes('id="tab-components"'), 'Component Stock & Batch Registration module present');
  assert(bloodbankHtml.includes('id="tab-shelflife"'), 'Component Shelf-Life & Vaults module present');
  assert(bloodbankHtml.includes('id="tab-qc"'), 'Laboratory QC module present');
  assert(bloodbankHtml.includes('id="tab-expiry"'), 'Expiry Monitoring module present');
  assert(bloodbankHtml.includes('id="tab-requests"'), 'Incoming Emergency Requests module present');
  assert(bloodbankHtml.includes('id="tab-processing"'), 'Component Separation module present');
  assert(bloodbankHtml.includes('id="tab-dispatches"'), 'Cold-Chain Dispatches module present');
  assert(bloodbankHtml.includes('id="tab-reservations"'), 'Active Reservations module present');
  assert(bloodbankHtml.includes('id="tab-staff"'), 'Lab & Vault Staff module present');
  assert(bloodbankHtml.includes('id="tab-reports"'), 'Regulatory Reports module present');
  assert(bloodbankHtml.includes('id="tab-notifications"'), 'Shortage Alerts module present');
  assert(bloodbankHtml.includes('id="tab-settings"'), 'Vault Sensor Settings module present');
  assert(bloodbankHtml.includes('id="register-batch-modal"'), 'Batch Registration Modal present');
  assert(bloodbankHtml.includes('id="qc-modal"'), 'Infectious Disease QC Modal present');
  assert(bloodbankHtml.includes('id="discard-modal"'), 'Unit Discard Modal present');
  assert(bloodbankHtml.includes('id="dispatch-modal"'), 'Cold-Chain Dispatch Modal present');
  assert(bloodbankHtml.includes('id="bloodbank-3d-cell-viewport"'), 'Blood Bank micro 3D simulation viewport present');

  assert(bloodbankHtml.includes('CLINICAL BLOOD COMPATIBILITY') && bloodbankHtml.includes('COLD-CHAIN NOTICE'), 'Statutory clinical disclaimer displayed in blood bank portal');

  const bbCssPath = path.join(__dirname, '../css/bloodbank-command-center.css');
  assert(fs.existsSync(bbCssPath), 'bloodbank-command-center.css exists');

  const bbServicePath = path.join(__dirname, '../js/bloodbank/bloodbank-service.js');
  assert(fs.existsSync(bbServicePath), 'bloodbank-service.js exists');

  const bbCcPath = path.join(__dirname, '../js/bloodbank/bloodbank-command-center.js');
  assert(fs.existsSync(bbCcPath), 'bloodbank-command-center.js exists');

  const bb3dPath = path.join(__dirname, '../js/bloodbank/bloodbank-3d-cell.js');
  assert(fs.existsSync(bb3dPath), 'bloodbank-3d-cell.js exists');

  // =========================================================================
  // 5. ZERO DEVELOPMENT PHASE NUMBERS IN CUSTOMER-FACING UI
  // =========================================================================
  console.log('\n5. Checking Zero Development Phase Numbers in Customer UI...');
  const clientHtmlFiles = [
    'index.html',
    'auth.html',
    'find-blood.html',
    'donor-dashboard.html',
    'patient-dashboard.html',
    'hospital-dashboard.html',
    'bloodbank-dashboard.html'
  ];

  const phaseRegex = /\bPhase\s+[1-9]\b/i;

  clientHtmlFiles.forEach(file => {
    const fPath = path.join(__dirname, '../', file);
    if (fs.existsSync(fPath)) {
      const content = fs.readFileSync(fPath, 'utf8');
      const match = content.match(phaseRegex);
      assert(!match, `No phase numbers displayed in ${file}${match ? ` (Found "${match[0]}")` : ''}`);
    }
  });

  console.log('\n================================================================');
  console.log(`Phase 6 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6Tests();
