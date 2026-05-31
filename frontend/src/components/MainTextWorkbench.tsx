"use client";

import { AlertTriangle, Activity, Copy, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import ProcessingBrandSpinner from "./ProcessingBrandSpinner";
import { useKhalilTheme } from "@/components/ThemeProvider";
import { workbenchClasses } from "@/lib/themeClasses";

export type WorkbenchMode = "summarize" | "edit" | "consolidate";

export const TASK_LOADING_PRIMARY: Record<WorkbenchMode, string> = {
  summarize: "جاري تلخيص الوثيقة",
  edit: "جاري معالجة الوثيقة",
  consolidate: "جاري صهر الوثيقة",
};

/** VIEWPORT_TEXT v4.6 — 20px / text-xl */
export const VIEWPORT_TEXT = "text-xl leading-relaxed font-sans";

export interface CoreIdeaItem {
  id: number | string;
  idea?: string;
  sovereign_idea?: string;
  section_title?: string;
  layers?: {
    conceptual_framework?: string;
    practical_applications?: string;
  };
  discovered_styles?: string[];
}

export interface WorkbenchDiscoveredStructure {
  core_ideas?: CoreIdeaItem[];
  editorial_suggestions?: string[];
  sovereign_keywords?: string[];
  numerical_ledger?: Array<{ value: string; context: string }>;
  _metadata?: {
    engine_description?: string;
    editorial_suggestions?: string[];
    audit_warnings?: string[];
  };
}

export interface WorkbenchSummaryData {
  discovered_structure?: WorkbenchDiscoveredStructure;
}

/** توحيد شكل الاستجابة (summary_analytics أو discovered_structure) */
export function normalizeWorkbenchPayload(raw: unknown): WorkbenchSummaryData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const inner = (r.discovered_structure || r) as WorkbenchDiscoveredStructure;
  const meta = inner._metadata || (r._metadata as WorkbenchDiscoveredStructure["_metadata"]);
  const editorial =
    inner.editorial_suggestions ||
    meta?.editorial_suggestions ||
    meta?.audit_warnings ||
    [];

  return {
    discovered_structure: {
      core_ideas: (inner.core_ideas || r.core_ideas) as CoreIdeaItem[] | undefined,
      sovereign_keywords: (inner.sovereign_keywords || r.sovereign_keywords) as string[] | undefined,
      numerical_ledger: (inner.numerical_ledger || r.numerical_ledger) as
        | WorkbenchDiscoveredStructure["numerical_ledger"]
        | undefined,
      editorial_suggestions: editorial,
      _metadata: meta,
    },
  };
}

interface MainTextWorkbenchProps {
  summaryData: WorkbenchSummaryData | null;
  isLoading: boolean;
  currentMode: WorkbenchMode;
  showLayers?: boolean;
  onCopyIdeas?: () => void;
  copiedIdeas?: boolean;
  /** سجل الإجراءات الحي — يُعرض في المنضدة بعدة أسطر */
  actionLogs?: string[];
}

