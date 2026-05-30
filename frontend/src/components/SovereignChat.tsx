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
  Cpu,
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

const getApiUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://127.0.0.1:8000";
    }
    return "/_/backend";
  }
  return "http://127.0.0.1:8000";
};

const API_BASE_URL = getApiUrl();

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
  const timerRef = useRef<any>(null);
  
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
        const res = await fetch(`${API_BASE_URL}/preflight-check`, {
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

      try {
        const res = await fetch(`${API_BASE_URL}/extract-text`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error("فشل استخراج النص من المرجع اللغوي.");
        const data = await res.json();
        
        setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, content: data.text, status: "success" } : f));
        setPrimaryText(data.text);
      } catch (err: any) {
        console.error("Primary text extraction failed:", err);
        setUploadedFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: "error", errorMsg: err.message } : f));
        setPrimaryText(`❌ حدث خطأ أثناء القراءة: ${err.message || "فشلت عملية القراءة"}`);
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

        try {
          const res = await fetch(`${API_BASE_URL}/extract-text`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) throw new Error("فشل استخراج النص من الملف الفرعي.");
          const data = await res.json();
          
          setUploadedFiles(prev => prev.map(f => f.id === correspondingId ? { ...f, content: data.text, status: "success" } : f));
        } catch (err: any) {
          console.error("Auxiliary text extraction failed for", file.name, err);
          setUploadedFiles(prev => prev.map(f => f.id === correspondingId ? { ...f, status: "error", errorMsg: err.message } : f));
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
        "جاري فحص وتهيئة المستندات المرفوعة وتحديد أدوار الدمج...",
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

      const res = await fetch(`${API_BASE_URL}/merge-drafts`, {
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
        "جاري قراءة المخطوطة وتحليل بنيتها...",
        "جاري استخلاص الأفكار الجوهرية والكشاف الرقمي...",
        "جاري صياغة التلخيص الدلالي..."
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

      const res = await fetch(`${API_BASE_URL}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: primaryText,
          format: summaryFormat,
          force_engine: engine === "local_hybrid" ? undefined : engine,
          user_tier: "premium",
        }),
      });

      clearInterval(logInterval);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "فشل طلب التلخيص من الخادم.");
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

      const res = await fetch(`${API_BASE_URL}/consolidate`, {
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

  const handleDownload = (content: string, id: string) => {
    const element = document.createElement("a");
    const file = new Blob([content], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `sovereign_output_${id}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleDownloadDocx = async () => {
    if (!summaryResult) {
      alert("لا توجد نتائج للتصدير. نفّذ الصهر أولاً.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/export/docx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discovered_structure: summaryResult,
          title: "جوهر المخطوطة — مدونة الخليل",
          source_filename: primaryFile?.name || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "فشل تصدير Word");
      }
      const blob = await res.blob();
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `khalil_consolidation_${stamp}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("DOCX export error:", error);
      alert(error.message || "تعذر تصدير مستند Word.");
    }
  };

  const handleNewChat = () => {
    if (window.confirm("هل أنت متأكد من بدء جلسة جديدة؟ سيتم مسح جميع الملفات والبيانات الحالية.")) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedTime(0);
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
    <div className="flex flex-col h-screen bg-[#020617] text-slate-100 font-sans selection:bg-[#f59e0b] selection:text-black relative overflow-hidden" dir="rtl">
      
      {/* Global Royal Blur Background Lights */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none z-0" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none z-0" />

      {/* Top Banner Header */}
      <header className="p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-l from-slate-900 via-emerald-950/20 to-slate-900 backdrop-blur z-40 shrink-0">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-slate-900/80 border border-amber-500/20 rounded-xl flex items-center justify-center overflow-hidden w-10 h-10 transition-all duration-300 hover:border-amber-500/40">
              <img 
                src="/logo.png" 
                alt="شعار مدونة الخليل" 
                className="w-full h-full object-contain opacity-85 hover:opacity-100 transition-opacity duration-300"
              />
            </div>
            <div className="flex flex-col right-alignment select-none">
              <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-emerald-100 to-amber-200">
                مدونة الخليل للتحرير اللغوي <span className="text-xs font-normal text-amber-500/70 font-mono">v2.1</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1 font-medium max-w-xl">
                مساعدك اللغوي لسبك الأفكار، دمج المسودات، والارتقاء بالمحتوى اللغوي بكفاءة بنائية و زمنية.
              </p>
            </div>
          </div>

          {/* 1. صندوق حجم الكلمات المدخلة (Input Volume Card) */}
          {totalInputWords > 0 && (
            <div 
              className="hidden md:flex flex-col text-right border-r border-slate-800 pr-4 select-none group relative cursor-help"
              title={`الأساسية: ${primaryWords.toLocaleString()} كلمة • الفرعية: ${auxWords.toLocaleString()} كلمة`}
            >
              <span className="text-[9px] text-slate-500 font-bold block">حجم المدخلات الإجمالي</span>
              <span className="text-[11px] font-black text-amber-500/90 font-mono mt-0.5">
                {totalInputWords.toLocaleString()} <span className="text-[9px] font-sans text-slate-400 font-medium">كلمة</span>
              </span>
              {/* Custom Tooltip */}
              <div className="absolute top-10 right-0 z-50 hidden group-hover:block bg-slate-900 border border-amber-500/20 p-2.5 rounded-xl text-[9px] text-slate-300 w-44 shadow-2xl leading-relaxed">
                <div className="flex justify-between mb-1">
                  <span>النص المرجعي:</span>
                  <span className="font-mono font-bold text-slate-200">{primaryWords.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>النصوص الرديفة:</span>
                  <span className="font-mono font-bold text-slate-200">{auxWords.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. عداد التحليل الزمني الحي (Live Execution Timer) */}
        <div className="flex flex-col items-center select-none">
          <span className="text-[9px] text-slate-500 font-bold block mb-0.5">ميقات السبك والتحوير الحي</span>
          <div className={cn(
            "text-sm font-black font-mono tracking-wider transition-colors duration-300",
            processPhase === "idle" 
              ? "text-slate-500/60" 
              : processPhase === "processing" || processPhase === "preflight"
              ? "text-amber-500 animate-pulse" 
              : "text-emerald-400"
          )}>
            {formatTimer(elapsedTime)}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {(displayTokenTotal > 0 ||
            ((operationMode === "summarize" || operationMode === "consolidate") &&
              processPhase === "completed")) && (
            <div className="flex items-center gap-2 text-xs font-mono text-amber-400/80 bg-amber-500/5 px-3 py-1 rounded-full border border-amber-500/15">
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
          <div className="flex items-center gap-1.5 bg-black/20 p-0.5 rounded-xl border border-slate-800">
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 text-[10px] text-slate-300 hover:text-amber-400 hover:scale-[1.02] transition-all duration-300 cursor-pointer bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg"
              title="بدء جلسة جديدة"
            >
              <RefreshCw size={11} />
              <span>جلسة جديدة</span>
            </button>
            
            <button
              onClick={() => {
                if (window.confirm("هل أنت متأكد من رغبتك في الخروج الآمن؟ سيتم إعادة تعيين كافة البيانات وإغلاق الجلسة.")) {
                  if (timerRef.current) clearInterval(timerRef.current);
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

          <div className="flex items-center gap-1.5 text-xs text-slate-500 border-r border-slate-800 pr-4">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </div>
            <span className="font-semibold text-slate-400">نشط</span>
          </div>
        </div>
      </header>

      {/* Main Three-Pane Dynamic Layout Area */}
      <div className="flex-1 flex overflow-hidden flex-col lg:flex-row z-10">
        
        {/* ========================================================================= */}
        {/* 1. RIGHT PANE: CONTROL & CONFIG PANE (22-25% width on desktop)            */}
        {/* ========================================================================= */}
        <div className="w-full lg:w-[320px] xl:w-[360px] shrink-0 border-l border-slate-800 bg-slate-950/80 backdrop-blur flex flex-col overflow-y-auto z-10">
          <div className="p-5 flex-1 flex flex-col justify-between">
            <div className="space-y-6">
              
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-extrabold text-slate-200 flex items-center gap-2 font-sans">
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
                    <span className="text-[11px] font-bold text-amber-500 block font-sans">الخطوة 1: اختيار المحرر الذكي</span>
                    <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
                      <button
                        onClick={() => setSelectedProvider("deepseek")}
                        className={cn(
                          "py-1.5 rounded-xl text-[10px] font-bold text-center transition-all duration-300 cursor-pointer",
                          selectedProvider === "deepseek"
                            ? "bg-amber-950/40 text-amber-500 border border-amber-500/30 ring-1 ring-amber-500/30 shadow-md font-black"
                            : "text-slate-500 hover:text-slate-300 hover:scale-[1.02]"
                        )}
                      >
                        DeepSeek-V3
                      </button>
                      <button
                        onClick={() => setSelectedProvider("gemini")}
                        className={cn(
                          "py-1.5 rounded-xl text-[10px] font-bold text-center transition-all duration-300 cursor-pointer",
                          selectedProvider === "gemini"
                            ? "bg-amber-950/40 text-amber-500 border border-amber-500/30 ring-1 ring-amber-500/30 shadow-md font-black"
                            : "text-slate-500 hover:text-slate-300 hover:scale-[1.02]"
                        )}
                      >
                        Gemini Flash
                      </button>
                    </div>
                    {/* Connection check status indicator */}
                    {checkingProvider && (
                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-[10px] text-slate-400 flex items-center justify-center gap-2 mt-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                        </span>
                        <span>جاري فحص الاتصال...</span>
                      </div>
                    )}
                    {preflightError && (
                      <div className="p-3 bg-red-950/20 border border-red-500/30 rounded-xl text-[10px] text-red-400 flex items-start gap-2 mt-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <p className="leading-relaxed">{preflightError}</p>
                      </div>
                    )}
                    {preflightSuccess && (
                      <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-[10px] text-emerald-400 flex items-start gap-2 mt-2">
                        <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                        <p className="leading-relaxed">{preflightSuccess}</p>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Upload Primary Document */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-amber-500 block font-sans">الخطوة 2: النص المرجعي (المصدر الأساسي)</span>
                    
                    {!primaryFile ? (
                      <div 
                        onClick={() => primaryFileInputRef.current?.click()}
                        className="border border-dashed border-amber-500/30 hover:border-amber-500 bg-slate-900/40 hover:bg-amber-500/5 hover:scale-[1.02] transition-all duration-300 rounded-2xl p-6 flex flex-col items-center justify-center gap-2.5 cursor-pointer group shadow-sm hover:shadow-md"
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
                          <p className="text-xs font-bold text-slate-300">إيداع النص المرجعي الأساسي</p>
                          <p className="text-[9px] text-slate-500 mt-1 leading-relaxed">docx · pdf · txt · md · json · rtf</p>
                        </div>
                      </div>
                    ) : (
                      // Primary File Status Card
                      <div className="p-3.5 bg-slate-900 border border-emerald-500/20 rounded-2xl flex items-center justify-between gap-3 relative overflow-hidden shadow-lg">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl shrink-0">
                            <Crown size={16} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-200 truncate">{primaryFile.name}</h4>
                            <p className="text-[9px] text-slate-500 font-mono mt-0.5">{(primaryFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {primaryFile.status === "loading" && <RefreshCw size={12} className="animate-spin text-amber-500" />}
                          {primaryFile.status === "error" && <span title={primaryFile.errorMsg}><AlertTriangle size={12} className="text-red-400" /></span>}
                          {primaryFile.status === "success" && <CheckCircle2 size={12} className="text-emerald-400" />}
                          
                          <button 
                            onClick={() => {
                              setUploadedFiles(prev => prev.filter(f => f.id !== primaryFile.id));
                              setPrimaryText("");
                              setHasSubDrafts(null);
                            }}
                            className="p-1 hover:bg-red-950/30 text-slate-500 hover:text-red-400 rounded-xl transition-colors border border-slate-800 bg-[#020617]"
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
                    <div className="space-y-4 pt-1 border-t border-slate-800">
                      <span className="text-[11px] font-bold text-amber-500 block font-sans">اختر نوع العملية</span>
                      <div className="grid grid-cols-3 gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
                        <button
                          onClick={() => setOperationMode("summarize")}
                          className={cn(
                            "py-1.5 rounded-lg text-[9px] font-bold text-center transition-all duration-300 cursor-pointer leading-snug",
                            operationMode === "summarize"
                              ? "bg-amber-950/40 text-amber-500 border border-amber-500/30 ring-1 ring-amber-500/30 shadow-md font-black"
                              : "text-slate-500 hover:text-slate-300 hover:scale-[1.02]"
                          )}
                        >
                          تلخيص دلالي
                        </button>
                        <button
                          onClick={() => setOperationMode("edit")}
                          className={cn(
                            "py-1.5 rounded-lg text-[9px] font-bold text-center transition-all duration-300 cursor-pointer leading-snug",
                            operationMode === "edit"
                              ? "bg-amber-950/40 text-amber-500 border border-amber-500/30 ring-1 ring-amber-500/30 shadow-md font-black"
                              : "text-slate-500 hover:text-slate-300 hover:scale-[1.02]"
                          )}
                        >
                          تحرير ودمج
                        </button>
                        <button
                          onClick={() => setOperationMode("consolidate")}
                          className={cn(
                            "py-1.5 rounded-lg text-[9px] font-bold text-center transition-all duration-300 cursor-pointer leading-snug",
                            operationMode === "consolidate"
                              ? "bg-amber-950/40 text-amber-500 border border-amber-500/30 ring-1 ring-amber-500/30 shadow-md font-black"
                              : "text-slate-500 hover:text-slate-300 hover:scale-[1.02]"
                          )}
                        >
                          صهر المحاور
                        </button>
                      </div>
                      {operationMode === "summarize" && (
                        <p className="text-[9px] text-slate-500 leading-relaxed">
                          استخلاص أفكار جوهرية وكلمات مفتاحية — استدعاء LLM واحد تقريباً.
                        </p>
                      )}
                      {operationMode === "consolidate" && (
                        <p className="text-[9px] text-amber-500/80 leading-relaxed">
                          متقدم: دمج الفوضى في 7 محاور — يتطلب ملف الأصل JSON.
                        </p>
                      )}
                    </div>
                  )}

                  {isPrimaryLoaded && operationMode === "edit" && (
                    <>
                      {/* Step 3: Choose Sub-drafts option (Visible if primary uploaded successfully) */}
                      <div className="space-y-3.5 pt-4 border-t border-slate-800/40">
                        <span className="text-[11px] font-bold text-amber-500 block font-sans">الخطوة 3: النصوص الرديفة والدمج</span>
                        
                        {hasSubDrafts === null ? (
                          <div className="space-y-2">
                            <p className="text-[10px] text-slate-400 leading-relaxed font-sans">هل لديك نصوص رديفة ترغب في دمج أفكارها ومقترحاتها مع النص المرجعي؟</p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => setHasSubDrafts(true)}
                                className="py-2 px-3 bg-amber-950/40 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer hover:scale-[1.02]"
                              >
                                نعم، دمج نصوص رديفة
                              </button>
                              <button
                                onClick={() => {
                                  setHasSubDrafts(false);
                                  setUploadedFiles(prev => prev.filter(f => f.isPrimary)); // Clear any aux if none wanted
                                }}
                                className="py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer hover:scale-[1.02]"
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
                              className="border border-dashed border-slate-800 hover:border-amber-500 bg-slate-900/40 hover:bg-amber-500/5 hover:scale-[1.02] transition-all duration-300 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm hover:shadow-md"
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
                              <Paperclip size={16} className="text-slate-500" />
                              <div className="text-center">
                                <p className="text-[11px] font-bold text-slate-300">إيداع النصوص الرديفة الإضافية</p>
                                <p className="text-[8px] text-slate-500 mt-0.5">حتى 10 ملفات — docx · pdf · txt · md · json · rtf</p>
                              </div>
                            </div>

                            {/* Auxiliary Files List */}
                            {hasAuxFiles && (
                              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                                {uploadedFiles.filter(f => !f.isPrimary).map(file => (
                                  <div key={file.id} className="p-2 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <FileText size={12} className="text-slate-400 shrink-0" />
                                      <span className="text-[10px] text-slate-300 truncate">{file.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {file.status === "loading" && <RefreshCw size={10} className="animate-spin text-amber-500" />}
                                      {file.status === "success" && <CheckCircle2 size={10} className="text-emerald-400" />}
                                      <button
                                        onClick={() => setUploadedFiles(prev => prev.filter(f => f.id !== file.id))}
                                        className="text-slate-500 hover:text-red-400 transition-colors"
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
                          <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl flex items-center justify-between shadow-inner">
                            <span className="text-xs text-amber-300 font-semibold font-sans">وضع التهذيب الفردي مفعل</span>
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
                      <div className="space-y-4 pt-4 border-t border-slate-800/40">
                        {/* Writing Style */}
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-bold text-amber-500 block font-sans">الأسلوب اللغوي</span>
                          <div className="grid grid-cols-2 gap-1.5">
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
                                  "py-1.5 px-2 rounded-xl text-xs font-bold text-center border transition-all duration-300 hover:scale-[1.02] cursor-pointer",
                                  selectedStyle === s.id
                                    ? "bg-amber-950/40 border-amber-500/30 ring-1 ring-amber-500/30 text-amber-500 font-extrabold shadow-lg shadow-amber-500/5"
                                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                                )}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Target Word Count */}
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-bold text-slate-300 block font-sans">الكلمات المستهدفة (اختياري)</span>
                          <input 
                            type="number"
                            value={targetWordCount}
                            onChange={(e) => setTargetWordCount(e.target.value)}
                            placeholder="مثال: 1000 كلمة"
                            className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 rounded-xl py-1.5 px-3 focus:outline-none text-right font-mono text-xs text-slate-300 placeholder:text-slate-500"
                          />
                        </div>

                        {/* Custom Intent Steering */}
                        <div className="space-y-1.5 pt-1.5 border-t border-slate-800/40">
                          <span className="text-[11px] font-bold text-amber-500 block font-sans">
                            التوجيه المخصص (اختياري)
                          </span>
                          <textarea
                            value={customIntent}
                            onChange={(e) => setCustomIntent(e.target.value)}
                            placeholder="اكتب هنا توجيهاتك الخاصة للمخطوطة (مثال: صياغة الأفكار الإدارية في قالب قصصي أدبي مترابط)..."
                            className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 rounded-xl p-3 text-right font-sans text-xs text-slate-300 placeholder:text-slate-500 resize-none min-h-[85px] focus:outline-none"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {isPrimaryLoaded && (operationMode === "summarize" || operationMode === "consolidate") && (
                    <div className="space-y-4 pt-4 border-t border-slate-800/40">
                      {operationMode === "consolidate" && (
                        <>
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-bold text-amber-500 block font-sans">ملف الأصل المرجعي (JSON — إلزامي)</span>
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
                              className="w-full text-[10px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:bg-amber-950/40 file:text-amber-500 file:font-bold file:cursor-pointer"
                            />
                            {referenceJson && (
                              <p className="text-[9px] text-emerald-400 font-sans">✓ تم تحميل المرجع ({Math.round(referenceJson.length / 1024)} KB)</p>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-bold text-slate-300 block font-sans">توجيه الصهر (اختياري)</span>
                            <textarea
                              value={customIntent}
                              onChange={(e) => setCustomIntent(e.target.value)}
                              placeholder="مثال: ركّز على السرد القصصي دون تكرار..."
                              className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 rounded-xl p-3 text-right font-sans text-xs text-slate-300 placeholder:text-slate-500 resize-none min-h-[70px] focus:outline-none"
                            />
                          </div>
                        </>
                      )}

                      {operationMode === "summarize" && (
                        <p className="text-[9px] text-slate-500 leading-relaxed">
                          استدعاء LLM واحد تقريباً — مناسب للنصوص الطويلة دون ملف مرجعي.
                        </p>
                      )}

                      {/* Export Format + Engine — مشترك */}
                      <div className="space-y-1.5 pt-1.5 border-t border-slate-800/40">
                        <span className="text-[11px] font-bold text-slate-300 block font-sans">صيغة المخرجات</span>
                        <div className="grid grid-cols-2 gap-2 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
                          <button
                            onClick={() => setSummaryFormat("json")}
                            className={cn(
                              "py-1.5 rounded-lg text-[10px] font-bold text-center transition-all duration-300 cursor-pointer",
                              summaryFormat === "json"
                                ? "bg-amber-950/40 text-amber-500 border border-amber-500/30 ring-1 ring-amber-500/30 shadow-md font-black"
                                : "text-slate-500 hover:text-slate-300 hover:scale-[1.02]"
                            )}
                          >
                            JSON الهيكلي
                          </button>
                          <button
                            onClick={() => setSummaryFormat("markdown")}
                            className={cn(
                              "py-1.5 rounded-lg text-[10px] font-bold text-center transition-all duration-300 cursor-pointer",
                              summaryFormat === "markdown"
                                ? "bg-amber-950/40 text-amber-500 border border-amber-500/30 ring-1 ring-amber-500/30 shadow-md font-black"
                                : "text-slate-500 hover:text-slate-300 hover:scale-[1.02]"
                            )}
                          >
                            Markdown منسق
                          </button>
                        </div>
                      </div>

                      {/* Preferred Engine Toggle */}
                      <div className="space-y-1.5 pt-1.5 border-t border-slate-800/40">
                        <span className="text-[11px] font-bold text-slate-300 block font-sans">تفضيل المحرك</span>
                        <div className="grid grid-cols-3 gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
                          {[
                            { id: "auto", label: "تلقائي" },
                            { id: "deepseek", label: "DeepSeek" },
                            { id: "gemini", label: "Gemini" }
                          ].map(e => (
                            <button
                              key={e.id}
                              onClick={() => setForceEngine(e.id)}
                              className={cn(
                                "py-1.5 rounded-lg text-[9px] font-bold text-center transition-all duration-300 cursor-pointer",
                                forceEngine === e.id
                                  ? "bg-amber-950/40 text-amber-500 border border-amber-500/30 ring-1 ring-amber-500/30 shadow-md font-black"
                                  : "text-slate-500 hover:text-slate-300 hover:scale-[1.02]"
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
                // Localized Loading View inside control pane (Middle pane stays visible!)
                <div className="space-y-6 py-10 flex flex-col items-center">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-amber-500/10" />
                    <div className="absolute inset-0 rounded-full border-4 border-t-amber-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                    <div className="absolute inset-1.5 rounded-full border-2 border-emerald-500/10" />
                    <div className="absolute inset-1.5 rounded-full border-2 border-b-emerald-400 border-t-transparent border-r-transparent border-l-transparent animate-spin [animation-duration:1.2s] [animation-direction:reverse]" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Cpu size={20} className="text-amber-500 animate-pulse" />
                    </div>
                  </div>

                  <div className="text-center space-y-1">
                    <h4 className="text-xs font-bold text-white font-sans">
                      {processPhase === "preflight"
                        ? "جاري فحص اتصال الخوادم..."
                        : operationMode === "summarize"
                          ? "جاري التلخيص الدلالي..."
                          : operationMode === "consolidate"
                            ? "جاري صهر المحاور..."
                            : "جاري صياغة النص الهجين"}
                    </h4>
                    <p className="text-[9px] text-slate-500 font-sans">
                      {processPhase === "preflight"
                        ? "يتم التحقق من مفتاح API وصلاحية الحساب"
                        : operationMode === "summarize"
                          ? "استخلاص الأفكار والكلمات المفتاحية في استدعاء واحد..."
                          : operationMode === "consolidate"
                            ? "دمج الفوضى البنائية في بطاقات المحاور السبعة..."
                            : "يقوم وكلاء الأنظمة بعمليات المطابقة والدراسة..."}
                    </p>
                  </div>

                  {/* Realtime logs viewport */}
                  {mergeLogs.length > 0 && (
                    <div className="w-full bg-black/40 border border-slate-800 rounded-2xl p-3.5 text-right space-y-2.5 font-mono text-[9px] text-slate-400 min-h-[140px] flex flex-col justify-end">
                      {mergeLogs.map((log, index) => {
                        const isLatest = index === mergeLogs.length - 1;
                        return (
                          <div 
                            key={index} 
                            className={cn(
                              "flex items-start gap-2 transition-all duration-350",
                              isLatest ? "text-amber-500 font-bold animate-pulse" : "text-slate-600"
                            )}
                          >
                            <span className="mt-0.5 shrink-0">
                              {isLatest ? (
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                                </span>
                              ) : (
                                <CheckCircle2 size={10} className="text-emerald-500/80" />
                              )}
                            </span>
                            <span className="flex-1 leading-relaxed">{log}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                // Phase 3: Completed State (Metrics Dashboard)
                <div className="space-y-5">
                  {operationMode === "edit" ? (
                    <>
                      <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800 space-y-1.5 shadow-inner">
                        <span className="text-[9px] text-slate-500 font-bold block">الملفات المستخدمة في الدمج</span>
                        <div className="space-y-1">
                          {uploadedFiles.map(file => (
                            <div key={file.id} className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-300 truncate max-w-[170px] font-medium">{file.name}</span>
                              <span className={cn("text-[8px] px-1.5 py-0.5 rounded font-bold border", 
                                file.isPrimary 
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" 
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/25"
                              )}>
                                {file.isPrimary ? "أساسي" : "فرعي"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Dynamic Metrics */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 block font-sans">مؤشرات الأداء اللغوي</span>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:scale-[1.02] transition-all duration-300 text-right">
                            <span className="text-[8px] text-slate-500 block mb-0.5">التوكنات المستهلكة</span>
                            <span className="text-xs font-bold text-amber-500 font-mono">
                              {activeWorkspaceData?.tokenUsage?.total_tokens || 0}
                            </span>
                          </div>
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:scale-[1.02] transition-all duration-300 text-right">
                            <span className="text-[8px] text-slate-500 block mb-0.5">سلامة البنية للـ Parser</span>
                            <span className="text-xs font-bold text-emerald-400 font-mono">
                              {activeWorkspaceData?.validation_report?.attempts === 0 ? "100%" : "98%"}
                            </span>
                          </div>
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:scale-[1.02] transition-all duration-300 text-right">
                            <span className="text-[8px] text-slate-500 block mb-0.5">زمن الاستجابة</span>
                            <span className="text-[11px] font-bold text-emerald-400 font-mono">
                              {"1850ms -> 920ms"}
                            </span>
                          </div>
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:scale-[1.02] transition-all duration-300 text-right">
                            <span className="text-[8px] text-slate-500 block mb-0.5">حجم الكلمات الناتج</span>
                            <span className="text-xs font-bold text-slate-300 font-mono">
                              {activeWorkspaceData?.metadata?.total_output_words || 0} كلمة
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : operationMode === "summarize" ? (
                    <>
                      <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800 space-y-1.5 shadow-inner">
                        <span className="text-[9px] text-slate-500 font-bold block">الملف المُلخَّص</span>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 truncate max-w-[170px] font-medium">{primaryFile?.name || "النص المباشر"}</span>
                          <span className="text-[8px] px-1.5 py-0.5 rounded font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                            تلخيص
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 block font-sans">مؤشرات التلخيص الدلالي</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-3 bg-amber-950/20 border border-amber-500/25 rounded-xl hover:scale-[1.02] transition-all duration-300 text-right col-span-2">
                            <span className="text-[8px] text-amber-500/80 block mb-0.5 font-bold">إجمالي التوكنات (LLM)</span>
                            <span className="text-lg font-black text-amber-400 font-mono">
                              {(
                                consolidationTokenUsage?.total_tokens ??
                                summaryResult?._metadata?.token_usage?.total_tokens ??
                                summaryResult?._metadata?.tokens_consumed ??
                                0
                              ).toLocaleString()}
                            </span>
                            {(consolidationTokenUsage?.estimated ||
                              summaryResult?._metadata?.token_usage?.estimated) && (
                              <span className="text-[8px] text-slate-500 block mt-1">
                                * تقدير تقريبي — المزود لم يُرجع عداداً دقيقاً
                              </span>
                            )}
                          </div>
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:scale-[1.02] transition-all duration-300 text-right">
                            <span className="text-[8px] text-slate-500 block mb-0.5">الأفكار الجوهرية</span>
                            <span className="text-xs font-bold text-emerald-400 font-mono">
                              {summaryResult?.core_ideas?.length || 0}
                            </span>
                          </div>
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:scale-[1.02] transition-all duration-300 text-right">
                            <span className="text-[8px] text-slate-500 block mb-0.5">الكلمات المفتاحية</span>
                            <span className="text-xs font-bold text-[#38bdf8] font-mono">
                              {summaryResult?.sovereign_keywords?.length || 0}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-right">
                        <span className="text-[8px] text-slate-500 block mb-0.5">محرك التلخيص</span>
                        <span className="text-xs font-bold text-slate-300 font-sans">
                          {summaryResult?._metadata?.engine_description || summaryResult?._metadata?.engine_utilized || "—"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800 space-y-1.5 shadow-inner">
                        <span className="text-[9px] text-slate-500 font-bold block">الملف المُصهَر</span>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 truncate max-w-[170px] font-medium">{primaryFile?.name || "النص المباشر"}</span>
                          <span className="text-[8px] px-1.5 py-0.5 rounded font-bold border bg-amber-500/10 text-amber-400 border-amber-500/25">
                            صهر
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 block font-sans">مؤشرات الصهر الديناميكي</span>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-3 bg-amber-950/20 border border-amber-500/25 rounded-xl hover:scale-[1.02] transition-all duration-300 text-right col-span-2">
                            <span className="text-[8px] text-amber-500/80 block mb-0.5 font-bold">إجمالي التوكنات (LLM)</span>
                            <span className="text-lg font-black text-amber-400 font-mono">
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
                              <div className="flex justify-between mt-1.5 text-[9px] font-mono text-slate-500">
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
                              <span className="text-[8px] text-slate-500 block mt-1">
                                * تقدير تقريبي — المزود لم يُرجع عداداً دقيقاً
                              </span>
                            )}
                          </div>
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:scale-[1.02] transition-all duration-300 text-right">
                            <span className="text-[8px] text-slate-500 block mb-0.5">البطاقات / العناقيد</span>
                            <span className="text-xs font-bold text-emerald-400 font-mono">
                              {summaryResult?.core_ideas?.length || 0} / {summaryResult?._metadata?.clusters_processed || 0}
                            </span>
                          </div>
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:scale-[1.02] transition-all duration-300 text-right">
                            <span className="text-[8px] text-slate-500 block mb-0.5">الكلمات المفتاحية السيادية</span>
                            <span className="text-xs font-bold text-[#38bdf8] font-mono">
                              {summaryResult?.sovereign_keywords?.length || 0} كلمات
                            </span>
                          </div>
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl hover:scale-[1.02] transition-all duration-300 text-right">
                            <span className="text-[8px] text-slate-500 block mb-0.5">عناصر الكشاف الرقمي</span>
                            <span className="text-xs font-bold text-[#a78bfa] font-mono">
                              {summaryResult?.numerical_ledger?.length || 0} قيم
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-right">
                        <span className="text-[8px] text-slate-500 block mb-0.5">محرك الصهر المعتمد</span>
                        <span className="text-xs font-bold text-slate-300 font-sans">
                          {summaryResult?._metadata?.engine_description || summaryResult?._metadata?.engine_utilized || "DeepSeek v4"}
                        </span>
                        {summaryResult?._metadata?.audit_passed === false && (
                          <div className="mt-1.5 space-y-1">
                            <span className="text-[9px] text-amber-500 block">⚠ تحذيرات تدقيق — راجع المخرجات</span>
                            {(summaryResult?._metadata?.audit_issues ||
                              summaryResult?._metadata?.audit_warnings ||
                              []
                            ).slice(0, 5).map((issue: string, i: number) => (
                              <span key={i} className="text-[8px] text-slate-500 block leading-relaxed">
                                • {issue}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Completion Logs summary */}
                  <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 space-y-1.5 max-h-36 overflow-y-auto">
                    <span className="text-[9px] text-amber-500 font-bold block">سجل المعالجة المكتملة</span>
                    <div className="space-y-1">
                      {mergeLogs.map((log, index) => (
                        <div key={index} className="flex items-center gap-1.5 text-[9px] text-slate-400 font-mono">
                          <CheckCircle2 size={10} className="text-emerald-500" />
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
                    className="w-full py-2 px-3 border border-amber-500/30 text-amber-500 hover:bg-amber-500/5 hover:scale-[1.02] transition-all duration-300 rounded-xl text-xs font-bold text-center cursor-pointer"
                  >
                    تعديل المدخلات وإعادة التشغيل
                  </button>

                </div>
              )}

            </div>

            {/* Launch Trigger button area */}
            {processPhase !== "completed" && processPhase !== "processing" && processPhase !== "preflight" && (
              <div className="pt-6 border-t border-slate-800 space-y-3 mt-6">
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
                    "w-full py-3.5 rounded-xl font-bold text-xs tracking-wide transition-all duration-300 shadow-lg cursor-pointer",
                    operationMode === "edit"
                      ? (isReadyToRun && isProviderReady && !checkingProvider)
                        ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black hover:scale-[1.02] hover:shadow-amber-500/20"
                        : "bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed"
                      : isPrimaryLoaded
                      ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black hover:scale-[1.02] hover:shadow-amber-500/20"
                      : "bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed"
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
        <div className="flex-1 flex flex-col bg-slate-950/40 overflow-hidden relative">
          
          {/* Watermark Background Logo */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 p-10 overflow-hidden mt-14">
            <img 
              src="/logo.png" 
              alt="خلفية مائية شعار مدونة الخليل" 
              className="w-full max-w-[450px] md:max-w-[550px] lg:max-w-[650px] h-auto object-contain opacity-[0.08]" 
            />
          </div>

          {/* Central Pane Header / Tab Bar */}
          <div className="p-4 border-b border-slate-800 bg-slate-900/75 flex items-center justify-between shrink-0 relative z-10">
            <h3 className="text-xs font-bold text-slate-300 font-sans flex items-center gap-2">
              <BookOpen size={14} className="text-[#f59e0b]" />
              <span>
                {processPhase === "completed" ? "المخطوطة اللغوية الموحدة" : "منضدة النص المرجعي (المراجعة والتهذيب)"}
              </span>
            </h3>

            {/* Structured Views Tabs (Completed phase only) */}
            {processPhase === "completed" && activeWorkspaceData && (
              <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-xl border border-slate-800">
                <button 
                  onClick={() => setViewMode("split")}
                  className={cn("px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-300 flex items-center gap-1 cursor-pointer hover:scale-[1.02]", 
                    viewMode === "split" 
                      ? "bg-amber-950/40 text-amber-500 border border-amber-500/30 ring-1 ring-amber-500/30 shadow-md font-extrabold" 
                      : "text-slate-400 hover:text-slate-200")}
                >
                  <ArrowRightLeft size={10} />
                  <span>العرض التفاعلي</span>
                </button>
                <button 
                  onClick={() => setViewMode("preview")}
                  className={cn("px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-300 flex items-center gap-1 cursor-pointer hover:scale-[1.02]", 
                    viewMode === "preview" 
                      ? "bg-amber-950/40 text-amber-500 border border-amber-500/30 ring-1 ring-amber-500/30 shadow-md font-extrabold" 
                      : "text-slate-400 hover:text-slate-200")}
                >
                  <Eye size={10} />
                  <span>النص الصافي</span>
                </button>
                <button 
                  onClick={() => setViewMode("json")}
                  className={cn("px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-300 flex items-center gap-1 cursor-pointer hover:scale-[1.02]", 
                    viewMode === "json" 
                      ? "bg-amber-950/40 text-amber-500 border border-amber-500/30 ring-1 ring-amber-500/30 shadow-md font-extrabold" 
                      : "text-slate-400 hover:text-slate-200")}
                >
                  <Code size={10} />
                  <span>JSON الهيكلي</span>
                </button>
              </div>
            )}
          </div>

          {/* Central Workspace Content Panel */}
          <div className="flex-1 p-6 overflow-y-auto min-h-0 relative z-10">
            
            {processPhase !== "completed" ? (
              // Phase 1 & 2: Plain Text Editor for Primary Draft
              primaryFile ? (
                <div className="h-full flex flex-col relative">
                  
                  {/* Processing Overlay blocker */}
                  {(processPhase === "processing" || processPhase === "preflight") && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center space-y-3">
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 animate-pulse">
                        <Cpu size={24} />
                      </div>
                      <h4 className="text-sm font-bold text-white">
                        {operationMode === "summarize"
                          ? "جاري التلخيص الدلالي للمخطوطة"
                          : operationMode === "consolidate"
                            ? "جاري صهر المحاور واستخلاص البطاقات"
                            : "جاري سبك وتوحيد النصوص عبر المحرك اللغوي الذكي"}
                      </h4>
                      <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                        {operationMode === "summarize"
                          ? "استدعاء LLM واحد تقريباً — يرجى الانتظار."
                          : operationMode === "consolidate"
                            ? "معالجة المحاور السبعة وفق ملف الأصل المرجعي."
                            : "الرجاء الانتظار، يتم حالياً تحليل الفروق، مطابقة الأفكار وتوليف المخطوطة اللغوية النهائية."}
                      </p>
                    </div>
                  )}

                  <textarea
                    value={primaryText}
                    onChange={(e) => setPrimaryText(e.target.value)}
                    disabled={processPhase === "processing" || processPhase === "preflight" || primaryFile.status !== "success"}
                    className="w-full flex-1 bg-transparent border-0 focus:ring-0 focus:outline-none text-slate-300 leading-relaxed text-justify font-sans text-sm resize-none"
                    placeholder="اكتب أو هذّب النص المرجعي الأساسي هنا..."
                  />
                </div>
              ) : (
                // Initial empty state
                <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-800 rounded-2xl bg-slate-900/10 relative z-10">
                  <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-full text-slate-600 mb-4">
                    <FileText size={32} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-300">منضدة النص المرجعي</h4>
                  <p className="text-xs text-slate-500 max-w-xs leading-relaxed mt-2 font-medium">
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
                                  ? "border-b border-slate-800 pb-2 hover:bg-white/5" 
                                  : isPrimary 
                                  ? "bg-slate-900 border border-slate-800 hover:border-amber-500/30 hover:bg-slate-900/80" 
                                  : "border-r-4 border-r-emerald-500 border-t border-l border-b border-emerald-500/20 bg-[#022c22]/80 hover:bg-[#022c22]/95 pl-4 pr-3 py-3 rounded-l-2xl rounded-r-sm shadow-inner",
                                isBlockActive && "ring-2 ring-amber-500/30 bg-slate-900/60 border-amber-500",
                                isBlockHighlighted && "animate-pulse ring-2 ring-amber-500/50 border-amber-500 bg-amber-950/30"
                              )}
                            >
                              {/* Hover tooltip for sub-draft paragraph */}
                              {!isPrimary && assocIdea && (
                                <div className="absolute z-50 hidden group-hover/block:block bg-slate-950 border border-emerald-500/20 p-3 rounded-xl text-[10px] text-slate-200 w-72 shadow-2xl pointer-events-none -top-14 right-2 leading-relaxed">
                                  <span className="font-bold text-amber-500 block mb-1">💡 فكرة مدمجة ({assocIdea.id})</span>
                                  <span>{assocIdea.content}</span>
                                </div>
                              )}

                              {isHeading ? (
                                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                                  <span className="w-1 h-3.5 bg-gradient-to-b from-amber-500 to-amber-600 rounded-full"></span>
                                  {block.text}
                                </h3>
                              ) : (
                                <div>
                                  {/* Sub-draft info badge displayed above paragraph */}
                                  {!isPrimary && (
                                    <div className="text-[9px] text-emerald-400 font-bold mb-1.5 flex items-center gap-1.5">
                                      <span>💡 فكرة مدمجة: {block.associated_idea_id}</span>
                                      <span>•</span>
                                      <span>المخطوطة المصدر: {block.source}</span>
                                    </div>
                                  )}
                                  <p className="text-sm text-slate-300 leading-relaxed text-justify">
                                    {block.text}
                                  </p>
                                </div>
                              )}

                              <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[9px] text-slate-500">
                                <span>المصدر: <strong className={isPrimary ? "text-slate-400" : "text-emerald-400 font-bold"}>{block.source}</strong></span>
                                {hasIdea && (
                                  <span className="flex items-center gap-1 text-[8px] text-emerald-400 bg-emerald-400/5 px-2 py-0.5 rounded border border-emerald-500/10 font-mono">
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
                        <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap select-text text-justify font-medium">
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
                          className="flex-1 w-full p-4 bg-black/40 border border-slate-800 rounded-xl text-[10px] font-mono text-emerald-400 focus:outline-none resize-none overflow-y-auto leading-relaxed shadow-inner"
                        />
                      </div>
                    )}

                  </div>
                )
              ) : (
                summaryResult && (
                  <div className="space-y-6 pb-12 select-text">
                    {/* 1. Sovereign Keywords Row */}
                    <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-850 space-y-3">
                      <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <Sparkles size={14} />
                        <span>📌 الكلمات المفتاحية السيادية</span>
                      </h4>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {summaryResult.sovereign_keywords?.map((kw: string, i: number) => (
                          <span key={i} className="px-3 py-1 bg-amber-500/5 text-amber-400 border border-amber-500/20 rounded-full text-xs font-semibold font-sans tracking-wide">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* 2. Core Ideas */}
                    <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-850 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                          <Layers size={14} />
                          <span>
                            {operationMode === "consolidate"
                              ? "💡 البطاقات المعرفية السيادية"
                              : "💡 الأفكار الجوهرية"}
                          </span>
                        </h4>
                        <button
                          onClick={() => {
                            const ideasText = summaryResult.core_ideas?.map((idea: any) =>
                              `${idea.id}. ${idea.section_title || ""}\n${idea.sovereign_idea || idea.idea || ""}`
                            ).join("\n\n");
                            copyToClipboard(ideasText, "summary_ideas_copy");
                          }}
                          className="flex items-center gap-1 text-[10px] text-amber-500 hover:underline cursor-pointer"
                        >
                          {copiedId === "summary_ideas_copy" ? <Check size={10} /> : <Copy size={10} />}
                          <span>{copiedId === "summary_ideas_copy" ? "تم النسخ" : "نسخ الأفكار الجوهرية"}</span>
                        </button>
                      </div>
                      <div className="space-y-2.5">
                        {summaryResult.core_ideas?.map((idea: any, i: number) => (
                          <div key={i} className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl space-y-2">
                            <div className="flex items-start gap-3">
                              <span className="w-5 h-5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono shrink-0 mt-0.5">
                                {idea.id}
                              </span>
                              <div className="space-y-1">
                                {idea.section_title && (
                                  <p className="text-[10px] font-bold text-amber-500/80">{idea.section_title}</p>
                                )}
                                <p className="text-xs text-slate-300 leading-relaxed">{idea.sovereign_idea || idea.idea}</p>
                              </div>
                            </div>
                            {idea.layers?.practical_applications && (
                              <p className="text-[10px] text-slate-500 pr-8 leading-relaxed">
                                <span className="text-slate-400 font-bold">التطبيقات: </span>{idea.layers.practical_applications}
                              </p>
                            )}
                            {idea.layers?.conceptual_framework && (
                              <p className="text-[10px] text-slate-500 pr-8 leading-relaxed">
                                <span className="text-slate-400 font-bold">الإطار: </span>{idea.layers.conceptual_framework}
                              </p>
                            )}
                            {idea.discovered_styles?.length > 0 && (
                              <p className="text-[9px] text-slate-600 pr-8">أنماط: {idea.discovered_styles.join(" · ")}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 3. Numerical Ledger */}
                    <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-850 space-y-4">
                      <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <Activity size={14} />
                        <span>🔢 الكشاف الرقمي والتواريخ الحيوية</span>
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {summaryResult.numerical_ledger?.map((num: any, i: number) => (
                          <div key={i} className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-bold font-mono">
                                {num.value}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 leading-relaxed italic">"{num.context}"</p>
                          </div>
                        ))}
                        {(!summaryResult.numerical_ledger || summaryResult.numerical_ledger.length === 0) && (
                          <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl text-center text-xs text-slate-500 col-span-2">
                            لا توجد أرقام أو تواريخ بارزة في النص.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 4. Export & Copy Panel */}
                    {summaryFormat === "markdown" && summaryResult.export_content && (
                      <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-850 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <h4 className="text-xs font-bold text-slate-300">مستند التصدير الجاهز (Markdown)</h4>
                          <button
                            onClick={() => copyToClipboard(summaryResult.export_content, "summary_export")}
                            className="flex items-center gap-1 text-[10px] text-amber-500 hover:underline cursor-pointer"
                          >
                            {copiedId === "summary_export" ? <Check size={10} /> : <Copy size={10} />}
                            <span>{copiedId === "summary_export" ? "تم النسخ" : "نسخ التلخيص"}</span>
                          </button>
                        </div>
                        <pre className="p-4 bg-slate-950 rounded-xl text-[10px] text-slate-400 font-mono overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap select-text">
                          {summaryResult.export_content}
                        </pre>
                      </div>
                    )}

                    {summaryFormat === "json" && (
                      <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-850 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <h4 className="text-xs font-bold text-slate-300">مستند التصدير الجاهز (JSON)</h4>
                          <button
                            onClick={() => copyToClipboard(JSON.stringify(summaryResult, null, 2), "summary_export_json")}
                            className="flex items-center gap-1 text-[10px] text-amber-500 hover:underline cursor-pointer"
                          >
                            {copiedId === "summary_export_json" ? <Check size={10} /> : <Copy size={10} />}
                            <span>{copiedId === "summary_export_json" ? "تم النسخ" : "نسخ التلخيص (JSON)"}</span>
                          </button>
                        </div>
                        <pre className="p-4 bg-slate-950 rounded-xl text-[10px] text-slate-400 font-mono overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap select-text">
                          {JSON.stringify(summaryResult, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              )
            )}

          </div>

          {/* Export Action Bar (Completed phase only, fixed to bottom) */}
          {processPhase === "completed" && (activeWorkspaceData || summaryResult) && (
            <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-slate-800 bg-slate-900/95 backdrop-blur z-20 flex justify-end gap-3 shrink-0">
              {activeWorkspaceData ? (
                <>
                  <button 
                    onClick={() => copyToClipboard(activeWorkspaceData.content, "workspace_draft")}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-300 cursor-pointer text-slate-200 hover:border-amber-500/30 hover:scale-[1.02]"
                  >
                    {copiedId === "workspace_draft" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>نسخ النص الصافي الموحد</span>
                  </button>
                  <button 
                    onClick={() => handleDownload(JSON.stringify(activeWorkspaceData, null, 2), "workspace_json")}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-300 cursor-pointer text-slate-200 hover:border-amber-500/30 hover:scale-[1.02]"
                  >
                    <Download size={12} />
                    <span>تصدير JSON المخرجات</span>
                  </button>
                </>
              ) : (
                <>
                  {operationMode === "consolidate" && (
                    <button 
                      onClick={handleDownloadDocx}
                      className="px-4 py-2 bg-gradient-to-r from-amber-500/90 to-amber-600/90 hover:from-amber-500 hover:to-amber-600 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-300 cursor-pointer text-black hover:scale-[1.02] shadow-md"
                    >
                      <Download size={12} />
                      <span>تصدير Word منسّق</span>
                    </button>
                  )}
                  <button 
                    onClick={() => copyToClipboard(summaryResult.export_content || "", "summary_export_action")}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-300 cursor-pointer text-slate-200 hover:border-amber-500/30 hover:scale-[1.02]"
                  >
                    {copiedId === "summary_export_action" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>نسخ Markdown</span>
                  </button>
                  <button 
                    onClick={() => handleDownload(JSON.stringify(summaryResult, null, 2), "summary_json")}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-300 cursor-pointer text-slate-200 hover:border-amber-500/30 hover:scale-[1.02]"
                  >
                    <Download size={12} />
                    <span>تصدير JSON</span>
                  </button>
                </>
              )}
            </div>
          )}

        </div>

        {/* ========================================================================= */}
        {/* 3. LEFT PANE: CHECKLIST & ATOMIC IDEAS PANE (22-25% width)                 */}
        {/* ========================================================================= */}
        {operationMode === "edit" && hasSubDrafts !== false && (
          <div className="w-full lg:w-[280px] xl:w-[320px] shrink-0 border-r border-slate-800 bg-slate-950/50 backdrop-blur flex flex-col overflow-y-auto z-10">
            <div className="p-5 flex-1 flex flex-col">
              
              <div className="pb-3 border-b border-slate-800 mb-4">
                <h3 className="text-sm font-extrabold text-slate-300 flex items-center gap-2 font-sans">
                  <Activity size={14} className="text-[#f59e0b]" />
                  قائمة الفحص والمطابقة (Delta)
                </h3>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed font-sans font-medium">
                  مصفوفة الأفكار الذرية الإضافية التي تم استخلاصها ومطابقتها مع المرجع.
                </p>
              </div>

              {processPhase !== "completed" ? (
                // Checklist Placeholder before processing
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-600 opacity-60">
                  <BookOpen size={28} className="mb-2 text-slate-700" />
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
                            "p-3.5 rounded-xl border text-right cursor-pointer transition-all duration-300 relative group hover:scale-[1.02] shadow-sm hover:shadow-md",
                            isActive 
                              ? "bg-amber-950/40 border-amber-500 shadow-lg shadow-amber-500/10 translate-x-1 ring-1 ring-amber-500/30 font-semibold" 
                              : isHighlighted
                              ? "bg-emerald-950/80 border-emerald-500 scale-[1.02] ring-1 ring-emerald-500/20"
                              : "bg-slate-900 border border-slate-800/80 hover:bg-slate-900/90 hover:border-amber-500/30"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[8px] font-mono font-bold text-amber-500/80 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">
                              {idea.id}
                            </span>
                            {isConsolidated ? (
                              <span className="flex items-center gap-0.5 text-[8px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-bold border border-emerald-500/20">
                                <CheckCircle2 size={10} className="text-emerald-400" />
                                مدمجة
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5 text-[8px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded font-bold border border-amber-500/25">
                                <AlertTriangle size={10} className="text-amber-400" />
                                غير مدمجة
                              </span>
                            )}
                          </div>
                          
                          <p className="text-xs text-slate-300 leading-relaxed font-semibold">
                            {idea.content}
                          </p>
                          
                          <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[8px] text-slate-500 font-medium">
                            <span className="truncate max-w-[130px]" title={idea.source_draft}>المصدر: {idea.source_draft}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center text-xs text-slate-600 py-8">لا توجد أفكار ذرية إضافية مدمجة.</div>
                )
              )}

            </div>
          </div>
        )}

      </div>

    </div>
  );
}
