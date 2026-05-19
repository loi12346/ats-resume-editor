# ATS Resume Editor

A local-first ATS resume workspace for drafting, tailoring, exporting, and iterating resume versions without touching Word formatting every time. The project combines a structured resume editor, A4 resume preview, multi-format export, and an AI Prompt workspace that helps turn job descriptions into import-ready resume improvements.

Live app: [ats-resume-editor.vercel.app](https://ats-resume-editor.vercel.app)

## End-to-End Workflow

1. **Draft the base resume**
   Start with a general resume version. Fill in the header, summary, experience, projects, education, skills, and languages as structured fields instead of editing a free-form document.

2. **Create versions for different applications**
   Use `+ Add Version` or `Copy` to create targeted versions. Each version can keep its own target role, application company, summary, keywords, experience bullets, and export state.

3. **Edit with live A4 preview**
   The editor and preview sit side by side. Changes in the form update the resume preview, so the user can check spacing, section order, and one-page fit while writing.

4. **Export application-ready files**
   Export `PDF` for job submissions, `DOCX` when recruiters ask for an editable file, `CSV` for sheet review, and `JSON` for full backup or AI-generated imports.

5. **Generate an AI review prompt**
   Open the `AI Prompt` tab, choose a resume version, enter the target role, application company, and paste the job description. The app generates a copyable prompt for an AI model.

6. **Reiterate with human-in-the-loop planning**
   The generated prompt asks the AI to review fit, identify missing evidence, suggest improvements, and discuss the plan with the user before producing final changes.

7. **Import final JSON back into the editor**
   Once the user approves the direction, the AI is instructed to output JSON that matches this editor's import format. That JSON can be imported back into the app, making the iteration loop faster and less manual.

## Key Features

- **Structured resume editing**: Header, summary, experience, projects, education, hard skills, soft skills, and languages.
- **Version management**: Maintain different resume versions for different target roles or companies.
- **Application company tracking**: Store company context without showing it in the resume export.
- **A4 resume preview**: Preview the resume in the same style used for export.
- **One-page export logic**: PDF output is designed to keep the resume on one page by tightening layout and scaling when needed.
- **Multi-format export**: PDF, DOCX, CSV, and JSON.
- **Import support**: Bring compatible JSON or CSV back into the editor.
- **AI Prompt tab**: Generate a Markdown prompt for JD matching, gap analysis, rewrite planning, and final import-ready JSON.
- **Local-first storage**: Resume data is stored in the browser's local storage by default.

## AI Prompt Output Goal

The AI Prompt workflow is designed to make resume improvement more controlled. The model is asked to:

- act in planning mode first;
- compare the resume against the job description;
- identify keyword fit, missing evidence, and risk areas;
- suggest changes section by section;
- wait for the user to confirm before generating the final version;
- return final output as JSON that can be imported directly into the editor.

## Export And Backup Strategy

- Use `PDF` for final applications.
- Use `DOCX` when a recruiter or portal needs an editable document.
- Use `CSV` when reviewing resume content in Excel or Google Sheets.
- Use `JSON` as the safest full backup because it preserves all structured resume fields.
- Use `Import` to restore a backup or apply an AI-generated JSON version.

## Privacy

This is a local-first app. Resume content is stored in browser local storage unless the user exports or imports files manually. The AI Prompt feature does not call an AI API; it only creates a prompt that the user can copy into their preferred model.

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful checks:

```bash
npm run typecheck
npm run build
```

## Tech Stack

- Next.js
- React
- TypeScript
- Browser local storage
- Custom PDF, DOCX, CSV, and JSON export logic

---

# ATS Resume Editor 中文说明

这是一个本地优先的 ATS 简历工作台，用来完成从简历初稿、岗位版本、A4 预览、文件导出，到 AI Prompt 分析和再次迭代的完整流程。它的重点不是做花哨模板，而是让投递简历这件事变得更结构化、更快、更容易反复优化。

线上版本：[ats-resume-editor.vercel.app](https://ats-resume-editor.vercel.app)

## 从头到尾的使用流程

1. **先建立基础简历 draft**
   从一个 General 版本开始，把 Header、Summary、Experience、Projects、Education、Skills、Languages 分成结构化字段填写。这样之后修改内容时，不需要手动处理 Word 排版。

2. **针对不同岗位建立版本**
   使用 `+ Add Version` 或 `Copy` 创建不同投递版本。每个版本都可以有自己的 target role、application company、summary、keywords、experience bullets 和导出内容。

3. **一边编辑，一边看 A4 preview**
   左边是编辑区，右边是简历预览区。用户改内容时可以马上看到 A4 简历效果，方便检查 spacing、section 顺序和是否维持在一页内。

4. **导出可以直接投递的文件**
   用 `PDF` 做正式投递，用 `DOCX` 应付需要可编辑文件的招聘流程，用 `CSV` 放进表格检查内容，用 `JSON` 做完整备份。

5. **进入 AI Prompt tab 做 JD 分析**
   选择一个简历版本，填写 target role 和 application company，然后贴上 JD。系统会自动生成一段可以复制的 Markdown prompt。

6. **和 AI 反复 iterate**
   Prompt 会让 AI 先进入 planning mode，先判断简历和 JD 的匹配度、缺少什么证据、哪些 bullet 需要加强，再和用户讨论方向，而不是一开始就直接乱改。

7. **确认后生成可导入 JSON**
   当用户确认方向后，AI 最后需要输出和本项目 import 格式一致的 JSON。这个 JSON 可以直接导入回 editor，让简历更新不用重新手动打字。

## 核心功能

- **结构化简历编辑**：Header、Summary、Experience、Projects、Education、Hard Skills、Soft Skills、Languages。
- **多版本管理**：针对不同岗位或公司保存不同简历版本。
- **投递公司字段**：可以记录 application company，但不会显示在 PDF 或 DOCX 简历里。
- **A4 简历预览**：右边 preview 直接显示接近最终导出的效果。
- **一页输出逻辑**：PDF 会尽量把内容维持在一页内，必要时压缩字体和 spacing。
- **多格式导出**：PDF、DOCX、CSV、JSON。
- **Import 支持**：可以把兼容 JSON 或 CSV 导入回 editor。
- **AI Prompt tab**：生成用于 JD 匹配、gap analysis、rewrite planning 和最终 JSON 输出的 prompt。
- **Local-first**：默认数据存在浏览器 local storage，不需要登录或云数据库。

## AI Prompt 的设计目标

AI Prompt 不是直接调用 API，而是把简历优化流程封装成一个可复制的 prompt。它会要求 AI：

- 先进入 planning mode；
- 对比简历和 JD；
- 找出关键词匹配、缺少的证据和风险点；
- 分 section 给出修改建议；
- 等用户确认方向后，才生成最终版本；
- 最后输出可以直接 import 回本 editor 的 JSON。

## 导出和备份策略

- `PDF` 用于正式投递。
- `DOCX` 用于需要可编辑文档的招聘流程。
- `CSV` 用于 Excel 或 Google Sheets 检查内容。
- `JSON` 是最完整的备份格式，可以保留所有结构化字段。
- `Import` 可以恢复备份，也可以导入 AI 生成的新版本。

## 隐私说明

这个项目是 local-first。简历内容默认存在浏览器 local storage。AI Prompt 功能不会自动把资料传给任何 AI 服务，它只负责生成 prompt，用户自己决定要复制到哪个模型里使用。

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

常用检查：

```bash
npm run typecheck
npm run build
```

## 技术栈

- Next.js
- React
- TypeScript
- Browser local storage
- 自定义 PDF、DOCX、CSV、JSON 导出逻辑
