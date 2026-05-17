"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

import { cloneStarterResume } from "@/lib/defaultResume";
import { buildDocx } from "@/lib/docx";
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
    const confirmed = window.confirm(`Delete "${current.name}"?`);
    if (!confirmed) return;
    actionLockRef.current = true;
    setIsWorking(true);
    try {
      setStatus("Deleting");
      const nextVersions = readVersions().filter((version) => version.id !== current.id);
      writeVersions(nextVersions);
      setStoredVersions(nextVersions);
      setVersions(toListItems(nextVersions));
      loadVersion(nextVersions[0].id, nextVersions);
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
    saveVersion();
    window.print();
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
    const text = await file.text();
    const imported = JSON.parse(text) as {
      profileName?: string;
      targetRole?: string;
      applicationCompany?: string;
      name?: string;
      data?: ResumeData;
    };
    if (!imported.data) {
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
    event.target.value = "";
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

  return (
    <main className={isRailHidden ? "app-shell rail-collapsed" : "app-shell"}>
      <button
        className={isRailHidden ? "sidebar-toggle collapsed no-print" : "sidebar-toggle no-print"}
        onClick={() => setIsRailHidden(!isRailHidden)}
        title={isRailHidden ? "Expand versions" : "Collapse versions"}
        aria-label={isRailHidden ? "Expand versions" : "Collapse versions"}
      >
        {isRailHidden ? ">" : "<"}
      </button>

      <aside className={isRailHidden ? "version-rail collapsed no-print" : "version-rail no-print"} aria-label="Resume versions">
          <div className="brand-block">
            <p className="eyebrow">Local Browser</p>
            <h1>Resume Editor</h1>
            <div className="brand-status">
              <span>{status}</span>
            </div>
          </div>

          <div className="version-actions">
              <button onClick={addVersion} disabled={isWorking}>
                + Add Version
              </button>
          </div>

          <div className="version-list">
            {versions.map((item) => (
              <button
                className={current?.id === item.id ? "version-row active" : "version-row"}
                key={item.id}
                disabled={isWorking}
                onClick={() => loadVersion(item.id)}
              >
                <strong>{item.name}</strong>
                <span>{item.targetRole}</span>
              </button>
            ))}
          </div>
        </aside>

      <section className="workspace no-print">
        <header className="toolbar">
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
            <button className="primary-action" onClick={saveVersion} disabled={isWorking} title="Save current version">
              Save
            </button>
            <button
              onClick={() => createBlank(profileName, targetRole, `${versionName} Copy`, data, applicationCompany)}
              disabled={isWorking}
              title="Copy version"
            >
              Copy
            </button>
            <button onClick={deleteCurrent} disabled={!current || isWorking} title="Delete version">
              Delete
            </button>
            <button onClick={printPdf} disabled={isWorking} title="Open print dialog for PDF">
              PDF
            </button>
            <button onClick={downloadDocx} disabled={!canDownload || isWorking} title="Download DOCX">
              DOCX
            </button>
            <button onClick={exportCsv} disabled={!canDownload || isWorking} title="Export sheet-ready CSV">
              CSV
            </button>
            <button onClick={exportJson} disabled={isWorking} title="Export backup JSON">
              JSON
            </button>
            <button onClick={() => importRef.current?.click()} disabled={isWorking} title="Import backup JSON">
              Import
            </button>
            <input ref={importRef} hidden type="file" accept="application/json" onChange={importJson} />
          </div>
        </header>

        <div className="editor-grid">
          <section className="editor-pane">
            <div className="tab-bar">
              <button className={activeTab === "content" ? "active" : ""} onClick={() => setActiveTab("content")}>
                Content
              </button>
              <button className={activeTab === "notes" ? "active" : ""} onClick={() => setActiveTab("notes")}>
                Raw Notes
              </button>
              <button className={activeTab === "aiPrompt" ? "active" : ""} onClick={() => setActiveTab("aiPrompt")}>
                AI Prompt
              </button>
            </div>

            {activeTab === "content" ? (
              <ContentEditor data={data} setData={setData} />
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
          </section>

          <section className="preview-pane" aria-label="Resume preview">
            <ResumePreview data={data} />
          </section>
        </div>
      </section>

      <section className="print-surface">
        <ResumePreview data={data} />
      </section>
    </main>
  );
}

function ContentEditor({
  data,
  setData,
}: {
  data: ResumeData;
  setData: (value: ResumeData) => void;
}) {
  return (
    <div className="form-stack">
      <section className="form-section">
        <h2>Header</h2>
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

      <section className="form-section">
        <h2>Summary</h2>
        <textarea
          rows={5}
          value={data.summary}
          onChange={(event) => setData({ ...data, summary: event.target.value })}
        />
      </section>

      <ResumeItemsEditor
        title="Experience"
        items={data.experience}
        onChange={(items) => setData({ ...data, experience: items })}
      />
      <ResumeItemsEditor title="Projects" items={data.projects} onChange={(items) => setData({ ...data, projects: items })} />
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
          <span>resume-tailor-prompt.md</span>
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
}: {
  title: string;
  items: ResumeItem[];
  onChange: (items: ResumeItem[]) => void;
  notesOnly?: boolean;
}) {
  const update = (index: number, patch: Partial<ResumeItem>) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  return (
    <section className="form-section">
      <div className="section-head">
        <h2>{title}</h2>
        <button onClick={() => onChange([...items, blankExperience()])}>+ Add</button>
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
                <button onClick={() => update(index, { bullets: [...item.bullets, ""] })}>+ Bullet</button>
              </div>
            )}

            <div className="item-actions">
              <button disabled={index === 0} onClick={() => onChange(move(items, index, index - 1))}>
                Up
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
    <section className="form-section">
      <div className="section-head">
        <h2>Education</h2>
        <button onClick={() => onChange([...items, blankEducation()])}>+ Add</button>
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
                Up
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
    <section className="form-section">
      <h2>Skills</h2>
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
        <label>
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
  return (
    <article className="resume-page">
      <header className="resume-header">
        <h1>{data.contact.fullName}</h1>
        <p>{data.contact.headline}</p>
        <p>
          {[data.contact.location, data.contact.email, data.contact.phone, data.contact.links].filter(Boolean).join(" | ")}
        </p>
      </header>

      <ResumeSection title="Summary">
        <p>{data.summary}</p>
      </ResumeSection>

      <ResumeSection title="Experience">
        {data.experience.map((item) => (
          <ResumeEntry item={item} key={item.id} />
        ))}
      </ResumeSection>

      <ResumeSection title="Projects">
        {data.projects.map((item) => (
          <ResumeEntry item={item} key={item.id} />
        ))}
      </ResumeSection>

      <ResumeSection title="Education">
        {data.education.map((item) => (
          <div className="resume-entry" key={item.id}>
            <div className="entry-topline">
              <strong>{item.school}</strong>
              <span>{item.location}</span>
            </div>
            <div className="entry-detail-line">
              <em>{item.degree}</em>
              <span>{[item.start, item.end].filter(Boolean).join(" - ")}</span>
            </div>
            {item.details && (
              <div className="education-details">
                {splitLines(item.details).map((line, index) => (
                  <p key={`${item.id}-detail-${index}`}>{line}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </ResumeSection>

      <ResumeSection title="Skills">
        {data.hardSkills.length > 0 && (
          <p>
            <strong>Hard skills:</strong> {data.hardSkills.join(", ")}
          </p>
        )}
        {data.softSkills.length > 0 && (
          <p>
            <strong>Soft skills:</strong> {data.softSkills.join(", ")}
          </p>
        )}
        {data.languages.length > 0 && (
          <p>
            <strong>Languages:</strong> {data.languages.join(", ")}
          </p>
        )}
      </ResumeSection>
    </article>
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

  return `# Resume Tailoring Prompt

You are an expert ATS resume editor. Rewrite my resume content for the target role and company below.

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

## Instructions
- Keep everything truthful and based only on the provided resume evidence.
- Use the historical performance review as supporting evidence for stronger impact bullets when it is relevant.
- Prioritize ATS clarity, direct business impact, and keywords from the job description.
- Do not invent employers, degrees, dates, metrics, certifications, or tools.
- If a stronger metric is needed but missing, put it under Missing Evidence / Risks.
- Make the result copy-ready for my resume editor.

## Required Output Format

### Summary
[2-3 sentence tailored summary]

### Skills
Hard skills: [comma-separated]
Soft skills: [comma-separated]

### Experience
#### [Company / Organization] | [Role]
Bullet 1: [copy-ready bullet]
Bullet 2: [copy-ready bullet]
Bullet 3: [copy-ready bullet]

### Projects
#### [Project Name] | [Role]
Bullet 1: [copy-ready bullet]
Bullet 2: [copy-ready bullet]
Bullet 3: [copy-ready bullet]

### Keyword Match
[keywords from the JD that are already supported by my resume evidence]

### Missing Evidence / Risks
[important JD requirements that my resume does not prove yet]`;
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
