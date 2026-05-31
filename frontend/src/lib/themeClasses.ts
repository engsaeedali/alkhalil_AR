import type { KhalilTheme } from "@/lib/theme";

/** فئات Tailwind حسب الثيم — للواجهة الرئيسية */
export function themeClasses(theme: KhalilTheme) {
  const light = theme === "oatmeal";

  return {
    appShell: light
      ? "bg-stone-100 text-stone-900 selection:bg-amber-200 selection:text-stone-900"
      : "bg-[#020617] text-slate-100 selection:bg-[#f59e0b] selection:text-black",
    glowEmerald: light ? "bg-amber-200/30" : "bg-emerald-500/5",
    glowAmber: light ? "bg-amber-300/25" : "bg-amber-500/5",
    header: light
      ? "border-stone-200 bg-gradient-to-l from-white via-stone-50 to-white"
      : "border-slate-800 bg-gradient-to-l from-slate-900 via-emerald-950/20 to-slate-900",
    logoBox: light
      ? "bg-white border-amber-300/50 hover:border-amber-400"
      : "bg-slate-900/80 border-amber-500/20 hover:border-amber-500/40",
    titleGradient: light
      ? "text-transparent bg-clip-text bg-gradient-to-r from-amber-900 via-stone-900 to-amber-800"
      : "text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-emerald-100 to-amber-200",
    subtitle: light ? "text-stone-600" : "text-slate-400",
    versionBadge: light ? "text-amber-700/80" : "text-amber-500/70",
    divider: light ? "border-stone-200" : "border-slate-800",
    labelMuted: light ? "text-stone-500" : "text-slate-500",
    tokenPill: light
      ? "text-amber-800 bg-amber-50 border-amber-200"
      : "text-amber-400/80 bg-amber-500/5 border-amber-500/15",
    controlsBar: light ? "bg-stone-100/80 border-stone-200" : "bg-black/20 border-slate-800",
    btnGhost: light
      ? "text-stone-700 bg-white border-stone-200 hover:text-amber-800 hover:border-amber-300"
      : "text-slate-300 bg-slate-900 border-slate-800 hover:text-amber-400 hover:border-amber-500/30",
    pane: light ? "bg-white/70 border-stone-200" : "bg-slate-950/50 border-slate-800",
    paneSolid: light ? "bg-white border-stone-200" : "bg-slate-950 border-slate-800",
    center: light ? "bg-white/90" : "bg-slate-950/30",
    card: light ? "bg-white border-stone-200 shadow-sm" : "bg-slate-900 border-slate-800",
    cardHover: light
      ? "hover:border-amber-400/50"
      : "hover:border-amber-500/30",
    inputArea: light ? "text-stone-800 placeholder:text-stone-400" : "text-slate-300",
    /** نص المستخرج في منضدة المرجع — تباين عالٍ في الثيم الفاتح */
    extractedText: light
      ? "text-stone-950 placeholder:text-stone-400 caret-amber-700"
      : "text-slate-200 placeholder:text-slate-500 caret-amber-400",
    manuscriptBody: light ? "text-stone-900" : "text-slate-300",
    /** شعار الخلفية — أوضح في Oatmeal دون إزعاج القراءة */
    watermark: light ? "opacity-[0.26]" : "opacity-[0.08]",
    watermarkShape:
      "rounded-[2rem] md:rounded-[2.75rem] shadow-none ring-0",
    overlayTitle: light ? "text-stone-900" : "text-white",
    overlaySub: light ? "text-stone-600" : "text-slate-500",
    headingAccent: light ? "text-amber-800" : "text-amber-500",
    textMuted: light ? "text-stone-500" : "text-slate-500",
    textBody: light ? "text-stone-700" : "text-slate-300",
    textSoft: light ? "text-stone-600" : "text-slate-400",
    gridToggle: light ? "bg-stone-100 border-stone-200" : "bg-slate-900 border-slate-800",
    toggleActive: light
      ? "bg-amber-50 text-amber-900 border-amber-300 ring-1 ring-amber-200 shadow-sm font-black"
      : "bg-amber-950/40 text-amber-500 border-amber-500/30 ring-1 ring-amber-500/30 shadow-md font-black",
    toggleIdle: light
      ? "text-stone-600 hover:text-stone-900"
      : "text-slate-400 hover:text-slate-200",
    uploadZone: light
      ? "border-amber-400/40 hover:border-amber-500 bg-white hover:bg-amber-50/50"
      : "border-amber-500/30 hover:border-amber-500 bg-slate-900/40 hover:bg-amber-500/5",
    successCard: light
      ? "bg-white border-emerald-300/50 shadow-md"
      : "bg-slate-900 border-emerald-500/20 shadow-lg",
    exportBar: light
      ? "border-stone-200 bg-white/95"
      : "border-slate-800 bg-slate-900/95",
    exportBtn: light
      ? "bg-white hover:bg-stone-50 border-stone-200 text-stone-800 hover:border-amber-300"
      : "bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200 hover:border-amber-500/30",
    tooltip: light
      ? "bg-white border-amber-200 text-stone-700 shadow-lg"
      : "bg-slate-900 border-amber-500/20 text-slate-300 shadow-2xl",
    overlay: light ? "bg-stone-100/85" : "bg-slate-950/80",
    centerTitle: light ? "text-stone-800" : "text-slate-200",
    /** أحجام خط أوضح في الثيم الفاتح */
    stepLabel: light
      ? "text-sm font-bold text-amber-800"
      : "text-[11px] font-bold text-amber-500",
    stepLabelMuted: light
      ? "text-sm font-bold text-stone-700"
      : "text-[11px] font-bold text-slate-300",
    sectionLabel: light
      ? "text-sm font-bold text-stone-600"
      : "text-[10px] font-bold text-slate-400",
    uiCaption: light ? "text-xs text-stone-600" : "text-[9px] text-slate-500",
    uiSmall: light ? "text-sm text-stone-700" : "text-[10px] text-slate-400",
    uiBody: light ? "text-base text-stone-800" : "text-xs text-slate-300",
    statusSuccess: light
      ? "bg-emerald-50 border-emerald-600/40 text-sm text-emerald-900 font-medium"
      : "bg-emerald-950/20 border-emerald-500/30 text-[10px] text-emerald-400",
    statusSuccessIcon: light ? "text-emerald-700 shrink-0" : "text-emerald-400 shrink-0",
    statusError: light
      ? "bg-red-50 border-red-400/60 text-sm text-red-900 font-medium"
      : "bg-red-950/20 border-red-500/30 text-[10px] text-red-400",
    statusChecking: light
      ? "bg-stone-50 border-stone-300 text-sm text-stone-700"
      : "bg-slate-900 border-slate-800 text-[10px] text-slate-400",
    statusActiveWrap: light ? "border-stone-200 text-sm" : "border-slate-800 text-xs",
    statusActiveDot: light ? "bg-emerald-700" : "bg-emerald-500",
    statusActivePing: light ? "bg-emerald-600 opacity-75" : "bg-emerald-400 opacity-75",
    statusActiveText: light ? "font-bold text-emerald-800" : "font-semibold text-slate-400",
    primaryFileCard: light
      ? "bg-white border-emerald-600/35 shadow-md"
      : "bg-slate-900 border-emerald-500/20 shadow-lg",
    primaryFileIcon: light
      ? "bg-emerald-50 text-emerald-800"
      : "bg-emerald-500/10 text-emerald-400",
    primaryFileTitle: light ? "text-sm font-bold text-stone-900" : "text-xs font-bold text-slate-200",
    primaryFileMeta: light ? "text-xs text-stone-500" : "text-[9px] text-slate-500",
    emptyPanel: light
      ? "border-stone-300 bg-white/60"
      : "border-slate-800 bg-slate-900/10",
    emptyTitle: light ? "text-base font-bold text-stone-900" : "text-sm font-bold text-slate-300",
    emptyBody: light ? "text-sm text-stone-600 leading-relaxed" : "text-xs text-slate-500 leading-relaxed",
    uploadTitle: light ? "text-sm font-bold text-stone-800" : "text-xs font-bold text-slate-300",
    uploadHint: light ? "text-xs text-stone-500" : "text-[9px] text-slate-500",
    timerIdle: light ? "text-stone-400" : "text-slate-500/60",
    timerDone: light ? "text-emerald-800" : "text-emerald-400",
    timerBusy: light ? "text-amber-800" : "text-amber-500",
    timerError: light ? "text-red-700" : "text-red-400",
    toggleText: light ? "text-sm" : "text-[10px]",
    toggleTextSm: light ? "text-xs" : "text-[9px]",
    metricValue: light ? "text-emerald-900 font-bold" : "text-emerald-400 font-bold",
    metricBadge: light
      ? "bg-emerald-100 text-emerald-900 border-emerald-500/40"
      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    referenceJsonOk: light
      ? "text-sm text-emerald-800 font-medium"
      : "text-[9px] text-emerald-400",
    headerSubtitle: light ? "text-sm text-stone-600" : "text-xs",
    labelStat: light ? "text-xs font-bold" : "text-[9px] font-bold",
    statValue: light ? "text-sm font-black" : "text-[11px] font-black",
    sectionDivider: light ? "border-stone-200" : "border-slate-800/40",
    inputField: light
      ? "bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:ring-amber-200"
      : "bg-slate-900 border-slate-800 text-slate-300 placeholder:text-slate-500 focus:border-amber-500 focus:ring-amber-500/30",
    btnSecondary: light
      ? "bg-white hover:bg-stone-50 text-stone-800 border-stone-300 hover:border-amber-400"
      : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800",
    btnAccent: light
      ? "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300"
      : "bg-amber-950/40 hover:bg-amber-500/20 text-amber-500 border-amber-500/30",
    pillIdle: light
      ? "bg-white border-stone-300 text-stone-700 hover:text-stone-900 hover:border-amber-400"
      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white",
    innerPanel: light
      ? "bg-stone-50 border-stone-200 shadow-sm"
      : "bg-slate-900 border-slate-800 shadow-inner",
    ctaDisabled: light
      ? "bg-stone-200 border-stone-300 text-stone-500"
      : "bg-slate-900 border-slate-800 text-slate-600",
    modeBanner: light
      ? "bg-amber-50 border-amber-300 text-amber-900"
      : "bg-amber-950/40 border-amber-500/30 text-amber-300",
    fileRow: light ? "bg-white border-stone-200" : "bg-slate-900 border-slate-800",
    hintText: light ? "text-xs text-stone-600 leading-relaxed" : "text-[10px] text-slate-400 leading-relaxed",
    fileInput: light
      ? "text-xs text-stone-600 file:bg-amber-50 file:text-amber-800 file:border-amber-200"
      : "text-[10px] text-slate-400 file:bg-amber-950/40 file:text-amber-500",
    launchBorder: light ? "border-stone-200" : "border-slate-800",
    metricCard: light
      ? "bg-white border-stone-200 shadow-sm"
      : "bg-slate-900 border-slate-800",
    metricCardHighlight: light
      ? "bg-amber-50 border-amber-300"
      : "bg-amber-950/20 border-amber-500/25",
    metricLabel: light ? "text-xs text-stone-500 block mb-0.5" : "text-[8px] text-slate-500 block mb-0.5",
    metricLabelBold: light
      ? "text-xs text-amber-800 block mb-0.5 font-bold"
      : "text-[8px] text-amber-500/80 block mb-0.5 font-bold",
    metricValueText: light
      ? "text-sm font-bold text-stone-900"
      : "text-xs font-bold text-slate-300",
    metricTokenTotal: light
      ? "text-lg font-black text-amber-800 font-mono"
      : "text-lg font-black text-amber-400 font-mono",
    metricHint: light ? "text-xs text-stone-500" : "text-[8px] text-slate-500",
    keywordValue: light ? "text-sm font-bold text-sky-800 font-mono" : "text-xs font-bold text-[#38bdf8] font-mono",
    violetValue: light ? "text-sm font-bold text-violet-800 font-mono" : "text-xs font-bold text-[#a78bfa] font-mono",
    logPanel: light
      ? "bg-stone-50 border-stone-200"
      : "bg-slate-900 border-slate-800",
    logLine: light ? "text-xs text-stone-600" : "text-[9px] text-slate-400 font-mono",
    logTitle: light ? "text-xs text-amber-800 font-bold block" : "text-[9px] text-amber-500 font-bold block",
    badgeSummarize: light
      ? "bg-emerald-100 text-emerald-900 border-emerald-400"
      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    badgeMelt: light
      ? "bg-amber-100 text-amber-900 border-amber-400"
      : "bg-amber-500/10 text-amber-400 border-amber-500/25",
    badgeRolePrimary: light
      ? "bg-emerald-100 text-emerald-900 border-emerald-400"
      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    badgeRoleAux: light
      ? "bg-amber-100 text-amber-900 border-amber-400"
      : "bg-amber-500/10 text-amber-400 border-amber-500/25",
    resetBtn: light
      ? "border-amber-400 text-amber-800 hover:bg-amber-50"
      : "border-amber-500/30 text-amber-500 hover:bg-amber-500/5",
    viewModeBar: light ? "bg-stone-100 border-stone-200" : "bg-black/40 border-slate-800",
    viewModeActive: light
      ? "bg-amber-100 text-amber-900 border border-amber-300 ring-1 ring-amber-200 shadow-sm font-extrabold"
      : "bg-amber-950/40 text-amber-500 border border-amber-500/30 ring-1 ring-amber-500/30 shadow-md font-extrabold",
    viewModeIdle: light ? "text-stone-600 hover:text-stone-900" : "text-slate-400 hover:text-slate-200",
    draftBlockPrimary: light
      ? "bg-white border-stone-200 hover:border-amber-400/60 hover:bg-amber-50/40 shadow-sm"
      : "bg-slate-900 border border-slate-800 hover:border-amber-500/30 hover:bg-slate-900/80",
    draftBlockMerged: light
      ? "border-r-4 border-r-emerald-600 border border-stone-200 bg-emerald-50 hover:bg-emerald-100/80 pl-4 pr-3 py-3 rounded-l-2xl rounded-r-sm shadow-sm"
      : "border-r-4 border-r-emerald-500 border-t border-l border-b border-emerald-500/20 bg-[#022c22]/80 hover:bg-[#022c22]/95 pl-4 pr-3 py-3 rounded-l-2xl rounded-r-sm shadow-inner",
    draftBlockHeading: light
      ? "border-b border-stone-300 pb-2 hover:bg-stone-50"
      : "border-b border-slate-800 pb-2 hover:bg-white/5",
    draftBlockActive: light
      ? "ring-2 ring-amber-400/50 bg-amber-50 border-amber-400"
      : "ring-2 ring-amber-500/30 bg-slate-900/60 border-amber-500",
    draftBlockHighlight: light
      ? "animate-pulse ring-2 ring-amber-400/60 border-amber-500 bg-amber-100"
      : "animate-pulse ring-2 ring-amber-500/50 border-amber-500 bg-amber-950/30",
    draftHeadingText: light ? "text-stone-900" : "text-slate-200",
    draftMetaFooter: light ? "border-stone-200 text-stone-500" : "border-slate-800 text-slate-500",
    draftMetaSourcePrimary: light ? "text-stone-700" : "text-slate-400",
    draftMetaSourceMerged: light ? "text-emerald-800 font-bold" : "text-emerald-400 font-bold",
    draftMergedBadge: light ? "text-emerald-800 font-bold" : "text-emerald-400 font-bold",
    draftIdeaIdBadge: light
      ? "text-emerald-800 bg-emerald-50 border-emerald-300"
      : "text-emerald-400 bg-emerald-400/5 border-emerald-500/10",
    draftTooltip: light
      ? "bg-white border-amber-200 text-stone-800 shadow-lg"
      : "bg-slate-950 border border-emerald-500/20 text-slate-200 shadow-2xl",
    jsonViewer: light
      ? "bg-stone-50 border-stone-300 text-emerald-900"
      : "bg-black/40 border-slate-800 text-emerald-400",
    deltaPaneTitle: light ? "text-stone-900" : "text-slate-300",
    deltaPaneSub: light ? "text-stone-600" : "text-slate-500",
    deltaIdeaCard: light
      ? "bg-white border-stone-200 hover:border-amber-400/50 shadow-sm hover:shadow-md"
      : "bg-slate-900 border border-slate-800/80 hover:bg-slate-900/90 hover:border-amber-500/30",
    deltaIdeaActive: light
      ? "bg-amber-50 border-amber-400 shadow-lg shadow-amber-200/50 translate-x-1 ring-1 ring-amber-300 font-semibold"
      : "bg-amber-950/40 border-amber-500 shadow-lg shadow-amber-500/10 translate-x-1 ring-1 ring-amber-500/30 font-semibold",
    deltaIdeaHighlight: light
      ? "bg-emerald-50 border-emerald-500 scale-[1.02] ring-1 ring-emerald-300"
      : "bg-emerald-950/80 border-emerald-500 scale-[1.02] ring-1 ring-emerald-500/20",
    deltaIdeaText: light ? "text-stone-800" : "text-slate-300",
    deltaIdeaId: light
      ? "text-amber-800 bg-amber-50 border-amber-200"
      : "text-amber-500/80 bg-amber-500/5 border-amber-500/10",
    deltaStatusMerged: light
      ? "text-emerald-800 bg-emerald-50 border-emerald-300"
      : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    deltaStatusPending: light
      ? "text-amber-800 bg-amber-50 border-amber-300"
      : "text-amber-400 bg-amber-500/10 border-amber-500/25",
    deltaEmpty: light ? "text-stone-500" : "text-slate-600",
    deltaWait: light ? "text-stone-500" : "text-slate-600",
  };
}

