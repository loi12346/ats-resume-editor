# Codex Project Notes: ATS Resume Editor

This file is the handoff memory for future Codex sessions. It records the main development and deployment decisions for this project so the work can continue even if chat context is lost.

## Project Snapshot

- Project: ATS Resume Editor / ATS Resume Tailoring Workspace.
- Repository: `https://github.com/loi12346/ats-resume-editor`.
- Production URL: `https://ats-resume-editor.vercel.app`.
- Local workspace: `C:\Users\loich\OneDrive\Documents\New project 3`.
- Main branch currently used for production work: `master`.
- App type: local-first Next.js web app.
- Current persistence model: browser `localStorage`.
- No login, no cloud database, no server-side resume storage.
- Electron packaging is explicitly deferred for later.

## Product Goal

Build a practical local-first resume tailoring workspace for English ATS resumes. The app should let the user draft, version, refine, export, and AI-review resume content without editing Word manually.

The core workflow is:

1. Draft a base resume in structured fields.
2. Create targeted versions for different roles or companies.
3. Edit content while checking an A4 live preview.
4. Export PDF / DOCX / CSV / JSON.
5. Use the AI Prompt tab to paste a JD and generate a structured prompt.
6. Let the AI review gaps in planning mode.
7. Only after human approval, generate import-ready JSON.
8. Import that JSON back into the editor as a new or updated resume version.

## Current Feature Set

- Structured editing for Header, Summary, Experience, Projects, Education, Hard Skills, Soft Skills, and Languages.
- Resume version management with add, copy, delete, save, import, and export.
- Application company field stored per version but hidden from resume preview/export.
- A4 live preview.
- One-page PDF export logic that scales layout to keep content on one page when possible.
- DOCX export.
- CSV export for sheet-style review.
- JSON export/import as the most complete backup and AI round-trip format.
- CSV import support.
- AI Prompt tab with:
  - resume version dropdown,
  - target role input,
  - application company input,
  - job description textarea,
  - historical performance review textarea,
  - copyable Markdown/code-style prompt box.
- AI prompt is planning-mode first and must end with JSON matching the app import format.
- No AI API call. The app only generates a prompt for the user to copy.

## Deployment Decisions

- The first implementation explored local SQLite, but production deployment moved away from server SQLite because Vercel serverless/runtime storage is not durable for user data.
- Final production-safe approach: browser localStorage.
- Vercel deployment is static/client-first and does not depend on SQLite or server database writes.
- Default deployed data must not contain the user's personal resume information.
- The sample/default resume should use placeholder/general content.
- `.vercelignore` excludes local data artifacts from deployment.
- `vercel.json` is minimal.
- GitHub remote is `origin` at `https://github.com/loi12346/ats-resume-editor.git`.

## Important File Map

- `src/components/ResumeEditor.tsx`
  - Main app UI and interactions.
  - Handles tabs, version list, editor forms, preview modal, import/export buttons, localStorage state.
  - Calls PDF/DOCX/CSV/JSON generation.

- `src/lib/types.ts`
  - Shared resume data types.
  - `ResumeVersion` includes `applicationCompany?: string`.

- `src/lib/resumeData.ts`
  - Normalizes legacy and current resume data.
  - Splits legacy skills into hard skills, soft skills, and languages where possible.
  - Keeps old JSON compatible.

- `src/lib/defaultResume.ts`
  - Sample/default resume content.
  - Must stay generic and not contain the user's personal info.

- `src/lib/pdf.ts`
  - Custom A4 PDF layout and PDF writer.
  - Also exports `buildResumeLayout`, which the preview uses.
  - This file is the source of truth for one-page PDF layout behavior.

- `src/lib/docx.ts`
  - DOCX generator.

- `src/app/globals.css`
  - Global UI styling, modern workspace UI, preview sizing, Calibri font-face declarations.

- `public/fonts/`
  - Static Calibri font files used for preview and PDF export:
    - `calibri-regular.ttf`
    - `calibri-bold.ttf`
    - `calibri-italic.ttf`

- `README.md`
  - User-facing bilingual workflow guide.

- `codex.md`
  - This file. Future-agent handoff notes.

## Development Timeline And Decisions

### Initial MVP

- Built a local ATS resume editor with Next.js, React, TypeScript, and structured resume sections.
- Initial model included profiles, resume versions, sections/items, and local persistence.
- Early app supported version switching, editing, saving, copying, deleting, and export actions.

### Persistence Change

- Production deployment raised the SQLite durability issue on Vercel.
- Decision: keep the app local-first and store resume versions in the user's browser localStorage.
- This makes the app simple to deploy and private by default.
- JSON export/import became the durable backup strategy.

