"use client";

import { Check, Copy, Download, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KhalilTheme } from "@/lib/theme";
import { themeClasses } from "@/lib/themeClasses";
import {
  buildAnalyticsFullMarkdown,
  buildAnalyticsFullPlain,
  buildAnalyticsSummaryMarkdown,
  buildEditFullMarkdown,
  buildEditFullPlain,
  buildEditSummaryMarkdown,
  docxFilename,
  downloadTextFile,
  exportFileStamp,
  getAnalyticsStructure,
  getAnalyticsSummaryMarkdown,
  workspaceToDocxPayload,
  type EditWorkspaceExport,
  type ExportPageKind,
} from "@/lib/exportOutputs";
import {
  downloadEditLuxuryHtml,
  downloadLuxuryHtml,
  printEditLuxuryHtml,
  printLuxuryHtml,
} from "@/lib/luxuryExportHtml";
const getHeavyApiUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isLocal =
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    if (isLocal) return "http://127.0.0.1:8000";
  }
  return "/api";
};

type ExportContext =
  | { kind: "edit"; workspace: EditWorkspaceExport; sourceFilename?: string }
  | { kind: "analytics"; mode: "summarize" | "consolidate"; summaryResult: unknown; sourceFilename?: string };

interface ExportActionBarProps {
  theme: KhalilTheme;
  context: ExportContext;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}

function accentBtn(theme: KhalilTheme) {
  return theme === "oatmeal"
    ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 border-amber-500/50 text-stone-950"
    : "bg-gradient-to-r from-amber-500/90 to-amber-600/90 hover:from-amber-500 hover:to-amber-600 border-amber-500/40 text-black";
}