export function workbenchClasses(theme: KhalilTheme) {
  const light = theme === "oatmeal";
  return {
    container: light
      ? "bg-white border-stone-200 shadow-lg"
      : "bg-slate-900 border-slate-800 shadow-2xl",
    headerBorder: light ? "border-stone-200" : "border-slate-800",
    title: light ? "text-stone-900" : "text-white",
    badge: light
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-amber-500/10 text-amber-400 border-amber-500/20",
    engine: light ? "text-stone-500" : "text-slate-400",
    loadingCard: light
      ? "border-amber-200 bg-amber-50/80"
      : "border-amber-500/20 bg-slate-950/80",
    loadingText: light ? "text-amber-900" : "text-amber-400",
    loadingLogPanel: light
      ? "bg-white border-stone-200 shadow-sm"
      : "bg-slate-950/80 border-slate-700",
    loadingLogLine: light ? "text-stone-700" : "text-slate-400",
    loadingLogActive: light ? "text-amber-900" : "text-amber-400",
    editorial: light
      ? "bg-amber-50 border-amber-200"
      : "bg-amber-950/30 border-amber-500/20",
    editorialTitle: light ? "text-amber-900" : "text-amber-400",
    editorialList: light ? "text-stone-700" : "text-slate-300",
    keywordsPanel: light
      ? "bg-stone-50 border-stone-200"
      : "bg-slate-950/50 border-slate-800",
    accentTitle: light ? "text-amber-800" : "text-amber-400",
    pill: light
      ? "bg-white text-amber-900 border-amber-300"
      : "bg-amber-500/5 text-amber-400 border-amber-500/20",
    ideaCard: light
      ? "bg-white border-stone-200 hover:border-amber-400/60 shadow-sm"
      : "bg-slate-800/40 border-slate-700/40 hover:border-amber-500/30",
    ideaNum: light
      ? "bg-amber-50 border-amber-300 text-amber-800"
      : "bg-amber-500/10 border-amber-500/30 text-amber-400",
    ideaText: light ? "text-stone-900" : "text-slate-100",
    layerBorder: light ? "border-stone-200" : "border-slate-700/60",
    layerMuted: light ? "text-stone-700 bg-stone-50/80 rounded-lg p-3" : "text-slate-400",
    layerBody: light ? "text-stone-900" : "text-slate-300",
    ledgerPanel: light
      ? "bg-stone-50 border-stone-200"
      : "bg-slate-950/50 border-slate-800",
    ledgerItem: light
      ? "bg-white border-stone-200"
      : "bg-slate-900/60 border-slate-800",
    ledgerValue: light
      ? "bg-emerald-50 text-emerald-900 border-emerald-500 font-semibold"
      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    empty: light ? "text-stone-500" : "text-slate-500",
    copyBtn: light ? "text-amber-700" : "text-amber-500",
  };
}
