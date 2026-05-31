import { normalizeWorkbenchPayload } from "@/components/MainTextWorkbench";
import type { WorkbenchDiscoveredStructure } from "@/components/MainTextWorkbench";

export type ExportPageKind = "edit" | "summarize" | "consolidate";

export interface EditWorkspaceExport {
  content: string;
  master_draft_structured?: Array<{
    block_id: string;
    type: string;
    is_primary: boolean;
    source: string;
    associated_idea_id: string | null;
    text: string;
  }>;
  atomic_ideas?: Array<{
    id: string;
    content: string;
    source_draft: string;
    category: string;
    status: string;
  }>;
  metadata?: {
    primary_draft_title?: string;
    total_output_words?: number;
    tokens_consumed?: number;
  };
  tokenUsage?: { total_tokens?: number };
}

export function exportFileStamp(): string {
  return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
}

export function downloadTextFile(
  content: string,
  basename: string,
  ext: "txt" | "md" | "json" | "html",
): void {
  const mime =
    ext === "json"
      ? "application/json;charset=utf-8"
      : ext === "html"
        ? "text/html;charset=utf-8"
        : "text/plain;charset=utf-8";
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${basename}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** استخراج هيكل التلخيص/الصهر للتصدير */
export function getAnalyticsStructure(raw: unknown): WorkbenchDiscoveredStructure | null {
  const norm = normalizeWorkbenchPayload(raw);
  if (norm?.discovered_structure) return norm.discovered_structure;
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.core_ideas) || r.export_content) {
      return r as WorkbenchDiscoveredStructure;
    }
    const inner = r.summary_analytics as WorkbenchDiscoveredStructure | undefined;
    if (inner?.core_ideas) return inner;
  }
  return null;
}

export function getAnalyticsSummaryMarkdown(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const r = raw as Record<string, unknown>;
  if (typeof r.export_content === "string" && r.export_content.trim()) {
    return r.export_content;
  }
  const inner = r.summary_analytics as Record<string, unknown> | undefined;
  if (inner && typeof inner.export_content === "string") return inner.export_content;
  const ds = getAnalyticsStructure(raw);
  if (!ds) return "";
  return buildAnalyticsSummaryMarkdown(ds, "summarize");
}

function ideaLine(item: {
  id?: number | string;
  idea?: string;
  sovereign_idea?: string;
  section_title?: string;
  layers?: { conceptual_framework?: string; practical_applications?: string };
}): string {
  const title = item.section_title ? ` — ${item.section_title}` : "";
  const body = item.sovereign_idea || item.idea || "";
  let block = `### ${item.id}${title}\n\n${body}\n`;
  if (item.layers?.conceptual_framework) {
    block += `\n**الإطار المفاهيمي:** ${item.layers.conceptual_framework}\n`;
  }
  if (item.layers?.practical_applications) {
    block += `\n**التطبيقات العملية:** ${item.layers.practical_applications}\n`;
  }
  return block;
}

export function buildAnalyticsFullMarkdown(
  ds: WorkbenchDiscoveredStructure,
  mode: ExportPageKind,
): string {
  const title =
    mode === "consolidate"
      ? "# جوهر المخطوطة — الصهر الديناميكي (محتوى كامل)"
      : "# مستخلص التلخيص الدلالي (محتوى كامل)";
  const ideas = (ds.core_ideas || []).map(ideaLine).join("\n");
  const keywords = (ds.sovereign_keywords || []).join("، ");
  const ledger = (ds.numerical_ledger || [])
    .map((n) => `- **${n.value}**: ${n.context}`)
    .join("\n");
  const editorial = (ds.editorial_suggestions || [])
    .map((s) => `- ${s}`)
    .join("\n");

  return `${title}

## الأفكار / البطاقات المعرفية
${ideas || "_لا توجد._"}

## الكلمات المفتاحية السيادية
${keywords || "—"}

## الكشاف الرقمي
${ledger || "—"}

${editorial ? `## إرشادات تحريرية\n${editorial}\n` : ""}
---
*مدونة الخليل v4.6*
`;
}

export function buildAnalyticsSummaryMarkdown(
  ds: WorkbenchDiscoveredStructure,
  mode: ExportPageKind,
): string {
  if (typeof (ds as { export_content?: string }).export_content === "string") {
    return (ds as { export_content: string }).export_content;
  }
  const ideas = (ds.core_ideas || [])
    .slice(0, mode === "summarize" ? 12 : 20)
    .map((item) => {
      const t = item.section_title ? ` (${item.section_title})` : "";
      return `- **${item.id}${t}:** ${item.sovereign_idea || item.idea || ""}`;
    })
    .join("\n");
  const keywords = (ds.sovereign_keywords || []).slice(0, 10).join("، ");
  return `# ملخص ${
    mode === "consolidate" ? "الصهر" : "التلخيص"
  } — مدونة الخليل