export default function ExportActionBar({
  theme,
  context,
  copiedId,
  onCopy,
}: ExportActionBarProps) {
  const tc = themeClasses(theme);
  const stamp = exportFileStamp();
  const kind: ExportPageKind =
    context.kind === "edit" ? "edit" : context.mode;

  const btn = cn(
    "px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-300 cursor-pointer hover:scale-[1.02] border shrink-0",
    tc.exportBtn,
  );
  const btnAccent = cn(btn, accentBtn(theme), "shadow-md");

  const copyBtn = (label: string, text: string, id: string) => (
    <button type="button" onClick={() => onCopy(text, id)} className={btn}>
      {copiedId === id ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
      <span>{label}</span>
    </button>
  );

  const downloadBtn = (label: string, content: string, basename: string, ext: "md" | "json") => (
    <button
      type="button"
      onClick={() => downloadTextFile(content, basename, ext)}
      className={btn}
    >
      <Download size={12} />
      <span>{label}</span>
    </button>
  );

  const docxExportKind = (k: ExportPageKind): string =>
    k === "edit" ? "merge" : k;

  const fetchDocx = async (
    structure: Record<string, unknown>,
    opts: {
      title: string;
      manuscript?: string;
      exportKind: ExportPageKind;
    },
  ) => {
    const res = await fetch(`${getHeavyApiUrl()}/export/docx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discovered_structure: structure,
        title: opts.title,
        source_filename: context.sourceFilename,
        manuscript_content: opts.manuscript,
        export_kind: docxExportKind(opts.exportKind),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || "فشل تصدير Word");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = docxFilename(opts.exportKind);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onDocx = async () => {
    try {
      if (context.kind === "edit") {
        await fetchDocx(workspaceToDocxPayload(context.workspace), {
          title: "المخطوطة اللغوية الموحدة — مدونة الخليل",
          manuscript: context.workspace.content,
          exportKind: "edit",
        });
        return;
      }
      const ds = getAnalyticsStructure(context.summaryResult);
      if (!ds?.core_ideas?.length && !getAnalyticsSummaryMarkdown(context.summaryResult)) {
        alert("لا توجد مخرجات للتصدير.");
        return;
      }
      const structure = (ds || context.summaryResult) as Record<string, unknown>;
      await fetchDocx(structure, {
        title:
          context.mode === "consolidate"
            ? "جوهر المخطوطة — الصهر الديناميكي"
            : "مستخلص التلخيص — مدونة الخليل",
        exportKind: context.mode,
      });
    } catch (e) {
      console.error("DOCX export:", e);
      alert(e instanceof Error ? e.message : "تعذر تصدير Word.");
    }
  };

  const onHtml = () => {
    if (context.kind === "edit") {
      downloadEditLuxuryHtml(context.workspace, {
        sourceFilename: context.sourceFilename,
        theme,
      });
      return;
    }
    const ds = getAnalyticsStructure(context.summaryResult);
    if (!ds?.core_ideas?.length && !(ds?.sovereign_keywords?.length)) {
      alert("لا توجد مخرجات للتصدير.");
      return;
    }
    downloadLuxuryHtml(ds, {
      mode: context.mode,
      sourceFilename: context.sourceFilename,
      showLayers: context.mode === "consolidate",
      theme,
    });
  };

  const onPrint = () => {
    if (context.kind === "edit") {
      printEditLuxuryHtml(context.workspace, {
        sourceFilename: context.sourceFilename,
        theme,
      });
      return;
    }
    const ds = getAnalyticsStructure(context.summaryResult);
    if (!ds?.core_ideas?.length) {
      alert("لا توجد مخرجات للطباعة.");
      return;
    }
    printLuxuryHtml(ds, {
      mode: context.mode,
      sourceFilename: context.sourceFilename,
      showLayers: context.mode === "consolidate",
      theme,
    });
  };

  let fullPlain = "";
  let summaryMd = "";
  let fullMd = "";
  let jsonPayload = "";

  if (context.kind === "edit") {
    const ws = context.workspace;
    fullPlain = buildEditFullPlain(ws);
    summaryMd = buildEditSummaryMarkdown(ws);
    fullMd = buildEditFullMarkdown(ws);
    jsonPayload = JSON.stringify(ws, null, 2);
  } else {
    const ds = getAnalyticsStructure(context.summaryResult);
    if (ds) {
      fullPlain = buildAnalyticsFullPlain(ds, context.mode);
      fullMd = buildAnalyticsFullMarkdown(ds, context.mode);
      summaryMd =
        getAnalyticsSummaryMarkdown(context.summaryResult) ||
        buildAnalyticsSummaryMarkdown(ds, context.mode);
    }
    jsonPayload = JSON.stringify(context.summaryResult, null, 2);
  }

  const baseName = `khalil_${kind}_${stamp}`;

  return (
    <div
      className={cn(
        "absolute bottom-0 left-0 right-0 p-3 border-t backdrop-blur z-20 shrink-0 transition-colors duration-300",
        tc.exportBar,
      )}
    >
      <p className={cn("text-xs font-bold mb-2 text-right", tc.labelMuted)}>
        تصدير المخرجات — المحتوى الكامل والملخص
      </p>
      <div className="flex flex-wrap justify-end gap-2 max-h-32 overflow-y-auto">
        {copyBtn("نسخ كامل", fullPlain, `${kind}_full_copy`)}
        {copyBtn("نسخ ملخص", summaryMd, `${kind}_summary_copy`)}
        {downloadBtn("Markdown كامل", fullMd, `${baseName}_full`, "md")}
        {downloadBtn("Markdown ملخص", summaryMd, `${baseName}_summary`, "md")}
        {downloadBtn("JSON", jsonPayload, `${baseName}_data`, "json")}
        <button type="button" onClick={onHtml} className={btnAccent}>
          <Sparkles size={12} />
          <span>HTML</span>
        </button>
        <button type="button" onClick={onPrint} className={btn}>
          <Download size={12} />
          <span>طباعة / PDF</span>
        </button>
        <button type="button" onClick={onDocx} className={btnAccent}>
          <Download size={12} />
          <span>Word</span>
        </button>
      </div>
    </div>
  );
}