### A4 Output And AI Prompt Workflow

- Added A4 output requirements:
  - PDF should be A4.
  - Preview should match the export shape.
  - DOCX should stay aligned with the simplified ATS structure.
- Added `Application Company` metadata field.
- Added `AI Prompt` as a real tab, not just a button.
- Prompt requirements:
  - selected resume version,
  - target role,
  - application company,
  - job description,
  - historical performance review,
  - structured planning mode,
  - final JSON must be import-compatible.

### Import/Export Compatibility

- Fixed JSON import compatibility issues from production.
- Added CSV import/export support.
- Important: exported JSON is the canonical full-fidelity format. Do not casually break it.
- AI-generated final JSON must match the same shape so the user can import it directly.

### UI Redesign

- Reworked the UI into a more modern workspace:
  - top app bar,
  - left workflow/version rail,
  - central resume content editor,
  - right live A4 preview and quick export.
- Removed overly bulky sidebar section navigator because it took too much UI space.
- Kept the version rail collapsible/narrowable with an arrow control.
- User prefers modern but practical UI, not decorative backgrounds.
- Dark mode/background experiments were removed because they were not friendly enough for the workflow.

### Preview And PDF Alignment

- Several iterations tried to make HTML preview and PDF export match.
- Final working direction: use a shared PDF layout model for both preview and export.
- Preview renders as an A4 SVG based on `buildResumeLayout`.
- PDF export uses the same layout commands from `src/lib/pdf.ts`.
- This keeps line wrapping, section rules, right-aligned dates/locations, bullets, and one-page fitting much closer between preview and final output.

### PDF Compatibility Bug Closed

Issue:

- Adobe Acrobat reported: `The font "Calibri Bold" contains a bad /BBox`.
- Edge could render the PDF incorrectly or show garbled text.
- Chrome and OpenResume Parser were more forgiving, but the PDF was not fully compatible.

Root cause:

- Older PDF export used fake Type1 font declarations such as `/BaseFont /Calibri-Bold`.
- Calibri is not a standard PDF Type1 font, and the font was not actually embedded.

Fix:

- Added clean local static Calibri font files under `public/fonts`.
- Added explicit `@font-face` declarations for `CalibriPDF` regular, bold, and italic.
- Rebuilt PDF font handling in `src/lib/pdf.ts`:
  - embeds TrueType fonts using `/FontFile2`,
  - creates separate objects for Regular/Bold/Italic,
  - adds `/FontDescriptor`,
  - adds `/FontBBox` from the TTF `head` table,
  - adds width tables from TTF metrics,
  - adds `/ToUnicode` CMap for readable text extraction.
- PDF export now waits for `document.fonts.ready`.
- `npm run typecheck` now runs `next typegen && tsc --noEmit` so route types exist in clean environments.

QA/UAT result:

- Local PDF export works.
- Deployed PDF export works.
- Adobe Acrobat renders correctly.
- Chrome PDF viewer renders correctly.
- Microsoft Edge PDF viewer renders correctly.
- Adobe shows Calibri Regular, Bold, and Italic as embedded fonts.
- No bad `/BBox` warning.
- Ctrl+A copy-paste to Notepad works.
- OpenResume Parser extracts resume content correctly.
- PDF file size around 4MB is acceptable.
- Decision: close the PDF compatibility bug.

Known limitation:

- Chinese/CJK text is not supported in the current PDF export pipeline.
- This is acceptable for the current English resume use case.
- Future CJK support would likely require a Unicode/CID font path instead of the current ASCII/WinAnsi-oriented path.

## Current Commands

Install:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Default local URL:

```text
http://localhost:3000
```

Typecheck:

```bash
npm run typecheck
```

Production build:

```bash
npm run build
```

Start production build:

```bash
npm run start
```

