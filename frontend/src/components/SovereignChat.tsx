"use client";

import { useState, useRef, useEffect } from "react";
import { 
  Send, 
  BookOpen, 
  Shield, 
  Paperclip, 
  Copy, 
  Check, 
  Clipboard, 
  Download, 
  RefreshCw, 
  ArrowLeft, 
  Layers,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Sparkles,
  Code,
  Eye,
  ArrowRightLeft,
  UploadCloud,
  Trash2,
  Crown,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import MainTextWorkbench, {
  normalizeWorkbenchPayload,
  TASK_LOADING_PRIMARY,
  VIEWPORT_TEXT,
} from "@/components/MainTextWorkbench";
import ProcessingBrandSpinner from "@/components/ProcessingBrandSpinner";
import ThemeToggle from "@/components/ThemeToggle";
import { useKhalilTheme } from "@/components/ThemeProvider";
import { themeClasses } from "@/lib/themeClasses";
import ExportActionBar from "@/components/ExportActionBar";

const getApiUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]";
    if (isLocal) {
      // بروكسي Next.js — نفس الأصل، بلا CORS
      return "/api";
    }
    return "/_/backend";
  }
  return "http://127.0.0.1:8000";
};

/** طلبات LLM طويلة — اتصال مباشر بالباكند (بروكسي Next يقطع عند ~30s) */
const getHeavyApiUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]";
    if (isLocal) {
      return "http://127.0.0.1:8000";
    }
  }
  return getApiUrl();
};

const fetchApiError = (err: unknown, endpoint: string, baseUrl?: string): string => {
  const base = baseUrl || getApiUrl();
  if (err instanceof TypeError && String(err.message).includes("fetch")) {
    return `تعذر الاتصال بالخادم (${base}${endpoint}). تأكد أن الباكند يعمل: uvicorn على المنفذ 8000.`;
  }
  return err instanceof Error ? err.message : "خطأ غير متوقع";
};

const parseApiDetail = (payload: unknown, fallback: string): string => {
  if (!payload || typeof payload !== "object") return fallback;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        typeof item === "object" && item && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : String(item),
      )
      .join(" — ");
  }
  const message = (payload as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;
  return fallback;
};

const readApiError = async (res: Response, fallback: string): Promise<string> => {
  const raw = await res.text().catch(() => "");
  if (!raw.trim()) return `${fallback} (${res.status})`;
  try {
    return parseApiDetail(JSON.parse(raw), raw.trim() || `${fallback} (${res.status})`);
  } catch {
    return raw.trim() || `${fallback} (${res.status})`;
  }
};

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokenUsage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
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
  validation_report?: {
    total_ideas?: number;
    consolidated_ideas?: number;
    missing_ideas_count?: number;
    attempts?: number;
  };
  metadata?: {
    primary_draft_title: string;
    total_input_drafts: number;
    total_output_words: number;
    tokens_consumed: number;
  };
}

