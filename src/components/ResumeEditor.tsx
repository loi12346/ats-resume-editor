"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

import { cloneStarterResume } from "@/lib/defaultResume";
import { buildDocx } from "@/lib/docx";
import { buildPdf, buildResumeLayout, PDF_PAGE_HEIGHT, PDF_PAGE_WIDTH } from "@/lib/pdf";
import { normalizeResumeData } from "@/lib/resumeData";
import type { EducationItem, ResumeData, ResumeItem, ResumeListItem, ResumeVersion } from "@/lib/types";

const STORAGE_KEY = "ats-resume-editor-versions";
const NEXT_ID_KEY = "ats-resume-editor-next-id";

const blankExperience = (): ResumeItem => ({
  id: makeId("item"),
  organization: "",
  role: "",
  location: "",
  start: "",
  end: "",
  keywords: "",
  impact: "",
  originalDescription: "",
  bullets: ["", "", ""],
});

const blankEducation = (): EducationItem => ({
  id: makeId("edu"),
  school: "",
  degree: "",
  location: "",
  start: "",
  end: "",
  details: "",
});

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeName(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "") || "resume";
}

export function ResumeEditor() {
  const [storedVersions, setStoredVersions] = useState<ResumeVersion[]>([]);
  const [versions, setVersions] = useState<ResumeListItem[]>([]);
  const [current, setCurrent] = useState<ResumeVersion | null>(null);
  const [profileName, setProfileName] = useState("General");
  const [targetRole, setTargetRole] = useState("General");
  const [applicationCompany, setApplicationCompany] = useState("");
  const [versionName, setVersionName] = useState("Untitled Resume");
  const [data, setData] = useState<ResumeData | null>(null);
  const [status, setStatus] = useState("Loading");
  const [activeTab, setActiveTab] = useState<"content" | "notes" | "aiPrompt">("content");
  const [aiVersionId, setAiVersionId] = useState<number | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [isRailHidden, setIsRailHidden] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const actionLockRef = useRef(false);
  const lastAddAtRef = useRef(0);

  const canDownload = Boolean(data);

  useEffect(() => {
    void loadVersions();
  }, []);

  async function loadVersions(selectId?: number) {
    const storedVersions = ensureLocalVersions();
    setStoredVersions(storedVersions);
    setVersions(toListItems(storedVersions));
    const id = selectId ?? storedVersions[0]?.id;
    if (id) loadVersion(id, storedVersions);
  }

  function loadVersion(id: number, sourceVersions = readVersions()) {
    setStatus("Loading version");
    setStoredVersions(sourceVersions);
    const version = sourceVersions.find((item) => item.id === id);
    if (!version) {
      setStatus("Version not found");
      return;
    }
    setCurrent(version);
    setProfileName(version.profileName);
    setTargetRole(version.targetRole);
    setApplicationCompany(version.applicationCompany ?? "");
    setVersionName(version.name);
    setData(normalizeResumeData(version.data));
    setAiVersionId(version.id);
    setStatus("Ready");
  }

  function createBlank(profile: string, role: string, name: string, sourceData?: ResumeData, company = "") {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setIsWorking(true);
    try {
      const versions = readVersions();
      const now = timestamp();
      const version: ResumeVersion = {
        id: nextId(),
        profileId: 0,
        profileName: profile,
        targetRole: role,
        applicationCompany: company,
        name,
        data: normalizeResumeData(sourceData ?? cloneStarterResume(role)),
        createdAt: now,
        updatedAt: now,
      };
      const nextVersions = [version, ...versions];
      writeVersions(nextVersions);
      setStoredVersions(nextVersions);
      setVersions(toListItems(nextVersions));
      loadVersion(version.id, nextVersions);
      setStatus("Created");
    } catch {
      setStatus("Create failed");
    } finally {
      actionLockRef.current = false;
      setIsWorking(false);
    }
  }

  async function addVersion() {
    const now = Date.now();
    if (now - lastAddAtRef.current < 4000) return;
    lastAddAtRef.current = now;

    const stamp = new Date().toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const nextName = `Resume Version ${stamp}`;
    createBlank(profileName || "General", targetRole || "General", nextName, data ?? undefined, applicationCompany);
  }

  function saveVersion() {
    if (!data || actionLockRef.current) return null;
    actionLockRef.current = true;
    setIsWorking(true);
    try {
      setStatus("Saving");
      const versions = readVersions();
      const now = timestamp();
      const version: ResumeVersion = {
        id: current?.id ?? nextId(),
        profileId: current?.profileId ?? 0,
        profileName,
        targetRole,
        applicationCompany,
        name: versionName,
        data: normalizeResumeData(data),
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      };
      const exists = versions.some((item) => item.id === version.id);
      const nextVersions = exists
        ? versions.map((item) => (item.id === version.id ? version : item))
        : [version, ...versions];
      writeVersions(nextVersions);
      setCurrent(version);
      setStoredVersions(nextVersions);
      setVersions(toListItems(nextVersions));
      setStatus("Saved");
      return version;
    } catch {
      setStatus("Save failed");
      return null;
    } finally {
      actionLockRef.current = false;
      setIsWorking(false);
    }
  }

  function deleteCurrent() {
    if (!current || actionLockRef.current) return;
    deleteVersion(current.id, current.name);
  }

  function deleteVersion(id: number, name: string) {
    if (actionLockRef.current) return;
    const versions = readVersions();
    if (versions.length <= 1) {
      setStatus("Keep at least one version");
      return;
    }
    const confirmed = window.confirm(`Delete "${name}"?`);
    if (!confirmed) return;
    actionLockRef.current = true;
    setIsWorking(true);
    try {
      setStatus("Deleting");
      const nextVersions = versions.filter((version) => version.id !== id);
      writeVersions(nextVersions);
      setStoredVersions(nextVersions);
      setVersions(toListItems(nextVersions));
      if (current?.id === id) {
        loadVersion(nextVersions[0].id, nextVersions);
      }
      setStatus("Deleted");
    } catch {
      setStatus("Delete failed");
    } finally {
      actionLockRef.current = false;
      setIsWorking(false);
    }
  }

  async function downloadDocx() {
    const saved = saveVersion();
    const id = saved?.id ?? current?.id;
    const version = readVersions().find((item) => item.id === id) ?? saved;
    if (!version) return;
    const docx = buildDocx(version.data);
    downloadBlob(
      new Blob([docx], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      `${safeName(version.name)}.docx`,
    );
  }

  async function printPdf() {
    if (!data) return;
    const saved = saveVersion();
    const version = saved ?? current;
    try {
      await document.fonts.ready;
      const pdf = await buildPdf(normalizeResumeData(data));
      downloadBlob(
        new Blob([pdf], { type: "application/pdf" }),
        `${safeName(version?.name ?? versionName)}.pdf`,
      );
    } catch {
      setStatus("PDF export failed");
    }
  }

  function exportJson() {
    if (!data) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            profileName,
            targetRole,
            applicationCompany,
            name: versionName,
            data,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    downloadBlob(blob, `${safeName(versionName)}.json`);
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImportedFile(text, file.name);
      if (!imported) {
        setStatus("Import failed");
        return;
      }
      createBlank(
        imported.profileName || "Imported",
        imported.targetRole || imported.profileName || "Imported",
        imported.name ? `${imported.name} Import` : "Imported Version",
        imported.data,
        imported.applicationCompany || "",
      );
    } catch {
      setStatus("Import failed");
    } finally {
      event.target.value = "";
    }
  }

  function exportCsv() {
    const saved = saveVersion();
    const id = saved?.id ?? current?.id;
    const version = readVersions().find((item) => item.id === id) ?? saved;
    if (!version) return;
    const csv = buildResumeCsv(version);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${safeName(version.name)}.csv`);
  }

  const promptVersions = storedVersions.map((version) =>
    current?.id === version.id && data
      ? {
          ...version,
          profileName,
          targetRole,
          applicationCompany,
          name: versionName,
          data: normalizeResumeData(data),
        }
      : version,
  );
  if (!data) {
    return (
      <main className="empty-shell">
        <div className="loading-panel">
          <span className="loader" />
          <p>{status}</p>
        </div>
      </main>
    );
  }

  const summaryWords = countWords(data.summary);
  const experienceBulletCount = data.experience.reduce(
    (total, item) => total + item.bullets.filter((bullet) => bullet.trim()).length,
    0,
  );
  const projectCount = data.projects.filter((item) => hasResumeItemContent(item)).length;

  return (
    <main className={isRailHidden ? "app-shell rail-collapsed" : "app-shell"}>
      <header className="app-topbar no-print">
        <div className="product-title">
          <span className="product-mark" aria-hidden="true">
            <Icon name="document" />
          </span>
          <div>
            <h1>ATS Resume Tailoring Workspace</h1>
            <p>Local-first <span>·</span> Structured JSON <span>·</span> AI-assisted <span>·</span> Export-ready</p>
          </div>
        </div>

        <div className="command-bar">
          <button onClick={() => createBlank("General", "General", "Sample Resume", cloneStarterResume("General"))} disabled={isWorking}>
            <Icon name="folder" /> Load Sample
          </button>
          <button onClick={() => importRef.current?.click()} disabled={isWorking}>
            <Icon name="upload" /> Import JSON
          </button>
          <button onClick={printPdf} disabled={!canDownload || isWorking}>
            <Icon name="pdf" /> Export PDF
          </button>
          <button onClick={downloadDocx} disabled={!canDownload || isWorking}>
            <Icon name="docx" /> Export DOCX
          </button>
          <button className="save-pill" onClick={saveVersion} disabled={isWorking}>
            <Icon name="check" /> Saved locally <Icon name="chevronDown" />
          </button>
          <input ref={importRef} hidden type="file" accept="application/json,text/csv,.json,.csv" onChange={importJson} />
        </div>
      </header>

      <div className="app-body">
        <button
          className={isRailHidden ? "sidebar-toggle collapsed no-print" : "sidebar-toggle no-print"}
          onClick={() => setIsRailHidden(!isRailHidden)}
          title={isRailHidden ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={isRailHidden ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon name={isRailHidden ? "chevronRight" : "chevronLeft"} />
        </button>

        <aside className={isRailHidden ? "version-rail collapsed no-print" : "version-rail no-print"} aria-label="Resume workflow">
          <div className="rail-scroll">
            <RailGroup title="Workflow">
              <RailButton active={activeTab === "content"} icon="document" label="Resume Versions" onClick={() => setActiveTab("content")} />
              <RailButton active={activeTab === "aiPrompt"} icon="clipboard" label="Job Description" onClick={() => setActiveTab("aiPrompt")} />
              <RailButton active={activeTab === "aiPrompt"} icon="spark" label="AI Prompt Workflow" onClick={() => setActiveTab("aiPrompt")} />
              <RailButton active={activeTab === "notes"} icon="upload" label="Import / Export" onClick={() => setActiveTab("notes")} />
            </RailGroup>

            <RailGroup
              title="Versions"
              action={
                <button className="rail-add-button" onClick={addVersion} disabled={isWorking}>
                  <Icon name="plus" /> New Version
                </button>
              }
            >
              <div className="version-list">
                {versions.map((item, index) => (
                  <article
                    className={current?.id === item.id ? "version-row active" : "version-row"}
                    key={item.id}
                  >
                    <button className="version-main" disabled={isWorking} onClick={() => loadVersion(item.id)}>
                      <span className={`version-color color-${index % 4}`} />
                      <span className="version-file">
                        <Icon name="document" />
                      </span>
                      <span className="version-copy">
                        <strong>{item.name}</strong>
                        <span>{item.targetRole || "Target role"}</span>
                      </span>
                      <span className={current?.id === item.id ? "version-state active" : "version-state"}>
                        {current?.id === item.id ? "Editing" : "Saved"}
                      </span>
                    </button>
                    <button
                      className="version-delete"
                      disabled={isWorking || versions.length <= 1}
                      onClick={() => deleteVersion(item.id, item.name)}
                      title={`Delete ${item.name}`}
                      aria-label={`Delete ${item.name}`}
                    >
                      <Icon name="trash" />
                    </button>
                  </article>
                ))}
              </div>
            </RailGroup>

            <div className="privacy-card">
              <Icon name="cloud" />
              <p>All data is stored locally in your browser.</p>
              <span>No data leaves your device.</span>
            </div>
          </div>
        </aside>

        <section className="workspace no-print">
          <div className="editor-grid">
            <section className="editor-pane">
              <div className="content-shell">
                <div className="content-header">
                  <div>
                    <h2>
                      {activeTab === "aiPrompt"
                        ? "AI Prompt Workflow"
                        : activeTab === "notes"
                          ? "Raw Notes & Import Review"
                          : `Resume Content (${versionName || "Untitled Resume"})`}
                    </h2>
                    <p>{targetRole || "Target role"} {applicationCompany ? `· ${applicationCompany}` : ""}</p>
                  </div>
                  <span className="local-save-status">
                    <Icon name="check" /> All changes saved locally
                  </span>
                </div>

                <div className="identity-fields">
                  <label>
                    Profile
                    <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
                  </label>
                  <label>
                    Target role
                    <input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} />
                  </label>
                  <label>
                    Application company
                    <input value={applicationCompany} onChange={(event) => setApplicationCompany(event.target.value)} />
                  </label>
                  <label>
                    Version
                    <input value={versionName} onChange={(event) => setVersionName(event.target.value)} />
                  </label>
                </div>

                <div className="toolbar-actions">
                  <button className="primary-action" onClick={saveVersion} disabled={isWorking}>
                    <Icon name="check" /> Save
                  </button>
                  <button onClick={() => createBlank(profileName, targetRole, `${versionName} Copy`, data, applicationCompany)} disabled={isWorking}>
                    <Icon name="copy" /> Copy
                  </button>
                  <button onClick={deleteCurrent} disabled={!current || isWorking}>
                    <Icon name="trash" /> Delete
                  </button>
                  <button onClick={exportCsv} disabled={!canDownload || isWorking}>
                    <Icon name="sheet" /> CSV
                  </button>
                  <button onClick={exportJson} disabled={isWorking}>
                    <Icon name="code" /> JSON
                  </button>
                </div>

                {activeTab === "content" ? (
                  <ContentEditor data={data} setData={setData} summaryWords={summaryWords} experienceBulletCount={experienceBulletCount} projectCount={projectCount} />
                ) : activeTab === "notes" ? (
                  <RawNotesEditor data={data} setData={setData} />
                ) : (
                  <AiPromptPanel
                    versions={promptVersions}
                    selectedVersionId={aiVersionId ?? current?.id ?? versions[0]?.id ?? null}
                    onSelectVersion={setAiVersionId}
                    fallbackRole={targetRole}
                    fallbackCompany={applicationCompany}
                    onCopied={() => setStatus("Prompt copied")}
                  />
                )}

                {activeTab === "content" && (
                  <button className="add-section-button" onClick={() => setActiveTab("content")}>
                    <Icon name="plus" /> Add Section
                  </button>
                )}
              </div>
            </section>

            <aside className="preview-column" aria-label="Resume preview and export status">
              <section className="preview-pane">
                <div className="preview-head">
                  <h2>Live Resume Preview (A4)</h2>
                  <button
                    className="icon-button"
                    onClick={() => setIsPreviewExpanded(true)}
                    title="Expand preview"
                    aria-label="Expand preview"
                  >
                    <Icon name="expand" />
                  </button>
                </div>
                <ResumePreview data={data} />
              </section>

              <InfoCard title="Quick Export" icon="cloud">
                <p className="quick-copy">Your resume is ready to export.</p>
                <div className="quick-actions">
                  <button onClick={printPdf} disabled={!canDownload || isWorking}>
                    <Icon name="pdf" /> Export PDF
                  </button>
                  <button onClick={downloadDocx} disabled={!canDownload || isWorking}>
                    <Icon name="docx" /> Export DOCX
                  </button>
                </div>
              </InfoCard>
            </aside>
          </div>
        </section>
      </div>

      <section className="print-surface">
        <ResumePreview data={data} />
      </section>

      {isPreviewExpanded && (
        <section className="preview-modal no-print" role="dialog" aria-modal="true" aria-label="Expanded resume preview">
          <div className="preview-modal-head">
            <h2>Live Resume Preview (A4)</h2>
            <button onClick={() => setIsPreviewExpanded(false)}>
              Close
            </button>
          </div>
          <div className="preview-modal-body">
            <ResumePreview data={data} />
          </div>
        </section>
      )}
    </main>
  );
}

function ContentEditor({
  data,
  setData,
  summaryWords,
  experienceBulletCount,
  projectCount,
}: {
  data: ResumeData;
  setData: (value: ResumeData) => void;
  summaryWords: number;
  experienceBulletCount: number;
  projectCount: number;
}) {
  return (
    <div className="form-stack">
      <section className="form-section compact-section" data-resume-section="header">
        <div className="section-head">
          <div className="section-title">
            <Icon name="user" />
            <h2>Header</h2>
          </div>
          <span className="section-badge ready">Ready</span>
        </div>
        <div className="field-grid">
          {(["fullName", "headline", "location", "email", "phone", "links"] as const).map((field) => (
            <label key={field}>
              {labelize(field)}
              <input
                value={data.contact[field]}
                onChange={(event) =>
                  setData({
                    ...data,
                    contact: { ...data.contact, [field]: event.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
      </section>

      <section className="form-section compact-section" data-resume-section="summary">
        <div className="section-head">
          <div className="section-title">
            <Icon name="education" />
            <h2>Summary</h2>
          </div>
          <span className="section-badge ready">Ready</span>
        </div>
        <textarea
          rows={5}
          value={data.summary}
          onChange={(event) => setData({ ...data, summary: event.target.value })}
        />
        <p className="section-meter">{summaryWords} words</p>
      </section>

      <ResumeItemsEditor
        title="Experience"
        items={data.experience}
        onChange={(items) => setData({ ...data, experience: items })}
        badge={`${experienceBulletCount} bullets`}
      />
      <ResumeItemsEditor title="Projects" items={data.projects} onChange={(items) => setData({ ...data, projects: items })} badge={`${projectCount} items`} />
      <EducationEditor items={data.education} onChange={(items) => setData({ ...data, education: items })} />
      <SkillsEditor data={data} setData={setData} />
    </div>
  );
}

function RawNotesEditor({
  data,
  setData,
}: {
  data: ResumeData;
  setData: (value: ResumeData) => void;
}) {
  return (
    <div className="form-stack">
      <ResumeItemsEditor
        title="Experience Notes"
        items={data.experience}
        onChange={(items) => setData({ ...data, experience: items })}
        notesOnly
      />
      <ResumeItemsEditor
        title="Project Notes"
        items={data.projects}
        onChange={(items) => setData({ ...data, projects: items })}
        notesOnly
      />
    </div>
  );
}

function AiPromptPanel({
  versions,
  selectedVersionId,
  onSelectVersion,
  fallbackRole,
  fallbackCompany,
  onCopied,
}: {
  versions: ResumeVersion[];
  selectedVersionId: number | null;
  onSelectVersion: (id: number) => void;
  fallbackRole: string;
  fallbackCompany: string;
  onCopied: () => void;
}) {
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null;
  const [promptRole, setPromptRole] = useState(fallbackRole);
  const [promptCompany, setPromptCompany] = useState(fallbackCompany);
  const [jobDescription, setJobDescription] = useState("");
  const [performanceReview, setPerformanceReview] = useState("");

  useEffect(() => {
    setPromptRole(selectedVersion?.targetRole || fallbackRole);
    setPromptCompany(selectedVersion?.applicationCompany || fallbackCompany);
  }, [
    fallbackCompany,
    fallbackRole,
    selectedVersion?.applicationCompany,
    selectedVersion?.id,
    selectedVersion?.targetRole,
  ]);

  const prompt = selectedVersion
    ? buildAiPrompt({
        version: selectedVersion,
        targetRole: promptRole,
        applicationCompany: promptCompany,
        jobDescription,
        performanceReview,
      })
    : "";

  async function copyPrompt() {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    onCopied();
  }

  return (
    <section className="form-section ai-prompt-panel">
      <div className="section-head">
        <h2>AI Prompt</h2>
        <button onClick={copyPrompt} disabled={!prompt}>
          Copy Prompt
        </button>
      </div>

      <div className="prompt-workflow-card">
        <h3>
          <Icon name="spark" />
          AI Prompt Workflow
        </h3>
        <div className="prompt-steps">
          {["Paste JD", "Review gaps", "Answer evidence questions", "Generate import-ready JSON", "Import final version"].map(
            (step, index) => (
              <span key={step}>
                <strong>{index + 1}</strong>
                {step}
              </span>
            ),
          )}
        </div>
      </div>

      <div className="field-grid">
        <label>
          Resume version
          <select
            value={selectedVersion?.id ?? ""}
            onChange={(event) => onSelectVersion(Number(event.target.value))}
          >
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target role
          <input value={promptRole} onChange={(event) => setPromptRole(event.target.value)} />
        </label>
        <label>
          Application company
          <input value={promptCompany} onChange={(event) => setPromptCompany(event.target.value)} />
        </label>
      </div>

      <label>
        Job description
        <textarea
          rows={8}
          value={jobDescription}
          onChange={(event) => setJobDescription(event.target.value)}
          placeholder="Paste the job description here before copying the prompt."
        />
      </label>

      <label>
        Historical performance review
        <textarea
          rows={7}
          value={performanceReview}
          onChange={(event) => setPerformanceReview(event.target.value)}
          placeholder="Paste past performance reviews, manager feedback, KPI notes, wins, or promotion evidence here."
        />
      </label>

      <div className="copy-box" aria-label="Generated AI prompt">
        <div className="copy-box-head">
          <span>resume-tailor-skill-prompt.md</span>
          <button onClick={copyPrompt} disabled={!prompt}>
            Copy
          </button>
        </div>
        <pre>{prompt || "Select a resume version to generate the prompt."}</pre>
      </div>
    </section>
  );
}

function ResumeItemsEditor({
  title,
  items,
  onChange,
  notesOnly = false,
  badge,
}: {
  title: string;
  items: ResumeItem[];
  onChange: (items: ResumeItem[]) => void;
  notesOnly?: boolean;
  badge?: string;
}) {
  const update = (index: number, patch: Partial<ResumeItem>) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  return (
    <section className="form-section" data-resume-section={sectionKeyFromTitle(title)}>
      <div className="section-head">
        <div className="section-title">
          <Icon name={title.toLowerCase().includes("project") ? "folder" : "briefcase"} />
          <h2>{title}</h2>
        </div>
        <div className="section-actions">
          {badge && <span className="section-badge">{badge}</span>}
          <button onClick={() => onChange([...items, blankExperience()])}>
            <Icon name="plus" /> Add
          </button>
        </div>
      </div>

      <div className="item-list">
        {items.map((item, index) => (
          <article className="edit-item" key={item.id}>
            {!notesOnly && (
              <>
                <div className="field-grid item-title-grid">
                  <label>
                    Company / Organization
                    <input value={item.organization} onChange={(event) => update(index, { organization: event.target.value })} />
                  </label>
                  <label>
                    Location
                    <input value={item.location} onChange={(event) => update(index, { location: event.target.value })} />
                  </label>
                  <label>
                    Role title
                    <input value={item.role} onChange={(event) => update(index, { role: event.target.value })} />
                  </label>
                  <label>
                    Start
                    <input value={item.start} onChange={(event) => update(index, { start: event.target.value })} />
                  </label>
                  <label>
                    End
                    <input value={item.end} onChange={(event) => update(index, { end: event.target.value })} />
                  </label>
                  <label>
                    Keywords
                    <input value={item.keywords} onChange={(event) => update(index, { keywords: event.target.value })} />
                  </label>
                </div>
                <label>
                  Impact
                  <input value={item.impact} onChange={(event) => update(index, { impact: event.target.value })} />
                </label>
              </>
            )}

            <label>
              Raw description
              <textarea
                rows={notesOnly ? 6 : 3}
                value={item.originalDescription}
                onChange={(event) => update(index, { originalDescription: event.target.value })}
              />
            </label>

            {!notesOnly && (
              <div className="bullet-list">
                {item.bullets.map((bullet, bulletIndex) => (
                  <label key={`${item.id}-${bulletIndex}`}>
                    Bullet {bulletIndex + 1}
                    <input
                      value={bullet}
                      onChange={(event) => {
                        const bullets = [...item.bullets];
                        bullets[bulletIndex] = event.target.value;
                        update(index, { bullets });
                      }}
                    />
                  </label>
                ))}
                <button onClick={() => update(index, { bullets: [...item.bullets, ""] })}>
                  <Icon name="plus" /> Bullet
                </button>
              </div>
            )}

            <div className="item-actions">
              <button disabled={index === 0} onClick={() => onChange(move(items, index, index - 1))}>
                <Icon name="arrows" /> Up
              </button>
              <button disabled={index === items.length - 1} onClick={() => onChange(move(items, index, index + 1))}>
                Down
              </button>
              <button onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EducationEditor({
  items,
  onChange,
}: {
  items: EducationItem[];
  onChange: (items: EducationItem[]) => void;
}) {
  const update = (index: number, patch: Partial<EducationItem>) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  return (
    <section className="form-section" data-resume-section="education">
      <div className="section-head">
        <div className="section-title">
          <Icon name="education" />
          <h2>Education</h2>
        </div>
        <div className="section-actions">
          <span className="section-badge ready">Ready</span>
          <button onClick={() => onChange([...items, blankEducation()])}>
            <Icon name="plus" /> Add
          </button>
        </div>
      </div>

      <div className="item-list">
        {items.map((item, index) => (
          <article className="edit-item" key={item.id}>
            <div className="field-grid item-title-grid">
              <label>
                School
                <input value={item.school} onChange={(event) => update(index, { school: event.target.value })} />
              </label>
              <label>
                Location
                <input value={item.location} onChange={(event) => update(index, { location: event.target.value })} />
              </label>
              <label>
                Degree
                <input value={item.degree} onChange={(event) => update(index, { degree: event.target.value })} />
              </label>
              <label>
                Start
                <input value={item.start} onChange={(event) => update(index, { start: event.target.value })} />
              </label>
              <label>
                End
                <input value={item.end} onChange={(event) => update(index, { end: event.target.value })} />
              </label>
            </div>
            <label>
              Details
              <textarea
                rows={3}
                value={item.details}
                onChange={(event) => update(index, { details: event.target.value })}
              />
            </label>
            <div className="item-actions">
              <button disabled={index === 0} onClick={() => onChange(move(items, index, index - 1))}>
                <Icon name="arrows" /> Up
              </button>
              <button disabled={index === items.length - 1} onClick={() => onChange(move(items, index, index + 1))}>
                Down
              </button>
              <button onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SkillsEditor({
  data,
  setData,
}: {
  data: ResumeData;
  setData: (value: ResumeData) => void;
}) {
  return (
    <section className="form-section" data-resume-section="skills">
      <div className="section-head">
        <div className="section-title">
          <Icon name="code" />
          <h2>Skills</h2>
        </div>
        <span className="section-badge ready">Ready</span>
      </div>
      <div className="skill-grid">
        <label>
          Hard skills
          <textarea
            rows={4}
            value={data.hardSkills.join(", ")}
            onChange={(event) => setData({ ...data, hardSkills: parseCommaList(event.target.value) })}
          />
        </label>
        <label>
          Soft skills
          <textarea
            rows={4}
            value={data.softSkills.join(", ")}
            onChange={(event) => setData({ ...data, softSkills: parseCommaList(event.target.value) })}
          />
        </label>
        <label data-resume-section="languages">
          Languages
          <textarea
            rows={3}
            value={data.languages.join(", ")}
            onChange={(event) => setData({ ...data, languages: parseCommaList(event.target.value) })}
          />
        </label>
      </div>
    </section>
  );
}

function ResumePreview({ data }: { data: ResumeData }) {
  const layout = buildResumeLayout(data);

  return (
    <article className="resume-page">
      <svg
        aria-label="Resume export preview"
        className="resume-sheet"
        role="img"
        viewBox={`0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}`}
      >
        <rect fill="#ffffff" height={PDF_PAGE_HEIGHT} width={PDF_PAGE_WIDTH} x="0" y="0" />
        {layout.rules.map((rule, index) => (
          <line
            key={`rule-${index}`}
            stroke="#111111"
            strokeWidth="0.5"
            x1={rule.x1}
            x2={rule.x2}
            y1={PDF_PAGE_HEIGHT - rule.y}
            y2={PDF_PAGE_HEIGHT - rule.y}
          />
        ))}
        {layout.dots.map((dot, index) => (
          <circle
            cx={dot.x}
            cy={PDF_PAGE_HEIGHT - dot.y}
            fill="#111111"
            key={`dot-${index}`}
            r={dot.radius}
          />
        ))}
        {layout.lines.map((line, index) => (
          <text
            dominantBaseline="alphabetic"
            fill="#111111"
            fontFamily="CalibriPDF, Calibri, Segoe UI, Arial, sans-serif"
            fontSize={line.size}
            fontStyle={line.font === "italic" ? "italic" : "normal"}
            fontWeight={line.font === "bold" ? 700 : 400}
            key={`${line.text}-${index}`}
            textAnchor={line.align === "end" ? "end" : "start"}
            x={line.x}
            y={PDF_PAGE_HEIGHT - line.y}
          >
            {line.text}
          </text>
        ))}
      </svg>
    </article>
  );
}

type IconName =
  | "arrows"
  | "briefcase"
  | "check"
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "clipboard"
  | "cloud"
  | "code"
  | "copy"
  | "document"
  | "docx"
  | "education"
  | "expand"
  | "folder"
  | "more"
  | "pdf"
  | "plus"
  | "sheet"
  | "shield"
  | "spark"
  | "trash"
  | "upload"
  | "user";

function Icon({ name }: { name: IconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.9,
  };
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      {name === "document" && (
        <>
          <path {...common} d="M7 3h7l4 4v14H7z" />
          <path {...common} d="M14 3v5h5M9 12h6M9 16h6" />
        </>
      )}
      {name === "folder" && <path {...common} d="M3 7h7l2 2h9v10H3z" />}
      {name === "upload" && (
        <>
          <path {...common} d="M12 16V4M8 8l4-4 4 4M5 16v4h14v-4" />
        </>
      )}
      {name === "pdf" && (
        <>
          <path {...common} d="M7 3h7l4 4v14H7zM14 3v5h5" />
          <path {...common} d="M9 15h6" />
        </>
      )}
      {name === "docx" && (
        <>
          <path {...common} d="M6 4h12v16H6z" />
          <path {...common} d="M9 8h6M9 12h6M9 16h4" />
        </>
      )}
      {name === "check" && <path {...common} d="M5 12l4 4L19 6" />}
      {name === "chevronDown" && <path {...common} d="M7 10l5 5 5-5" />}
      {name === "chevronLeft" && <path {...common} d="M15 6l-6 6 6 6" />}
      {name === "chevronRight" && <path {...common} d="M9 6l6 6-6 6" />}
      {name === "clipboard" && (
        <>
          <path {...common} d="M8 5h8v3H8z" />
          <path {...common} d="M6 7h12v14H6z" />
        </>
      )}
      {name === "spark" && <path {...common} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />}
      {name === "cloud" && <path {...common} d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3 2A3 3 0 0 0 7 18z" />}
      {name === "code" && <path {...common} d="M9 18l-5-6 5-6M15 6l5 6-5 6" />}
      {name === "copy" && (
        <>
          <rect {...common} x="8" y="8" width="10" height="10" rx="2" />
          <path {...common} d="M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
        </>
      )}
      {name === "education" && <path {...common} d="M3 9l9-5 9 5-9 5zM7 12v5c3 2 7 2 10 0v-5" />}
      {name === "expand" && <path {...common} d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />}
      {name === "more" && (
        <>
          <circle cx="12" cy="5" r="1.4" fill="currentColor" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" />
          <circle cx="12" cy="19" r="1.4" fill="currentColor" />
        </>
      )}
      {name === "plus" && <path {...common} d="M12 5v14M5 12h14" />}
      {name === "sheet" && (
        <>
          <rect {...common} x="4" y="4" width="16" height="16" rx="2" />
          <path {...common} d="M4 10h16M10 4v16" />
        </>
      )}
      {name === "shield" && <path {...common} d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8 12l3 3 5-6" />}
      {name === "trash" && <path {...common} d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" />}
      {name === "user" && (
        <>
          <circle {...common} cx="12" cy="8" r="4" />
          <path {...common} d="M4 21c1.5-4 14.5-4 16 0" />
        </>
      )}
      {name === "briefcase" && (
        <>
          <path {...common} d="M4 8h16v11H4zM9 8V5h6v3" />
          <path {...common} d="M4 13h16" />
        </>
      )}
      {name === "arrows" && <path {...common} d="M8 7h11M15 3l4 4-4 4M16 17H5M9 13l-4 4 4 4" />}
    </svg>
  );
}

function RailGroup({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rail-group">
      <div className="rail-group-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function RailButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "rail-button active" : "rail-button"} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon: IconName; children: React.ReactNode }) {
  return (
    <section className="side-card">
      <h2>
        <Icon name={icon} />
        {title}
      </h2>
      {children}
    </section>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="health-row">
      <span>
        <Icon name="check" />
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function sectionKeyFromTitle(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("experience")) return "experience";
  if (lower.includes("project")) return "projects";
  return lower.replace(/[^a-z0-9]+/g, "-");
}

function SkillLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="skill-line">
      <strong>{label}:</strong>
      <span>{value}</span>
    </p>
  );
}

function ResumeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="resume-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ResumeEntry({ item }: { item: ResumeItem }) {
  return (
    <div className="resume-entry">
      <div className="entry-topline">
        <strong>{item.organization}</strong>
        <span>{item.location}</span>
      </div>
      <div className="entry-detail-line">
        <em>{item.role}</em>
        <span>{[item.start, item.end].filter(Boolean).join(" - ")}</span>
      </div>
      {item.impact && <p className="impact-line">{item.impact}</p>}
      <ul>
        {item.bullets
          .filter((bullet) => bullet.trim())
          .map((bullet, index) => (
            <li key={`${item.id}-preview-${index}`}>{bullet}</li>
          ))}
      </ul>
    </div>
  );
}

function labelize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function parseCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function hasResumeItemContent(item: ResumeItem) {
  return Boolean(
    item.organization.trim() ||
      item.role.trim() ||
      item.location.trim() ||
      item.impact.trim() ||
      item.originalDescription.trim() ||
      item.bullets.some((bullet) => bullet.trim()),
  );
}

function buildAiPrompt({
  version,
  targetRole,
  applicationCompany,
  jobDescription,
  performanceReview,
}: {
  version: ResumeVersion;
  targetRole: string;
  applicationCompany: string;
  jobDescription: string;
  performanceReview: string;
}) {
  const data = normalizeResumeData(version.data);
  const resumePayload = {
    versionName: version.name,
    profileName: version.profileName,
    targetRole: targetRole || version.targetRole,
    applicationCompany: applicationCompany || version.applicationCompany || "",
    contact: data.contact,
    summary: data.summary,
    hardSkills: data.hardSkills,
    softSkills: data.softSkills,
    languages: data.languages,
    experience: data.experience.map(serializableResumeItem),
    projects: data.projects.map(serializableResumeItem),
    education: data.education,
  };

  return `# Resume Tailoring Skill Prompt

You are an expert ATS resume editor running a resume-tailoring skill. Your main job is to judge the CV against the target role and company, identify gaps, ask for missing evidence, and only generate the final import-ready resume JSON after the human explicitly approves generation.

## Target Application
- Role: ${targetRole || version.targetRole || "Not specified"}
- Company: ${applicationCompany || version.applicationCompany || "Not specified"}

## Job Description
${jobDescription.trim() || "[Paste job description here]"}

## Historical Performance Review / Evidence
${performanceReview.trim() || "[Paste historical performance reviews, manager feedback, KPI notes, awards, wins, or promotion evidence here]"}

## Current Resume Version
\`\`\`json
${JSON.stringify(resumePayload, null, 2)}
\`\`\`

## Skill Workflow
- Start in planning mode. Do not generate the final JSON on the first response unless the user explicitly says "generate", "final", "可以 generate", or "可以生成".
- In planning mode, judge the CV against the JD and return:
  - Fit verdict: high / medium / low.
  - Matched evidence: JD requirements that are already supported by the resume.
  - Gap analysis: missing or weak evidence that may hurt ATS/recruiter fit.
  - Suggested positioning: which summary, skills, experience bullets, and projects should change.
  - Human questions: concise questions that would improve the final resume, especially missing metrics, tools, scope, stakeholders, and outcomes.
- Keep iterating with the human. Use new answers as additional evidence, but never invent unsupported facts.
- Only when the human says the equivalent of "okay, generate" should you produce the final answer.
- The final answer must be the clean resume JSON schema below and nothing else. It must be directly importable into my resume editor.

## Guardrails
- Keep everything truthful and based only on the provided resume evidence.
- Use the historical performance review as supporting evidence for stronger impact bullets when it is relevant.
- Prioritize ATS clarity, direct business impact, and keywords from the job description.
- Do not invent employers, degrees, dates, metrics, certifications, or tools.
- If a stronger metric is needed but missing, ask the human first or keep the bullet conservative.
- Make the result copy-ready for my resume editor.
- Planning responses can be concise markdown.
- Final generation response must be JSON only. Do not wrap it in markdown. Do not add commentary before or after the JSON.
- Final JSON must use the same clean backup/import format as the resume editor.

## Required JSON Output
\`\`\`json
{
  "versionName": "Targeted resume version name",
  "profileName": "${version.profileName}",
  "targetRole": "${targetRole || version.targetRole || ""}",
  "applicationCompany": "${applicationCompany || version.applicationCompany || ""}",
  "contact": {
    "fullName": "Full name",
    "headline": "Targeted headline",
    "location": "Location, or empty string if not provided",
    "email": "Email",
    "phone": "Phone",
    "links": "Links, or empty string if not provided"
  },
  "summary": "2-3 sentence tailored summary, copy-ready.",
  "experience": [
    {
      "organization": "Company / Organization",
      "role": "Role title",
      "location": "City, Country",
      "start": "MMM YYYY",
      "end": "MMM YYYY or Present",
      "keywords": "Comma-separated keywords",
      "impact": "One concise impact sentence, or empty string.",
      "bullets": [
        "Copy-ready bullet 1",
        "Copy-ready bullet 2",
        "Copy-ready bullet 3"
      ]
    }
  ],
  "projects": [
    {
      "organization": "Project name",
      "role": "Project role",
      "location": "Context or platform",
      "start": "MMM YYYY",
      "end": "MMM YYYY",
      "keywords": "Comma-separated keywords",
      "impact": "One concise impact sentence, or empty string.",
      "bullets": [
        "Copy-ready bullet 1",
        "Copy-ready bullet 2"
      ]
    }
  ],
  "education": [
    {
      "school": "School / University",
      "degree": "Degree / Certification",
      "location": "City, Country",
      "start": "MMM YYYY",
      "end": "MMM YYYY",
      "details": [
        "Cumulative GPA: value.",
        "Relevant coursework: course 1, course 2."
      ]
    }
  ],
  "skills": {
    "hardSkills": [
      "skill"
    ],
    "softSkills": [
      "skill"
    ],
    "languages": [
      "language"
    ]
  }
}
\`\`\``;
}

