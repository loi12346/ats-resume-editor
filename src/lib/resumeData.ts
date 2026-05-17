import type { ResumeData } from "./types";

export function normalizeResumeData(data: ResumeData): ResumeData {
  const legacySkills = Array.isArray(data.skills) ? data.skills : [];
  const hardSkills = Array.isArray(data.hardSkills) && data.hardSkills.length > 0 ? data.hardSkills : legacySkills;
  const rawSoftSkills = Array.isArray(data.softSkills) ? data.softSkills : [];
  const existingLanguages = Array.isArray(data.languages) ? data.languages : [];
  const inferredLanguages = existingLanguages.length > 0 ? existingLanguages : rawSoftSkills.filter(isLanguageSkill);
  const softSkills = rawSoftSkills.filter((item) => !inferredLanguages.includes(item));

  return {
    ...data,
    contact: {
      ...data.contact,
      location: clearPlaceholder(data.contact.location, "City, Country"),
      email: clearPlaceholder(data.contact.email, "email@example.com"),
      phone: clearPlaceholder(data.contact.phone, "+00 000 0000"),
      links: clearPlaceholder(data.contact.links, "LinkedIn | Portfolio | GitHub"),
    },
    hardSkills,
    softSkills,
    languages: inferredLanguages,
    education: data.education.map((item) => ({
      ...item,
      start: item.start === "YYYY" ? "MMM YYYY" : item.start,
      end: item.end === "YYYY" ? "MMM YYYY" : item.end,
      details: splitEducationDetails(item.details),
    })),
  };
}

function clearPlaceholder(value: string, placeholder: string) {
  return value.trim() === placeholder ? "" : value;
}

export function allSkills(data: ResumeData) {
  const normalized = normalizeResumeData(data);
  return [...normalized.hardSkills, ...normalized.softSkills, ...normalized.languages].filter(Boolean);
}

function isLanguageSkill(value: string) {
  return /\b(chinese|english|malay|mandarin|cantonese|bahasa|fluent|proficient|native|bilingual)\b/i.test(value);
}

function splitEducationDetails(value: string) {
  return value.replace(/\.\s+(Relevant coursework:)/i, ".\n$1");
}
