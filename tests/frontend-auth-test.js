/**
 * BLOODLINK - FRONTEND ARCHITECTURE & SECURITY TEST SUITE (frontend-auth-test.js)
 * Executes offline verification of:
 * - Security rules & no service-role key leakage
 * - SQL migration validity & RLS table coverage
 * - Role-based dashboard shells & route guards
 * - HTML structure & script inclusions
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

console.log('\n======================================================');
console.log('🩸 BLOODLINK PHASE 2 - ARCHITECTURAL VERIFICATION SUITE');
console.log('======================================================\n');

// 1. Check SQL Migrations
console.log('1. DATABASE MIGRATIONS & RLS COVERAGE:');
const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

runTest('Migrations folder contains required SQL files', () => {
  assert.ok(migrationFiles.length >= 3, `Expected at least 3 migrations, found ${migrationFiles.length}`);
});

const rlsSql = fs.readFileSync(path.join(migrationsDir, '20261124000002_row_level_security.sql'), 'utf-8');
const requiredRlsTables = ['profiles', 'user_roles', 'donor_profiles', 'hospitals', 'blood_banks', 'audit_logs'];

requiredRlsTables.forEach(table => {
  runTest(`RLS is explicitly enabled on table '${table}'`, () => {
    assert.ok(
      rlsSql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`),
      `Missing ENABLE ROW LEVEL SECURITY for ${table}`
    );
  });
});

// 2. Check Security: No Service Role Key in Frontend Files
console.log('\n2. CYBERSECURITY: SERVICE ROLE KEY LEAK PREVENTION:');
function scanDirForSecrets(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      scanDirForSecrets(fullPath);
    } else if (file.endsWith('.js') || file.endsWith('.html')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      runTest(`No hardcoded service_role secrets in ${file}`, () => {
        assert.ok(!content.includes('service_role'), `Found dangerous 'service_role' reference in ${file}`);
        assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY='), `Found raw service key in ${file}`);
      });
    }
  });
}
scanDirForSecrets(path.join(__dirname, '..', 'js'));

// 3. Check Dashboards & Route Guards
console.log('\n3. ROLE-BASED DASHBOARD SHELLS & GUARDS:');
const dashboards = [
  { file: 'donor-dashboard.html', role: 'donor' },
  { file: 'patient-dashboard.html', role: 'patient' },
  { file: 'hospital-dashboard.html', role: 'hospital' },
  { file: 'bloodbank-dashboard.html', role: 'blood_bank' }
];

dashboards.forEach(({ file, role }) => {
  runTest(`Dashboard '${file}' exists and enforces role '${role}'`, () => {
    const p = path.join(__dirname, '..', file);
    assert.ok(fs.existsSync(p), `Missing file ${file}`);
    const content = fs.readFileSync(p, 'utf-8');
    assert.ok(content.includes('BloodLinkSession.requireAuth'), `Missing requireAuth call in ${file}`);
    assert.ok(content.includes(role), `Missing role restriction for ${role} in ${file}`);
    assert.ok(content.includes('btn-logout'), `Missing logout button in ${file}`);
    assert.ok(content.includes('@supabase/supabase-js'), `Missing Supabase SDK script in ${file}`);
  });
});

// 4. Check Reset Password Page
console.log('\n4. PASSWORD RESET PAGE:');
runTest('reset-password.html exists with updateUser handler', () => {
  const p = path.join(__dirname, '..', 'reset-password.html');
  assert.ok(fs.existsSync(p), 'Missing reset-password.html');
  const content = fs.readFileSync(p, 'utf-8');
  assert.ok(content.includes('supabase.auth.updateUser'), 'Missing updateUser call in reset-password.html');
});

// 5. Check Environment Templates
console.log('\n5. CONFIGURATION & GIT EXCLUSIONS:');
runTest('.env.example contains required variables', () => {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf-8');
  assert.ok(envContent.includes('SUPABASE_URL='), 'Missing SUPABASE_URL');
  assert.ok(envContent.includes('SUPABASE_ANON_KEY='), 'Missing SUPABASE_ANON_KEY');
  assert.ok(envContent.includes('SUPABASE_SERVICE_ROLE_KEY='), 'Missing SUPABASE_SERVICE_ROLE_KEY');
  assert.ok(envContent.includes('SUPABASE_JWT_SECRET='), 'Missing SUPABASE_JWT_SECRET');
});

runTest('.gitignore ignores .env and Python cache', () => {
  const gitignoreContent = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf-8');
  assert.ok(gitignoreContent.includes('.env'), 'Missing .env in .gitignore');
  assert.ok(gitignoreContent.includes('__pycache__/'), 'Missing __pycache__ in .gitignore');
});

console.log(`\n======================================================`);
console.log(`SUMMARY: ${passedTests}/${totalTests} tests passed successfully.`);
console.log('======================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
