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
const printableFirstChar = 32;
const printableLastChar = 126;
const layoutScale = {
  headerRuleGap: 1.25,
  sectionTopGap: 0.75,
  sectionRuleGap: 0.62,
  sectionContentGap: 1.45,
  entryBottomGap: 0.25,
};

type PdfFontSource = {
  baseName: string;
  data: Uint8Array;
  descriptor: TtfDescriptor;
};

type TtfDescriptor = {
  ascent: number;
  bbox: [number, number, number, number];
  capHeight: number;
  descent: number;
  flags: number;
  italicAngle: number;
  stemV: number;
  widths: number[];
};

let fontCache: Promise<Record<PdfLine["font"], PdfFontSource>> | null = null;

export async function buildPdf(data: ResumeData) {
  const state = buildResumeLayout(data);
  const content = renderContent(state);
  const fonts = await loadPdfFonts();
  return buildPdfDocument(content, fonts);
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

async function loadPdfFonts() {
  fontCache ??= Promise.all([
    loadPdfFont("/fonts/calibri-regular.ttf", "CalibriPDF-Regular", "regular"),
    loadPdfFont("/fonts/calibri-bold.ttf", "CalibriPDF-Bold", "bold"),
    loadPdfFont("/fonts/calibri-italic.ttf", "CalibriPDF-Italic", "italic"),
  ]).then(([regular, bold, italic]) => ({ regular, bold, italic }));
  return fontCache;
}

async function loadPdfFont(path: string, baseName: string, style: PdfLine["font"]) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Missing PDF font: ${path}`);
  const data = new Uint8Array(await response.arrayBuffer());
  return {
    baseName,
    data,
    descriptor: parseTtfDescriptor(data, style),
  };
}

function buildPdfDocument(content: string, fonts: Record<PdfLine["font"], PdfFontSource>) {
  const fontObjectStart = 5;
  const regular = fontObjects(fonts.regular, fontObjectStart);
  const bold = fontObjects(fonts.bold, fontObjectStart + 4);
  const italic = fontObjects(fonts.italic, fontObjectStart + 8);
  const objects: PdfObject[] = [
    pdfText("<< /Type /Catalog /Pages 2 0 R >>"),
    pdfText("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    pdfText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectStart} 0 R /F2 ${fontObjectStart + 4} 0 R /F3 ${fontObjectStart + 8} 0 R >> >> /Contents 4 0 R >>`,
    ),
    pdfStream(encoder.encode(content), ""),
    ...regular,
    ...bold,
    ...italic,
  ];

  return writePdf(objects);
}

type PdfObject = {
  body: Uint8Array;
};

function fontObjects(font: PdfFontSource, fontObjectNumber: number): PdfObject[] {
  const descriptorObjectNumber = fontObjectNumber + 1;
  const fileObjectNumber = fontObjectNumber + 2;
  const toUnicodeObjectNumber = fontObjectNumber + 3;
  const descriptor = font.descriptor;
  const widths = descriptor.widths.map((width) => n(width)).join(" ");
  const bbox = descriptor.bbox.map((value) => n(value)).join(" ");

  return [
    pdfText(
      `<< /Type /Font /Subtype /TrueType /BaseFont /${font.baseName} /FirstChar ${printableFirstChar} /LastChar ${printableLastChar} /Widths [${widths}] /Encoding /WinAnsiEncoding /FontDescriptor ${descriptorObjectNumber} 0 R /ToUnicode ${toUnicodeObjectNumber} 0 R >>`,
    ),
    pdfText(
      `<< /Type /FontDescriptor /FontName /${font.baseName} /Flags ${descriptor.flags} /FontBBox [${bbox}] /ItalicAngle ${descriptor.italicAngle} /Ascent ${n(descriptor.ascent)} /Descent ${n(descriptor.descent)} /CapHeight ${n(descriptor.capHeight)} /StemV ${descriptor.stemV} /FontFile2 ${fileObjectNumber} 0 R >>`,
    ),
    pdfStream(font.data, `/Length1 ${font.data.length}`),
    pdfStream(encoder.encode(buildToUnicodeCMap(font.baseName)), ""),
  ];
}

function buildToUnicodeCMap(fontName: string) {
  const mappings: string[] = [];
  for (let charCode = printableFirstChar; charCode <= printableLastChar; charCode += 1) {
    const hex = charCode.toString(16).toUpperCase().padStart(2, "0");
    const unicode = charCode.toString(16).toUpperCase().padStart(4, "0");
    mappings.push(`<${hex}> <${unicode}>`);
  }

  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /${fontName}-ToUnicode def
/CMapType 2 def
1 begincodespacerange
<00> <FF>
endcodespacerange
${mappings.length} beginbfchar
${mappings.join("\n")}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
}

function pdfText(value: string): PdfObject {
  return { body: encoder.encode(value) };
}

function pdfStream(data: Uint8Array, extraDictionary: string) {
  const head = encoder.encode(`<< /Length ${data.length}${extraDictionary ? ` ${extraDictionary}` : ""} >>\nstream\n`);
  const tail = encoder.encode("\nendstream");
  return { body: concatBytes([head, data, tail]) };
}

function writePdf(objects: PdfObject[]) {
  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  const offsets = [0];
  let length = chunks[0].length;

  objects.forEach((object, index) => {
    offsets.push(length);
    const prefix = encoder.encode(`${index + 1} 0 obj\n`);
    const suffix = encoder.encode("\nendobj\n");
    chunks.push(prefix, object.body, suffix);
    length += prefix.length + object.body.length + suffix.length;
  });

  const xrefOffset = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(encoder.encode(xref));

  return concatBytes(chunks);
}

