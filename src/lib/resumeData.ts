import type { ResumeData } from "./types";

export function normalizeResumeData(data: ResumeData): ResumeData {
  const legacySkills = Array.isArray(data.skills) ? data.skills : [];
  const hardSkills = Array.isArray(data.hardSkills) && data.hardSkills.length > 0 ? data.hardSkills : legacySkills;
  const softSkills = Array.isArray(data.softSkills) ? data.softSkills : [];

  return {
    ...data,
    hardSkills,
    softSkills,
    education: data.education.map((item) => ({
      ...item,
      start: item.start === "YYYY" ? "MMM YYYY" : item.start,
      end: item.end === "YYYY" ? "MMM YYYY" : item.end,
    })),
  };
}

export function allSkills(data: ResumeData) {
  const normalized = normalizeResumeData(data);
  return [...normalized.hardSkills, ...normalized.softSkills].filter(Boolean);
}
