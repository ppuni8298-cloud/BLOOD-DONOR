/**
 * BLOODLINK: SUPER ADMIN COMMAND CENTER & GLOBAL PLATFORM INTELLIGENCE TEST
 * Validates:
 * 1. Supabase migration 20261125000008_super_admin_command_center.sql, tables, RLS & triggers
 * 2. Flask REST APIs in backend/routes/admin_routes.py & app.py blueprint registration
 * 3. Frontend Super Admin Command Center (admin-dashboard.html, CSS, JS services, 3D Globe)
 * 4. Zero Development Phase Numbers in Customer UI across all HTML pages
 */

const fs = require('fs');
const path = require('path');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failedTests++;
  }
}

console.log('\n================================================================');
console.log('🛡️ BLOODLINK: SUPER ADMIN COMMAND CENTER VERIFICATION TEST');
console.log('================================================================');

try {
  // =========================================================================
  // 1. SUPABASE DATABASE MIGRATIONS & SCHEMA
  // =========================================================================
  console.log('\n1. Checking Supabase Database Migration & Schema...');
  const migrationPath = path.join(__dirname, '../supabase/migrations/20261125000008_super_admin_command_center.sql');
  assert(fs.existsSync(migrationPath), 'Phase 7 SQL migration file exists');

  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.admin_roles'), 'Table admin_roles created');
  assert(migrationSql.includes('super_admin') && migrationSql.includes('operations_admin') && migrationSql.includes('verification_admin'), 'Granular admin roles defined');
  assert(migrationSql.includes('FUNCTION public.is_super_admin'), 'Security function is_super_admin defined');
  assert(migrationSql.includes('FUNCTION public.has_admin_role'), 'Security function has_admin_role defined');

  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.facility_verification_reviews'), 'Table facility_verification_reviews created');
  assert(migrationSql.includes('additional_documentation_requested'), 'Verification decision workflows defined');

  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.admin_action_logs'), 'Table admin_action_logs created');
  assert(migrationSql.includes('REVOKE UPDATE, DELETE ON public.admin_action_logs'), 'Immutable append-only protection on admin_action_logs enforced');

  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.security_incidents'), 'Table security_incidents created');
  assert(migrationSql.includes('generate_security_incident_code'), 'Trigger for incident codes INC-YYYY-XXXXX implemented');

  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.platform_announcements'), 'Table platform_announcements created');
  assert(migrationSql.includes('generate_announcement_code'), 'Trigger for broadcast codes ANN-YYYY-XXXXX implemented');

  assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.system_configuration'), 'Table system_configuration created');
  assert(migrationSql.includes('protect_clinical_rules_configuration') || migrationSql.includes('protect_clinical_rules'), 'Clinical rules modification protection trigger implemented');

  assert(migrationSql.includes('ENABLE ROW LEVEL SECURITY'), 'Row Level Security enabled across admin tables');

  const provisionScriptPath = path.join(__dirname, '../scripts/provision_super_admin.py');
  assert(fs.existsSync(provisionScriptPath), 'Secure Super Admin provisioning utility exists');

  // =========================================================================
  // 2. FLASK REST API ROUTES & SERVICE LAYER
  // =========================================================================
  console.log('\n2. Checking Flask REST API Routes & Service Layer...');
  const adminRoutesPath = path.join(__dirname, '../backend/routes/admin_routes.py');
  assert(fs.existsSync(adminRoutesPath), 'admin_routes.py exists');

  const adminRoutesPy = fs.readFileSync(adminRoutesPath, 'utf8');
  assert(adminRoutesPy.includes('/api/v1/admin/dashboard'), 'Dashboard metrics endpoint registered');
  assert(adminRoutesPy.includes('/api/v1/admin/users'), 'User management list endpoint registered');
  assert(adminRoutesPy.includes('/api/v1/admin/users/<user_id>/status'), 'User status modification endpoint registered');
  assert(adminRoutesPy.includes('/api/v1/admin/facilities'), 'Facility verification queue endpoint registered');
  assert(adminRoutesPy.includes('/api/v1/admin/facilities/<facility_id>/review'), 'Facility accreditation review endpoint registered');
  assert(adminRoutesPy.includes('/api/v1/admin/emergency-operations'), 'Global emergency operations endpoint registered');
  assert(adminRoutesPy.includes('/api/v1/admin/inventory-overview'), 'Platform inventory intelligence endpoint registered');
  assert(adminRoutesPy.includes('/api/v1/admin/analytics'), 'Global analytics endpoint registered');
  assert(adminRoutesPy.includes('/api/v1/admin/announcements'), 'Platform announcements & broadcast endpoint registered');
  assert(adminRoutesPy.includes('/api/v1/admin/security/events'), 'Security audit events stream endpoint registered');
  assert(adminRoutesPy.includes('/api/v1/admin/security/incidents'), 'Security incidents management endpoint registered');
  assert(adminRoutesPy.includes('/api/v1/admin/configuration'), 'System configuration endpoint registered');
  assert(adminRoutesPy.includes('/api/v1/admin/roles'), 'Admin role management endpoint registered');

  const appPyPath = path.join(__dirname, '../backend/app.py');
  const appPy = fs.readFileSync(appPyPath, 'utf8');
  assert(appPy.includes('admin_bp'), 'admin_bp registered in backend/app.py');

  const routesInitPath = path.join(__dirname, '../backend/routes/__init__.py');
  const routesInit = fs.readFileSync(routesInitPath, 'utf8');
  assert(routesInit.includes('admin_bp'), 'admin_bp exported in backend/routes/__init__.py');

  const pytestPath = path.join(__dirname, '../backend/tests/test_admin_routes.py');
  assert(fs.existsSync(pytestPath), 'Pytest test_admin_routes.py exists');

  // =========================================================================
  // 3. SUPER ADMIN COMMAND CENTER FRONTEND
  // =========================================================================
  console.log('\n3. Checking Super Admin Command Center Frontend...');
  const adminHtmlPath = path.join(__dirname, '../admin-dashboard.html');
  assert(fs.existsSync(adminHtmlPath), 'admin-dashboard.html exists');

  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
  assert(adminHtml.includes('id="tab-overview"'), 'Global Overview module present');
  assert(adminHtml.includes('id="tab-users"'), 'User Administration module present');
  assert(adminHtml.includes('id="tab-facilities"'), 'Facility Accreditation module present');
  assert(adminHtml.includes('id="tab-emergency"'), 'Emergency Operations module present');
  assert(adminHtml.includes('id="tab-inventory"'), 'Inventory Intelligence module present');
  assert(adminHtml.includes('id="tab-analytics"'), 'Analytics & Reports module present');
  assert(adminHtml.includes('id="tab-broadcast"'), 'Broadcast & Alerts module present');
  assert(adminHtml.includes('id="tab-security"'), 'Security & Incidents module present');
  assert(adminHtml.includes('id="tab-configuration"'), 'System Configuration module present');
  assert(adminHtml.includes('id="tab-roles"'), 'Admin Access Control module present');

  assert(adminHtml.includes('id="user-status-modal"'), 'User Status Modal present');
  assert(adminHtml.includes('id="facility-review-modal"'), 'Facility Accreditation Review Modal present');
  assert(adminHtml.includes('id="broadcast-modal"'), 'Targeted Broadcast Modal present');
  assert(adminHtml.includes('id="incident-modal"'), 'Security Incident Modal present');
  assert(adminHtml.includes('id="config-modal"'), 'System Configuration Modal present');
  assert(adminHtml.includes('id="role-modal"'), 'Admin Role Modal present');

  assert(adminHtml.includes('id="admin-3d-globe-viewport"'), '3D Network Telemetry Globe viewport present');
  assert(adminHtml.includes('ADMINISTRATIVE &amp; CLINICAL GOVERNANCE NOTICE') || adminHtml.includes('ADMINISTRATIVE & CLINICAL GOVERNANCE NOTICE'), 'Statutory Administrative Governance Notice displayed');
  assert(adminHtml.includes('btn-logout'), 'Logout button with btn-logout class present');

  const adminCssPath = path.join(__dirname, '../css/admin-command-center.css');
  assert(fs.existsSync(adminCssPath), 'admin-command-center.css exists');

  const adminServicePath = path.join(__dirname, '../js/admin/admin-service.js');
  assert(fs.existsSync(adminServicePath), 'admin-service.js exists');

  const adminGlobePath = path.join(__dirname, '../js/admin/admin-3d-globe.js');
  assert(fs.existsSync(adminGlobePath), 'admin-3d-globe.js exists');

  const adminCcPath = path.join(__dirname, '../js/admin/admin-command-center.js');
  assert(fs.existsSync(adminCcPath), 'admin-command-center.js exists');

  // =========================================================================
  // 4. ZERO DEVELOPMENT PHASE NUMBERS IN CUSTOMER UI
  // =========================================================================
  console.log('\n4. Checking Zero Development Phase Numbers in Customer UI...');
  const customerFacingHtmlFiles = [
    'index.html',
    'auth.html',
    'find-blood.html',
    'donor-dashboard.html',
    'patient-dashboard.html',
    'hospital-dashboard.html',
    'bloodbank-dashboard.html',
    'admin-dashboard.html'
  ];

  // Regex looking for Phase followed by numbers 1-9 in visible text
  const phaseRegex = />[^<]*\b(Phase\s+[1-9]|Phase-[1-9])\b[^<]*</i;

  customerFacingHtmlFiles.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const match = content.match(phaseRegex);
      assert(!match, `No phase numbers displayed in ${file}`);
    }
  });

  // Also verify that public registration in auth.html does not allow selecting super_admin
  const authHtml = fs.readFileSync(path.join(__dirname, '../auth.html'), 'utf8');
  assert(!authHtml.includes('data-role="super_admin"'), 'Super Admin is not selectable during public registration in auth.html');

} catch (err) {
  console.error('Test execution exception:', err);
  failedTests++;
}

console.log('\n================================================================');
console.log(`Phase 7 Test Results: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
