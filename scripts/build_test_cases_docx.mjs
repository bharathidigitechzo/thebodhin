import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const stagingDir = path.resolve('temp_docx_build');

if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

fs.mkdirSync(path.join(stagingDir, '_rels'), { recursive: true });
fs.mkdirSync(path.join(stagingDir, 'word', '_rels'), { recursive: true });

// 1. [Content_Types].xml
const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
fs.writeFileSync(path.join(stagingDir, '[Content_Types].xml'), contentTypesXml, 'utf8');

// 2. _rels/.rels
const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
fs.writeFileSync(path.join(stagingDir, '_rels', '.rels'), relsXml, 'utf8');

// 3. word/_rels/document.xml.rels
const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
fs.writeFileSync(path.join(stagingDir, 'word', '_rels', 'document.xml.rels'), docRelsXml, 'utf8');

// 4. word/styles.xml
const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:color w:val="1E293B"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="160" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`;
fs.writeFileSync(path.join(stagingDir, 'word', 'styles.xml'), stylesXml, 'utf8');

// Helpers for OOXML building
function escapeXml(unsafe) {
  if (typeof unsafe !== 'string') return unsafe;
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function p(text, options = {}) {
  const { bold = false, italic = false, size = 22, color = "1E293B", align = "left", before = 0, after = 140 } = options;
  const jc = align === "center" ? `<w:jc w:val="center"/>` : (align === "right" ? `<w:jc w:val="right"/>` : "");
  return `
  <w:p>
    <w:pPr>
      <w:spacing w:before="${before}" w:after="${after}"/>
      ${jc}
    </w:pPr>
    <w:r>
      <w:rPr>
        ${bold ? '<w:b/>' : ''}
        ${italic ? '<w:i/>' : ''}
        <w:color w:val="${color}"/>
        <w:sz w:val="${size}"/>
        <w:szCs w:val="${size}"/>
      </w:rPr>
      <w:t xml:space="preserve">${escapeXml(text)}</w:t>
    </w:r>
  </w:p>`;
}

function heading1(text) {
  return `
  <w:p>
    <w:pPr>
      <w:spacing w:before="360" w:after="160"/>
      <w:pBdr>
        <w:bottom w:val="single" w:sz="12" w:space="4" w:color="0A3663"/>
      </w:pBdr>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:b/>
        <w:color w:val="0A3663"/>
        <w:sz w:val="28"/>
        <w:szCs w:val="28"/>
      </w:rPr>
      <w:t xml:space="preserve">${escapeXml(text)}</w:t>
    </w:r>
  </w:p>`;
}

function heading2(text) {
  return `
  <w:p>
    <w:pPr>
      <w:spacing w:before="280" w:after="120"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:b/>
        <w:color w:val="D97706"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
      </w:rPr>
      <w:t xml:space="preserve">${escapeXml(text)}</w:t>
    </w:r>
  </w:p>`;
}

function bullet(label, text) {
  return `
  <w:p>
    <w:pPr>
      <w:spacing w:before="40" w:after="80"/>
      <w:ind w:left="360"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:b/>
        <w:color w:val="0A3663"/>
        <w:sz w:val="21"/>
      </w:rPr>
      <w:t xml:space="preserve">${escapeXml(label)} </w:t>
    </w:r>
    <w:r>
      <w:rPr>
        <w:color w:val="334155"/>
        <w:sz w:val="21"/>
      </w:rPr>
      <w:t xml:space="preserve">${escapeXml(text)}</w:t>
    </w:r>
  </w:p>`;
}

function renderTestCaseTable(id, title, priority, role, prereq, steps, testData, expected) {
  const stepsXml = steps.map((s, idx) => `
    <w:p>
      <w:pPr><w:spacing w:before="20" w:after="40"/></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:color w:val="0A3663"/><w:sz w:val="19"/></w:rPr>
        <w:t xml:space="preserve">${idx + 1}. </w:t>
      </w:r>
      <w:r>
        <w:rPr><w:color w:val="1E293B"/><w:sz w:val="19"/></w:rPr>
        <w:t xml:space="preserve">${escapeXml(s)}</w:t>
      </w:r>
    </w:p>
  `).join('');

  const expectedXml = expected.map(e => `
    <w:p>
      <w:pPr><w:spacing w:before="20" w:after="40"/></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:color w:val="059669"/><w:sz w:val="19"/></w:rPr>
        <w:t xml:space="preserve">[OK]  </w:t>
      </w:r>
      <w:r>
        <w:rPr><w:color w:val="065F46"/><w:sz w:val="19"/></w:rPr>
        <w:t xml:space="preserve">${escapeXml(e)}</w:t>
      </w:r>
    </w:p>
  `).join('');

  return `
  <w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
      </w:tblBorders>
    </w:tblPr>
    
    <!-- Row 1: Header / Title -->
    <w:tr>
      <w:tc>
        <w:tcPr>
          <w:tcW w:w="1250" w:type="pct"/>
          <w:shd w:val="clear" w:color="auto" w:fill="0A3663"/>
        </w:tcPr>
        <w:p>
          <w:pPr><w:spacing w:before="80" w:after="80"/><w:jc w:val="center"/></w:pPr>
          <w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="20"/></w:rPr><w:t>Test Case</w:t></w:r>
        </w:p>
      </w:tc>
      <w:tc>
        <w:tcPr>
          <w:tcW w:w="3750" w:type="pct"/>
          <w:gridSpan w:val="3"/>
          <w:shd w:val="clear" w:color="auto" w:fill="F0F9FF"/>
        </w:tcPr>
        <w:p>
          <w:pPr><w:spacing w:before="80" w:after="80"/></w:pPr>
          <w:r><w:rPr><w:b/><w:color w:val="0A3663"/><w:sz w:val="21"/></w:rPr><w:t xml:space="preserve">${escapeXml(id)}: </w:t></w:r>
          <w:r><w:rPr><w:b/><w:color w:val="0F172A"/><w:sz w:val="21"/></w:rPr><w:t xml:space="preserve">${escapeXml(title)}</w:t></w:r>
        </w:p>
      </w:tc>
    </w:tr>

    <!-- Row 2: Priority & Platform -->
    <w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="475569"/></w:rPr><w:t>Priority</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="B45309"/></w:rPr><w:t>${escapeXml(priority)}</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="475569"/></w:rPr><w:t>Platform / Role</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/><w:color w:val="1E293B"/></w:rPr><w:t>${escapeXml(role)}</w:t></w:r></w:p>
      </w:tc>
    </w:tr>

    <!-- Row 3: Prerequisites -->
    <w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="475569"/></w:rPr><w:t>Prerequisites</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="3750" w:type="pct"/><w:gridSpan w:val="3"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/><w:color w:val="334155"/></w:rPr><w:t>${escapeXml(prereq)}</w:t></w:r></w:p>
      </w:tc>
    </w:tr>

    <!-- Row 4: Test Steps -->
    <w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="475569"/></w:rPr><w:t>Execution Steps</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="3750" w:type="pct"/><w:gridSpan w:val="3"/></w:tcPr>
        ${stepsXml}
      </w:tc>
    </w:tr>

    <!-- Row 5: Test Data -->
    <w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="475569"/></w:rPr><w:t>Test Data</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="3750" w:type="pct"/><w:gridSpan w:val="3"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/><w:color w:val="334155"/></w:rPr><w:t>${escapeXml(testData)}</w:t></w:r></w:p>
      </w:tc>
    </w:tr>

    <!-- Row 6: Expected Result -->
    <w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="475569"/></w:rPr><w:t>Expected Results</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="3750" w:type="pct"/><w:gridSpan w:val="3"/></w:tcPr>
        ${expectedXml}
      </w:tc>
    </w:tr>

    <!-- Row 7: QA Status -->
    <w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr>
        <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="475569"/></w:rPr><w:t>QA Status</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="3750" w:type="pct"/><w:gridSpan w:val="3"/></w:tcPr>
        <w:p>
          <w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="19"/><w:color w:val="334155"/></w:rPr><w:t xml:space="preserve">[  ] PASS       [  ] FAIL       [  ] BLOCKED          Tester: __________________   Date: __________</w:t></w:r>
        </w:p>
      </w:tc>
    </w:tr>
  </w:tbl>
  <w:p><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr></w:p>`;
}

// Build Document Body
let bodyXml = '';

// Title & Cover Header
bodyXml += p("BODHIN EDTECH PLATFORM", { bold: true, size: 36, color: "0A3663", align: "center", before: 200, after: 80 });
bodyXml += p("Comprehensive Platform Architecture Analysis & Manual QA Test Suite", { bold: true, size: 24, color: "D97706", align: "center", after: 240 });

// Metadata Block Table
bodyXml += `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="5000" w:type="pct"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Document Version</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>v1.0 (Production / Staging QA)</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Execution Date</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>November 2026</w:t></w:r></w:p></w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Scope of Testing</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>Web LMS, Mobile App, Realtime &amp; Security</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Target Environment</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>Localhost / Vercel Web / EAS Android Preview</w:t></w:r></w:p></w:tc>
  </w:tr>
