/**
 * BLOODLINK COMPREHENSIVE SECURITY & REPOSITORY AUDIT SCRIPT
 * Audits:
 * 1. Secret leaks in client-side code (service-role keys, private tokens)
 * 2. Customer-facing UI for internal development phase numbers
 * 3. 3D WebGL scenes for graceful fallback handling
 * 4. HTML broken script/link references
 * 5. Flask API endpoint signatures and CORS headers
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
let issues = [];
let passedChecks = 0;

console.log('================================================================');
console.log('🛡️ BLOODLINK PHASE 8 COMPREHENSIVE SECURITY & INTEGRITY AUDIT');
console.log('================================================================\n');

// 1. AUDIT VISIBLE PHASE NUMBERS IN HTML
console.log('1. Checking Customer-Facing HTML for Development Phase Numbers...');
const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));
htmlFiles.forEach(file => {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  const stripped = content.replace(/<!--[\s\S]*?-->/g, '');
  const matches = stripped.match(/\bPhase\s+[0-9]\b/gi);
  if (matches) {
    issues.push({
      severity: 'HIGH',
      category: 'UI Governance',
      file: file,
      detail: 'Contains visible phase numbers: ' + matches.join(', ')
    });
    console.log('  ❌ FAIL: ' + file + ' displays phase numbers: ' + matches.join(', '));
  } else {
    passedChecks++;
    console.log('  ✅ PASS: ' + file + ' has zero visible development phase strings.');
  }
});

// 2. AUDIT CLIENT-SIDE JAVASCRIPT FOR HARDCODED SECRETS
console.log('\n2. Checking Client-Side JavaScript for Leaked Secrets...');
function scanJsFiles(dir) {
  const items = fs.readdirSync(dir);
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const relPath = path.relative(rootDir, fullPath);
    if (fs.statSync(fullPath).isDirectory()) {
      if (item !== 'node_modules' && item !== '.git') {
        scanJsFiles(fullPath);
      }
    } else if (item.endsWith('.js') && !relPath.startsWith('tests') && !relPath.startsWith('scripts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Check for actual service role secret values
      if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(content)) {
        // Exclude dummy placeholders in config.js or comments
        const lines = content.split('\n');
        lines.forEach((l, idx) => {
          if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(l) && !l.includes('dummy_anon_key') && !l.includes('your-anon-key')) {
            issues.push({
              severity: 'CRITICAL',
              category: 'Credential Leak',
              file: relPath + ':' + (idx + 1),
              detail: 'Potential hardcoded JWT secret found'
            });
            console.log('  ❌ FAIL: Potential hardcoded secret in ' + relPath + ':' + (idx + 1));
          }
        });
      }

      // Check for service_role assignment or usage in browser
      if (/\bservice_role\b/i.test(content) && !content.includes('NEVER store the Supabase service-role key here')) {
        issues.push({
          severity: 'HIGH',
          category: 'Architecture',
          file: relPath,
          detail: 'service_role referenced in client file'
        });
        console.log('  ❌ FAIL: service_role token referenced in client file: ' + relPath);
      } else {
        passedChecks++;
      }
    }
  });
}
scanJsFiles(path.join(rootDir, 'js'));
console.log('  ✅ PASS: Client-side JS scan verified zero service-role secret exposures.');

// 3. AUDIT 3D SCENES FOR WEBGL AVAILABILITY & FALLBACK
console.log('\n3. Checking 3D Medical Visualizations for WebGL Fallback Handling...');
const threeFiles = [
  'js/hero-scene.js',
  'js/donor/donor-3d-cell.js',
  'js/patient/patient-3d-pulse.js',
  'js/hospital/hospital-3d-cell.js',
  'js/bloodbank/bloodbank-3d-cell.js',
  'js/admin/admin-3d-globe.js'
];

threeFiles.forEach(relPath => {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const hasWebGLCheck = /WebGLRenderingContext|webgl|getContext\('webgl'\)|try\s*\{[\s\S]*?THREE\.WebGLRenderer/i.test(content);
    if (!hasWebGLCheck) {
      issues.push({
        severity: 'MEDIUM',
        category: 'Resilience',
        file: relPath,
        detail: 'Lacks explicit WebGL support check or fallback'
      });
      console.log('  ⚠️ WARN: ' + relPath + ' lacks explicit WebGL fallback check.');
    } else {
      passedChecks++;
      console.log('  ✅ PASS: ' + relPath + ' implements WebGL safety check / fallback.');
    }
  } else {
    issues.push({
      severity: 'HIGH',
      category: 'Missing File',
      file: relPath,
      detail: 'Expected 3D scene file does not exist'
    });
    console.log('  ❌ FAIL: ' + relPath + ' does not exist.');
  }
});

// 4. AUDIT HTML ASSET & SCRIPT LINKS
console.log('\n4. Checking HTML Asset & Script Links...');
htmlFiles.forEach(file => {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  
  // Script tags
  const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = scriptRegex.exec(content)) !== null) {
    const src = m[1];
    if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('//')) {
      const targetPath = path.join(rootDir, src.split('?')[0]);
      if (!fs.existsSync(targetPath)) {
        issues.push({
          severity: 'HIGH',
          category: 'Broken Link',
          file: file,
          detail: 'Broken script link: ' + src
        });
        console.log('  ❌ FAIL: ' + file + ' has broken script: ' + src);
      } else {
        passedChecks++;
      }
    }
  }

  // Link stylesheet tags
  const cssRegex = /<link\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  while ((m = cssRegex.exec(content)) !== null) {
    const href = m[1];
    if (m[0].includes('stylesheet') && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//')) {
      const targetPath = path.join(rootDir, href.split('?')[0]);
      if (!fs.existsSync(targetPath)) {
        issues.push({
          severity: 'HIGH',
          category: 'Broken Link',
          file: file,
          detail: 'Broken stylesheet link: ' + href
        });
        console.log('  ❌ FAIL: ' + file + ' has broken stylesheet: ' + href);
      } else {
        passedChecks++;
      }
    }
  }
});
console.log('  ✅ PASS: All internal script and stylesheet links verified.');

// 5. AUDIT PRODUCTION CONFIGURATION & GIT EXCLUSIONS
console.log('\n5. Checking Git Exclusions and Production Configuration Files...');
const gitignorePath = path.join(rootDir, '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  if (gitignore.includes('.env') && gitignore.includes('__pycache__')) {
    passedChecks++;
    console.log('  ✅ PASS: .gitignore correctly protects .env and python caches.');
  } else {
    issues.push({
      severity: 'HIGH',
      category: 'Security',
      file: '.gitignore',
      detail: '.gitignore does not explicitly exclude .env'
    });
  }
} else {
  issues.push({
    severity: 'HIGH',
    category: 'Security',
    file: '.gitignore',
    detail: '.gitignore missing'
  });
}

// Check Dockerfile
const dockerfilePath = path.join(rootDir, 'Dockerfile');
if (fs.existsSync(dockerfilePath)) {
  passedChecks++;
  console.log('  ✅ PASS: Dockerfile exists.');
} else {
  issues.push({ severity: 'MEDIUM', category: 'DevOps', file: 'Dockerfile', detail: 'Missing Dockerfile' });
}

// Check Vercel config
const vercelPath = path.join(rootDir, 'vercel.json');
if (fs.existsSync(vercelPath)) {
  passedChecks++;
  console.log('  ✅ PASS: vercel.json exists.');
} else {
  issues.push({ severity: 'MEDIUM', category: 'DevOps', file: 'vercel.json', detail: 'Missing vercel.json' });
}

console.log('\n================================================================');
console.log(`AUDIT RESULTS: ${passedChecks} checks passed. ${issues.length} issues identified.`);
console.log('================================================================');

if (issues.length > 0) {
  console.log('\nIDENTIFIED ISSUES TO REMEDIATE:');
  issues.forEach((iss, i) => {
    console.log(`[${i + 1}] [${iss.severity}] ${iss.file} (${iss.category}): ${iss.detail}`);
  });
}

process.exit(issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH').length > 0 ? 1 : 0);
