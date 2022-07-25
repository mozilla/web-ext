#!/usr/bin/env node

// This nodejs script loads the .nsprc's "exceptions" list (as `nsp check` used to support) and
// and then filters the output of `npm audit --json` to check if any of the security advisories
// detected should be a blocking issue and force the CI job to fail.
//
// We can remove this script if/once npm audit will support this feature natively
// (See https://github.com/npm/npm/issues/20565).

import shell from 'shelljs';
import stripJsonComments from 'strip-json-comments';

const npmVersion = parseInt(shell.exec('npm --version', {silent: true}).stdout.split('.')[0], 10);
const npmCmd = npmVersion >= 6 ? 'npm' : 'npx npm@latest';

if (npmCmd.startsWith('npx') && !shell.which('npx')) {
  shell.echo('Sorry, this script requires npm >= 6 or npx installed globally');
  shell.exit(1);
}

if (!shell.test('-f', 'package-lock.json')) {
  console.log('audit-deps is generating the missing package-lock.json file');
  shell.exec(`${npmCmd} i --package-lock-only`);
}

// Collect audit results and split them into blocking and ignored issues.
function getNpmAuditJSON() {
  const res = shell.exec(`${npmCmd} audit --json`, {silent: true});
  if (res.code !== 0) {
    try {
      return JSON.parse(res.stdout);
    } catch (err) {
      console.error('Error parsing npm audit output:', res.stdout);
      throw err;
    }
  }
  // npm audit didn't found any security advisories.
  return null;
}

const blockingIssues = [];
const ignoredIssues = [];
let auditReport = getNpmAuditJSON();

if (auditReport) {
  const cmdres = shell.cat('.nsprc');
  const {exceptions} = JSON.parse(stripJsonComments(cmdres.stdout));

  if (auditReport.error) {
    if (auditReport.error.code === 'ENETUNREACH') {
      console.log('npm was not able to reach the api endpoint:', auditReport.error.summary);
      console.log('Retrying...');
      auditReport = getNpmAuditJSON();
    }

    // If the error code is not ENETUNREACH or it fails again after a single retry
    // just log the audit error and exit with error code 2.
    if (auditReport.error) {
      console.error('npm audit error:', auditReport.error);
      process.exit(2);
    }
  }

  if (auditReport.auditReportVersion > 2) {
    // Throw a more clear error when a new format that this script does not expect
    // has been introduced.
    console.error(
      'ERROR: npm audit JSON is using a new format not yet supported.',
      '\nPlease file a bug in the github repository and attach the following JSON data sample to it:',
      `\n\n${JSON.stringify(auditReport, null, 2)}`
    );
  } else if (auditReport.auditReportVersion === 2) {
    // New npm audit json format introduced in npm v8.
    for (const vulnerablePackage of Object.keys(auditReport.vulnerabilities)) {
      const item = auditReport.vulnerabilities[vulnerablePackage];

      if (item.via.every((via) => exceptions.includes(via.url))) {
        ignoredIssues.push(item);
        continue;
      }
      blockingIssues.push(item);
    }
  } else {
    // Old npm audit json format for npm versions < npm v8
    for (const advId of Object.keys(auditReport.advisories)) {
      const adv = auditReport.advisories[advId];

      if (exceptions.includes(adv.url)) {
        ignoredIssues.push(adv);
        continue;
      }
      blockingIssues.push(adv);
    }
  }
}

// Reporting.

function formatAdvisoryV1(adv) {
  function formatFinding(desc) {
    return `${desc.version}, paths: ${desc.paths.join(', ')}`;
  }
  const findings = adv.findings.map(formatFinding).map((msg) => `  ${msg}`).join('\n');
  return `${adv.module_name} (${adv.url}):\n${findings}`;
}

function formatAdvisoryV2(adv) {
  function formatVia(via) {
    return `${via.url}\n    ${via.dependency} ${via.range}\n    ${via.title}`;
  }
  const entryVia = adv.via.map(formatVia).map((msg) => `  ${msg}`).join('\n');
  const fixAvailable = Boolean(adv.fixAvailable);
  const entryDetails = `isDirect: ${adv.isDirect}, severity: ${adv.severity}, fixAvailable: ${fixAvailable}`;
  return `${adv.name} (${entryDetails}):\n${entryVia}`;
}

function formatAdvisory(adv) {
  return auditReport.auditReportVersion === 2
    ? formatAdvisoryV2(adv)
    : formatAdvisoryV1(adv);
}

if (ignoredIssues.length > 0) {
  console.log('\n== audit-deps: ignored security issues (based on .nsprc exceptions)\n');

  for (const adv of ignoredIssues) {
    console.log(formatAdvisory(adv));
  }
}

if (blockingIssues.length > 0) {
  console.log('\n== audit-deps: blocking security issues\n');

  for (const adv of blockingIssues) {
    console.log(formatAdvisory(adv));
  }

  // Exit with error if blocking security issues has been found.
  process.exit(1);
}