</w:tbl>
<w:p><w:pPr><w:spacing w:before="180" w:after="180"/></w:pPr></w:p>
`;

// Section 1: Executive Overview
bodyXml += heading1("1. Executive Platform & Architecture Overview");
bodyXml += p("The Bodhin EdTech platform is a multi-tenant Learning Management and Virtual Classroom platform designed for academies, tutors, and students. The system architecture is built across three primary tiers:", { size: 21, color: "334155" });

bodyXml += bullet("1. Web Application (apps/web):", "Next.js 14 App Router powering dedicated dashboards for Super Admins (tenant isolation & metrics), Educators (course curriculum authoring, batch management, invites, storefront), and Tutors (interactive smart board, real-time grading).");
bodyXml += bullet("2. Mobile Application (apps/student):", "React Native & Expo Router delivering cross-platform mobile learning, responsive onboarding, SecureStore token caching, offline lesson storage, and interactive video playback.");
bodyXml += bullet("3. Realtime Backend Tier:", "Supabase PostgreSQL with Row Level Security (RLS) guaranteeing tenant isolation, Realtime presence channels for virtual classrooms, and automated SMTP microservices for transactional mail.");

// Section 2: QA Demo Accounts
bodyXml += heading1("2. Pre-Configured Test Environments & QA Credentials");
bodyXml += p("Authenticate with the following pre-configured credentials to execute role-specific test suites:", { size: 21, color: "334155" });

bodyXml += `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="5000" w:type="pct"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="6" w:space="0" w:color="0A3663"/>
      <w:left w:val="single" w:sz="6" w:space="0" w:color="0A3663"/>
      <w:bottom w:val="single" w:sz="6" w:space="0" w:color="0A3663"/>
      <w:right w:val="single" w:sz="6" w:space="0" w:color="0A3663"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="0A3663"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="19"/></w:rPr><w:t>Platform Role</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="0A3663"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="19"/></w:rPr><w:t>Test Email</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1000" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="0A3663"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="19"/></w:rPr><w:t>Password</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="0A3663"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="19"/></w:rPr><w:t>Target Portal</w:t></w:r></w:p></w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Super Admin</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>admin@demo.in</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1000" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>demo123</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>/admin (Global Console)</w:t></w:r></w:p></w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Educator (Owner)</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>rajesh@demo.in</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1000" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>demo123</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>/educator (Academy Console)</w:t></w:r></w:p></w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Tutor (Faculty)</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>meera@demo.in</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1000" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>demo123</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>/tutor (Live Board &amp; Grading)</w:t></w:r></w:p></w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Student (Learner)</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>arjun@demo.in</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1000" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>demo123</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>Mobile App &amp; /student</w:t></w:r></w:p></w:tc>
  </w:tr>