function concatBytes(chunks: Uint8Array[]) {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function parseTtfDescriptor(data: Uint8Array, style: PdfLine["font"]): TtfDescriptor {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tables = readTtfTables(view);
  const head = requiredTable(tables, "head");
  const hhea = requiredTable(tables, "hhea");
  const hmtx = requiredTable(tables, "hmtx");
  const maxp = requiredTable(tables, "maxp");
  const cmap = requiredTable(tables, "cmap");
  const unitsPerEm = readUint16(view, head.offset + 18);
  const scale = 1000 / unitsPerEm;
  const numGlyphs = readUint16(view, maxp.offset + 4);
  const numberOfHMetrics = readUint16(view, hhea.offset + 34);
  const glyphMap = readCmapFormat4(view, cmap.offset);
  const advances = readAdvanceWidths(view, hmtx.offset, numberOfHMetrics, numGlyphs);
  const widths: number[] = [];

  for (let charCode = printableFirstChar; charCode <= printableLastChar; charCode += 1) {
    const glyphIndex = glyphMap(charCode);
    const advance = advances[Math.min(glyphIndex, advances.length - 1)] ?? advances[0] ?? unitsPerEm * 0.5;
    widths.push(Math.round(advance * scale));
  }

  const xMin = readInt16(view, head.offset + 36) * scale;
  const yMin = readInt16(view, head.offset + 38) * scale;
  const xMax = readInt16(view, head.offset + 40) * scale;
  const yMax = readInt16(view, head.offset + 42) * scale;
  const ascent = readInt16(view, hhea.offset + 4) * scale;
  const descent = readInt16(view, hhea.offset + 6) * scale;

  return {
    ascent,
    bbox: [xMin, yMin, xMax, yMax],
    capHeight: ascent,
    descent,
    flags: style === "italic" ? 98 : 34,
    italicAngle: style === "italic" ? -12 : 0,
    stemV: style === "bold" ? 120 : 80,
    widths,
  };
}

function readTtfTables(view: DataView) {
  const numTables = readUint16(view, 4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    const tag = readTag(view, record);
    tables.set(tag, {
      offset: readUint32(view, record + 8),
      length: readUint32(view, record + 12),
    });
  }
  return tables;
}

function requiredTable(tables: Map<string, { offset: number; length: number }>, tag: string) {
  const table = tables.get(tag);
  if (!table) throw new Error(`Invalid TTF: missing ${tag}`);
  return table;
}

function readAdvanceWidths(view: DataView, offset: number, numberOfHMetrics: number, numGlyphs: number) {
  const advances: number[] = [];
  let lastAdvance = 0;
  for (let index = 0; index < numberOfHMetrics; index += 1) {
    lastAdvance = readUint16(view, offset + index * 4);
    advances.push(lastAdvance);
  }
  while (advances.length < numGlyphs) advances.push(lastAdvance);
  return advances;
}

function readCmapFormat4(view: DataView, cmapOffset: number) {
  const numTables = readUint16(view, cmapOffset + 2);
  let subtableOffset = 0;

  for (let index = 0; index < numTables; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    const platformId = readUint16(view, record);
    const encodingId = readUint16(view, record + 2);
    const offset = readUint32(view, record + 4);
    const format = readUint16(view, cmapOffset + offset);
    if (format === 4 && platformId === 3 && (encodingId === 1 || encodingId === 0)) {
      subtableOffset = cmapOffset + offset;
      break;
    }
    if (!subtableOffset && format === 4) subtableOffset = cmapOffset + offset;
  }

  if (!subtableOffset) throw new Error("Invalid TTF: missing cmap format 4");

  const segCount = readUint16(view, subtableOffset + 6) / 2;
  const endCodeOffset = subtableOffset + 14;
  const startCodeOffset = endCodeOffset + segCount * 2 + 2;
  const idDeltaOffset = startCodeOffset + segCount * 2;
  const idRangeOffsetOffset = idDeltaOffset + segCount * 2;

  return (charCode: number) => {
    for (let index = 0; index < segCount; index += 1) {
      const endCode = readUint16(view, endCodeOffset + index * 2);
      const startCode = readUint16(view, startCodeOffset + index * 2);
      if (charCode < startCode || charCode > endCode) continue;

      const idDelta = readInt16(view, idDeltaOffset + index * 2);
      const idRangeOffsetAddress = idRangeOffsetOffset + index * 2;
      const idRangeOffset = readUint16(view, idRangeOffsetAddress);
      if (idRangeOffset === 0) return (charCode + idDelta) & 0xffff;

      const glyphAddress = idRangeOffsetAddress + idRangeOffset + (charCode - startCode) * 2;
      const glyphIndex = readUint16(view, glyphAddress);
      return glyphIndex === 0 ? 0 : (glyphIndex + idDelta) & 0xffff;
    }
    return 0;
  };
}

function readTag(view: DataView, offset: number) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function readUint16(view: DataView, offset: number) {
  return view.getUint16(offset, false);
}

function readInt16(view: DataView, offset: number) {
  return view.getInt16(offset, false);
}

function readUint32(view: DataView, offset: number) {
  return view.getUint32(offset, false);
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