## Current Package Scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "typecheck": "next typegen && tsc --noEmit"
}
```

## Git / Deployment Notes

- Current production branch is `master`.
- Recent important commits:
  - `1304a84 Fix Calibri PDF font embedding`
  - `4b99dfc Remove sidebar section navigator`
  - `171f1bb Redesign resume workspace UI`
  - `fbe96c8 Add bilingual README workflow guide`
  - `6ef75d3 Add direct one-page PDF export`
  - `70cf19c Support CSV imports and JSON prompt output`
  - `a556f4b Fix resume JSON import compatibility`
  - `6bf2f18 Add A4 exports and AI prompt workflow`
  - `84b620b Store resume versions in browser`
  - `7fd03e1 Build local ATS resume editor`
- The user is comfortable pushing to `master` when the change is confirmed.
- Before push, run:
  - `npm run typecheck`
  - `npm run build`
- If git staging fails with `.git/index.lock` permission denied on OneDrive, retry with appropriate permissions. This has happened before.

## Data And Import/Export Rules

- JSON is the canonical backup and import format.
- Do not change JSON shape without adding backward compatibility in `normalizeResumeData`.
- CSV is for sheet-style review and simpler import/export.
- Application company is metadata only and must not appear in preview/PDF/DOCX.
- AI Prompt final output must be import-ready JSON matching the app's expected format.
- Raw notes and refined bullets should remain separate concepts.

## Resume Layout Rules

- Output is A4.
- PDF must stay one page for the current English resume use case by shrinking font size/spacing when needed.
- Preview and PDF should use the same layout rules from `buildResumeLayout`.
- Calibri must remain the resume font.
- Section title lines should not collide with text.
- Right-side location/date should align consistently.
- Bullets should use the available width and should not wrap too early because of fixed right-column space.
- Skills and languages are grouped under `SKILLS & LANGUAGES`.
- Hard skills, soft skills, and languages each continue on their own lines.

## Font / Licensing Note

The project currently includes Calibri font files in `public/fonts`. This was necessary to fix PDF compatibility and keep the resume using Calibri.

Before distributing widely or keeping the repo public long-term, confirm whether bundling these Calibri files is acceptable under the relevant Microsoft font licensing. If that becomes a concern, replace with a license-safe metrically similar font and update the product decision accordingly.

## User Preferences Captured For This Project

- Keep the app practical and ATS-friendly.
- Do not overdo decorative UI.
- Prefer local-first and simple deployment.
- Keep default/sample data generic, not personal.
- PDF output quality matters more than implementation elegance.
- Preview/export alignment matters a lot.
- Import/export compatibility is important because the AI workflow depends on it.
- Use planning-mode AI prompt with human-in-the-loop before generating final JSON.
- Electron can wait until the web version is stable.

## Future Work Ideas

- Add CJK/Unicode PDF support if Chinese resume content becomes needed.
- Consider a license-safe bundled font alternative if Calibri distribution becomes a problem.
- Add automated PDF validation if Poppler tools are available:
  - `pdffonts resume.pdf`
  - `pdftotext resume.pdf -`
- Add a small sample JSON fixture for import/export regression testing.
- Add automated browser smoke tests for import, export, version copy/delete, and AI Prompt copy.
- Add Electron wrapper later if the user wants a desktop app.

## Harness Log: 2026-06-05 UI/UX Implementation

This log records the UI/UX implementation session for future Codex handoff. Work was done after a read-only audit and followed a harness-style loop: inspect context, make small reversible frontend changes, verify with builds and rendered browser checks, then record evidence and remaining risk.

### Objective

- Improve the frontend UI/UX for the local-first ATS Resume Editor.
- Keep the product document-first, practical, professional, and productivity-oriented.
- Prioritize desktop and 1280px laptop workflows.
- Do not change backend logic, persistence, import/export schema, PDF/DOCX generation, Calibri resume output, or preview/PDF layout rules.

### Scope Executed

- Edited `src/components/ResumeEditor.tsx`.
- Edited `src/app/globals.css`.
- Edited `src/app/layout.tsx`.
- Added `public/favicon.svg`.
- Did not add dependencies, UI frameworks, backend APIs, auth, database, Tailwind migration, or state-management libraries.
- Did not commit or push.

### Main Fixes Implemented

- Save/status semantics:
  - Replaced misleading always-saved copy with real dirty-state behavior.
  - Editing now shows `Unsaved changes` and top action `Save Changes`.
  - Saving returns the UI to `Saved locally`.
  - Added `beforeunload` protection when there are unsaved changes.
  - Added `aria-live` status announcement for save state.

- Action hierarchy:
  - Moved primary save/export/import/sample actions into the top command bar.
  - Removed duplicate Quick Export behavior from the right column.
  - Replaced Quick Export with a passive `Document Status` card showing save/PDF/DOCX readiness.
  - Kept CSV/JSON/copy/delete as current-version actions near the editor.

- Navigation clarity:
  - Simplified left workflow rail to:
    - `Resume Content`
    - `AI Prompt & JD`
    - `Raw Notes`
  - Removed confusing duplicate entries where `Job Description` and `AI Prompt Workflow` both opened the same tab.
  - Removed the false `Add Section` affordance.
  - Added a lightweight section jump bar for `Header`, `Summary`, `Experience`, `Projects`, `Education`, and `Skills`.

- Long-form editor workflow:
  - Converted experience/project/education edit items into scan-friendly native `details` cards.
  - Card summaries show useful labels such as organization/role and bullet count.
  - Kept items expanded by default so the existing editing flow remains familiar.

- Responsive layout:
  - Adjusted the desktop/laptop grid so 1280px keeps the A4 preview visible in the first viewport.
  - Kept mobile as non-primary per user direction, but added basic overflow protection so it does not obviously break.

- Accessibility and polish:
  - Added `name`, `autoComplete`, `type`, and `inputMode` attributes to key form fields where practical.
  - Added Escape-close and focus behavior for the expanded preview modal.
  - Added reduced-motion CSS handling.
  - Added `public/favicon.svg` and metadata icon config to remove browser favicon 404 noise.

### Verification Evidence

- Ran `npm.cmd run typecheck`.
  - Result: passed.
  - Command expands to `next typegen && tsc --noEmit`.

- Ran `npm.cmd run build`.
  - Result: passed.
  - Next.js production build compiled successfully and prerendered `/`.

- Ran local browser QA against `http://127.0.0.1:3000/` using Chrome headless/CDP.
  - Page title: `Local Resume Editor`.
  - Confirmed meaningful page content rendered.
  - Confirmed `Live Resume Preview (A4)` rendered.
  - Confirmed section jump links rendered.
  - Confirmed simplified rail labels rendered.
  - Confirmed dirty/save interaction:
    - editing version name showed `Unsaved changes` and `Save Changes`;
    - clicking save returned to saved state.
  - Console issues: none after favicon fix.

