import { normalizeResumeData } from "./resumeData";
import type { ResumeData, ResumeItem } from "./types";

type PdfLine = {
  text: string;
  font: "regular" | "bold" | "italic";
  size: number;
  x: number;
  y: number;
};

type PdfRule = {
  x1: number;
  x2: number;
  y: number;
};

type DrawState = {
  lines: PdfLine[];
  rules: PdfRule[];
  y: number;
  fontSize: number;
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const marginX = 42;
const marginTop = 34;
const marginBottom = 34;
const usableWidth = pageWidth - marginX * 2;
const encoder = new TextEncoder();

export function buildPdf(data: ResumeData) {
  const normalized = normalizeResumeData(data);
  const fontSize = fitFontSize(normalized);
  const state = layoutResume(normalized, fontSize);
  const content = renderContent(state);
  return buildPdfDocument(content);
}

function fitFontSize(data: ResumeData) {
  let low = 4.8;
  let high = 10.2;

  for (let index = 0; index < 12; index += 1) {
    const mid = (low + high) / 2;
    const state = layoutResume(data, mid);
    if (state.y >= marginBottom) low = mid;
    else high = mid;
  }

  return low;
}

function layoutResume(data: ResumeData, fontSize: number) {
  const state: DrawState = {
    lines: [],
    rules: [],
    y: pageHeight - marginTop,
    fontSize,
  };

  const nameSize = fontSize * 1.85;
  const headerSize = fontSize * 0.98;
  drawCentered(state, data.contact.fullName.toUpperCase(), "bold", nameSize);
  drawCentered(state, data.contact.headline, "regular", headerSize);
  drawCentered(
    state,
    [data.contact.location, data.contact.email, data.contact.phone, data.contact.links].filter(Boolean).join(" | "),
    "regular",
    headerSize,
  );
  state.y -= fontSize * 0.7;
  rule(state);
  state.y -= fontSize * 1.05;

  section(state, "SUMMARY");
  paragraph(state, data.summary);

  if (data.experience.length > 0) {
    section(state, "EXPERIENCE");
    data.experience.forEach((item) => entry(state, item));
  }

  if (data.projects.length > 0) {
    section(state, "PROJECTS");
    data.projects.forEach((item) => entry(state, item));
  }

  if (data.education.length > 0) {
    section(state, "EDUCATION");
    data.education.forEach((item) => {
      twoColumn(state, item.school, item.location, "bold");
      twoColumn(state, item.degree, [item.start, item.end].filter(Boolean).join(" - "), "italic");
      splitLines(item.details).forEach((line) => paragraph(state, line));
      state.y -= fontSize * 0.2;
    });
  }

  if (data.hardSkills.length > 0 || data.softSkills.length > 0 || data.languages.length > 0) {
    section(state, "SKILLS & LANGUAGES");
    if (data.hardSkills.length > 0) labeledParagraph(state, "Hard skills:", data.hardSkills.join(", "));
    if (data.softSkills.length > 0) labeledParagraph(state, "Soft skills:", data.softSkills.join(", "));
    if (data.languages.length > 0) labeledParagraph(state, "Languages:", data.languages.join(", "));
  }

  return state;
}

function section(state: DrawState, title: string) {
  state.y -= state.fontSize * 0.7;
  addRawLine(state, title, "bold", state.fontSize * 1.02, marginX, state.y);
  state.y -= state.fontSize * 0.45;
  rule(state);
  state.y -= state.fontSize * 0.95;
}

function entry(state: DrawState, item: ResumeItem) {
  twoColumn(state, item.organization, item.location, "bold");
  twoColumn(state, item.role, [item.start, item.end].filter(Boolean).join(" - "), "italic");
  if (item.impact) paragraph(state, item.impact, "italic");
  item.bullets.filter(Boolean).forEach((bullet) => bulletLine(state, bullet));
  state.y -= state.fontSize * 0.25;
}

function labeledParagraph(state: DrawState, label: string, text: string) {
  addLine(state, label, "bold", state.fontSize, marginX);
  paragraph(state, text);
}

function paragraph(state: DrawState, text: string, font: PdfLine["font"] = "regular") {
  wrapText(text, usableWidth, state.fontSize, font).forEach((line) => addLine(state, line, font, state.fontSize, marginX));
}

function bulletLine(state: DrawState, text: string) {
  const bulletX = marginX + state.fontSize * 0.6;
  const textX = marginX + state.fontSize * 1.9;
  const width = usableWidth - state.fontSize * 1.9;
  const lines = wrapText(text, width, state.fontSize, "regular");
  lines.forEach((line, index) => {
    if (index === 0) addRawLine(state, "-", "regular", state.fontSize, bulletX, state.y);
    addRawLine(state, line, "regular", state.fontSize, textX, state.y);
    state.y -= lineHeight(state.fontSize);
  });
}

function twoColumn(state: DrawState, left: string, right: string, font: PdfLine["font"]) {
  const rightWidth = right ? textWidth(right, state.fontSize, "regular") : 0;
  const leftWidth = usableWidth - rightWidth - 14;
  const leftLines = wrapText(left, leftWidth, state.fontSize, font);

  leftLines.forEach((line, index) => {
    addRawLine(state, line, font, state.fontSize, marginX, state.y);
    if (index === 0 && right) {
      addRawLine(state, right, "regular", state.fontSize, pageWidth - marginX - rightWidth, state.y);
    }
    state.y -= lineHeight(state.fontSize);
  });
}

function drawCentered(state: DrawState, text: string, font: PdfLine["font"], size: number) {
  if (!text) return;
  const x = (pageWidth - textWidth(text, size, font)) / 2;
  addLine(state, text, font, size, x);
}

function addLine(state: DrawState, text: string, font: PdfLine["font"], size: number, x: number) {
  addRawLine(state, text, font, size, x, state.y);
  state.y -= lineHeight(size);
}

function addRawLine(state: DrawState, text: string, font: PdfLine["font"], size: number, x: number, y: number) {
  if (!text) return;
  state.lines.push({ text, font, size, x, y });
}

function rule(state: DrawState) {
  state.rules.push({ x1: marginX, x2: pageWidth - marginX, y: state.y });
}

function wrapText(text: string, maxWidth: number, size: number, font: PdfLine["font"]) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size, font) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  });

  if (line) lines.push(line);
  return lines;
}

function lineHeight(size: number) {
  return size * 1.34;
}

function textWidth(text: string, size: number, font: PdfLine["font"]) {
  const factor = font === "bold" ? 0.56 : 0.52;
  return toPdfText(text).length * size * factor;
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderContent(state: DrawState) {
  const commands: string[] = ["0 0 0 rg", "0.5 w"];

  state.rules.forEach((item) => {
    commands.push(`${n(item.x1)} ${n(item.y)} m ${n(item.x2)} ${n(item.y)} l S`);
  });

  state.lines.forEach((line) => {
    const font = line.font === "bold" ? "F2" : line.font === "italic" ? "F3" : "F1";
    commands.push(`BT /${font} ${n(line.size)} Tf ${n(line.x)} ${n(line.y)} Td (${escapePdf(line.text)}) Tj ET`);
  });

  return commands.join("\n");
}

function buildPdfDocument(content: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Calibri >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Calibri-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Calibri-Italic >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return encoder.encode(pdf);
}

function escapePdf(value: string) {
  return toPdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function toPdfText(value: string) {
  return value
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7e]/g, "");
}

function n(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}
