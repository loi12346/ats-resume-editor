import type { EducationItem, ResumeData, ResumeItem } from "./types";
import { normalizeResumeData } from "./resumeData";

type ZipEntry = {
  path: string;
  content: string;
};

const encoder = new TextEncoder();

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraph(text: string, style?: string) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function italicParagraph(text: string) {
  return `<w:p><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function bullet(text: string) {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function itemDateRange(item: ResumeItem) {
  const dates = [item.start, item.end].filter(Boolean).join(" - ");
  return dates;
}

function educationHeader(item: EducationItem) {
  return [item.school, item.location].filter(Boolean).join(" | ");
}

function educationDetail(item: EducationItem) {
  const dates = [item.start, item.end].filter(Boolean).join(" - ");
  return [item.degree, dates].filter(Boolean).join(" | ");
}

function resumeXml(data: ResumeData) {
  const normalized = normalizeResumeData(data);
  const parts = [
    paragraph(normalized.contact.fullName, "Title"),
    paragraph(
      [
        normalized.contact.headline,
        normalized.contact.location,
        normalized.contact.email,
        normalized.contact.phone,
        normalized.contact.links,
      ]
        .filter(Boolean)
        .join(" | "),
    ),
    paragraph("SUMMARY", "Heading1"),
    paragraph(normalized.summary),
    paragraph("EXPERIENCE", "Heading1"),
    ...normalized.experience.flatMap((item) => [
      paragraph([item.organization, item.location].filter(Boolean).join(" | "), "Heading2"),
      italicParagraph([item.role, itemDateRange(item)].filter(Boolean).join(" | ")),
      ...(item.impact ? [paragraph(`Impact: ${item.impact}`)] : []),
      ...item.bullets.filter(Boolean).map(bullet),
    ]),
    paragraph("PROJECTS", "Heading1"),
    ...normalized.projects.flatMap((item) => [
      paragraph([item.organization, item.location].filter(Boolean).join(" | "), "Heading2"),
      italicParagraph([item.role, itemDateRange(item)].filter(Boolean).join(" | ")),
      ...(item.impact ? [paragraph(`Impact: ${item.impact}`)] : []),
      ...item.bullets.filter(Boolean).map(bullet),
    ]),
    paragraph("EDUCATION", "Heading1"),
    ...normalized.education.flatMap((item) => [
      paragraph(educationHeader(item), "Heading2"),
      ...(educationDetail(item) ? [italicParagraph(educationDetail(item))] : []),
      ...(item.details ? [paragraph(item.details)] : []),
    ]),
    paragraph("SKILLS", "Heading1"),
    ...(normalized.hardSkills.length ? [paragraph(`Hard skills: ${normalized.hardSkills.join(", ")}`)] : []),
    ...(normalized.softSkills.length ? [paragraph(`Soft skills: ${normalized.softSkills.join(", ")}`)] : []),
  ];

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${parts.join("\n")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr>
    <w:pPr><w:spacing w:after="80" w:line="240" w:lineRule="auto"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="80"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:rPr><w:b/><w:sz w:val="22"/></w:rPr>
    <w:pPr><w:spacing w:before="180" w:after="60"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/></w:pBdr></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:rPr><w:b/><w:sz w:val="20"/></w:rPr>
    <w:pPr><w:spacing w:before="80" w:after="20"/></w:pPr>
  </w:style>
</w:styles>`;

const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:pPr><w:ind w:left="360" w:hanging="180"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

function makeCrcTable() {
  const table: number[] = [];
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUInt32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function buildZip(entries: ZipEntry[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const data = encoder.encode(entry.content);
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length + data.length);
    writeUInt32(local, 0, 0x04034b50);
    writeUInt16(local, 4, 20);
    writeUInt16(local, 8, 0);
    writeUInt32(local, 14, crc);
    writeUInt32(local, 18, data.length);
    writeUInt32(local, 22, data.length);
    writeUInt16(local, 26, name.length);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    writeUInt32(central, 0, 0x02014b50);
    writeUInt16(central, 4, 20);
    writeUInt16(central, 6, 20);
    writeUInt16(central, 10, 0);
    writeUInt32(central, 16, crc);
    writeUInt32(central, 20, data.length);
    writeUInt32(central, 24, data.length);
    writeUInt16(central, 28, name.length);
    writeUInt32(central, 42, offset);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  }

  const centralStart = offset;
  const central = concat(centralParts);
  const end = new Uint8Array(22);
  writeUInt32(end, 0, 0x06054b50);
  writeUInt16(end, 8, entries.length);
  writeUInt16(end, 10, entries.length);
  writeUInt32(end, 12, central.length);
  writeUInt32(end, 16, centralStart);

  return concat([...localParts, central, end]);
}

export function buildDocx(data: ResumeData) {
  return buildZip([
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`,
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    },
    {
      path: "word/_rels/document.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`,
    },
    { path: "word/document.xml", content: resumeXml(data) },
    { path: "word/styles.xml", content: stylesXml },
    { path: "word/numbering.xml", content: numberingXml },
  ]);
}
