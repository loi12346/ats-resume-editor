"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

import { normalizeResumeData } from "@/lib/resumeData";
import type { EducationItem, ResumeData, ResumeItem, ResumeListItem, ResumeVersion } from "@/lib/types";

type ApiListResponse = {
  versions: ResumeListItem[];
};

type ApiVersionResponse = {
  version: ResumeVersion;
};

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
  const [versions, setVersions] = useState<ResumeListItem[]>([]);
  const [current, setCurrent] = useState<ResumeVersion | null>(null);
  const [profileName, setProfileName] = useState("General");
  const [targetRole, setTargetRole] = useState("General");
  const [versionName, setVersionName] = useState("General Base");
  const [data, setData] = useState<ResumeData | null>(null);
  const [status, setStatus] = useState("Loading");
  const [activeTab, setActiveTab] = useState<"content" | "notes">("content");
  const [isWorking, setIsWorking] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const importRef = useRef<HTMLInputElement>(null);
  const actionLockRef = useRef(false);
  const lastAddAtRef = useRef(0);

  const canDownload = Boolean(current?.id);

  useEffect(() => {
    void loadVersions();
  }, []);

  useEffect(() => {
    const storedTheme = localStorage.getItem("resume-editor-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(storedTheme === "dark" || (!storedTheme && prefersDark) ? "dark" : "light");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("resume-editor-theme", theme);
  }, [theme]);

  async function loadVersions(selectId?: number) {
    const response = await fetch("/api/resumes", { cache: "no-store" });
    const payload = (await response.json()) as ApiListResponse;
    setVersions(payload.versions);
    const id = selectId ?? payload.versions[0]?.id;
    if (id) await loadVersion(id);
  }

  async function loadVersion(id: number) {
    setStatus("Loading version");
    const response = await fetch(`/api/resumes/${id}`, { cache: "no-store" });
    const payload = (await response.json()) as ApiVersionResponse;
    setCurrent(payload.version);
    setProfileName(payload.version.profileName);
    setTargetRole(payload.version.targetRole);
    setVersionName(payload.version.name);
    setData(normalizeResumeData(payload.version.data));
    setStatus("Ready");
  }

  async function createBlank(profile: string, role: string, name: string, sourceData?: ResumeData) {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setIsWorking(true);
    try {
      setStatus("Creating version");
      const response = await fetch("/api/resumes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileName: profile,
          targetRole: role,
          name,
          data: sourceData,
        }),
      });
      const payload = (await response.json()) as ApiVersionResponse;
      await loadVersions(payload.version.id);
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
    await createBlank(profileName || "General", targetRole || "General", nextName, data ?? undefined);
  }

  async function saveVersion() {
    if (!data || actionLockRef.current) return null;
    actionLockRef.current = true;
    setIsWorking(true);
    try {
      setStatus("Saving");
      if (!current) {
        const response = await fetch("/api/resumes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileName,
            targetRole,
            name: versionName,
            data,
          }),
        });
        const payload = (await response.json()) as ApiVersionResponse;
        await loadVersions(payload.version.id);
        setStatus("Saved");
        return payload.version;
      }

      const response = await fetch(`/api/resumes/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileName,
          targetRole,
          name: versionName,
          data,
        }),
      });
      const payload = (await response.json()) as ApiVersionResponse;
      setCurrent(payload.version);
      await loadVersions(payload.version.id);
      setStatus("Saved");
      return payload.version;
    } catch {
      setStatus("Save failed");
      return null;
    } finally {
      actionLockRef.current = false;
      setIsWorking(false);
    }
  }

  async function deleteCurrent() {
    if (!current || actionLockRef.current) return;
    const confirmed = window.confirm(`Delete "${current.name}"?`);
    if (!confirmed) return;
    actionLockRef.current = true;
    setIsWorking(true);
    try {
      setStatus("Deleting");
      await fetch(`/api/resumes/${current.id}`, { method: "DELETE" });
      const response = await fetch("/api/resumes", { cache: "no-store" });
      const payload = (await response.json()) as ApiListResponse;
      const nextVersion = payload.versions.find((version) => version.id !== current.id) ?? payload.versions[0];

      if (nextVersion) {
        setVersions(payload.versions);
        await loadVersion(nextVersion.id);
      } else {
        const createResponse = await fetch("/api/resumes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileName: "General",
            targetRole: "General",
            name: "General Base",
          }),
        });
        const createPayload = (await createResponse.json()) as ApiVersionResponse;
        await loadVersions(createPayload.version.id);
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
    const saved = await saveVersion();
    const id = saved?.id ?? current?.id;
    if (!id) return;
    window.location.href = `/api/resumes/${id}/docx`;
  }

  async function printPdf() {
    await saveVersion();
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
      name?: string;
      data?: ResumeData;
    };
    if (!imported.data) {
      setStatus("Import failed");
      return;
    }
    await createBlank(
      imported.profileName || "Imported",
      imported.targetRole || imported.profileName || "Imported",
      imported.name ? `${imported.name} Import` : "Imported Version",
      imported.data,
    );
    event.target.value = "";
  }

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
    <main className="app-shell">
      <aside className="version-rail no-print" aria-label="Resume versions">
        <div className="brand-block">
          <p className="eyebrow">Local SQLite</p>
          <h1>Resume Editor</h1>
          <div className="brand-status">
            <span>{status}</span>
            <button
              className="theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Toggle dark mode"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>
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
              Version
              <input value={versionName} onChange={(event) => setVersionName(event.target.value)} />
            </label>
          </div>
          <div className="toolbar-actions">
            <button onClick={saveVersion} disabled={isWorking} title="Save current version">
              Save
            </button>
            <button
              onClick={() => createBlank(profileName, targetRole, `${versionName} Copy`, data)}
              disabled={isWorking}
              title="Copy version"
            >
              Copy
            </button>
            <button onClick={deleteCurrent} disabled={isWorking} title="Delete version">
              Delete
            </button>
            <button onClick={printPdf} disabled={isWorking} title="Open print dialog for PDF">
              PDF
            </button>
            <button onClick={downloadDocx} disabled={!canDownload || isWorking} title="Download DOCX">
              DOCX
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
            </div>

            {activeTab === "content" ? (
              <ContentEditor data={data} setData={setData} />
            ) : (
              <RawNotesEditor data={data} setData={setData} />
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
              <input value={item.details} onChange={(event) => update(index, { details: event.target.value })} />
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
            {item.details && <p>{item.details}</p>}
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

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
