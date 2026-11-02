/**
 * GIMMS P1-01 — NATIVE Office / Document engine.
 *
 * ZERO new dependencies. Uses Node built-ins only (fs, path, crypto).
 * Generates REAL files: .docx / .xlsx / .pptx (OOXML ZIP), .pdf (PDF 1.4 with
 * a real xref table), .eml, .ics, .csv, .md, .html, .txt, .json.
 *
 * HONESTY RULES:
 *  - Microsoft Office, Microsoft 365, Google Workspace, Outlook and Gmail are
 *    NOT connected. These are NATIVE file generators producing compatible open
 *    formats; nothing is opened in or synced to an external product.
 *  - No file is emailed, uploaded, signed, printed or published here.
 *  - PDF merge / split / edit / extract / form-fill work on GIMMS-generated
 *    text PDFs. Scanned PDFs, AcroForm fields and arbitrary third-party PDFs
 *    need an external library and are reported as MISSING, not claimed.
 *  - PDF uses Helvetica/WinAnsi: non-Latin glyphs (e.g. Sinhala) are not
 *    supported by this native writer and are replaced with "?".
 *  - Summarisation is deterministic extractive text ranking, NOT an AI model.
 *
 * Server-only. All writes stay under data/dept01-artifacts/ (git-ignored).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();

export type ArtifactMeta = {
  name: string;
  format: string;
  bytes: number;
  sha256: string;
  generatedBy: string;
  createdAt: string;
  note: string;
};

function resolve(...parts: string[]): string {
  return path.join(/*turbopackIgnore: true*/ ROOT, "data", "dept01-artifacts", ...parts);
}

function safeName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(name) && !name.includes("..");
}

/** Save a real byte buffer to the local artifact store and hash it. */
export function saveArtifact(name: string, data: string | Buffer, format: string, generatedBy: string, note: string): ArtifactMeta {
  if (!safeName(name)) throw new Error(`invalid artifact name: ${name}`);
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const dir = resolve();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolve(name), buf);
  return {
    name,
    format,
    bytes: buf.length,
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    generatedBy,
    createdAt: new Date().toISOString(),
    note,
  };
}

export function readArtifact(name: string): Buffer | null {
  if (!safeName(name)) return null;
  try {
    return fs.readFileSync(resolve(name));
  } catch {
    return null;
  }
}

export function listArtifactFiles(): string[] {
  try {
    return fs.readdirSync(resolve()).filter(safeName);
  } catch {
    return [];
  }
}