## ملخص الأفكار
${ideas || "_لا توجد._"}

## كلمات مفتاحية
${keywords || "—"}
`;
}

export function buildAnalyticsFullPlain(
  ds: WorkbenchDiscoveredStructure,
  mode: ExportPageKind,
): string {
  return buildAnalyticsFullMarkdown(ds, mode)
    .replace(/^#+ /gm, "")
    .replace(/\*\*/g, "")
    .replace(/^- /gm, "• ");
}

export function buildEditFullMarkdown(ws: EditWorkspaceExport): string {
  const title = ws.metadata?.primary_draft_title || "المخطوطة الموحدة";
  const words = ws.metadata?.total_output_words;
  const header = `# المخطوطة اللغوية الموحدة — مدونة الخليل

**المرجع:** ${title}
${words != null ? `**الحجم:** ${words.toLocaleString()} كلمة` : ""}

---

`;
  return header + (ws.content?.trim() || "_لا يوجد نص._");
}

export function buildEditSummaryMarkdown(ws: EditWorkspaceExport): string {
  const ideas = ws.atomic_ideas || [];
  const lines = ideas.map((idea) => {
    const status = idea.status === "consolidated" || idea.status === "integrated" ? "مدمجة" : "غير مدمجة";
    return `### فكرة ${idea.id} (${status})

${idea.content}

*المصدر:* ${idea.source_draft || "—"}
`;
  });
  const report = ws.metadata
    ? `\n---\n*كلمات المخرجات:* ${ws.metadata.total_output_words ?? "—"} | *توكنات:* ${ws.tokenUsage?.total_tokens ?? ws.metadata.tokens_consumed ?? "—"}`
    : "";
  return `# ملخص الدمج — الأفكار الذرية

${lines.length ? lines.join("\n") : "_لا توجد أفكار ذرية._"}
${report}
`;
}

export function buildEditFullPlain(ws: EditWorkspaceExport): string {
  return ws.content?.trim() || "";
}

export function workspaceToDocxPayload(ws: EditWorkspaceExport): Record<string, unknown> {
  const ideas = (ws.atomic_ideas || []).map((idea) => ({
    id: idea.id,
    section_title: idea.source_draft || `فكرة ${idea.id}`,
    sovereign_idea: idea.content,
  }));
  if (!ideas.length && ws.content?.trim()) {
    return {
      core_ideas: [
        {
          id: 1,
          section_title: "المخطوطة الموحدة",
          sovereign_idea: ws.content.slice(0, 8000),
        },
      ],
      export_content: buildEditFullMarkdown(ws),
      sovereign_keywords: [],
      numerical_ledger: [],
      _metadata: { engine_description: "سبك ودمج المسودات — مدونة الخليل" },
    };
  }
  return {
    core_ideas: ideas,
    export_content: buildEditSummaryMarkdown(ws),
    sovereign_keywords: [],
    numerical_ledger: [],
    _metadata: { engine_description: "سبك ودمج المسودات — مدونة الخليل" },
  };
}

export function docxFilename(kind: ExportPageKind): string {
  const stamp = exportFileStamp();
  const prefix =
    kind === "edit" ? "khalil_merge" : kind === "consolidate" ? "khalil_consolidation" : "khalil_summary";
  return `${prefix}_${stamp}.docx`;
}
