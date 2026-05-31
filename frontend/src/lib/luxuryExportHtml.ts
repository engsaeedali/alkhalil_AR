import type { WorkbenchDiscoveredStructure } from "@/components/MainTextWorkbench";
import type { EditWorkspaceExport } from "@/lib/exportOutputs";
import type { KhalilTheme } from "@/lib/theme";

export interface LuxuryExportOptions {
  mode: "summarize" | "consolidate" | "edit";
  title?: string;
  sourceFilename?: string;
  showLayers?: boolean;
  /** يطابق ثيم الواجهة الحالي */
  theme?: KhalilTheme;
}

function luxuryExportCss(theme: KhalilTheme): string {
  if (theme === "oatmeal") {
    return `
    :root {
      --bg: #f5f5f4;
      --card: #ffffff;
      --card-inner: #fafaf9;
      --border: #e7e5e4;
      --gold: #b45309;
      --gold-soft: #c08a3e;
      --gold-dim: #fef3c7;
      --text: #1c1917;
      --muted: #78716c;
      --emerald: #047857;
      --panel-bg: rgba(250, 250, 249, 0.9);
      --editorial-bg: #fffbeb;
      --shadow: 0 4px 24px rgba(0,0,0,0.06);
    }`;
  }
  return `
    :root {
      --bg: #0c111d;
      --card: #111827;
      --card-inner: #1e293b66;
      --border: #1e293b;
      --gold: #d4af37;
      --gold-soft: #f59e0b;
      --gold-dim: rgba(245, 158, 11, 0.15);
      --text: #f1f5f9;
      --muted: #94a3b8;
      --emerald: #34d399;
      --panel-bg: rgba(15, 23, 42, 0.55);
      --editorial-bg: rgba(69, 26, 3, 0.35);
      --shadow: 0 25px 50px -12px rgba(0,0,0,0.55);
    }`;
}