</w:tbl>
<w:p><w:pPr><w:spacing w:before="180" w:after="180"/></w:pPr></w:p>
`;

// Section 3: Test Suites
bodyXml += heading1("3. Detailed Manual Test Case Specifications");

// Suite 1
bodyXml += heading2("Suite 1: Mobile App Onboarding & Authentication Flow");
bodyXml += renderTestCaseTable(
  "TC-MOB-01",
  "Onboarding Carousel Navigation & Responsive Visual Alignment",
  "High / P1",
  "Student (Mobile App - Expo / Android APK)",
  "Fresh installation of Bodhin Mobile App or cleared application storage cache.",
  [
    "Launch the Bodhin Student mobile app on device or emulator.",
    "Inspect top header area containing Bodhin leaf logo, wordmark, and 'Skip' action.",
    "Verify student hero illustration is centered with rounded corners and consistent padding.",
    "Swipe horizontally to slide 2 ('Learn anywhere'), slide 3 ('Live with mentors'), and slide 4 ('Earn real certificates').",
    "Inspect bottom pagination dot indicators during horizontal swiping."
  ],
  "Touch gestures, multiple screen aspect ratios (360dp - 430dp)",
  [
    "Logo and Skip action remain positioned near top without overlapping status bar.",
    "Hero illustration and slide cards maintain aspect ratio without vertical or horizontal cropping.",
    "Typography remains balanced and readable across all slides.",
    "Pagination dots transition seamlessly to reflect active slide."
  ]
);

bodyXml += renderTestCaseTable(
  "TC-MOB-02",
  "Skip Action & Direct Route to Authentication",
  "Medium / P2",
  "Student (Mobile App)",
  "User is on Slide 1 or Slide 2 of the Onboarding screen.",
  [
    "Tap 'Skip' text button located at top right.",
    "Observe screen transition behavior and target view."
  ],
  "User tap gesture",
  [
    "Onboarding carousel terminates immediately without freezing.",
    "User lands on Sign-In screen with email and password inputs."
  ]
);

bodyXml += renderTestCaseTable(
  "TC-MOB-03",
  "Learner Authentication & Secure Token Session Persistence",
  "Critical / P0",
  "Student (Mobile App)",
  "User on Sign-In screen with network connectivity.",
  [
    "Enter student credentials: email 'arjun@demo.in' and password 'demo123'.",
    "Tap 'Sign In' button.",
    "Verify transition to Student Home / Enrolled Courses screen.",
    "Force close the application and relaunch."
  ],
  "Email: arjun@demo.in, Password: demo123",
  [
    "Authentication succeeds within 2 seconds.",
    "JWT token is stored in SecureStore.",
    "App auto-logs in to Home screen on relaunch without re-prompting credentials."
  ]
);

bodyXml += renderTestCaseTable(
  "TC-MOB-04",
  "Invalid Credentials & Offline Network Error Handling",
  "High / P1",
  "Student (Mobile App)",
  "User on Sign-In screen.",
  [
    "Enter invalid password 'wrongpass' for arjun@demo.in and tap 'Sign In'.",
    "Enable Airplane Mode (disable WiFi / Mobile Data).",
    "Tap 'Sign In' again."
  ],
  "Password: 'wrongpass'; Network: Offline",
  [
    "Shows user-friendly toast: 'Invalid login credentials'.",
    "When offline, shows toast: 'Network error. Please check your internet connection'.",
    "App remains stable without crashing."
  ]
);

// Suite 2
bodyXml += heading2("Suite 2: Super Admin Portal Operations");
bodyXml += renderTestCaseTable(
  "TC-ADM-01",
  "Global Platform Overview & System Telemetry Metrics",
  "High / P1",
  "Super Admin (Web Portal)",
  "Logged into /admin as admin@demo.in.",
  [
    "Navigate to Super Admin Dashboard (/admin).",
    "Inspect KPI cards: Total Academies, Active Students, Total Revenue, System Health.",
    "Review tenant distribution chart and recent platform logs."
  ],
  "Super Admin account access",
  [
    "Metrics aggregate correctly from Supabase database.",
    "Interactive charts display accurate tooltips on hover."
  ]
);

bodyXml += renderTestCaseTable(
  "TC-ADM-02",
  "Academy Organization Provisioning & Custom Domain Mapping",
  "Critical / P0",
  "Super Admin (Web Portal)",
  "Logged into /admin/academies.",
  [
    "Click '+ Create Academy'.",
    "Enter name 'Pinnacle IAS Academy', slug 'pinnacle-ias', and owner email 'rajesh@demo.in'.",
    "Submit form and verify listing in academy directory."
  ],
  "Name: Pinnacle IAS, Slug: pinnacle-ias, Owner: rajesh@demo.in",
  [
    "New tenant record created with unique organization_id.",
    "Tenant isolation policies are activated automatically."
  ]
);

// Suite 3
bodyXml += heading2("Suite 3: Educator (Academy Owner) Dashboard & Course Management");
bodyXml += renderTestCaseTable(
  "TC-EDU-01",
  "Hierarchical Course Curriculum Authoring & Publishing",
  "Critical / P0",
  "Educator / Owner (Web Portal)",
  "Logged into /educator as rajesh@demo.in.",
  [
    "Navigate to Course Builder (/educator/courses/new).",
    "Fill title 'Full Stack Development', description, and price (Rs. 4,999).",
    "Add Module 1: 'Frontend with Next.js'.",
    "Add Lesson 1.1: 'SSR vs SSG' with video URL and lecture notes.",
    "Click 'Publish Course'."
  ],
  "Course title, modules, lesson attachments",
  [
    "Curriculum hierarchy displays in chronological order.",
    "Course status switches from Draft to Published.",
    "Course immediately appears in academy public storefront."
  ]
);

bodyXml += renderTestCaseTable(
  "TC-EDU-02",
  "Faculty Team Member Invitation & Role Allocation via SMTP",
  "High / P1",
  "Educator (Web Portal)",
  "Logged into /educator/team with SMTP service active.",
  [
    "Click 'Invite Member'.",
    "Enter email 'newfaculty@demo.in', select Role 'Tutor / Faculty'.",
    "Submit invitation form.",
    "Verify email delivery in SMTP logs or recipient inbox."
  ],
  "Email: newfaculty@demo.in, Role: Tutor",
  [
    "Invite logged with 'Pending' status.",
    "SMTP server dispatches invitation email with secure token link.",
    "Recipient clicking link can set their password and log in."
  ]
);

bodyXml += renderTestCaseTable(
  "TC-EDU-03",
  "White-Label Storefront Customization & Brand Accent Configuration",
  "Medium / P2",
  "Educator (Web Portal)",
  "Logged into /educator/settings/branding.",
  [
    "Upload brand logo and header banner.",
    "Set Primary Brand Color (#0A3663) and Accent Color.",
    "Enter custom tagline: 'Discover What You Can Become'.",
    "Save changes and verify in public storefront."
  ],
  "Logo asset, Hex color #0A3663, Custom tagline",
  [
    "Branding preview updates in real-time.",
    "Public storefront displays customized logo, palette, and hero banner."
  ]
);

// Suite 4
bodyXml += heading2("Suite 4: Student (Learner) Learning Journey");
bodyXml += renderTestCaseTable(
  "TC-STU-01",
  "Interactive Video Player, Playback Speed & Resume Tracking",
  "High / P1",
  "Student (Web & Mobile)",
  "Logged in as arjun@demo.in with enrolled video course.",
  [
    "Open video lecture 'Module 1 - Lesson 1'.",
    "Click Play, switch speed to 1.5x, toggle Fullscreen.",
    "Fast forward to timestamp 05:42 and watch 30 seconds.",
    "Navigate back to Dashboard, then re-open lecture."
  ],
  "Video timestamp: 05:42, Speed: 1.5x",
  [
    "Video streams smoothly without desync.",
    "Playback resumes exactly at saved timestamp (05:42).",
    "Course progress percentage updates accordingly."
  ]
);

bodyXml += renderTestCaseTable(
  "TC-STU-02",
  "Smart Board Notes Canvas, Annotation Tools & PDF Export",
  "High / P1",
  "Student / Tutor (Smart Board)",
  "Lecture classroom with Smart Board opened.",
  [
    "Select pen tool, set color to Blue (#0066CC), width 4px.",
    "Draw diagrams and formulas on canvas.",
    "Use highlighter and test eraser tool.",
    "Click 'Export Notes as PDF'."
  ],
  "Vector drawing strokes, eraser gestures",
  [
    "Strokes render in real-time with sub-16ms latency.",
    "Eraser cleanly removes selected strokes.",
    "Exported PDF captures high-resolution notes."
  ]
);

bodyXml += renderTestCaseTable(
  "TC-STU-03",
  "Course Completion, Certificate Generation & QR Verification",
  "Medium / P2",
  "Student (LMS)",
  "Student completed all lectures with passing quiz score.",
  [
    "Submit final module assessment with score >= 80%.",
    "Go to Course Summary and click 'Claim Certificate'.",
    "Download PDF and scan embedded QR code."
  ],
  "Quiz score >= 80%, Certificate generation",
  [
    "Certificate displays student name ('Arjun K.'), course title, and completion date.",
    "Embedded QR code resolves to valid verification URL."
  ]
);

// Suite 5
bodyXml += heading2("Suite 5: Tutor (Faculty) Live Classes & Doubts Clearance");
bodyXml += renderTestCaseTable(
  "TC-TUT-01",
  "Live Class Initiation & Realtime Presence Sync",
  "Critical / P0",
  "Tutor & Student",
  "Live batch scheduled at current time.",
  [
    "Tutor logs into /tutor/live and clicks 'Start Live Class'.",
    "Tutor shares camera and screen.",
    "Student joins from Mobile App or Web portal.",
    "Student taps 'Raise Hand' button."
  ],
  "WebRTC media stream, Supabase Realtime channel",
  [
    "Tutor sees student joined in real-time.",
    "Student receives live stream with low latency (<500ms).",
    "Hand-raise notification pops up in Tutor moderation panel."
  ]
);

bodyXml += renderTestCaseTable(
  "TC-TUT-02",
  "Tutor Mentorship Badge Allocation & Session Scheduling",
  "Medium / P2",
  "Tutor (Faculty)",
  "Tutor profile at /tutor/profile.",
  [
    "Navigate to Tutor Profile settings.",
    "Verify 'Verified Mentor' badge displays on profile.",
    "Configure weekly 1-on-1 mentorship available slots.",
    "Save availability schedule."
  ],
  "Available hours: Mon-Fri 4 PM - 6 PM",
  [
    "Gold verified badge renders beside tutor name in student catalog.",
    "Students can book open mentorship slots without overlap."
  ]
);

// Suite 6
bodyXml += heading2("Suite 6: Security, Multi-Tenant Isolation & Access Control (RBAC)");
bodyXml += renderTestCaseTable(
  "TC-SEC-01",
  "Cross-Tenant Data Isolation & RLS Enforcement",
  "Blocker / P0",
  "Security / All Roles",
  "Two distinct academies: Academy A and Academy B.",
  [
    "Log in as Educator of Academy A.",
    "Directly request URL belonging to Academy B: /educator/courses/[academy_b_id].",
    "Attempt direct Supabase API query using Academy A JWT."
  ],
  "Academy B Course ID",
  [
    "Portal returns 404 Not Found or 403 Forbidden.",
    "Supabase database returns 0 records due to RLS policy.",
    "Zero cross-tenant data leakage."
  ]
);

bodyXml += renderTestCaseTable(
  "TC-SEC-02",
  "Privilege Escalation Prevention on Role-Gated Endpoints",
  "Blocker / P0",
  "Security / Student Role",
  "Logged in as Student (arjun@demo.in).",
  [
    "Manually enter '/admin' in browser URL bar.",
    "Manually enter '/educator' in browser URL bar.",
    "Submit POST request to '/api/courses' using Student JWT."
  ],
  "Student JWT session token",
  [
    "Accessing /admin redirects immediately with 'Unauthorized' alert.",
    "Accessing /educator is blocked and redirected.",
    "API endpoint returns HTTP 403 Forbidden."
  ]
);

// Section 4: QA Sign-off
bodyXml += heading1("4. QA Execution Sign-Off & Verification Log");
bodyXml += `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="5000" w:type="pct"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="6" w:space="0" w:color="0A3663"/>
      <w:left w:val="single" w:sz="6" w:space="0" w:color="0A3663"/>
      <w:bottom w:val="single" w:sz="6" w:space="0" w:color="0A3663"/>
      <w:right w:val="single" w:sz="6" w:space="0" w:color="0A3663"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="0A3663"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="19"/></w:rPr><w:t>Test Suite</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="0A3663"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="19"/></w:rPr><w:t>Total</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="0A3663"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="19"/></w:rPr><w:t>Passed</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="0A3663"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="19"/></w:rPr><w:t>Failed</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="0A3663"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="19"/></w:rPr><w:t>Sign-Off / Date</w:t></w:r></w:p></w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Suite 1: Mobile App Onboarding</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>4</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Suite 2: Super Admin Operations</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>2</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Suite 3: Educator &amp; Courses</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>3</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Suite 4: Student Learning Journey</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>3</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Suite 5: Tutor Live Classes</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>2</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
  </w:tr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="1500" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="19"/></w:rPr><w:t>Suite 6: Security &amp; RBAC</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t>2</w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="750" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
    <w:tc><w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t></w:t></w:r></w:p></w:tc>
  </w:tr>