function serializableResumeItem(item: ResumeItem) {
  return {
    organization: item.organization,
    role: item.role,
    location: item.location,
    start: item.start,
    end: item.end,
    keywords: item.keywords,
    impact: item.impact,
    originalDescription: item.originalDescription,
    bullets: item.bullets.filter((bullet) => bullet.trim()),
  };
}

function buildResumeCsv(version: ResumeVersion) {
  const data = normalizeResumeData(version.data);
  const rows = [
    [
      "version_name",
      "target_role",
      "application_company",
      "section",
      "item_title",
      "role_or_detail",
      "date_range",
      "location",
      "keywords",
      "bullets_or_content",
    ],
    [
      version.name,
      version.targetRole,
      version.applicationCompany ?? "",
      "summary",
      data.contact.fullName,
      data.contact.headline,
      "",
      data.contact.location,
      "",
      data.summary,
    ],
    [
      version.name,
      version.targetRole,
      version.applicationCompany ?? "",
      "skills",
      "Hard skills",
      "",
      "",
      "",
      "",
      data.hardSkills.join(", "),
    ],
    [
      version.name,
      version.targetRole,
      version.applicationCompany ?? "",
      "skills",
      "Soft skills",
      "",
      "",
      "",
      "",
      data.softSkills.join(", "),
    ],
    [
      version.name,
      version.targetRole,
      version.applicationCompany ?? "",
      "skills",
      "Languages",
      "",
      "",
      "",
      "",
      data.languages.join(", "),
    ],
    ...data.experience.map((item) => csvResumeItem(version, "experience", item)),
    ...data.projects.map((item) => csvResumeItem(version, "projects", item)),
    ...data.education.map((item) => [
      version.name,
      version.targetRole,
      version.applicationCompany ?? "",
      "education",
      item.school,
      item.degree,
      [item.start, item.end].filter(Boolean).join(" - "),
      item.location,
      "",
      item.details,
    ]),
  ];

  return `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

function csvResumeItem(version: ResumeVersion, section: string, item: ResumeItem) {
  return [
    version.name,
    version.targetRole,
    version.applicationCompany ?? "",
    section,
    item.organization,
    item.role,
    [item.start, item.end].filter(Boolean).join(" - "),
    item.location,
    item.keywords,
    [...item.bullets.filter((bullet) => bullet.trim()), item.impact].filter(Boolean).join("\n"),
  ];
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

type ImportedResume = {
  profileName?: string;
  targetRole?: string;
  applicationCompany?: string;
  name?: string;
  data: ResumeData;
};

function parseImportedFile(text: string, fileName: string): ImportedResume | null {
  if (fileName.toLowerCase().endsWith(".csv")) return parseImportedCsv(text);
  try {
    return parseImportedJson(JSON.parse(text));
  } catch {
    return parseImportedCsv(text);
  }
}

function parseImportedJson(value: unknown): ImportedResume | null {
  if (!isRecord(value)) return null;

  if (isResumeData(value.data)) {
    return {
      profileName: asString(value.profileName),
      targetRole: asString(value.targetRole),
      applicationCompany: asString(value.applicationCompany),
      name: asString(value.name),
      data: normalizeResumeData(value.data),
    };
  }

  if (isResumeData(value)) {
    const metadata = value as ResumeData & Record<string, unknown>;
    return {
      profileName: asString(metadata.profileName),
      targetRole: asString(metadata.targetRole),
      applicationCompany: asString(metadata.applicationCompany),
      name: asString(metadata.versionName) || asString(metadata.name),
      data: normalizeResumeData(value),
    };
  }

  const contact = isRecord(value.contact) ? value.contact : null;
  const skills = isRecord(value.skills) ? value.skills : null;
  if (!contact || typeof value.summary !== "string") return null;

  return {
    profileName: asString(value.profileName),
    targetRole: asString(value.targetRole),
    applicationCompany: asString(value.applicationCompany),
    name: asString(value.versionName) || asString(value.name),
    data: normalizeResumeData({
      contact: {
        fullName: asString(contact.fullName),
        headline: asString(contact.headline),
        location: asString(contact.location),
        email: asString(contact.email),
        phone: asString(contact.phone),
        links: asString(contact.links),
      },
      summary: value.summary,
      hardSkills: parseStringList(skills?.hardSkills),
      softSkills: parseStringList(skills?.softSkills),
      languages: parseStringList(skills?.languages),
      experience: parseResumeItems(value.experience),
      projects: parseResumeItems(value.projects),
      education: parseEducationItems(value.education),
    }),
  };
}

function parseImportedCsv(text: string): ImportedResume | null {
  const rows = parseCsv(text.replace(/^\ufeff/, ""));
  if (rows.length < 2) return null;

  const header = rows[0].map((cell) => cell.trim());
  const index = (name: string) => header.indexOf(name);
  const required = [
    "version_name",
    "target_role",
    "application_company",
    "section",
    "item_title",
    "role_or_detail",
    "date_range",
    "location",
    "keywords",
    "bullets_or_content",
  ];
  if (required.some((name) => index(name) === -1)) return null;

  const data: ResumeData = {
    contact: {
      fullName: "",
      headline: "",
      location: "",
      email: "",
      phone: "",
      links: "",
    },
    summary: "",
    hardSkills: [],
    softSkills: [],
    languages: [],
    experience: [],
    projects: [],
    education: [],
  };

  let versionName = "";
  let targetRole = "";
  let applicationCompany = "";

  for (const row of rows.slice(1)) {
    const cell = (name: string) => row[index(name)] ?? "";
    const section = cell("section").trim().toLowerCase();
    versionName ||= cell("version_name");
    targetRole ||= cell("target_role");
    applicationCompany ||= cell("application_company");

    if (section === "summary") {
      data.contact.fullName = cell("item_title");
      data.contact.headline = cell("role_or_detail");
      data.contact.location = cell("location");
      data.summary = cell("bullets_or_content");
      continue;
    }

    if (section === "skills") {
      const title = cell("item_title").trim().toLowerCase();
      const skills = parseStringList(cell("bullets_or_content"));
      if (title.includes("hard")) data.hardSkills = skills;
      if (title.includes("soft")) data.softSkills = skills;
      if (title.includes("language")) data.languages = skills;
      continue;
    }

    if (section === "education") {
      const [start, end] = splitDateRange(cell("date_range"));
      data.education.push({
        id: makeId("edu"),
        school: cell("item_title"),
        degree: cell("role_or_detail"),
        location: cell("location"),
        start,
        end,
        details: cell("bullets_or_content"),
      });
      continue;
    }

    if (section === "experience" || section === "projects") {
      const [start, end] = splitDateRange(cell("date_range"));
      const contentLines = splitLines(cell("bullets_or_content"));
      const item: ResumeItem = {
        id: makeId("item"),
        organization: cell("item_title"),
        role: cell("role_or_detail"),
        location: cell("location"),
        start,
        end,
        keywords: cell("keywords"),
        impact: "",
        originalDescription: "",
        bullets: contentLines,
      };
      if (section === "experience") data.experience.push(item);
      else data.projects.push(item);
    }
  }

  if (!data.contact.fullName && !data.summary && data.experience.length === 0) return null;

  return {
    profileName: "Imported",
    targetRole,
    applicationCompany,
    name: versionName,
    data: normalizeResumeData(data),
  };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function splitDateRange(value: string): [string, string] {
  const [start = "", ...rest] = value.split(" - ");
  return [start, rest.join(" - ")];
}

function isResumeData(value: unknown): value is ResumeData {
  return (
    isRecord(value) &&
    isRecord(value.contact) &&
    typeof value.summary === "string" &&
    Array.isArray(value.hardSkills) &&
    Array.isArray(value.softSkills) &&
    Array.isArray(value.experience) &&
    Array.isArray(value.projects) &&
    Array.isArray(value.education)
  );
}

function parseResumeItems(value: unknown): ResumeItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    id: asString(item.id) || makeId("item"),
    organization: asString(item.organization),
    role: asString(item.role),
    location: asString(item.location),
    start: asString(item.start),
    end: asString(item.end),
    keywords: asString(item.keywords),
    impact: asString(item.impact),
    originalDescription: asString(item.originalDescription),
    bullets: parseStringList(item.bullets),
  }));
}

function parseEducationItems(value: unknown): EducationItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    id: asString(item.id) || makeId("edu"),
    school: asString(item.school),
    degree: asString(item.degree),
    location: asString(item.location),
    start: asString(item.start),
    end: asString(item.end),
    details: Array.isArray(item.details) ? parseStringList(item.details).join("\n") : asString(item.details),
  }));
}

function parseStringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return parseCommaList(value);
  return [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function makeSeedVersions(): ResumeVersion[] {
  const seeds = [
    { profileName: "General", targetRole: "General", name: "General Base" },
    { profileName: "Sales CS", targetRole: "Sales / Customer Success", name: "Sales CS Base" },
    { profileName: "Product Ops", targetRole: "Product / Operations", name: "Product Ops Base" },
    { profileName: "Tech AI Builder", targetRole: "Tech / AI Builder", name: "Tech AI Builder Base" },
  ];

  const now = timestamp();
  return seeds.map((seed, index) => ({
    id: index + 1,
    profileId: index + 1,
    profileName: seed.profileName,
    targetRole: seed.targetRole,
    applicationCompany: "",
    name: seed.name,
    data: cloneStarterResume(seed.targetRole),
    createdAt: now,
    updatedAt: now,
  }));
}

function ensureLocalVersions() {
  const versions = readVersions();
  if (versions.length > 0) return versions;
  const seedVersions = makeSeedVersions();
  writeVersions(seedVersions);
  localStorage.setItem(NEXT_ID_KEY, String(seedVersions.length + 1));
  return seedVersions;
}

function readVersions(): ResumeVersion[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const versions = JSON.parse(raw) as ResumeVersion[];
    return versions.map((version) => ({
      ...version,
      applicationCompany: version.applicationCompany ?? "",
      data: normalizeResumeData(version.data),
    }));
  } catch {
    return [];
  }
}

function writeVersions(versions: ResumeVersion[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
}

function toListItems(versions: ResumeVersion[]): ResumeListItem[] {
  return versions.map((version) => ({
    id: version.id,
    profileId: version.profileId,
    profileName: version.profileName,
    targetRole: version.targetRole,
    applicationCompany: version.applicationCompany ?? "",
    name: version.name,
    previewName: version.data.contact.fullName,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  }));
}

function nextId() {
  const current = Number(localStorage.getItem(NEXT_ID_KEY) ?? "1");
  localStorage.setItem(NEXT_ID_KEY, String(current + 1));
  return current;
}

function timestamp() {
  return new Date().toISOString();
}