export function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// ---------------------------------------------------------------------------
// Minimal ZIP writer (stored / no compression) for OOXML packages
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries: { name: string; data: string | Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : entry.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

/** Read back a stored-method OOXML package (used for real conversion/extraction). */
function unzip(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const size = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const start = i + 30 + nameLen + extraLen;
    if (method === 0) out[name] = buf.subarray(start, start + size).toString("utf8");
    i = start + size;
  }
  return out;
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const CT_OPEN = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">';
const RELS_OPEN = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';

function contentTypes(overrides: string[]): string {
  return (
    XML_DECL +
    CT_OPEN +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    overrides.join("") +
    "</Types>"
  );
}
function override(part: string, type: string): string {
  return `<Override PartName="${part}" ContentType="${type}"/>`;
}
function rootRels(target: string, type: string): string {
  return XML_DECL + RELS_OPEN + `<Relationship Id="rId1" Type="${type}" Target="${target}"/>` + "</Relationships>";
}

// ---------------------------------------------------------------------------
// .docx — WordprocessingML
// ---------------------------------------------------------------------------

export function docx(title: string, paragraphs: string[]): Buffer {
  const body = [
    `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${xmlEscape(title)}</w:t></w:r></w:p>`,
    ...paragraphs.map(
      (line) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`,
    ),
  ].join("");
  const documentXml =
    XML_DECL +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    body +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>';
  const core =
    XML_DECL +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${xmlEscape(title)}</dc:title><dc:creator>AI GIMMS (native writer)</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>` +
    "</cp:coreProperties>";
  const app =
    XML_DECL +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    "<Application>AI GIMMS native OOXML writer (not Microsoft Word)</Application></Properties>";
  return zip([
    {
      name: "[Content_Types].xml",
      data: contentTypes([
        override("/word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"),
        override("/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"),
        override("/docProps/app.xml", "application/vnd.openxmlformats-officedocument.extended-properties+xml"),
      ]),
    },
    {
      name: "_rels/.rels",
      data: rootRels("word/document.xml", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"),
    },
    { name: "word/document.xml", data: documentXml },
    { name: "docProps/core.xml", data: core },
    { name: "docProps/app.xml", data: app },
  ]);
}

export function docxText(buf: Buffer): string[] {
  const xml = unzip(buf)["word/document.xml"] ?? "";
  return [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) =>
    match[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&"),
  );
}

// ---------------------------------------------------------------------------
// .xlsx — SpreadsheetML with real formulas + cached values
// ---------------------------------------------------------------------------

export type XlsxFormula = { cell: string; formula: string; value: number };

export function xlsx(sheetName: string, columns: string[], rows: (string | number)[][], formulas: XlsxFormula[] = []): Buffer {
  const colName = (index: number): string => {
    let n = index + 1;
    let out = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  };
  const formulaMap = new Map(formulas.map((f) => [f.cell.toUpperCase(), f]));
  const cellXml = (ref: string, value: string | number, rowIndex: number, colIndex: number): string => {
    const f = formulaMap.get(ref.toUpperCase());
    if (f) return `<c r="${ref}"><f>${xmlEscape(f.formula)}</f><v>${f.value}</v></c>`;
    if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
  };
  const allRows = [columns, ...rows];
  const rowXml = allRows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => cellXml(`${colName(colIndex)}${rowIndex + 1}`, value, rowIndex, colIndex))
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const sheetXml =
    XML_DECL +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews>' +
    '<sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>' +
    rowXml +
    "</sheetData></worksheet>";
  const workbookXml =
    XML_DECL +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    `<sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels =
    XML_DECL +
    RELS_OPEN +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    "</Relationships>";
  const stylesXml =
    XML_DECL +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
    '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>';
  return zip([
    {
      name: "[Content_Types].xml",
      data: contentTypes([
        override("/xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"),
        override("/xl/worksheets/sheet1.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"),
        override("/xl/styles.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"),
      ]),
    },
    {
      name: "_rels/.rels",
      data: rootRels("xl/workbook.xml", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"),
    },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml },
    { name: "xl/styles.xml", data: stylesXml },
  ]);
}

export function xlsxText(buf: Buffer): string[] {
  const sheet = unzip(buf)["xl/worksheets/sheet1.xml"] ?? "";
  const lines: string[] = [];
  for (const row of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of row[1].matchAll(/<c[^>]*>([\s\S]*?)<\/c>/g)) {
      const formula = /<f>([\s\S]*?)<\/f>/.exec(cell[1]);
      const value = /<v>([\s\S]*?)<\/v>/.exec(cell[1]);
      const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cell[1]);
      cells.push(formula ? `=${formula[1]}` : (inline ? inline[1] : (value ? value[1] : "")));
    }
    lines.push(cells.join(","));
  }
  return lines;
}

// ---------------------------------------------------------------------------
// .pptx — PresentationML (single slide)
// ---------------------------------------------------------------------------

export function pptx(title: string, bullets: string[]): Buffer {
  const shape = (id: number, name: string, x: number, y: number, cx: number, cy: number, size: number, text: string): string =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="${size}" dirty="0"/><a:t>${xmlEscape(text)}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const shapes = [
    shape(2, "Title", 457200, 274638, 8229600, 1000000, 3200, title),
    ...bullets.map((line, index) => shape(3 + index, `Bullet ${index + 1}`, 685800, 1600000 + index * 500000, 7772400, 420000, 1600, line)),
  ].join("");
  const spTree =
    "<p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>" +
    "<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>" +
    shapes +
    "</p:spTree>";
  const ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const slide = XML_DECL + `<p:sld ${ns}><p:cSld>${spTree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const layout = XML_DECL + `<p:sldLayout ${ns} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const master =
    XML_DECL +
    `<p:sldMaster ${ns}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>` +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    "<p:sldLayoutIdLst><p:sldLayoutId id=\"2147483649\" r:id=\"rId1\"/></p:sldLayoutIdLst></p:sldMaster>";
  const theme =
    XML_DECL +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="GIMMS"><a:themeElements>' +
    '<a:clrScheme name="GIMMS"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
    '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>' +
    '<a:fontScheme name="GIMMS"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="GIMMS"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
    '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>' +
    "</a:themeElements></a:theme>";
  const presentation =
    XML_DECL +
    `<p:presentation ${ns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>' +
    '<p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
  const rel = (id: string, type: string, target: string) =>
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  return zip([
    {
      name: "[Content_Types].xml",
      data: contentTypes([
        override("/ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"),
        override("/ppt/slides/slide1.xml", "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"),
        override("/ppt/slideLayouts/slideLayout1.xml", "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"),
        override("/ppt/slideMasters/slideMaster1.xml", "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"),
        override("/ppt/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"),
      ]),
    },
    {
      name: "_rels/.rels",
      data: rootRels("ppt/presentation.xml", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"),
    },
    {
      name: "ppt/_rels/presentation.xml.rels",
      data: XML_DECL + RELS_OPEN + rel("rId1", "slideMaster", "slideMasters/slideMaster1.xml") + rel("rId2", "slide", "slides/slide1.xml") + rel("rId3", "theme", "theme/theme1.xml") + "</Relationships>",
    },
    { name: "ppt/presentation.xml", data: presentation },
    { name: "ppt/slides/slide1.xml", data: slide },
    {
      name: "ppt/slides/_rels/slide1.xml.rels",
      data: XML_DECL + RELS_OPEN + rel("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml") + "</Relationships>",
    },
    { name: "ppt/slideLayouts/slideLayout1.xml", data: layout },
    {
      name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      data: XML_DECL + RELS_OPEN + rel("rId1", "slideMaster", "../slideMasters/slideMaster1.xml") + "</Relationships>",
    },
    { name: "ppt/slideMasters/slideMaster1.xml", data: master },
    {
      name: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      data: XML_DECL + RELS_OPEN + rel("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml") + rel("rId2", "theme", "../theme/theme1.xml") + "</Relationships>",
    },
    { name: "ppt/theme/theme1.xml", data: theme },
  ]);
}

// ---------------------------------------------------------------------------
// .pdf — PDF 1.4, single page, real xref table
// ---------------------------------------------------------------------------

function pdfEscape(value: string): string {
  return value
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export function pdf(title: string, lines: string[]): Buffer {
  const content = [
    "BT",
    "/F1 18 Tf",
    "50 790 Td",
    `(${pdfEscape(title)}) Tj`,
    "/F1 11 Tf",
    "0 -30 Td",
    "16 TL",
    ...lines.flatMap((line) => [`(${pdfEscape(line)}) Tj`, "T*"]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    `<< /Title (${pdfEscape(title)}) /Producer (AI GIMMS native PDF writer - not Microsoft Word) /Creator (GIMMS P1-01) >>`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Extract text from GIMMS-generated text PDFs. Not OCR, not arbitrary PDF parsing. */
export function pdfText(buf: Buffer): string[] {
  const raw = buf.toString("latin1");
  const lines: string[] = [];
  for (const match of raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    lines.push(
      match[1]
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\"),
    );
  }
  return lines;
}

export function isNativePdf(buf: Buffer): boolean {
  return buf.subarray(0, 8).toString("latin1") === "%PDF-1.4" && buf.toString("latin1").includes("AI GIMMS native PDF writer");
}

/** Deterministic extractive summary. NOT an AI model. */
export function summarize(text: string, maxSentences = 3): string {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  if (sentences.length <= maxSentences) return sentences.join(" ");
  const stop = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "for", "is", "are", "with", "on", "at", "by", "this", "that", "be", "as", "it", "from"]);
  const freq = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
    if (!stop.has(word)) freq.set(word, (freq.get(word) ?? 0) + 1);
  }
  const scored = sentences.map((sentence, index) => {
    const words = sentence.toLowerCase().match(/[a-z]{3,}/g) ?? [];
    const score = words.reduce((sum, word) => sum + (freq.get(word) ?? 0), 0) / Math.max(words.length, 1);
    return { sentence, index, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Plain document formats
// ---------------------------------------------------------------------------

export function csv(rows: (string | number)[][]): string {
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}

export function eml(subject: string, body: string, to = "owner@invalid.example"): string {
  return [
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    `From: AI GIMMS Drafts <no-reply@invalid.example>`,
    `To: ${to}`,
    `Subject: ${subject.replace(/[\r\n]/g, " ")}`,
    `Date: ${new Date().toUTCString()}`,
    "X-GIMMS-Status: DRAFT - NEVER SENT - no mail service connected",
    "",
    body,
    "",
  ].join("\r\n");
}

export function ics(summary: string, description: string, startsAt: string, endsAt: string): string {
  const stamp = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
      : date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI GIMMS//Native Calendar Draft//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@gimms.local`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(startsAt)}`,
    `DTEND:${stamp(endsAt)}`,
    `SUMMARY:${summary.replace(/[\r\n,;]/g, " ")}`,
    `DESCRIPTION:${description.replace(/[\r\n,;]/g, " ")}`,
    "STATUS:TENTATIVE",
    "X-GIMMS-Status: DRAFT - no calendar service connected",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function html(title: string, bodyLines: string[]): string {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${xmlEscape(title)}</title>` +
    "<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:40px auto;line-height:1.6}h1{font-size:1.6rem}li{margin:.3rem 0}</style></head><body>" +
    `<h1>${xmlEscape(title)}</h1><ul>${bodyLines.map((line) => `<li>${xmlEscape(line)}</li>`).join("")}</ul>` +
    "<p><small>AI GIMMS native document draft — no external service connected.</small></p></body></html>\n";
}

export function markdown(title: string, lines: string[]): string {
  return `# ${title}\n\n${lines.map((line) => `- ${line}`).join("\n")}\n\n_AI GIMMS native draft; no external service connected._\n`;
}

/** GIMMS-owned format conversion. General third-party conversion is NOT implemented. */
export function convert(source: Buffer, from: string, to: string): { data: string | Buffer; format: string; blocked: string[] } {
  let lines: string[] = [];
  if (from === "docx") lines = docxText(source);
  else if (from === "xlsx") lines = xlsxText(source);
  else if (from === "pdf") lines = isNativePdf(source) ? pdfText(source) : [];
  else lines = source.toString("utf8").split(/\r?\n/).filter(Boolean);
  const blocked = ["arbitrary third-party / scanned / encrypted file conversion is MISSING", "no conversion service connected"];
  if (to === "pdf") return { data: pdf("GIMMS converted document", lines), format: "pdf", blocked };
  if (to === "docx") return { data: docx("GIMMS converted document", lines), format: "docx", blocked };
  if (to === "csv") return { data: csv(lines.map((line) => [line])), format: "csv", blocked };
  if (to === "html") return { data: html("GIMMS converted document", lines), format: "html", blocked };
  return { data: lines.join("\n") + "\n", format: "txt", blocked };
}