</w:tbl>
<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
  <w:r><w:rPr><w:b/><w:color w:val="475569"/><w:sz w:val="20"/></w:rPr><w:t>Lead QA Signature: ___________________________          Approval Date: ___________________</w:t></w:r>
</w:p>
`;

// 5. word/document.xml
const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
fs.writeFileSync(path.join(stagingDir, 'word', 'document.xml'), documentXml, 'utf8');

console.log("Staging directory prepared at: " + stagingDir);

// Now zip it into .docx using .NET ZipFile
const outputFile = path.resolve('Bodhin_Platform_Manual_Test_Cases.docx');
if (fs.existsSync(outputFile)) {
  fs.unlinkSync(outputFile);
}

const psScript = `
[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') | Out-Null;
[System.IO.Compression.ZipFile]::CreateFromDirectory('${stagingDir.replace(/\\/g, '\\\\')}', '${outputFile.replace(/\\/g, '\\\\')}');
`;

execSync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { stdio: 'inherit' });

if (fs.existsSync(outputFile)) {
  const stats = fs.statSync(outputFile);
  console.log(`SUCCESS: Created ${outputFile} (${stats.size} bytes)`);
} else {
  console.error("FAILED to create docx file");
  process.exit(1);
}

// Cleanup staging
fs.rmSync(stagingDir, { recursive: true, force: true });