export default function SovereignChat() {
  const { theme } = useKhalilTheme();
  const tc = themeClasses(theme);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Step-by-Step UX states
  const [processPhase, setProcessPhase] = useState<"idle" | "preflight" | "processing" | "completed">("idle");
  const [selectedProvider, setSelectedProvider] = useState<"gemini" | "deepseek">("deepseek");
  const [primaryText, setPrimaryText] = useState<string>("");
  const [hasSubDrafts, setHasSubDrafts] = useState<boolean | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [preflightSuccess, setPreflightSuccess] = useState<string | null>(null);
  const [isProviderReady, setIsProviderReady] = useState(false);
  const [checkingProvider, setCheckingProvider] = useState(false);

  // Config States
  const [uploadedFiles, setUploadedFiles] = useState<Array<{
    id: string;
    name: string;
    content: string;
    size: number;
    isPrimary: boolean;
    status: "loading" | "success" | "error";
    errorMsg?: string;
  }>>([]);
  const [selectedStyle, setSelectedStyle] = useState<string>("literary");
  const [targetWordCount, setTargetWordCount] = useState<string>("");
  const [customIntent, setCustomIntent] = useState<string>("");
  const [isMerging, setIsMerging] = useState(false);
  const [mergeLogs, setMergeLogs] = useState<string[]>([]);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** ميقات استخراج النص من الملفات (منفصل عن ميقات السبك) */
  const [extractElapsedMs, setExtractElapsedMs] = useState(0);
  const [extractTimerPhase, setExtractTimerPhase] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [extractServerMs, setExtractServerMs] = useState<number | null>(null);
  const extractTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const extractStartRef = useRef(0);
  const extractPendingRef = useRef(0);
  
  // Interactive Workspace states
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeWorkspaceData, setActiveWorkspaceData] = useState<Message | null>(null);
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [highlightedBlock, setHighlightedBlock] = useState<string | null>(null);
  const [highlightedIdea, setHighlightedIdea] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<string>("split"); // "split", "preview", "json"
  
  // Summarizer states
  const [operationMode, setOperationMode] = useState<"edit" | "summarize" | "consolidate">("summarize");
  const [summaryFormat, setSummaryFormat] = useState<"json" | "markdown">("json");
  const [forceEngine, setForceEngine] = useState<string>("auto");
  const [referenceJson, setReferenceJson] = useState<string>("");
  const [summaryResult, setSummaryResult] = useState<any>(null);
  const [consolidationTokenUsage, setConsolidationTokenUsage] = useState<{
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    llm_calls?: number;
    estimated?: boolean;
  } | null>(null);
  
  const primaryFileInputRef = useRef<HTMLInputElement>(null);
  const auxFileInputRef = useRef<HTMLInputElement>(null);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const ideaRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const totalTokens = messages.reduce((acc, msg) => acc + (msg.tokenUsage?.total_tokens || 0), 0);
  const consolidateTokens =
    consolidationTokenUsage?.total_tokens ??
    summaryResult?._metadata?.token_usage?.total_tokens ??
    summaryResult?._metadata?.tokens_consumed ??
    0;
  const displayTokenTotal =
    operationMode === "summarize" || operationMode === "consolidate"
      ? consolidateTokens
      : totalTokens;

  // حساب حجم الكلمات المدخلة ديناميكياً
  const primaryWords = primaryText.trim() ? primaryText.trim().split(/\s+/).filter(Boolean).length : 0;
  const auxWords = uploadedFiles
    .filter(f => !f.isPrimary && f.status === "success")
    .reduce((acc, f) => acc + (f.content ? f.content.trim().split(/\s+/).filter(Boolean).length : 0), 0);
  const totalInputWords = primaryWords + auxWords;

  // تنسيق عداد الوقت الحي
  const formatTimer = (ms: number) => {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const centiseconds = Math.floor((ms % 1000) / 10);
    
    const pad = (num: number, size: number = 2) => {
      let s = num.toString();
      while (s.length < size) s = "0" + s;
      return s;
    };
    
    return `${pad(minutes)}:${pad(seconds)}.${pad(centiseconds)}`;
  };

  const parseServerExtractMs = (res: Response): number | undefined => {
    const raw = res.headers.get("X-Extract-Latency-Ms");
    if (!raw) return undefined;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  const stopExtractTimerInterval = () => {
    if (extractTimerRef.current) {
      clearInterval(extractTimerRef.current);
      extractTimerRef.current = null;
    }
  };

  const startExtractTimer = () => {
    if (extractPendingRef.current === 0) {
      extractStartRef.current = Date.now();
      setExtractElapsedMs(0);
      setExtractServerMs(null);
      setExtractTimerPhase("running");
      stopExtractTimerInterval();
      extractTimerRef.current = setInterval(() => {
        setExtractElapsedMs(Date.now() - extractStartRef.current);
      }, 10);
    }
    extractPendingRef.current += 1;
  };

  const finishExtractTimer = (success: boolean, serverMs?: number) => {
    extractPendingRef.current = Math.max(0, extractPendingRef.current - 1);
    if (extractPendingRef.current > 0) return;

    stopExtractTimerInterval();
    const clientMs = Date.now() - extractStartRef.current;
    setExtractElapsedMs(clientMs);
    if (serverMs != null) setExtractServerMs(serverMs);
    setExtractTimerPhase(success ? "done" : "error");
  };

  const resetExtractTimer = () => {
    extractPendingRef.current = 0;
    stopExtractTimerInterval();
    setExtractElapsedMs(0);
    setExtractServerMs(null);
    setExtractTimerPhase("idle");
  };

  // Silent connection verification whenever selectedProvider changes
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    const pingProvider = async () => {
      setCheckingProvider(true);
      setIsProviderReady(false);
      setPreflightError(null);
      setPreflightSuccess(null);
      
      try {
        const res = await fetch(`${getApiUrl()}/preflight-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: selectedProvider }),
          signal
        });
        
        if (!res.ok) {
          throw new Error("فشل الاتصال بخادم فحص الصلاحية المسبق.");
        }
        
        const data = await res.json();
        if (data.status === "ready") {
          setIsProviderReady(true);
          setPreflightSuccess(data.message);
        } else {
          setPreflightError(data.message || "فشل التحقق من صلاحية مزود الخدمة.");
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || signal.aborted) {
          return;
        }
        console.warn("Provider preflight check failed:", err.message || err);
        setPreflightError(err.message || "فشل الاتصال بمزود الخدمة.");
      } finally {
        if (!signal.aborted) {
          setCheckingProvider(false);
        }
      }
    };
    
    pingProvider();

    return () => {
      controller.abort();
    };
  }, [selectedProvider]);

  const UPLOAD_ACCEPT = ".docx,.pdf,.txt,.md,.markdown,.json,.rtf";
  const isAllowedUpload = (name: string) => {
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    return [".docx", ".pdf", ".txt", ".md", ".markdown", ".json", ".rtf"].includes(ext);
  };

  // File Upload Handler (distinguishes between Primary and Auxiliary drafts)
  const handleFilesUpload = async (fileList: FileList | File[], isPrimaryUpload: boolean) => {
    const filesArray = Array.from(fileList);
    const acceptedFiles = filesArray.filter(f => isAllowedUpload(f.name));

    if (acceptedFiles.length === 0) {
      alert("الصيغ المدعومة: Word (.docx)، PDF، نص (.txt)، Markdown (.md)، JSON، RTF");
      return;
    }

    if (isPrimaryUpload) {
      // Primary draft: only one allowed
      const file = acceptedFiles[0];
      const fileId = Math.random().toString(36).substring(7);
      
      const primaryFileItem = {
        id: fileId,
        name: file.name,
        content: "",
        size: file.size,
        isPrimary: true,
        status: "loading" as const
      };

      setUploadedFiles(prev => [primaryFileItem, ...prev.filter(f => !f.isPrimary)]);
      setPrimaryText("جاري استخراج وقراءة النص المرجعي...");
      setHasSubDrafts(null); // Reset step 2 prompt

      const formData = new FormData();
      formData.append("file", file);

      startExtractTimer();
      try {
        const res = await fetch(`${getApiUrl()}/extract-text`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error(await readApiError(res, "فشل استخراج النص من المرجع اللغوي."));
        }
        const data = await res.json();
        const serverMs = parseServerExtractMs(res);

        setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, content: data.text, status: "success" } : f));
        setPrimaryText(data.text);
        finishExtractTimer(true, serverMs);
      } catch (err: unknown) {
        const errMsg = fetchApiError(err, "/extract-text");
        console.error("Primary text extraction failed:", err);
        setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: "error", errorMsg: errMsg } : f));
        setPrimaryText(`❌ حدث خطأ أثناء القراءة: ${errMsg}`);
        finishExtractTimer(false);
      }
    } else {
      // Auxiliary drafts upload (up to 10 files)
      const currentAuxCount = uploadedFiles.filter(f => !f.isPrimary).length;
      if (currentAuxCount + acceptedFiles.length > 10) {
        alert("الحد الأقصى للنصوص الرديفة هو 10 نصوص فقط.");
        return;
      }

      const newFiles = acceptedFiles.map(file => {
        const fileId = Math.random().toString(36).substring(7);
        return {
          id: fileId,
          name: file.name,
          content: "",
          size: file.size,
          isPrimary: false,
          status: "loading" as const
        };
      });

      setUploadedFiles(prev => [...prev, ...newFiles]);

      acceptedFiles.forEach(async (file, index) => {
        const correspondingId = newFiles[index].id;
        const formData = new FormData();
        formData.append("file", file);

        startExtractTimer();
        try {
          const res = await fetch(`${getApiUrl()}/extract-text`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            throw new Error(await readApiError(res, "فشل استخراج النص من الملف الفرعي."));
          }
          const data = await res.json();
          const serverMs = parseServerExtractMs(res);

          setUploadedFiles(prev => prev.map(f => f.id === correspondingId ? { ...f, content: data.text, status: "success" } : f));
          finishExtractTimer(true, serverMs);
        } catch (err: unknown) {
          const errMsg = fetchApiError(err, "/extract-text");
          console.error("Auxiliary text extraction failed for", file.name, err);
          setUploadedFiles(prev => prev.map(f => f.id === correspondingId ? { ...f, status: "error", errorMsg: errMsg } : f));
          finishExtractTimer(false);
        }
      });
    }
  };

  const handlePreflightAndMerge = async () => {
    setProcessPhase("processing");
    setIsMerging(true);
    setElapsedTime(0);
    const startTime = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 10);
    
    try {
      const logs = [
        "جاري فحص وتهيئة المستندات وتحديد أدوار الدمج...",
        "جاري استدعاء محرك البحث واستخراج الأفكار الذرية من المسودات الرديفة...",
        "جاري مطابقة الأفكار المكتشفة مع النص المرجعي ورصد النواقص...",
        "جاري صياغة النص الهجين الشامل بأسلوب الصياغة المحدد وحرية الأسلوب الأدبي...",
        "جاري تمرير المخطوطة عبر مرشحات التعديل والمطابقة الذاتية للتحقق من الصفر ثغرات...",
        "جاري توليد تقرير الجودة والمطابقة النهائي وتغذية لوحة التحرير..."
      ];
      
      setMergeLogs([logs[0]]);
      let logCounter = 1;
      const logInterval = setInterval(() => {
        if (logCounter < logs.length) {
          setMergeLogs(curr => [...curr, logs[logCounter]]);
          logCounter++;
        } else {
          clearInterval(logInterval);
        }
      }, 3000);

      const primaryFile = uploadedFiles.find(f => f.isPrimary && f.status === "success");
      const draftsPayload = uploadedFiles
        .filter(f => f.status === "success")
        .map(f => ({
          title: f.name,
          content: f.isPrimary ? primaryText : f.content
        }));

      const res = await fetch(`${getHeavyApiUrl()}/merge-drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drafts: draftsPayload,
          primary_draft_title: primaryFile?.name || "النص المرجعي.docx",
          style: selectedStyle,
          provider: selectedProvider,
          target_word_count: targetWordCount ? parseInt(targetWordCount) : null,
          custom_intent: customIntent || null
        })
      });

      clearInterval(logInterval);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "فشل طلب دمج النصوص من الخادم الرئيسي.");
      }

      const data = await res.json();

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.manuscript,
        tokenUsage: data.token_usage,
        master_draft_structured: data.master_draft_structured,
        atomic_ideas: data.atomic_ideas,
        validation_report: data.validation_report,
        metadata: {
          primary_draft_title: data.validation_report?.primary_draft_title || primaryFile?.name || "النص المرجعي.docx",
          total_input_drafts: data.validation_report?.total_ideas || draftsPayload.length,
          total_output_words: data.manuscript ? data.manuscript.split(/\s+/).filter(Boolean).length : 0,
          tokens_consumed: data.token_usage?.total_tokens || 0
        }
      };

      setMessages([
        {
          id: Date.now().toString(),
          role: "user",
          content: `طلب دمج وصياغة النصوص بأسلوب ${selectedStyle} باستخدام ${selectedProvider}`
        },
        assistantMsg
      ]);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setActiveWorkspaceData(assistantMsg);
      setProcessPhase("completed");
      setViewMode("split");

    } catch (error: any) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      console.error("Merge error:", error);
      setPreflightError(error.message || "حدث خطأ غير متوقع أثناء معالجة الدمج.");
      setProcessPhase("idle");
      setIsMerging(false);
    } finally {
      setIsMerging(false);
    }
  };

  const handleSummarize = async () => {
    if (!primaryText.trim()) {
      alert("يرجى رفع المستند أو كتابة النص أولاً للتلخيص.");
      return;
    }

    setProcessPhase("processing");
    setConsolidationTokenUsage(null);
    setElapsedTime(0);
    const startTime = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 10);

    try {
      const logs = [
        "جاري تحليل الفصول عبر المحلل العنقودي...",
        "جاري استخلاص الأفكار الجوهرية والكلمات المفتاحية...",
        "جاري صهر النتائج في استدعاءات Map-Reduce...",
      ];
      setMergeLogs([logs[0]]);
      let logCounter = 1;
      const logInterval = setInterval(() => {
        if (logCounter < logs.length) {
          setMergeLogs((curr) => [...curr, logs[logCounter]]);
          logCounter++;
        } else {
          clearInterval(logInterval);
        }
      }, 1800);

      const engine = forceEngine === "auto" ? selectedProvider : forceEngine;

      const res = await fetch(`${getHeavyApiUrl()}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: primaryText,
          format: summaryFormat,
          force_engine: engine,
          user_tier: "premium",
        }),
      });

      clearInterval(logInterval);

      if (!res.ok) {
        throw new Error(await readApiError(res, "فشل طلب التلخيص"));
      }

      const data = await res.json();
      setMergeLogs(logs);
      const analytics = data.summary_analytics || data.discovered_structure || data;
      const meta = analytics._metadata || {};
      const usage = meta.token_usage
        ? {
            input_tokens: Number(meta.token_usage.input_tokens ?? 0),
            output_tokens: Number(meta.token_usage.output_tokens ?? 0),
            total_tokens: Number(meta.token_usage.total_tokens ?? meta.tokens_consumed ?? 0),
            llm_calls: meta.token_usage.llm_calls ?? 1,
            estimated: Boolean(meta.token_usage.estimated),
          }
        : meta.tokens_consumed
          ? { total_tokens: Number(meta.tokens_consumed), llm_calls: 1 }
          : null;

      if (analytics && usage) {
        analytics._metadata = { ...meta, token_usage: usage, tokens_consumed: usage.total_tokens };
      }
      setSummaryResult(analytics);
      setConsolidationTokenUsage(usage);
      setProcessPhase("completed");

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } catch (error: any) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      console.error("Summarize error:", error);
      alert(error.message || "حدث خطأ أثناء التلخيص.");
      setProcessPhase("idle");
    }
  };

  const handleConsolidate = async () => {
    if (!primaryText.trim()) {
      alert("يرجى رفع المستند أو كتابة النص أولاً لتفعيل الصهر الديناميكي.");
      return;
    }
    if (!referenceJson.trim()) {
      alert(
        "مسار الصهر v4.0 يتطلب رفع ملف الأصل JSON (أصل منهجية المحاور السبعة). " +
        "بدونه يُنشئ النظام عناقيد زائفة ويستهلك مئات آلاف التوكنات بلا بطاقات."
      );
      return;
    }

    setProcessPhase("processing");
    setConsolidationTokenUsage(null);
    setElapsedTime(0);
    const startTime = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 10);

    try {
      const logs = [
        "جاري تحليل الفوضى البنائية داخل المخطوطة...",
        "جاري التجميع العنقودي وربط الشظايا بالمحاور...",
        "جاري الصهر الأسلوبي الديناميكي وعكس الهندسة الدلالية...",
        "جاري التدقيق الآلي وإنتاج البطاقات السيادية..."
      ];
      setMergeLogs([logs[0]]);
      let logCounter = 1;
      const logInterval = setInterval(() => {
        if (logCounter < logs.length) {
          setMergeLogs(curr => [...curr, logs[logCounter]]);
          logCounter++;
        } else {
          clearInterval(logInterval);
        }
      }, 2000);

      const engine = forceEngine === "auto" ? selectedProvider : forceEngine;

      const res = await fetch(`${getHeavyApiUrl()}/consolidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: primaryText,
          reference_json: referenceJson.trim() || undefined,
          format: summaryFormat,
          force_engine: engine === "local_hybrid" ? "deepseek" : engine,
          custom_intent: customIntent.trim() || undefined,
        })
      });

      clearInterval(logInterval);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "فشل طلب الصهر الديناميكي من الخادم.");
      }

      const data = await res.json();
      setMergeLogs(logs);
      const discovered = data.discovered_structure || data.summary_analytics;
      const rawUsage =
        data.token_usage ||
        discovered?._metadata?.token_usage ||
        (discovered?._metadata?.tokens_consumed
          ? { total_tokens: discovered._metadata.tokens_consumed }
          : null);
      const usage = rawUsage
        ? {
            input_tokens: Number(rawUsage.input_tokens ?? 0),
            output_tokens: Number(rawUsage.output_tokens ?? 0),
            total_tokens: Number(
              rawUsage.total_tokens ?? discovered?._metadata?.tokens_consumed ?? 0
            ),
            llm_calls: rawUsage.llm_calls ?? undefined,
            estimated: Boolean(rawUsage.estimated),
          }
        : null;
      if (discovered && usage) {
        discovered._metadata = {
          ...(discovered._metadata || {}),
          token_usage: usage,
          tokens_consumed: usage.total_tokens,
        };
      }
      setSummaryResult(discovered);
      setConsolidationTokenUsage(usage);
      setProcessPhase("completed");

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

    } catch (error: any) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      console.error("Consolidation error:", error);
      alert(error.message || "حدث خطأ غير متوقع أثناء الصهر الديناميكي.");
      setProcessPhase("idle");
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleNewChat = () => {
    if (window.confirm("هل أنت متأكد من بدء جلسة جديدة؟ سيتم مسح جميع الملفات والبيانات الحالية.")) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedTime(0);
      resetExtractTimer();
      setMessages([]);
      setCopiedId(null);
      setActiveWorkspaceData(null);
      setUploadedFiles([]);
      setPrimaryText("");
      setHasSubDrafts(null);
      setProcessPhase("idle");
      setTargetWordCount("");
      setCustomIntent("");
      setPreflightError(null);
      setPreflightSuccess(null);
      setSummaryResult(null);
      setConsolidationTokenUsage(null);
    }
  };

  // Scroll to block and trigger flash effect from checklist click
  const handleIdeaClick = (ideaId: string) => {
    setActiveIdeaId(ideaId);
    
    if (activeWorkspaceData?.master_draft_structured) {
      const targetBlock = activeWorkspaceData.master_draft_structured.find(
        (b) => b.associated_idea_id === ideaId
      );
      
      if (targetBlock) {
        const targetBlockId = targetBlock.block_id;
        setActiveBlockId(targetBlockId);
        setHighlightedBlock(targetBlockId);
        
        const el = blockRefs.current[targetBlockId];
        if (el) {
          el.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
        }
        
        setTimeout(() => {
          setHighlightedBlock(null);
        }, 2000);
      } else {
        setHighlightedBlock(null);
      }
    }
  };

  // Click handler for text block in central editor
  const handleBlockClick = (block: any) => {
    const blockId = block.block_id;
    setActiveBlockId(blockId);
    
    if (block.associated_idea_id) {
      const ideaId = block.associated_idea_id;
      setActiveIdeaId(ideaId);
      setHighlightedIdea(ideaId);
      
      const el = ideaRefs.current[ideaId];
      if (el) {
        el.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }
      
      setTimeout(() => {
        setHighlightedIdea(null);
      }, 2000);
    } else {
      setActiveIdeaId(null);
    }
  };

  const primaryFile = uploadedFiles.find(f => f.isPrimary);
  const isPrimaryLoaded = primaryFile && primaryFile.status === "success";
  
  const hasAuxFiles = uploadedFiles.some(f => !f.isPrimary);
  const isReadyToRun = isPrimaryLoaded && (hasSubDrafts === false || (hasSubDrafts === true && hasAuxFiles));

  return (
    <div className={cn("flex flex-col h-screen font-sans relative overflow-hidden transition-colors duration-300", tc.appShell)} dir="rtl">
      
      <div className={cn("absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl pointer-events-none z-0", tc.glowEmerald)} />
      <div className={cn("absolute bottom-0 left-0 w-96 h-96 rounded-full blur-3xl pointer-events-none z-0", tc.glowAmber)} />

      <header className={cn("p-5 border-b flex items-center justify-between backdrop-blur z-40 shrink-0 transition-colors duration-300", tc.header)}>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <div className={cn("p-1.5 rounded-xl flex items-center justify-center overflow-hidden w-10 h-10 transition-all duration-300 border", tc.logoBox)}>
              <img 
                src="/logo.png" 
                alt="شعار مدونة الخليل" 
                className="w-full h-full object-contain opacity-85 hover:opacity-100 transition-opacity duration-300"
              />
            </div>
            <div className="flex flex-col right-alignment select-none">
              <h1 className={cn("text-xl font-black", tc.titleGradient)}>
                مدونة الخليل للتحرير اللغوي <span className={cn("text-xs font-normal font-mono", tc.versionBadge)}>v4.6 SaaS</span>
              </h1>
              <p className={cn("mt-1 font-medium max-w-xl", tc.headerSubtitle, tc.subtitle)}>
                مساعدك اللغوي لسبك الأفكار، دمج المسودات، والارتقاء بالمحتوى اللغوي بكفاءة بنائية و زمنية.
              </p>
            </div>
          </div>

          {/* 1. صندوق حجم الكلمات المدخلة (Input Volume Card) */}
          {totalInputWords > 0 && (
            <div 
              className={cn("hidden md:flex flex-col text-right border-r pr-4 select-none group relative cursor-help", tc.divider)}
              title={`الأساسية: ${primaryWords.toLocaleString()} كلمة • الفرعية: ${auxWords.toLocaleString()} كلمة`}
            >
              <span className={cn("block", tc.labelStat, tc.labelMuted)}>حجم المدخلات الإجمالي</span>
              <span className={cn("font-black font-mono mt-0.5", tc.statValue, theme === "oatmeal" ? "text-amber-800" : "text-amber-500/90")}>
                {totalInputWords.toLocaleString()} <span className={cn("font-sans font-medium", tc.uiCaption, tc.textSoft)}>كلمة</span>
              </span>
              <div className={cn("absolute top-10 right-0 z-50 hidden group-hover:block p-2.5 rounded-xl text-[9px] w-44 leading-relaxed border", tc.tooltip)}>
                <div className="flex justify-between mb-1">
                  <span>النص المرجعي:</span>
                  <span className={cn("font-mono font-bold", tc.uiBody)}>{primaryWords.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>النصوص الرديفة:</span>
                  <span className={cn("font-mono font-bold", tc.uiBody)}>{auxWords.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. ميقاتا الاستخراج والسبك */}
        <div className="flex items-center gap-5 select-none">
          <div className="flex flex-col items-center">
            <span className={cn("font-bold block mb-0.5", tc.labelStat, tc.labelMuted)}>
              ميقات استخراج النص
            </span>
            <div
              className={cn(
                "font-black font-mono tracking-wider transition-colors duration-300",
                theme === "oatmeal" ? "text-base" : "text-sm",
                extractTimerPhase === "idle"
                  ? tc.timerIdle
                  : extractTimerPhase === "running"
                    ? cn(tc.timerBusy, "animate-pulse")
                    : extractTimerPhase === "error"
                      ? tc.timerError
                      : tc.timerDone,
              )}
            >
              {formatTimer(extractElapsedMs)}
            </div>
            {extractServerMs != null && extractTimerPhase === "done" && (
              <span className={cn("text-[10px] font-mono mt-0.5", tc.labelMuted)}>
                خادم: {extractServerMs.toLocaleString("ar")} مللي ث
              </span>
            )}
          </div>

          <div className={cn("h-10 w-px shrink-0", tc.divider)} aria-hidden />

          <div className="flex flex-col items-center">
            <span className={cn("font-bold block mb-0.5", tc.labelStat, tc.labelMuted)}>
              ميقات السبك والتحوير الحي
            </span>
            <div
              className={cn(
                "font-black font-mono tracking-wider transition-colors duration-300",
                theme === "oatmeal" ? "text-base" : "text-sm",
                processPhase === "idle"
                  ? tc.timerIdle
                  : processPhase === "processing" || processPhase === "preflight"
                    ? cn(tc.timerBusy, "animate-pulse")
                    : tc.timerDone,
              )}
            >
              {formatTimer(elapsedTime)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {(displayTokenTotal > 0 ||
            ((operationMode === "summarize" || operationMode === "consolidate") &&
              processPhase === "completed")) && (
            <div className={cn("flex items-center gap-2 text-xs font-mono px-3 py-1 rounded-full border", tc.tokenPill)}>
              <Activity size={12} className="text-[#f59e0b]" />
              <span>
                {displayTokenTotal.toLocaleString()} TKN
                {consolidationTokenUsage?.estimated && (
                  <span className="text-[9px] text-slate-500 mr-1"> (تقدير)</span>
                )}
              </span>
            </div>
          )}

          {/* 3. نقل أدوات التحكم السيادية في النظام (System Control Buttons) */}
          <div className={cn("flex items-center gap-1.5 p-0.5 rounded-xl border", tc.controlsBar)}>
            <ThemeToggle />
            <button
              onClick={handleNewChat}
              className={cn("flex items-center gap-1.5 text-[10px] hover:scale-[1.02] transition-all duration-300 cursor-pointer px-2.5 py-1.5 rounded-lg border", tc.btnGhost)}
              title="بدء جلسة جديدة"
            >
              <RefreshCw size={11} />
              <span>جلسة جديدة</span>
            </button>
            
            <button
              onClick={() => {
                if (window.confirm("هل أنت متأكد من رغبتك في الخروج الآمن؟ سيتم إعادة تعيين كافة البيانات وإغلاق الجلسة.")) {
                  if (timerRef.current) clearInterval(timerRef.current);
                  resetExtractTimer();
                  setMessages([]);
                  setCopiedId(null);
                  setActiveWorkspaceData(null);
                  setUploadedFiles([]);
                  setPrimaryText("");
                  setHasSubDrafts(null);
                  setProcessPhase("idle");
                  setTargetWordCount("");
                  setCustomIntent("");
                  setPreflightError(null);
                  setPreflightSuccess(null);
                  setElapsedTime(0);
                  alert("تم الخروج وإغلاق الجلسة بنجاح.");
                }
              }}
              className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-red-400 hover:scale-[1.02] transition-all duration-300 cursor-pointer bg-transparent hover:bg-red-500/5 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-red-500/10"
              title="الخروج الآمن وإغلاق الجلسة"
            >
              <LogOut size={11} />
              <span>الخروج الآمن</span>
            </button>
          </div>

          <div className={cn("flex items-center gap-1.5 border-r pr-4", tc.statusActiveWrap, tc.divider)}>
            <div className="relative flex h-2.5 w-2.5">
              <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full", tc.statusActivePing)}></span>
              <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", tc.statusActiveDot)}></span>
            </div>
            <span className={tc.statusActiveText}>نشط</span>
          </div>
        </div>
      </header>

      {/* Main Three-Pane Dynamic Layout Area */}
      <div className="flex-1 flex overflow-hidden flex-col lg:flex-row z-10">
        
        {/* ========================================================================= */}
        {/* 1. RIGHT PANE: CONTROL & CONFIG PANE (22-25% width on desktop)            */}
        {/* ========================================================================= */}
        <div className={cn("w-full lg:w-[320px] xl:w-[360px] shrink-0 border-l backdrop-blur flex flex-col overflow-y-auto z-10 transition-colors duration-300", tc.pane)}>
          <div className="p-5 flex-1 flex flex-col justify-between">
            <div className="space-y-6">
              
              <div className={cn("flex items-center justify-between border-b pb-3", tc.divider)}>
                <h3 className={cn("text-sm font-extrabold flex items-center gap-2 font-sans", tc.centerTitle)}>
                  <Layers size={16} className="text-[#f59e0b]" />
                  <span>لوحة التوجيه والتحكم</span>
                </h3>
              </div>

              {/* Before/After Processing Conditions */}
              {processPhase !== "completed" && processPhase !== "processing" && processPhase !== "preflight" ? (
                // Phase 1 Setup Controls
                <div className="space-y-5">
                  
                  {/* Step 1: Model Provider Choice */}
                  <div className="space-y-1.5">
                    <span className={cn("block font-sans", tc.stepLabel)}>الخطوة 1: اختيار المحرر الذكي</span>
                    <div className={cn("grid grid-cols-2 gap-1 p-0.5 rounded-xl border", tc.gridToggle)}>
                      <button
                        onClick={() => setSelectedProvider("deepseek")}
                        className={cn(
                          "py-1.5 rounded-xl font-bold text-center transition-all duration-300 cursor-pointer",
                          tc.toggleText,
                          selectedProvider === "deepseek"
                            ? tc.toggleActive
                            : cn(tc.toggleIdle, "hover:scale-[1.02]")
                        )}
                      >
                        DeepSeek-V3
                      </button>
                      <button
                        onClick={() => setSelectedProvider("gemini")}
                        className={cn(
                          "py-1.5 rounded-xl font-bold text-center transition-all duration-300 cursor-pointer",
                          tc.toggleText,
                          selectedProvider === "gemini"
                            ? tc.toggleActive
                            : cn(tc.toggleIdle, "hover:scale-[1.02]")
                        )}
                      >
                        Gemini Flash
                      </button>
                    </div>
                    {/* Connection check status indicator */}
                    {checkingProvider && (
                      <div className={cn("p-3 rounded-xl flex items-center justify-center gap-2 mt-2 border", tc.statusChecking)}>
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                        </span>
                        <span>جاري فحص الاتصال...</span>
                      </div>
                    )}
                    {preflightError && (
                      <div className={cn("p-3 rounded-xl flex items-start gap-2 mt-2 border", tc.statusError)}>
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <p className="leading-relaxed">{preflightError}</p>
                      </div>
                    )}
                    {preflightSuccess && (
                      <div className={cn("p-3 rounded-xl flex items-start gap-2 mt-2 border", tc.statusSuccess)}>
                        <CheckCircle2 size={14} className={cn("mt-0.5", tc.statusSuccessIcon)} />
                        <p className="leading-relaxed">{preflightSuccess}</p>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Upload Primary Document */}
                  <div className="space-y-2">
                    <span className={cn("block font-sans", tc.stepLabel)}>الخطوة 2: النص المرجعي (المصدر الأساسي)</span>
                    
                    {!primaryFile ? (
                      <div 
                        onClick={() => primaryFileInputRef.current?.click()}
                        className={cn("border border-dashed border-amber-500/30 hover:border-amber-500 hover:bg-amber-500/5 hover:scale-[1.02] transition-all duration-300 rounded-2xl p-6 flex flex-col items-center justify-center gap-2.5 cursor-pointer group shadow-sm hover:shadow-md", tc.uploadZone)}
                      >
                        <input
                          type="file"
                          ref={primaryFileInputRef}
                          onChange={(e) => {
                            if (e.target.files) handleFilesUpload(e.target.files, true);
                            e.target.value = "";
                          }}
                          accept={UPLOAD_ACCEPT}
                          className="hidden"
                        />
                        <UploadCloud size={24} className="text-amber-500/70 group-hover:scale-105 transition-transform" />
                        <div className="text-center">
                          <p className={cn("font-bold", tc.uploadTitle)}>إيداع النص المرجعي الأساسي</p>
                          <p className={cn("mt-1 leading-relaxed", tc.uploadHint)}>docx · pdf · txt · md · json · rtf</p>
                        </div>
                      </div>
                    ) : (
                      // Primary File Status Card
                      <div className={cn("p-3.5 rounded-2xl flex items-center justify-between gap-3 relative overflow-hidden", tc.primaryFileCard)}>
                        <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn("p-2 rounded-xl shrink-0", tc.primaryFileIcon)}>
                            <Crown size={16} />
                          </div>
                          <div className="min-w-0">
                            <h4 className={cn("truncate", tc.primaryFileTitle)}>{primaryFile.name}</h4>
                            <p className={cn("font-mono mt-0.5", tc.primaryFileMeta)}>{(primaryFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {primaryFile.status === "loading" && <RefreshCw size={12} className="animate-spin text-amber-500" />}
                          {primaryFile.status === "error" && <span title={primaryFile.errorMsg}><AlertTriangle size={12} className="text-red-400" /></span>}
                          {primaryFile.status === "success" && <CheckCircle2 size={12} className={theme === "oatmeal" ? "text-emerald-700" : "text-emerald-400"} />}
                          
                          <button 
                            onClick={() => {
                              setUploadedFiles(prev => prev.filter(f => f.id !== primaryFile.id));
                              setPrimaryText("");
                              setHasSubDrafts(null);
                            }}
                            className={cn(
                              "p-1 rounded-xl transition-colors border",
                              tc.btnGhost,
                              "hover:bg-red-50 hover:text-red-600 hover:border-red-300",
                            )}
                            title="إزالة المستند"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 3: Choose operation mode and show options accordingly */}
                  {isPrimaryLoaded && (
                    <div className={cn("space-y-4 pt-1 border-t", tc.sectionDivider)}>
                      <span className={cn("block font-sans", tc.stepLabel)}>اختر نوع العملية</span>
                      <div className={cn("grid grid-cols-3 gap-1 p-0.5 rounded-xl border", tc.gridToggle)}>
                        <button
                          onClick={() => setOperationMode("summarize")}
                          className={cn(
                            "py-1.5 rounded-lg font-bold text-center transition-all duration-300 cursor-pointer leading-snug",
                            tc.toggleTextSm,
                            operationMode === "summarize" ? tc.toggleActive : tc.toggleIdle,
                          )}
                        >
                          تلخيص دلالي
                        </button>
                        <button
                          onClick={() => setOperationMode("edit")}
                          className={cn(
                            "py-1.5 rounded-lg font-bold text-center transition-all duration-300 cursor-pointer leading-snug",
                            tc.toggleTextSm,
                            operationMode === "edit" ? tc.toggleActive : tc.toggleIdle,
                          )}
                        >
                          تحرير ودمج
                        </button>
                        <button
                          onClick={() => setOperationMode("consolidate")}
                          className={cn(
                            "py-1.5 rounded-lg font-bold text-center transition-all duration-300 cursor-pointer leading-snug",
                            tc.toggleTextSm,
                            operationMode === "consolidate" ? tc.toggleActive : tc.toggleIdle,
                          )}
                        >
                          صهر المحاور
                        </button>
                      </div>
                      {operationMode === "summarize" && (
                        <p className={cn("leading-relaxed", tc.uiCaption)}>
                          استخلاص أفكار جوهرية وكلمات مفتاحية — استدعاء LLM واحد تقريباً.
                        </p>
                      )}
                      {operationMode === "consolidate" && (
                        <p className={cn("leading-relaxed text-amber-800", tc.uiCaption)}>
                          متقدم: دمج الفوضى في 7 محاور — يتطلب ملف الأصل JSON.
                        </p>
                      )}
                    </div>
                  )}

                  {isPrimaryLoaded && operationMode === "edit" && (
                    <>
                      {/* Step 3: Choose Sub-drafts option (Visible if primary uploaded successfully) */}
                      <div className={cn("space-y-3.5 pt-4 border-t", tc.sectionDivider)}>
                        <span className={cn("block font-sans", tc.stepLabel)}>الخطوة 3: النصوص الرديفة والدمج</span>
                        
                        {hasSubDrafts === null ? (
                          <div className="space-y-2">
                            <p className={cn("font-sans", tc.hintText)}>هل لديك نصوص رديفة ترغب في دمج أفكارها ومقترحاتها مع النص المرجعي؟</p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => setHasSubDrafts(true)}
                                className={cn(
                                  "py-2 px-3 rounded-xl text-xs font-bold border transition-all duration-300 cursor-pointer hover:scale-[1.02]",
                                  tc.btnAccent,
                                )}
                              >
                                نعم، دمج نصوص رديفة
                              </button>
                              <button
                                onClick={() => {
                                  setHasSubDrafts(false);
                                  setUploadedFiles(prev => prev.filter(f => f.isPrimary)); // Clear any aux if none wanted
                                }}
                                className={cn(
                                  "py-2 px-3 rounded-xl text-xs font-bold border transition-all duration-300 cursor-pointer hover:scale-[1.02]",
                                  tc.btnSecondary,
                                )}
                              >
                                لا، النص المرجعي فقط
                              </button>
                            </div>
                          </div>
                        ) : hasSubDrafts ? (
                          // Upload Auxiliary Drafts Zone
                          <div className="space-y-3">
                            <div 
                              onClick={() => auxFileInputRef.current?.click()}
                              className={cn(
                                "border border-dashed hover:border-amber-500 hover:scale-[1.02] transition-all duration-300 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm hover:shadow-md",
                                tc.uploadZone,
                              )}
                            >
                              <input
                                type="file"
                                ref={auxFileInputRef}
                                onChange={(e) => {
                                  if (e.target.files) handleFilesUpload(e.target.files, false);
                                  e.target.value = "";
                                }}
                                accept={UPLOAD_ACCEPT}
                                multiple
                                className="hidden"
                              />
                              <Paperclip size={16} className={tc.textMuted} />
                              <div className="text-center">
                                <p className={cn("font-bold", tc.uploadTitle)}>إيداع النصوص الرديفة الإضافية</p>
                                <p className={cn("mt-0.5", tc.uploadHint)}>حتى 10 ملفات — docx · pdf · txt · md · json · rtf</p>
                              </div>
                            </div>

                            {/* Auxiliary Files List */}
                            {hasAuxFiles && (
                              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                                {uploadedFiles.filter(f => !f.isPrimary).map(file => (
                                  <div key={file.id} className={cn("p-2 rounded-xl border flex items-center justify-between gap-2", tc.fileRow)}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <FileText size={12} className={cn("shrink-0", tc.textMuted)} />
                                      <span className={cn("text-xs truncate", tc.uiBody)}>{file.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {file.status === "loading" && <RefreshCw size={10} className="animate-spin text-amber-500" />}
                                      {file.status === "success" && <CheckCircle2 size={10} className={theme === "oatmeal" ? "text-emerald-700" : "text-emerald-400"} />}
                                      <button
                                        onClick={() => setUploadedFiles(prev => prev.filter(f => f.id !== file.id))}
                                        className={cn("transition-colors", tc.textMuted, "hover:text-red-500")}
                                      >
                                        <Trash2 size={10} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <button 
                              onClick={() => setHasSubDrafts(null)}
                              className="text-[9px] text-[#f59e0b] hover:underline block text-left"
                            >
                              تغيير الاختيار
                            </button>
                          </div>
                        ) : (
                          // Individual refinement mode card
                          <div className={cn("p-3 rounded-xl border flex items-center justify-between", tc.modeBanner)}>
                            <span className="text-xs font-semibold font-sans">وضع التهذيب الفردي مفعل</span>
                            <button 
                              onClick={() => setHasSubDrafts(null)}
                              className="text-[9px] text-[#f59e0b] hover:underline"
                            >
                              تغيير الاختيار
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Global Configurations (Style, Word target) */}
                      <div className={cn("space-y-4 pt-4 border-t", tc.sectionDivider)}>
                        {/* Writing Style */}
                        <div className="space-y-1.5">
                          <span className={cn("block font-sans", tc.stepLabel)}>الأسلوب اللغوي</span>
                          <div className={cn("grid grid-cols-2 gap-1.5 p-0.5 rounded-xl border", tc.gridToggle)}>
                            {[
                              { id: "academic", label: "أكاديمي" },
                              { id: "legal", label: "قانوني" },
                              { id: "literary", label: "أدبي" },
                              { id: "business", label: "عملي" }
                            ].map(s => (
                              <button
                                key={s.id}
                                onClick={() => setSelectedStyle(s.id)}
                                className={cn(
                                  "py-1.5 px-2 rounded-xl font-bold text-center border transition-all duration-300 hover:scale-[1.02] cursor-pointer",
                                  tc.toggleText,
                                  selectedStyle === s.id ? tc.toggleActive : tc.pillIdle,
                                )}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Target Word Count */}
                        <div className="space-y-1.5">
                          <span className={cn("block font-sans", tc.stepLabelMuted)}>الكلمات المستهدفة (اختياري)</span>
                          <input 
                            type="number"
                            value={targetWordCount}
                            onChange={(e) => setTargetWordCount(e.target.value)}
                            placeholder="مثال: 1000 كلمة"
                            className={cn(
                              "w-full rounded-xl py-1.5 px-3 focus:outline-none text-right font-mono text-xs focus:ring-1",
                              tc.inputField,
                            )}
                          />
                        </div>

                        {/* Custom Intent Steering */}
                        <div className={cn("space-y-1.5 pt-1.5 border-t", tc.sectionDivider)}>
                          <span className={cn("block font-sans", tc.stepLabelMuted)}>
                            التوجيه المخصص (اختياري)
                          </span>
                          <textarea
                            value={customIntent}
                            onChange={(e) => setCustomIntent(e.target.value)}
                            placeholder="اكتب هنا توجيهاتك الخاصة للمخطوطة (مثال: صياغة الأفكار الإدارية في قالب قصصي أدبي مترابط)..."
                            className={cn(
                              "w-full rounded-xl p-3 text-right font-sans text-xs resize-none min-h-[85px] focus:outline-none focus:ring-1",
                              tc.inputField,
                            )}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {isPrimaryLoaded && (operationMode === "summarize" || operationMode === "consolidate") && (
                    <div className={cn("space-y-4 pt-4 border-t", tc.sectionDivider)}>
                      {operationMode === "consolidate" && (
                        <>
                          <div className="space-y-1.5">
                            <span className={cn("block font-sans", tc.stepLabel)}>ملف الأصل المرجعي (JSON — إلزامي)</span>
                            <input
                              type="file"
                              accept=".json"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const text = await file.text();
                                setReferenceJson(text);
                                e.target.value = "";
                              }}
                              className={cn(
                                "w-full file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border file:font-bold file:cursor-pointer",
                                tc.fileInput,
                              )}
                            />
                            {referenceJson && (
                              <p className={cn("font-sans", tc.referenceJsonOk)}>✓ تم تحميل المرجع ({Math.round(referenceJson.length / 1024)} KB)</p>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <span className={cn("block font-sans", tc.stepLabelMuted)}>توجيه الصهر (اختياري)</span>
                            <textarea
                              value={customIntent}
                              onChange={(e) => setCustomIntent(e.target.value)}
                              placeholder="مثال: ركّز على السرد القصصي دون تكرار..."
                              className={cn(
                                "w-full rounded-xl p-3 text-right font-sans text-xs resize-none min-h-[70px] focus:outline-none focus:ring-1",
                                tc.inputField,
                              )}
                            />
                          </div>
                        </>
                      )}

                      {operationMode === "summarize" && (
                        <p className={cn("leading-relaxed", tc.uiCaption)}>
                          استدعاء LLM واحد تقريباً — مناسب للنصوص الطويلة دون ملف مرجعي.
                        </p>
                      )}

                      {/* Export Format + Engine — مشترك */}
                      <div className={cn("space-y-1.5 pt-1.5 border-t", tc.sectionDivider)}>
                        <span className={cn("block font-sans", tc.stepLabelMuted)}>صيغة المخرجات</span>
                        <div className={cn("grid grid-cols-2 gap-2 p-0.5 rounded-xl border", tc.gridToggle)}>
                          <button
                            onClick={() => setSummaryFormat("json")}
                            className={cn(
                              "py-1.5 rounded-lg font-bold text-center transition-all duration-300 cursor-pointer",
                              tc.toggleText,
                              summaryFormat === "json" ? tc.toggleActive : tc.toggleIdle,
                            )}
                          >
                            JSON الهيكلي
                          </button>
                          <button
                            onClick={() => setSummaryFormat("markdown")}
                            className={cn(
                              "py-1.5 rounded-lg font-bold text-center transition-all duration-300 cursor-pointer",
                              tc.toggleText,
                              summaryFormat === "markdown" ? tc.toggleActive : tc.toggleIdle,
                            )}
                          >
                            Markdown منسق
                          </button>
                        </div>
                      </div>

                      {/* Preferred Engine Toggle */}
                      <div className={cn("space-y-1.5 pt-1.5 border-t", tc.sectionDivider)}>
                        <span className={cn("block font-sans", tc.stepLabelMuted)}>تفضيل المحرك</span>
                        <div className={cn("grid grid-cols-3 gap-1 p-0.5 rounded-xl border", tc.gridToggle)}>
                          {[
                            { id: "auto", label: "تلقائي" },
                            { id: "deepseek", label: "DeepSeek" },
                            { id: "gemini", label: "Gemini" }
                          ].map(e => (
                            <button
                              key={e.id}
                              onClick={() => setForceEngine(e.id)}
                              className={cn(
                                "py-1.5 rounded-lg font-bold text-center transition-all duration-300 cursor-pointer",
                                tc.toggleTextSm,
                                forceEngine === e.id ? tc.toggleActive : tc.toggleIdle,
                              )}
                            >
                              {e.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              ) : processPhase === "processing" || processPhase === "preflight" ? (
                <div className="py-10 flex flex-col items-center justify-center text-center gap-4">
                  <ProcessingBrandSpinner size="lg" />
                  <h4 className={cn("font-bold font-sans", tc.stepLabel)}>
                    {processPhase === "preflight"
                      ? "جاري فحص الاتصال..."
                      : operationMode === "summarize"
                        ? "جاري تلخيص الوثيقة"
                        : operationMode === "consolidate"
                          ? "جاري صهر الوثيقة"
                          : "جاري معالجة الوثيقة"}
                  </h4>
                </div>
              ) : (
                // Phase 3: Completed State (Metrics Dashboard)
                <div className="space-y-5">
                  {operationMode === "edit" ? (
                    <>
                      <div className={cn("p-3.5 rounded-2xl border space-y-1.5", tc.innerPanel)}>
                        <span className={cn("font-bold block", tc.metricLabel)}>الملفات المستخدمة في الدمج</span>
                        <div className="space-y-1">
                          {uploadedFiles.map(file => (
                            <div key={file.id} className="flex items-center justify-between text-xs">
                              <span className={cn("truncate max-w-[170px] font-medium", tc.uiBody)}>{file.name}</span>
                              <span className={cn("px-1.5 py-0.5 rounded font-bold border text-xs", 
                                file.isPrimary ? tc.badgeRolePrimary : tc.badgeRoleAux
                              )}>
                                {file.isPrimary ? "أساسي" : "فرعي"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Dynamic Metrics */}
                      <div className="space-y-2">
                        <span className={cn("block font-sans", tc.sectionLabel)}>مؤشرات الأداء اللغوي</span>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div className={cn("p-3 rounded-xl border hover:scale-[1.02] transition-all duration-300 text-right", tc.metricCard)}>
                            <span className={tc.metricLabel}>التوكنات المستهلكة</span>
                            <span className={cn("font-mono", theme === "oatmeal" ? "text-sm font-bold text-amber-800" : "text-xs font-bold text-amber-500")}>
                              {activeWorkspaceData?.tokenUsage?.total_tokens || 0}
                            </span>
                          </div>
                          <div className={cn("p-3 rounded-xl border hover:scale-[1.02] transition-all duration-300 text-right", tc.metricCard)}>
                            <span className={tc.metricLabel}>سلامة البنية للـ Parser</span>
                            <span className={cn("text-xs font-mono", tc.metricValue)}>
                              {activeWorkspaceData?.validation_report?.attempts === 0 ? "100%" : "98%"}
                            </span>
                          </div>
                          <div className={cn("p-3 rounded-xl border hover:scale-[1.02] transition-all duration-300 text-right", tc.metricCard)}>
                            <span className={tc.metricLabel}>زمن الاستجابة</span>
                            <span className={cn("font-mono", tc.metricValue, theme === "oatmeal" ? "text-sm" : "text-[11px]")}>
                              {"1850ms -> 920ms"}
                            </span>
                          </div>
                          <div className={cn("p-3 rounded-xl border hover:scale-[1.02] transition-all duration-300 text-right", tc.metricCard)}>
                            <span className={tc.metricLabel}>حجم الكلمات الناتج</span>
                            <span className={cn("font-mono", tc.metricValueText)}>
                              {activeWorkspaceData?.metadata?.total_output_words || 0} كلمة
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : operationMode === "summarize" ? (
                    <>
                      <div className={cn("p-3.5 rounded-2xl border space-y-1.5", tc.innerPanel)}>
                        <span className={cn("font-bold block", tc.metricLabel)}>الملف المُلخَّص</span>
                        <div className="flex items-center justify-between text-xs">
                          <span className={cn("truncate max-w-[170px] font-medium", tc.uiBody)}>{primaryFile?.name || "النص المباشر"}</span>
                          <span className={cn("px-1.5 py-0.5 rounded font-bold border text-xs", tc.badgeSummarize)}>
                            تلخيص
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className={cn("block font-sans", tc.sectionLabel)}>مؤشرات التلخيص الدلالي</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div className={cn("p-3 rounded-xl border hover:scale-[1.02] transition-all duration-300 text-right col-span-2", tc.metricCardHighlight)}>
                            <span className={tc.metricLabelBold}>إجمالي التوكنات (LLM)</span>
                            <span className={tc.metricTokenTotal}>
                              {(
                                consolidationTokenUsage?.total_tokens ??
                                summaryResult?._metadata?.token_usage?.total_tokens ??
                                summaryResult?._metadata?.tokens_consumed ??
                                0
                              ).toLocaleString()}
                            </span>
                            {(consolidationTokenUsage?.estimated ||
                              summaryResult?._metadata?.token_usage?.estimated) && (
                              <span className={cn("block mt-1", tc.metricHint)}>
                                * تقدير تقريبي — المزود لم يُرجع عداداً دقيقاً
                              </span>
                            )}
                          </div>
                          <div className={cn("p-3 rounded-xl border hover:scale-[1.02] transition-all duration-300 text-right", tc.metricCard)}>
                            <span className={tc.metricLabel}>الأفكار الجوهرية</span>
                            <span className={cn("text-xs font-mono", tc.metricValue)}>
                              {summaryResult?.core_ideas?.length || 0}
                            </span>
                          </div>
                          <div className={cn("p-3 rounded-xl border hover:scale-[1.02] transition-all duration-300 text-right", tc.metricCard)}>
                            <span className={tc.metricLabel}>الكلمات المفتاحية</span>
                            <span className={tc.keywordValue}>
                              {summaryResult?.sovereign_keywords?.length || 0}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={cn("p-3 rounded-xl border text-right", tc.metricCard)}>
                        <span className={tc.metricLabel}>محرك التلخيص</span>
                        <span className={cn("font-sans", tc.metricValueText)}>
                          {summaryResult?._metadata?.engine_description || summaryResult?._metadata?.engine_utilized || "—"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={cn("p-3.5 rounded-2xl border space-y-1.5", tc.innerPanel)}>
                        <span className={cn("font-bold block", tc.metricLabel)}>الملف المُصهَر</span>
                        <div className="flex items-center justify-between text-xs">
                          <span className={cn("truncate max-w-[170px] font-medium", tc.uiBody)}>{primaryFile?.name || "النص المباشر"}</span>
                          <span className={cn("px-1.5 py-0.5 rounded font-bold border text-xs", tc.badgeMelt)}>
                            صهر
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className={cn("block font-sans", tc.sectionLabel)}>مؤشرات الصهر الديناميكي</span>

                        <div className="grid grid-cols-2 gap-2">
                          <div className={cn("p-3 rounded-xl border hover:scale-[1.02] transition-all duration-300 text-right col-span-2", tc.metricCardHighlight)}>
                            <span className={tc.metricLabelBold}>إجمالي التوكنات (LLM)</span>
                            <span className={tc.metricTokenTotal}>
                              {(
                                consolidationTokenUsage?.total_tokens ??
                                summaryResult?._metadata?.token_usage?.total_tokens ??
                                summaryResult?._metadata?.tokens_consumed ??
                                0
                              ).toLocaleString()}
                            </span>
                            {((consolidationTokenUsage?.input_tokens ?? 0) > 0 ||
                              (summaryResult?._metadata?.token_usage?.input_tokens ?? 0) > 0 ||
                              (consolidationTokenUsage?.llm_calls ?? 0) > 0) && (
                              <div className={cn("flex justify-between mt-1.5 font-mono", tc.metricHint)}>
                                <span>
                                  مدخل:{" "}
                                  {(
                                    consolidationTokenUsage?.input_tokens ??
                                    summaryResult?._metadata?.token_usage?.input_tokens ??
                                    0
                                  ).toLocaleString()}
                                </span>
                                <span>
                                  مخرج:{" "}
                                  {(
                                    consolidationTokenUsage?.output_tokens ??
                                    summaryResult?._metadata?.token_usage?.output_tokens ??
                                    0
                                  ).toLocaleString()}
                                </span>
                                <span>
                                  استدعاءات:{" "}
                                  {consolidationTokenUsage?.llm_calls ??
                                    summaryResult?._metadata?.token_usage?.llm_calls ??
                                    "—"}
                                </span>
                              </div>
                            )}
                            {(consolidationTokenUsage?.estimated ||
                              summaryResult?._metadata?.token_usage?.estimated) && (
                              <span className={cn("block mt-1", tc.metricHint)}>
                                * تقدير تقريبي — المزود لم يُرجع عداداً دقيقاً
                              </span>
                            )}
                          </div>
                          <div className={cn("p-3 rounded-xl border hover:scale-[1.02] transition-all duration-300 text-right", tc.metricCard)}>
                            <span className={tc.metricLabel}>البطاقات / العناقيد</span>
                            <span className={cn("text-xs font-mono", tc.metricValue)}>
                              {summaryResult?.core_ideas?.length || 0} / {summaryResult?._metadata?.clusters_processed || 0}
                            </span>
                          </div>
                          <div className={cn("p-3 rounded-xl border hover:scale-[1.02] transition-all duration-300 text-right", tc.metricCard)}>
                            <span className={tc.metricLabel}>الكلمات المفتاحية السيادية</span>
                            <span className={tc.keywordValue}>
                              {summaryResult?.sovereign_keywords?.length || 0} كلمات
                            </span>
                          </div>
                          <div className={cn("p-3 rounded-xl border hover:scale-[1.02] transition-all duration-300 text-right", tc.metricCard)}>
                            <span className={tc.metricLabel}>عناصر الكشاف الرقمي</span>
                            <span className={tc.violetValue}>
                              {summaryResult?.numerical_ledger?.length || 0} قيم
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={cn("p-3 rounded-xl border text-right", tc.metricCard)}>
                        <span className={tc.metricLabel}>محرك الصهر المعتمد</span>
                        <span className={cn("font-sans", tc.metricValueText)}>
                          {summaryResult?._metadata?.engine_description || summaryResult?._metadata?.engine_utilized || "DeepSeek v4"}
                        </span>
                        {summaryResult?._metadata?.audit_passed === false && (
                          <div className="mt-1.5 space-y-1">
                            <span className={cn("block text-xs", theme === "oatmeal" ? "text-amber-800" : "text-amber-500")}>⚠ تحذيرات تدقيق — راجع المخرجات</span>
                            {(summaryResult?._metadata?.audit_issues ||
                              summaryResult?._metadata?.audit_warnings ||
                              []
                            ).slice(0, 5).map((issue: string, i: number) => (
                              <span key={i} className={cn("block leading-relaxed", tc.metricHint)}>
                                • {issue}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Completion Logs summary */}
                  <div className={cn("p-3 rounded-2xl border space-y-1.5 max-h-36 overflow-y-auto", tc.logPanel)}>
                    <span className={tc.logTitle}>سجل المعالجة المكتملة</span>
                    <div className="space-y-1">
                      {mergeLogs.map((log, index) => (
                        <div key={index} className={cn("flex items-center gap-1.5 font-mono", tc.logLine)}>
                          <CheckCircle2 size={12} className={theme === "oatmeal" ? "text-emerald-700 shrink-0" : "text-emerald-500 shrink-0"} />
                          <span>{log}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setProcessPhase("idle");
                      if (operationMode === "edit") {
                        setActiveWorkspaceData(null);
                      } else {
                        setSummaryResult(null);
                        setConsolidationTokenUsage(null);
                      }
                    }}
                    className={cn("w-full py-2 px-3 border hover:scale-[1.02] transition-all duration-300 rounded-xl text-xs font-bold text-center cursor-pointer", tc.resetBtn)}
                  >
                    تعديل المدخلات وإعادة التشغيل
                  </button>

                </div>
              )}

            </div>

            {/* Launch Trigger button area */}
            {processPhase !== "completed" && processPhase !== "processing" && processPhase !== "preflight" && (
              <div className={cn("pt-6 border-t space-y-3 mt-6", tc.launchBorder)}>
                <button
                  onClick={
                    operationMode === "edit"
                      ? handlePreflightAndMerge
                      : operationMode === "summarize"
                        ? handleSummarize
                        : handleConsolidate
                  }
                  disabled={operationMode === "edit" ? (!isReadyToRun || !isProviderReady || checkingProvider) : !isPrimaryLoaded}
                  className={cn(
                    "w-full py-3.5 rounded-xl font-bold text-xs tracking-wide transition-all duration-300 shadow-lg cursor-pointer border",
                    operationMode === "edit"
                      ? (isReadyToRun && isProviderReady && !checkingProvider)
                        ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-900 border-amber-400 hover:scale-[1.02] hover:shadow-amber-500/20"
                        : cn(tc.ctaDisabled, "cursor-not-allowed")
                      : isPrimaryLoaded
                      ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-900 border-amber-400 hover:scale-[1.02] hover:shadow-amber-500/20"
                      : cn(tc.ctaDisabled, "cursor-not-allowed"),
                  )}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <Sparkles size={14} />
                    <span>
                      {operationMode === "edit"
                        ? "بدء السبك الصياغي والدمج الذكي"
                        : operationMode === "summarize"
                          ? "بدء التلخيص الدلالي"
                          : "بدء صهر المحاور السبعة"}
                    </span>
                  </div>
                </button>
              </div>
            )}

          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. MIDDLE PANE: LIVE EDITOR & estructured VIEWER (50-60% width)           */}
        {/* ========================================================================= */}
        <div className={cn("flex-1 flex flex-col overflow-hidden relative transition-colors duration-300", tc.center)}>
          
          {/* Watermark Background Logo */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 p-10 overflow-hidden mt-14">
            <img 
              src="/logo.png" 
              alt="خلفية مائية شعار مدونة الخليل" 
              className={cn(
                "w-full max-w-[450px] md:max-w-[550px] lg:max-w-[650px] h-auto object-contain object-center",
                tc.watermarkShape,
                tc.watermark,
              )}
            />
          </div>

          {/* Central Pane Header / Tab Bar */}
          <div className={cn("p-4 border-b flex items-center justify-between shrink-0 relative z-10 transition-colors duration-300", tc.paneSolid)}>
            <h3 className={cn("text-xs font-bold font-sans flex items-center gap-2", tc.centerTitle)}>
              <BookOpen size={14} className="text-[#f59e0b]" />
              <span>
                {processPhase === "completed" && operationMode === "edit"
                  ? "المخطوطة اللغوية الموحدة"
                  : operationMode === "summarize" || operationMode === "consolidate"
                    ? "مِنْضَدَة النص اللغوية الموحدة"
                    : "منضدة النص المرجعي (المراجعة والتهذيب)"}
              </span>
            </h3>

            {/* Structured Views Tabs (Completed phase only) */}
            {processPhase === "completed" && activeWorkspaceData && (
              <div className={cn("flex items-center gap-1 p-0.5 rounded-xl border", tc.viewModeBar)}>
                <button 
                  onClick={() => setViewMode("split")}
                  className={cn("px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 flex items-center gap-1 cursor-pointer hover:scale-[1.02]", 
                    viewMode === "split" ? tc.viewModeActive : tc.viewModeIdle)}
                >
                  <ArrowRightLeft size={10} />
                  <span>العرض التفاعلي</span>
                </button>
                <button 
                  onClick={() => setViewMode("preview")}
                  className={cn("px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 flex items-center gap-1 cursor-pointer hover:scale-[1.02]", 
                    viewMode === "preview" ? tc.viewModeActive : tc.viewModeIdle)}
                >
                  <Eye size={10} />
                  <span>النص الصافي</span>
                </button>
                <button 
                  onClick={() => setViewMode("json")}
                  className={cn("px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 flex items-center gap-1 cursor-pointer hover:scale-[1.02]", 
                    viewMode === "json" ? tc.viewModeActive : tc.viewModeIdle)}
                >
                  <Code size={10} />
                  <span>JSON الهيكلي</span>
                </button>
              </div>
            )}
          </div>

          {/* Central Workspace Content Panel */}
          <div
            className={cn(
              "flex-1 p-6 overflow-y-auto min-h-0 relative z-10",
              processPhase === "completed" && (activeWorkspaceData || summaryResult) && "pb-36",
            )}
          >

            {(operationMode === "summarize" || operationMode === "consolidate") &&
            (processPhase === "processing" || processPhase === "preflight" || processPhase === "completed") ? (
              <MainTextWorkbench
                summaryData={summaryResult ? normalizeWorkbenchPayload(summaryResult) : null}
                isLoading={processPhase === "processing" || processPhase === "preflight"}
                currentMode={operationMode}
                showLayers={operationMode === "consolidate"}
                actionLogs={
                  processPhase === "processing" || processPhase === "preflight"
                    ? mergeLogs
                    : []
                }
                copiedIdeas={copiedId === "summary_ideas_copy"}
                onCopyIdeas={
                  summaryResult?.core_ideas?.length
                    ? () => {
                        const ideasText = summaryResult.core_ideas
                          ?.map(
                            (idea: { id: number; section_title?: string; sovereign_idea?: string; idea?: string }) =>
                              `${idea.id}. ${idea.section_title || ""}\n${idea.sovereign_idea || idea.idea || ""}`
                          )
                          .join("\n\n");
                        copyToClipboard(ideasText || "", "summary_ideas_copy");
                      }
                    : undefined
                }
              />
            ) : processPhase !== "completed" ? (
              // Phase 1 & 2: Plain Text Editor for Primary Draft
              primaryFile ? (
                <div className="h-full flex flex-col relative">
                  
                  {/* Processing Overlay blocker */}
                  {(processPhase === "processing" || processPhase === "preflight") && (
                    <div className={cn("absolute inset-0 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-8 transition-colors duration-300", tc.overlay)}>
                      <div className={cn("w-full max-w-2xl rounded-xl border p-6 space-y-4", tc.card)}>
                        <div className="flex items-start gap-4 justify-center">
                          <ProcessingBrandSpinner size="md" />
                          <div className="flex-1 text-right space-y-3 min-w-0">
                            <h4 className={cn("font-bold font-sans", VIEWPORT_TEXT, tc.overlayTitle)}>
                              {TASK_LOADING_PRIMARY[operationMode as keyof typeof TASK_LOADING_PRIMARY]}
                            </h4>
                            {mergeLogs.length > 0 && (
                              <div className={cn("rounded-xl border p-4 space-y-2", tc.innerPanel)}>
                                {mergeLogs.map((log, index) => (
                                  <p
                                    key={index}
                                    className={cn(
                                      "text-justify font-sans leading-relaxed",
                                      index === mergeLogs.length - 1
                                        ? cn("font-bold text-lg", tc.overlayTitle)
                                        : cn("text-base", tc.overlaySub),
                                    )}
                                  >
                                    {log}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <textarea
                    value={primaryText}
                    onChange={(e) => setPrimaryText(e.target.value)}
                    disabled={processPhase === "processing" || processPhase === "preflight" || primaryFile.status !== "success"}
                    className={cn(
                      "w-full flex-1 bg-transparent border-0 focus:ring-0 focus:outline-none text-justify font-sans resize-none",
                      VIEWPORT_TEXT,
                      tc.extractedText,
                    )}
                    placeholder="اكتب أو هذّب النص المرجعي الأساسي هنا..."
                  />
                </div>
              ) : (
                // Initial empty state
                <div className={cn("h-full flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-2xl relative z-10", tc.emptyPanel)}>
                  <div className={cn("p-4 rounded-full mb-4 border", tc.card)}>
                    <FileText size={32} className={tc.textMuted} />
                  </div>
                  <h4 className={tc.emptyTitle}>منضدة النص المرجعي</h4>
                  <p className={cn("max-w-xs mt-2 font-medium", tc.emptyBody)}>
                    يرجى إيداع النص المرجعي من لوحة التوجيه الجانبية للبدء بالمراجعة والتهذيب قبل السبك اللغوي.
                  </p>
                </div>
              )
            ) : (
              // Phase 3: Post-processing Output Viewers
              operationMode === "edit" ? (
                activeWorkspaceData && (
                  <div className="h-full">
                    
                    {/* VIEW MODE 1: STRUCTURED VIEW WITH BORDER HIGHLIGHTS */}
                    {viewMode === "split" && (
                      <div className="space-y-4 pb-12">
                        {activeWorkspaceData.master_draft_structured?.map((block) => {
                          const isHeading = block.type === "heading";
                          const isPrimary = block.is_primary;
                          const hasIdea = !!block.associated_idea_id;
                          const isBlockActive = activeBlockId === block.block_id;
                          const isBlockHighlighted = highlightedBlock === block.block_id;

                          // Retrieve full idea description for tooltip
                          const assocIdea = activeWorkspaceData.atomic_ideas?.find(idea => idea.id === block.associated_idea_id);

                          return (
                            <div 
                              key={block.block_id}
                              ref={(el) => { blockRefs.current[block.block_id] = el; }}
                              onClick={() => handleBlockClick(block)}
                              className={cn(
                                "p-4 rounded-2xl cursor-pointer transition-all duration-300 relative group/block",
                                isHeading
                                  ? tc.draftBlockHeading
                                  : isPrimary
                                    ? tc.draftBlockPrimary
                                    : tc.draftBlockMerged,
                                isBlockActive && tc.draftBlockActive,
                                isBlockHighlighted && tc.draftBlockHighlight,
                              )}
                            >
                              {/* Hover tooltip for sub-draft paragraph */}
                              {!isPrimary && assocIdea && (
                                <div className={cn("absolute z-50 hidden group-hover/block:block p-3 rounded-xl text-xs w-72 pointer-events-none -top-14 right-2 leading-relaxed", tc.draftTooltip)}>
                                  <span className={cn("font-bold block mb-1", tc.headingAccent)}>💡 فكرة مدمجة ({assocIdea.id})</span>
                                  <span>{assocIdea.content}</span>
                                </div>
                              )}

                              {isHeading ? (
                                <h3 className={cn("text-sm font-bold flex items-center gap-2", tc.draftHeadingText)}>
                                  <span className="w-1 h-3.5 bg-gradient-to-b from-amber-500 to-amber-600 rounded-full"></span>
                                  {block.text}
                                </h3>
                              ) : (
                                <div>
                                  {/* Sub-draft info badge displayed above paragraph */}
                                  {!isPrimary && (
                                    <div className={cn("text-xs font-bold mb-1.5 flex items-center gap-1.5", tc.draftMergedBadge)}>
                                      <span>💡 فكرة مدمجة: {block.associated_idea_id}</span>
                                      <span>•</span>
                                      <span>المخطوطة المصدر: {block.source}</span>
                                    </div>
                                  )}
                                  <p className={cn("text-base leading-relaxed text-justify", theme === "oatmeal" ? "text-stone-900" : tc.manuscriptBody)}>
                                    {block.text}
                                  </p>
                                </div>
                              )}

                              <div className={cn("mt-2.5 pt-2 border-t flex items-center justify-between text-xs", tc.draftMetaFooter)}>
                                <span>المصدر: <strong className={isPrimary ? tc.draftMetaSourcePrimary : tc.draftMetaSourceMerged}>{block.source}</strong></span>
                                {hasIdea && (
                                  <span className={cn("flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-mono", tc.draftIdeaIdBadge)}>
                                    ID: {block.associated_idea_id}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* VIEW MODE 2: PLAIN MANUSCRIPT PREVIEW */}
                    {viewMode === "preview" && (
                      <div className="max-w-3xl mx-auto w-full space-y-6 pb-12">
                        <div className={cn("text-sm leading-relaxed whitespace-pre-wrap select-text text-justify font-medium", tc.manuscriptBody)}>
                          {activeWorkspaceData.content}
                        </div>
                      </div>
                    )}

                    {/* VIEW MODE 3: JSON STRUCTURE */}
                    {viewMode === "json" && (
                      <div className="h-full flex flex-col overflow-hidden pb-12">
                        <textarea
                          readOnly
                          value={JSON.stringify(activeWorkspaceData, null, 2)}
                          dir="ltr"
                          className={cn("flex-1 w-full p-4 rounded-xl text-xs font-mono focus:outline-none resize-none overflow-y-auto leading-relaxed shadow-inner border", tc.jsonViewer)}
                        />
                      </div>
                    )}

                  </div>
                )
              ) : null
            )}

          </div>

          {/* Export Action Bar (Completed phase only, fixed to bottom) */}
          {processPhase === "completed" && (activeWorkspaceData || summaryResult) && (
            <ExportActionBar
              theme={theme}
              copiedId={copiedId}
              onCopy={copyToClipboard}
              context={
                activeWorkspaceData
                  ? {
                      kind: "edit",
                      workspace: activeWorkspaceData,
                      sourceFilename: primaryFile?.name,
                    }
                  : {
                      kind: "analytics",
                      mode: operationMode === "consolidate" ? "consolidate" : "summarize",
                      summaryResult,
                      sourceFilename: primaryFile?.name,
                    }
              }
            />
          )}

        </div>

        {/* ========================================================================= */}
        {/* 3. LEFT PANE: CHECKLIST & ATOMIC IDEAS PANE (22-25% width)                 */}
        {/* ========================================================================= */}
        {operationMode === "edit" && hasSubDrafts !== false && (
          <div className={cn("w-full lg:w-[280px] xl:w-[320px] shrink-0 border-r backdrop-blur flex flex-col overflow-y-auto z-10 transition-colors duration-300", tc.pane)}>
            <div className="p-5 flex-1 flex flex-col">
              
              <div className={cn("pb-3 border-b mb-4", tc.sectionDivider)}>
                <h3 className={cn("text-sm font-extrabold flex items-center gap-2 font-sans", tc.deltaPaneTitle)}>
                  <Activity size={14} className="text-[#f59e0b]" />
                  قائمة الفحص والمطابقة (Delta)
                </h3>
                <p className={cn("text-xs mt-1 leading-relaxed font-sans font-medium", tc.deltaPaneSub)}>
                  مصفوفة الأفكار الذرية الإضافية التي تم استخلاصها ومطابقتها مع المرجع.
                </p>
              </div>

              {processPhase !== "completed" ? (
                // Checklist Placeholder before processing
                <div className={cn("flex-1 flex flex-col items-center justify-center text-center p-6 opacity-60", tc.deltaWait)}>
                  <BookOpen size={28} className={cn("mb-2", tc.textMuted)} />
                  <p className="text-xs font-medium">في انتظار إيداع النصوص واستخراج الفروق اللغوية...</p>
                </div>
              ) : (
                // checklist containing extracted ideas
                activeWorkspaceData?.atomic_ideas && activeWorkspaceData.atomic_ideas.length > 0 ? (
                  <div className="space-y-3">
                    {activeWorkspaceData.atomic_ideas.map((idea) => {
                      const isConsolidated = idea.status === "consolidated" || idea.status === "integrated";
                      const isActive = activeIdeaId === idea.id;
                      const isHighlighted = highlightedIdea === idea.id;

                      return (
                        <div 
                          key={idea.id}
                          ref={(el) => { ideaRefs.current[idea.id] = el; }}
                          onClick={() => handleIdeaClick(idea.id)}
                          className={cn(
                            "p-3.5 rounded-xl border text-right cursor-pointer transition-all duration-300 relative group hover:scale-[1.02]",
                            isActive
                              ? tc.deltaIdeaActive
                              : isHighlighted
                                ? tc.deltaIdeaHighlight
                                : tc.deltaIdeaCard,
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className={cn("text-xs font-mono font-bold px-2 py-0.5 rounded border", tc.deltaIdeaId)}>
                              {idea.id}
                            </span>
                            {isConsolidated ? (
                              <span className={cn("flex items-center gap-0.5 text-xs px-2 py-0.5 rounded font-bold border", tc.deltaStatusMerged)}>
                                <CheckCircle2 size={10} className={theme === "oatmeal" ? "text-emerald-700" : "text-emerald-400"} />
                                مدمجة
                              </span>
                            ) : (
                              <span className={cn("flex items-center gap-0.5 text-xs px-2 py-0.5 rounded font-bold border", tc.deltaStatusPending)}>
                                <AlertTriangle size={10} className={theme === "oatmeal" ? "text-amber-700" : "text-amber-400"} />
                                غير مدمجة
                              </span>
                            )}
                          </div>
                          
                          <p className={cn("text-sm leading-relaxed font-semibold", tc.deltaIdeaText)}>
                            {idea.content}
                          </p>
                          
                          <div className={cn("mt-2.5 pt-2 border-t flex items-center justify-between text-xs font-medium", tc.draftMetaFooter)}>
                            <span className="truncate max-w-[130px]" title={idea.source_draft}>المصدر: {idea.source_draft}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={cn("text-center text-xs py-8", tc.deltaEmpty)}>لا توجد أفكار ذرية إضافية مدمجة.</div>
                )
              )}

            </div>
          </div>
        )}

      </div>

    </div>
  );
}