- Screenshot evidence generated outside the repo:
  - Desktop: `C:\Users\loich\AppData\Local\Temp\codex-ui-audit-resume-editor-final2\final2-desktop.png`
  - 1280 laptop: `C:\Users\loich\AppData\Local\Temp\codex-ui-audit-resume-editor-final2\final2-laptop.png`

### Known Non-Goals And Preserved Boundaries

- Mobile is not the product focus for this iteration.
- No Tailwind migration was attempted; current styling remains custom CSS.
- JSON import/export shape was not changed.
- Resume preview/PDF layout model was not changed.
- PDF/DOCX/CSV/JSON export logic was not changed.
- LocalStorage persistence model was not changed.
- No AI API integration was added.

### Remaining Risks / Follow-Up

- `details open` keeps item cards expanded by default; if future UX wants persistent collapsed state, add explicit state carefully and avoid disrupting typing performance.
- Mobile is only minimally protected; do not treat it as fully designed.
- Future browser smoke tests should cover import/export actions, AI Prompt copy, preview modal keyboard behavior, and version copy/delete flows.
- Before pushing, run:
  - `npm run typecheck`
  - `npm run build`

## Harness Log Update: 2026-06-05 Browser Comment Fixes

### User Feedback Addressed

- Browser comments 1, 2, and 3:
  - The `Up`, `Down`, and `Remove` action group in Experience, Projects, and Education looked too tight and visually odd.
  - Fixed by turning the item actions into a clearer footer row with more spacing, a top divider, and larger minimum button widths.
  - Added a subtle danger hover style to `Remove` without changing behavior.

- Browser comments 4 and 5:
  - Collapsing the sidebar left an awkward blank column and made the whole page feel incorrectly scaled.
  - Fixed by making the collapsed sidebar truly leave the layout grid instead of hiding only the rail contents.
  - Moved the sidebar toggle from the lower page edge to a stable top-left control position so it feels attached to the workspace.

### Scope Boundaries

- CSS-only follow-up for browser-review feedback.
- No data model, persistence, export, PDF, DOCX, CSV, JSON, or AI Prompt logic was changed.
- Mobile remains non-primary for this product; desktop and laptop layout are the focus for this pass.

### Expected Verification

- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.
- Recheck `http://localhost:3000/` or `http://127.0.0.1:3000/` at desktop/laptop widths:
  - item action buttons should have clearer spacing;
  - collapsed rail should not leave a blank column;
  - expanded rail should still preserve the normal workspace layout.

### Follow-Up Adjustment

- User noticed the collapse control still followed the viewport while scrolling.
- Removed the old floating/fixed collapse button entirely.
- Added a normal sidebar-top `Collapse` control inside the rail.
- Added a normal `Show sidebar` restore control at the top of the workspace when the rail is collapsed.
- Expected behavior: scrolling down should no longer carry an independent collapse button with the viewport.