function esc(text: unknown): string {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ideaText(item: { sovereign_idea?: string; idea?: string }): string {
  return item.sovereign_idea || item.idea || "";
}

export function buildLuxuryExportHtml(
  ds: WorkbenchDiscoveredStructure,
  options: LuxuryExportOptions,
): string {
  const meta = (ds._metadata || {}) as WorkbenchDiscoveredStructure["_metadata"] & {
    tokens_consumed?: number;
    token_usage?: { total_tokens?: number };
  };
  const editorial = ds.editorial_suggestions || [];
  const keywords = ds.sovereign_keywords || [];
  const ideas = ds.core_ideas || [];
  const ledger = ds.numerical_ledger || [];
  const modeLabel =
    options.mode === "consolidate"
      ? "صهر المحاور السيادي"
      : options.mode === "edit"
        ? "سبك ودمج المسودات"
        : "التلخيص الدلالي";
  const ideasTitle =
    options.mode === "consolidate"
      ? "البطاقات المعرفية السيادية"
      : options.mode === "edit"
        ? "الأفكار الذرية المدمجة"
        : "الأفكار الجوهرية";
  const stamp = new Date().toLocaleString("ar-SA", { dateStyle: "long", timeStyle: "short" });
  const showLayers = options.showLayers ?? options.mode === "consolidate";
  const tokens = meta.tokens_consumed ?? meta.token_usage?.total_tokens ?? "—";
  const exportTheme = options.theme ?? "sovereign-dark";

  const keywordPills = keywords
    .map(
      (kw) =>
        `<span class="pill">${esc(kw)}</span>`,
    )
    .join("\n");

  const editorialBlock =
    editorial.length > 0
      ? `<section class="panel editorial">
  <h3><span class="icon">⚠️</span> إرشادات التدقيق والرقابة التحريرية</h3>
  <ul>${editorial.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
</section>`
      : "";

  const ideaCards = ideas
    .map((item) => {
      const layers =
        showLayers && item.layers
          ? `<div class="layers">
      ${
        item.layers.conceptual_framework
          ? `<div class="layer"><strong>🎯 البُعد المنهجي والفلسفي</strong><p>${esc(item.layers.conceptual_framework)}</p></div>`
          : ""
      }
      ${
        item.layers.practical_applications
          ? `<div class="layer"><strong>🛠️ المسار والتطبيق العملي</strong><p>${esc(item.layers.practical_applications)}</p></div>`
          : ""
      }
    </div>`
          : "";
      return `<article class="idea-card">
  ${item.section_title ? `<p class="section-tag">${esc(item.section_title)}</p>` : ""}
  <div class="idea-row">
    <span class="idea-num">${esc(item.id)}</span>
    <p class="idea-text">${esc(ideaText(item))}</p>
  </div>
  ${layers}
</article>`;
    })
    .join("\n");

  const ledgerGrid = ledger
    .map(
      (row) => `<div class="ledger-item">
  <span class="ledger-value">${esc(row.value)}</span>
  <p class="ledger-ctx">"${esc(row.context)}"</p>
</div>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(options.title || "جوهر المخطوطة — مدونة الخليل")}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    ${luxuryExportCss(exportTheme)}
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Noto Naskh Arabic", "Traditional Arabic", serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.85;
      min-height: 100vh;
      padding: 2rem 1.25rem 3rem;
    }
    .wrap { max-width: 920px; margin: 0 auto; }
    .brand {
      text-align: center;
      margin-bottom: 1.75rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--border);
    }
    .brand h1 {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--gold);
      letter-spacing: 0.02em;
    }
    .brand p { color: var(--muted); font-size: 0.9rem; margin-top: 0.35rem; }
    .workbench {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow);
      padding: 1.75rem 1.5rem;
    }
    .wb-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      padding-bottom: 1rem;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
    }
    .wb-header h2 { font-size: 1.45rem; font-weight: 700; }
    .badge {
      font-size: 0.7rem;
      font-family: ui-monospace, monospace;
      background: var(--gold-dim);
      color: var(--gold-soft);
      border: 1px solid rgba(245,158,11,0.25);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      margin-right: 0.5rem;
    }
    .engine { font-size: 0.85rem; color: var(--muted); font-family: ui-monospace, monospace; }
    section { margin-bottom: 1.75rem; }
    section h3 {
      font-size: 1.15rem;
      color: var(--gold-soft);
      margin-bottom: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .panel {
      background: var(--panel-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.1rem 1.15rem;
    }
    .editorial { background: var(--editorial-bg); border-color: rgba(245,158,11,0.2); }
    .editorial ul { padding-right: 1.25rem; color: var(--text); opacity: 0.9; }
    .editorial li { margin-bottom: 0.45rem; text-align: justify; }
    .pills { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .pill {
      display: inline-block;
      padding: 0.35rem 0.85rem;
      background: var(--card);
      color: var(--gold-soft);
      border: 1px solid var(--gold-soft);
      opacity: 0.85;
      border-radius: 999px;
      font-size: 0.95rem;
      font-weight: 600;
    }
    .idea-card {
      background: var(--card-inner);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.25rem 1.15rem;
      margin-bottom: 1rem;
    }
    .section-tag {
      font-size: 0.8rem;
      font-weight: 700;
      color: rgba(245,158,11,0.75);
      margin-bottom: 0.5rem;
    }
    .idea-row { display: flex; gap: 1rem; align-items: flex-start; }
    .idea-num {
      flex-shrink: 0;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 50%;
      background: var(--gold-dim);
      border: 1px solid rgba(245,158,11,0.3);
      color: var(--gold-soft);
      font-weight: 700;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: ui-monospace, monospace;
    }
    .idea-text {
      flex: 1;
      font-size: 1.15rem;
      text-align: justify;
      color: #e2e8f0;
      font-weight: 500;
    }
    .layers {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(51,65,85,0.6);
    }
    @media (max-width: 640px) { .layers { grid-template-columns: 1fr; } }
    .layer strong { display: block; color: var(--gold-soft); margin-bottom: 0.35rem; font-size: 0.9rem; }
    .layer p { color: #94a3b8; text-align: justify; font-size: 0.95rem; }
    .ledger-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    @media (max-width: 640px) { .ledger-grid { grid-template-columns: 1fr; } }
    .ledger-item {
      background: rgba(15,23,42,0.65);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.85rem;
    }
    .ledger-value {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      background: rgba(52,211,153,0.1);
      color: var(--emerald);
      border: 1px solid rgba(52,211,153,0.22);
      border-radius: 6px;
      font-family: ui-monospace, monospace;
      font-weight: 700;
      font-size: 0.85rem;
    }
    .ledger-ctx { color: var(--muted); font-style: italic; margin-top: 0.45rem; font-size: 0.95rem; text-align: justify; }
    .footer {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      font-size: 0.8rem;
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.5rem;
      justify-content: space-between;
    }
    @media print {
      body { background: #fff; color: #111; padding: 0.5cm; }
      .workbench { box-shadow: none; border-color: #ccc; }
      .idea-text, .editorial li, .layer p { color: #222; }
      .pill { border-color: #b45309; color: #92400e; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="brand">
      <h1>✨ مدونة الخليل للتحرير اللغوي</h1>
      <p>${esc(modeLabel)} · ${esc(stamp)}</p>
      ${options.sourceFilename ? `<p>المصدر: ${esc(options.sourceFilename)}</p>` : ""}
    </header>

    <main class="workbench">
      <div class="wb-header">
        <h2>✨ مِنْضَدَة النص اللغوية الموحدة <span class="badge">v4.6 SaaS</span></h2>
        ${meta.engine_description ? `<span class="engine">المحرك: ${esc(meta.engine_description)}</span>` : ""}
      </div>

      ${editorialBlock}

      ${
        keywords.length
          ? `<section class="panel">
  <h3><span class="icon">📌</span> الكلمات المفتاحية السيادية</h3>
  <div class="pills">${keywordPills}</div>
</section>`
          : ""
      }

      ${
        ideas.length
          ? `<section>
  <h3><span class="icon">💡</span> ${esc(ideasTitle)}</h3>
  ${ideaCards}
</section>`
          : ""
      }

      ${
        ledger.length
          ? `<section class="panel">
  <h3><span class="icon">🔢</span> الكشاف الرقمي والتواريخ الحيوية</h3>
  <div class="ledger-grid">${ledgerGrid}</div>
</section>`
          : ""
      }

      <footer class="footer">
        <span>التوكنات: ${esc(tokens)}</span>
        <span>الأفكار: ${ideas.length}</span>
        <span>مدونة الخليل · تصدير فاخر</span>
      </footer>
    </main>
  </div>
</body>
</html>`;
}

export function buildEditLuxuryHtml(
  ws: EditWorkspaceExport,
  options: Pick<LuxuryExportOptions, "title" | "sourceFilename" | "theme">,
): string {
  const exportTheme = options.theme ?? "sovereign-dark";
  const stamp = new Date().toLocaleString("ar-SA", { dateStyle: "long", timeStyle: "short" });
  const blocks = ws.master_draft_structured || [];
  const blockHtml = blocks.length
    ? blocks
        .map((block) => {
          const cls = block.is_primary ? "block-primary" : "block-merged";
          const badge = block.is_primary
            ? ""
            : `<p class="merge-badge">💡 فكرة مدمجة: ${esc(block.associated_idea_id)} · ${esc(block.source)}</p>`;
          const tag = block.type === "heading" ? "h3" : "p";
          return `<article class="manuscript-block ${cls}">
  ${badge}
  <${tag} class="block-text">${esc(block.text)}</${tag}>
  <footer class="block-meta">المصدر: <strong>${esc(block.source)}</strong></footer>
</article>`;
        })
        .join("\n")
    : `<div class="manuscript-plain"><p>${esc(ws.content || "")}</p></div>`;

  const ideasHtml = (ws.atomic_ideas || [])
    .map(
      (idea) => `<article class="idea-card compact">
  <span class="idea-num">${esc(idea.id)}</span>
  <p class="idea-text">${esc(idea.content)}</p>
  <p class="idea-src">${esc(idea.source_draft)} — ${esc(idea.status)}</p>
</article>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${esc(options.title || "المخطوطة اللغوية الموحدة")}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    ${luxuryExportCss(exportTheme)}
    body { font-family: "Noto Naskh Arabic", serif; background: var(--bg); color: var(--text); padding: 2rem 1.25rem; line-height: 1.85; }
    .wrap { max-width: 920px; margin: 0 auto; }
    .brand { text-align: center; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem; }
    .brand h1 { color: var(--gold); font-size: 1.35rem; }
    .workbench { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 1.5rem; }
    .manuscript-block { margin-bottom: 1rem; padding: 1rem; border-radius: 12px; border: 1px solid var(--border); }
    .block-primary { background: var(--card-inner); }
    .block-merged { border-right: 4px solid var(--emerald); background: var(--panel-bg); }
    .merge-badge { font-size: 0.8rem; color: var(--emerald); margin-bottom: 0.5rem; font-weight: 700; }
    .block-text { text-align: justify; font-size: 1.05rem; }
    .block-meta { margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid var(--border); font-size: 0.8rem; color: var(--muted); }
    .idea-card.compact { margin-top: 0.75rem; padding: 0.85rem; border: 1px dashed var(--border); border-radius: 10px; }
    .idea-src { font-size: 0.8rem; color: var(--muted); margin-top: 0.35rem; }
    h2 { color: var(--gold-soft); margin: 1.25rem 0 0.75rem; font-size: 1.1rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="brand">
      <h1>${esc(options.title || "المخطوطة اللغوية الموحدة")}</h1>
      <p>سبك ودمج المسودات · ${esc(stamp)}${options.sourceFilename ? ` · ${esc(options.sourceFilename)}` : ""}</p>
    </header>
    <main class="workbench">
      <h2>المخطوطة الموحدة</h2>
      ${blockHtml}
      ${ideasHtml ? `<h2>الأفكار الذرية</h2>${ideasHtml}` : ""}
    </main>
  </div>
</body>
</html>`;
}

export function downloadEditLuxuryHtml(
  ws: EditWorkspaceExport,
  options: Pick<LuxuryExportOptions, "title" | "sourceFilename" | "theme">,
): void {
  const html = buildEditLuxuryHtml(ws, options);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const stamp = new Date().toISOString().slice(0, 10);
  const themeSuffix = options.theme === "oatmeal" ? "oatmeal" : "dark";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `khalil_merge_luxury_${themeSuffix}_${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function printEditLuxuryHtml(
  ws: EditWorkspaceExport,
  options: Pick<LuxuryExportOptions, "title" | "sourceFilename" | "theme">,
): void {
  const html = buildEditLuxuryHtml(ws, options);
  const win = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!win) {
    alert("تعذر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة أو استخدم «تصدير HTML».");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => {
    setTimeout(() => win.print(), 400);
  };
}

export function downloadLuxuryHtml(
  ds: WorkbenchDiscoveredStructure,
  options: LuxuryExportOptions,
): void {
  const html = buildLuxuryExportHtml(ds, options);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const stamp = new Date().toISOString().slice(0, 10);
  const mode =
    options.mode === "consolidate" ? "consolidation" : options.mode === "edit" ? "merge" : "summary";
  const themeSuffix = options.theme === "oatmeal" ? "oatmeal" : "dark";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `khalil_${mode}_luxury_${themeSuffix}_${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function printLuxuryHtml(
  ds: WorkbenchDiscoveredStructure,
  options: LuxuryExportOptions,
): void {
  const html = buildLuxuryExportHtml(ds, options);
  const win = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!win) {
    alert("تعذر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة أو استخدم «تصدير HTML».");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => {
    setTimeout(() => win.print(), 400);
  };
}
