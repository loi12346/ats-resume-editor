import { normalizeResumeData } from "./resumeData";
import type { ResumeData, ResumeItem } from "./types";

export type PdfLine = {
  text: string;
  font: "regular" | "bold" | "italic";
  size: number;
  x: number;
  y: number;
  align?: "start" | "end";
};

export type PdfRule = {
  x1: number;
  x2: number;
  y: number;
};

export type PdfDot = {
  x: number;
  y: number;
  radius: number;
};

export type PdfLayout = {
  lines: PdfLine[];
  rules: PdfRule[];
  dots: PdfDot[];
  y: number;
  fontSize: number;
};

export const PDF_PAGE_WIDTH = 595.28;
export const PDF_PAGE_HEIGHT = 841.89;
const pageWidth = PDF_PAGE_WIDTH;
const pageHeight = PDF_PAGE_HEIGHT;
const marginX = 32;
const marginTop = 34;
const marginBottom = 34;
const usableWidth = pageWidth - marginX * 2;
const encoder = new TextEncoder();
const layoutScale = {
  headerRuleGap: 1.25,
  sectionTopGap: 0.75,
  sectionRuleGap: 0.62,
  sectionContentGap: 1.45,
  entryBottomGap: 0.25,
};

export function buildPdf(data: ResumeData) {
  const state = buildResumeLayout(data);
  const content = renderContent(state);
  return buildPdfDocument(content);
}

export function buildResumeLayout(data: ResumeData) {
  const normalized = normalizeResumeData(data);
  const fontSize = fitFontSize(normalized);
  return layoutResume(normalized, fontSize);
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
  const state: PdfLayout = {
    lines: [],
    rules: [],
    dots: [],
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
  state.y -= fontSize * layoutScale.headerRuleGap;

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

function section(state: PdfLayout, title: string) {
  state.y -= state.fontSize * layoutScale.sectionTopGap;
  addRawLine(state, title, "bold", state.fontSize * 1.02, marginX, state.y);
  state.y -= state.fontSize * layoutScale.sectionRuleGap;
  rule(state);
  state.y -= state.fontSize * layoutScale.sectionContentGap;
}

function entry(state: PdfLayout, item: ResumeItem) {
  twoColumn(state, item.organization, item.location, "bold");
  twoColumn(state, item.role, [item.start, item.end].filter(Boolean).join(" - "), "italic");
  if (item.impact) paragraph(state, item.impact, "italic");
  item.bullets.filter(Boolean).forEach((bullet) => bulletLine(state, bullet));
  state.y -= state.fontSize * layoutScale.entryBottomGap;
}

function labeledParagraph(state: PdfLayout, label: string, text: string) {
  addLine(state, label, "bold", state.fontSize, marginX);
  paragraph(state, text);
}

function paragraph(state: PdfLayout, text: string, font: PdfLine["font"] = "regular") {
  wrapText(text, usableWidth, state.fontSize, font).forEach((line) => addLine(state, line, font, state.fontSize, marginX));
}

function bulletLine(state: PdfLayout, text: string) {
  const dotX = marginX + state.fontSize * 0.8;
  const textX = marginX + state.fontSize * 1.85;
  const width = pageWidth - marginX - textX;
  const lines = wrapText(text, width, state.fontSize, "regular");
  lines.forEach((line, index) => {
    if (index === 0) state.dots.push({ x: dotX, y: state.y + state.fontSize * 0.32, radius: state.fontSize * 0.14 });
    addRawLine(state, line, "regular", state.fontSize, textX, state.y);
    state.y -= lineHeight(state.fontSize);
  });
}

function twoColumn(state: PdfLayout, left: string, right: string, font: PdfLine["font"]) {
  const rightWidth = right ? textWidth(right, state.fontSize, "regular") : 0;
  const leftWidth = usableWidth - rightWidth - 14;
  const leftLines = wrapText(left, leftWidth, state.fontSize, font);

  leftLines.forEach((line, index) => {
    addRawLine(state, line, font, state.fontSize, marginX, state.y);
    if (index === 0 && right) {
      addRawLine(state, right, "regular", state.fontSize, pageWidth - marginX, state.y, "end");
    }
    state.y -= lineHeight(state.fontSize);
  });
}

function drawCentered(state: PdfLayout, text: string, font: PdfLine["font"], size: number) {
  if (!text) return;
  const x = (pageWidth - textWidth(text, size, font)) / 2;
  addLine(state, text, font, size, x);
}

function addLine(state: PdfLayout, text: string, font: PdfLine["font"], size: number, x: number) {
  addRawLine(state, text, font, size, x, state.y);
  state.y -= lineHeight(size);
}

function addRawLine(
  state: PdfLayout,
  text: string,
  font: PdfLine["font"],
  size: number,
  x: number,
  y: number,
  align: PdfLine["align"] = "start",
) {
  if (!text) return;
  state.lines.push({ text, font, size, x, y, align });
}

function rule(state: PdfLayout) {
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
  return size * 1.36;
}

function textWidth(text: string, size: number, font: PdfLine["font"]) {
  const factor = font === "bold" ? 0.48 : font === "italic" ? 0.46 : 0.44;
  return toPdfText(text).length * size * factor;
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderContent(state: PdfLayout) {
  const commands: string[] = ["0 0 0 rg", "0.5 w"];

  state.rules.forEach((item) => {
    commands.push(`${n(item.x1)} ${n(item.y)} m ${n(item.x2)} ${n(item.y)} l S`);
  });

  state.dots.forEach((dot) => {
    commands.push(circle(dot.x, dot.y, dot.radius));
  });

  state.lines.forEach((line) => {
    const font = line.font === "bold" ? "F2" : line.font === "italic" ? "F3" : "F1";
    const x = line.align === "end" ? line.x - textWidth(line.text, line.size, line.font) : line.x;
    commands.push(`BT /${font} ${n(line.size)} Tf ${n(x)} ${n(line.y)} Td (${escapePdf(line.text)}) Tj ET`);
  });

  return commands.join("\n");
}

function circle(x: number, y: number, radius: number) {
  const control = radius * 0.5522847498;
  const x0 = x - radius;
  const x1 = x - control;
  const x2 = x + control;
  const x3 = x + radius;
  const y0 = y - radius;
  const y1 = y - control;
  const y2 = y + control;
  const y3 = y + radius;
  return `${n(x)} ${n(y3)} m ${n(x2)} ${n(y3)} ${n(x3)} ${n(y2)} ${n(x3)} ${n(y)} c ${n(x3)} ${n(y1)} ${n(x2)} ${n(y0)} ${n(x)} ${n(y0)} c ${n(x1)} ${n(y0)} ${n(x0)} ${n(y1)} ${n(x0)} ${n(y)} c ${n(x0)} ${n(y2)} ${n(x1)} ${n(y3)} ${n(x)} ${n(y3)} c f`;
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