export default function MainTextWorkbench({
  summaryData,
  isLoading,
  currentMode,
  showLayers = true,
  onCopyIdeas,
  copiedIdeas = false,
  actionLogs = [],
}: MainTextWorkbenchProps) {
  const { theme } = useKhalilTheme();
  const wb = workbenchClasses(theme);
  const ds = summaryData?.discovered_structure;
  const editorial = ds?.editorial_suggestions || [];
  const coreIdeas = ds?.core_ideas || [];
  const engineLabel = ds?._metadata?.engine_description;

  return (
    <div
      className={cn(
        "main-text-workbench-container w-full max-w-5xl mx-auto p-6 rounded-xl border select-text transition-colors duration-300",
        wb.container,
      )}
    >
      <div className={cn("workbench-header flex flex-wrap justify-between items-center gap-3 mb-6 border-b pb-4", wb.headerBorder)}>
        <h2 className={cn("text-2xl font-bold font-sans flex items-center gap-2", wb.title)}>
          ✨ مِنْضَدَة النص اللغوية الموحدة
          <span className={cn("text-xs px-2 py-0.5 rounded font-mono border", wb.badge)}>
            v4.6 SaaS
          </span>
        </h2>
        {!isLoading && engineLabel && (
          <span className={cn("text-sm font-mono", wb.engine)}>المحرك: {engineLabel}</span>
        )}
      </div>

      {isLoading && (
        <div className={cn("processing-log-card p-6 rounded-xl border", wb.loadingCard)}>
          <div className="flex items-start gap-4">
            <ProcessingBrandSpinner size="md" />
            <div className="flex-1 space-y-4 text-right min-w-0">
              <p className={cn("font-bold font-sans", VIEWPORT_TEXT, wb.loadingText)}>
                {TASK_LOADING_PRIMARY[currentMode] || "جاري معالجة الوثيقة"}
              </p>
              {actionLogs.length > 0 && (
                <div className={cn("rounded-xl border p-4 space-y-3", wb.loadingLogPanel)}>
                  {actionLogs.map((log, index) => {
                    const isLatest = index === actionLogs.length - 1;
                    return (
                      <p
                        key={`${index}-${log.slice(0, 24)}`}
                        className={cn(
                          "leading-relaxed text-justify font-sans",
                          isLatest
                            ? cn("font-bold", VIEWPORT_TEXT, wb.loadingLogActive)
                            : cn("text-lg", wb.loadingLogLine),
                        )}
                      >
                        {log}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!isLoading && editorial.length > 0 && (
        <div className={cn("editorial-panel mb-6 p-4 rounded-lg border", wb.editorial)}>
          <h4 className={cn("font-bold text-lg mb-2 flex items-center gap-2 font-sans", wb.editorialTitle)}>
            <AlertTriangle size={18} />
            ⚠️ إرشادات التدقيق والرقابة التحريرية:
          </h4>
          <ul className={cn("list-disc list-inside space-y-2 text-base font-sans", wb.editorialList)}>
            {editorial.map((suggestion, idx) => (
              <li key={idx} className="text-justify leading-relaxed">
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isLoading && ds?.sovereign_keywords && ds.sovereign_keywords.length > 0 && (
        <div className={cn("mb-6 p-4 rounded-lg border", wb.keywordsPanel)}>
          <h4 className={cn("font-bold flex items-center gap-2 mb-3", VIEWPORT_TEXT, wb.accentTitle)}>
            <Sparkles size={18} />
            📌 الكلمات المفتاحية السيادية
          </h4>
          <div className="flex flex-wrap gap-2">
            {ds.sovereign_keywords.map((kw, i) => (
              <span
                key={i}
                className={cn("px-3 py-1 rounded-full text-base font-semibold border", wb.pill)}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {!isLoading && coreIdeas.length > 0 && (
        <div className="core-ideas-wrapper flex flex-col gap-5 mt-4">
          <div className="flex items-center justify-between">
            <h4 className={cn("font-bold font-sans", VIEWPORT_TEXT, wb.accentTitle)}>
              {currentMode === "consolidate" ? "💡 البطاقات المعرفية السيادية" : "💡 الأفكار الجوهرية"}
            </h4>
            {onCopyIdeas && (
              <button
                type="button"
                onClick={onCopyIdeas}
                className={cn("flex items-center gap-1 text-sm hover:underline cursor-pointer", wb.copyBtn)}
              >
                {copiedIdeas ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedIdeas ? "تم النسخ" : "نسخ الأفكار"}</span>
              </button>
            )}
          </div>

          {coreIdeas.map((item) => (
            <div
              key={String(item.id)}
              className={cn("sovereign-card p-6 rounded-xl border transition-all duration-300", wb.ideaCard)}
            >
              {item.section_title && (
                <p className={cn("text-sm font-bold mb-2 font-sans", wb.accentTitle)}>{item.section_title}</p>
              )}
              <div className="flex gap-4 items-start">
                <span
                  className={cn(
                    "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-xl font-mono border",
                    wb.ideaNum,
                  )}
                >
                  {item.id}
                </span>
                <p className={cn("text-justify font-medium flex-1", VIEWPORT_TEXT, wb.ideaText)}>
                  {item.sovereign_idea || item.idea}
                </p>
              </div>

              {showLayers && item.layers && (
                <div
                  className={cn(
                    "layers-container grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-4 border-t text-base font-sans",
                    wb.layerBorder,
                  )}
                >
                  {item.layers.conceptual_framework && (
                    <div className={wb.layerMuted}>
                      <strong className={cn("block mb-1", wb.accentTitle)}>🎯 البُعد المنهجي والفلسفي:</strong>
                      <span className={cn("block text-justify", VIEWPORT_TEXT, wb.layerBody)}>
                        {item.layers.conceptual_framework}
                      </span>
                    </div>
                  )}
                  {item.layers.practical_applications && (
                    <div className={wb.layerMuted}>
                      <strong className={cn("block mb-1", wb.accentTitle)}>🛠️ المسار والتطبيق العملي:</strong>
                      <span className={cn("block text-justify whitespace-pre-line", VIEWPORT_TEXT, wb.layerBody)}>
                        {item.layers.practical_applications}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {item.discovered_styles && item.discovered_styles.length > 0 && (
                <p className={cn("text-sm mt-3 pr-12 font-sans", wb.empty)}>
                  أنماط: {item.discovered_styles.join(" · ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {!isLoading && ds?.numerical_ledger && ds.numerical_ledger.length > 0 && (
        <div className={cn("mt-8 p-4 rounded-lg border", wb.ledgerPanel)}>
          <h4 className={cn("font-bold flex items-center gap-2 mb-3", VIEWPORT_TEXT, wb.accentTitle)}>
            <Activity size={18} />
            🔢 الكشاف الرقمي والتواريخ الحيوية
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ds.numerical_ledger.map((num, i) => (
              <div key={i} className={cn("p-3 rounded-xl border", wb.ledgerItem)}>
                <span className={cn("px-2 py-0.5 rounded text-sm font-bold font-mono border", wb.ledgerValue)}>
                  {num.value}
                </span>
                <p className={cn("mt-2 italic text-justify", VIEWPORT_TEXT, wb.layerMuted)}>
                  &quot;{num.context}&quot;
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && coreIdeas.length === 0 && editorial.length === 0 && (
        <p className={cn("text-center py-8", VIEWPORT_TEXT, wb.empty)}>
          لا توجد مخرجات بعد — نفّذ العملية من لوحة التوجيه.
        </p>
      )}
    </div>
  );
}
