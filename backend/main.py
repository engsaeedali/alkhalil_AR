import os
import sys
import uuid
import logging
import json
from typing import List, Dict, Optional, Any, Tuple
from contextlib import asynccontextmanager

# 1. تثبيت مسارات النظام لضمان سلامة التجميع (Vercel & Local)
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware  
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, validator
import httpx

from utils.logger_config import setup_logger
from utils.token_meter import (
    estimate_tokens,
    extract_token_usage,
    extract_tokens_consumed,
    merge_usage_accumulator,
)
from processors.summarizer import ArabicExtractiveSummarizer
from processors.consolidation_engine import ConsolidationEngine, build_consolidation_export
from processors.docx_exporter import ConsolidationDocxExporter
from utils.summary_router import choose_summarizer_engine, get_engine_description, MIN_TEXT_FOR_LOCAL
from tenacity import retry, stop_after_attempt, wait_exponential
from langchain_openai import ChatOpenAI

# Safe loading of core modules to prevent startup crashes on serverless platforms
startup_error = None
app_graph = None
get_llm = None
DocumentProcessor = None

try:
    from agent.graph import app_graph
    from agent.helpers import get_llm
    from processors.document_processor import DocumentProcessor  
except Exception as e:
    import traceback
    startup_error = traceback.format_exc()

try:
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:
    ChatGoogleGenerativeAI = None

logger = setup_logger("main")

# فحص متغيرات البيئة الحيوية عند بدء التشغيل
required_env_vars = ["DEEPSEEK_API_KEY", "GOOGLE_API_KEY"]
missing_vars = [v for v in required_env_vars if not os.getenv(v)]
if missing_vars:
    logger.warning(f"⚠️ تننبيه - متغيرات البيئة التالية مفقودة من ملف الـ .env: {missing_vars}")

# إدارة دورة حياة التطبيق وعميل HTTPX المشترك
class AppState:
    http_client: Optional[httpx.AsyncClient] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    AppState.http_client = httpx.AsyncClient(timeout=15.0)
    yield
    if AppState.http_client:
        await AppState.http_client.aclose()

# تهيئة تطبيق مدونة الخليل مع التوثيق الكامل لـ OpenAPI
app = FastAPI(
    title="مدونة الخليل للتحرير اللغوي",
    description="مساعدك اللغوي لسبك الأفكار، دمج المسودات، والارتقاء بالمحتوى اللغوي بكفاءة بنائية و زمنية.",
    version="2.1.0",
    lifespan=lifespan
)

# دمج نظام ضغط الردود الضخمة لرفع كفاءة النقل عبر الشبكة
app.add_middleware(GZipMiddleware, minimum_size=1000)

# [MODIFY] 1. تقييد CORS الحازم لحماية النطاق السحابي في الإنتاج (ملاحظة 1)
ALLOWED_ORIGINS = [
    "https://alamalholol.com",
    "https://edit.alamalholol.com",
    "http://localhost:3000",  # لضمان استقرار بيئة التطوير المحلية لديك
    "http://127.0.0.1:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# [MODIFY] 2. نظام تتبع الحركة ومعرفات الطلبات الموحد (ملاحظة 4 و 7)
@app.middleware("http")
async def log_and_track_requests(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    
    # تسجيل دخول الطلب فصيحاً بالـ Path
    logger.info(f"➡️ طلب وارد: [{request.method}] على المسار {request.url.path} | المعرف: {request_id}")
    
    response = await call_next(request)
    
    # تسجيل خروج الاستجابة بالـ Status Code
    logger.info(f"⬅️ استجابة صادرة: [{response.status_code}] للمسار {request.url.path} | المعرف: {request_id}")
    response.headers["X-Request-ID"] = request_id
    return response

# معالج الاستثناءات العام الفصيح
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    req_id = getattr(request.state, "request_id", "N/A")
    logger.error(f"🚨 خطأ فادح في نظام المعالجة [{req_id}]: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"عذراً، حدث خطأ داخلي غير متوقع في محرك المعالجة. المعرف الفني للطلب: {req_id}"}
    )

# --- نماذج الاستجابة والتحقق من صحة البيانات مسبقاً ---
class KhalilResponse(BaseModel):
    manuscript: str = Field(..., description="النص النهائي الذي تمت صياغته وتهذيبه بلاغياً")
    editor_notes: List[str] = Field(default=[], description="ملحوظات التدقيق اللغوي والرقابة الدلالية")
    metric_scores: Dict[str, Any] = Field(default={}, description="مؤشرات الجودة والسبك البنائي")
    violations: List[str] = Field(default=[], description="مخالفات السياق المحصورة")
    token_usage: Dict[str, Any] = Field(default={}, description="معدل استهلاك الطاقة والتوكنات للمحرك")
    master_draft_structured: List[Dict[str, Any]] = Field(default=[], description="البنية التحتية للمخطوطة المجمعة")
    atomic_ideas: List[Dict[str, Any]] = Field(default=[], description="حالة مصفوفة الأفكار الذرية (Delta)")
    validation_report: Dict[str, Any] = Field(default={}, description="تقرير المطابقة النهائي")
    status: str = "completed"

class ChatRequest(BaseModel):
    message: str = Field(..., description="النص المراد إرساله للمحادثة اللغوية الفورية")
    
    @validator('message')
    def validate_message(cls, v):
        if not v.strip():
            raise ValueError("عذراً، لا يمكن معالجة أو سبك نص فارغ")
        return v

class MergeRequest(BaseModel):
    drafts: List[Dict[str, str]] = Field(..., description="قائمة المخطوطات والمسودات الفرعية المودعة")
    primary_draft_title: str = Field(..., description="عنوان النص المرجعي الأساسي")
    style: str = Field(..., description="الأسلوب البلاغي واللغوي المستهدف")
    target_word_count: Optional[int] = None
    provider: Optional[str] = None
    custom_intent: Optional[str] = None

    @validator('drafts')
    def validate_drafts(cls, v):
        if not v or len(v) == 0:
            raise ValueError("قائمة المسودات فارغة، يرجى إيداع مستند فرعي واحد على الأفتراض")
        return v

    @validator('primary_draft_title')
    def validate_primary_title(cls, v):
        if not v.strip():
            raise ValueError("يجب تحديد عنوان المخطوطة المرجعية الأساسية لبدء الفحص")
        return v

class PreflightRequest(BaseModel):
    provider: str

class SummaryRequest(BaseModel):
    text: str = Field(..., description="النص أو المخطوطة المراد تلخيصها")
    user_tier: Optional[str] = Field("free", description="نوع المستخدم: free أو premium")
    ratio: Optional[float] = Field(0.3, description="نسبة الاختصار للمحرك المحلي")
    format: Optional[str] = Field("json", description="صيغة التصدير: json أو markdown")
    force_engine: Optional[str] = Field(None, description="فرض محرك معين للاختبارات")

    @validator('text')
    def validate_text(cls, v):
        if not v or not v.strip():
            raise ValueError("عذراً، لا يمكن معالجة أو تلخيص نص فارغ.")
        return v.strip()

    @validator('format')
    def validate_format(cls, v):
        if v not in ["json", "markdown"]:
            raise ValueError(f"الصيغة {v} غير مدعومة برمجياً. استخدم json أو markdown")
        return v

class PeakExtractionRequest(BaseModel):
    text: str = Field(..., description="النص أو المخطوطة المراد تفكيكها")
    format: Optional[str] = Field("json", description="صيغة التصدير: json أو markdown")
    
    @validator('format')
    def validate_format(cls, v):
        if v not in ["json", "markdown"]:
            raise ValueError(f"الصيغة {v} غير مدعومة. استخدم json أو markdown")
        return v

class ConsolidateRequest(BaseModel):
    text: str = Field(..., description="المخطوطة الفوضوية أو JSON Docx")
    reference_json: Optional[str] = Field(None, description="ملف الأصل المرجعي (JSON) اختياري")
    format: Optional[str] = Field("json", description="json أو markdown")
    force_engine: Optional[str] = Field("deepseek", description="deepseek | gemini")
    custom_intent: Optional[str] = Field(None, description="توجيه مخصص للصهر")

    @validator('text')
    def validate_text(cls, v):
        if not v or not v.strip():
            raise ValueError("عذراً، لا يمكن صهر مخطوطة فارغة.")
        return v.strip()

    @validator('format')
    def validate_format(cls, v):
        if v not in ["json", "markdown"]:
            raise ValueError(f"الصيغة {v} غير مدعومة. استخدم json أو markdown")
        return v

class DocxExportRequest(BaseModel):
    discovered_structure: Dict[str, Any] = Field(..., description="هيكل discovered_structure من /consolidate")
    title: Optional[str] = Field("جوهر المخطوطة — مدونة الخليل", description="عنوان المستند")
    source_filename: Optional[str] = Field(None, description="اسم الملف المصدر")

    @validator('discovered_structure')
    def validate_structure(cls, v):
        if not v or not isinstance(v, dict):
            raise ValueError("هيكل المخرجات فارغ أو غير صالح.")
        if not v.get("core_ideas") and not v.get("export_content"):
            raise ValueError("لا توجد بطاقات معرفية للتصدير.")
        return v

# دالة فحص أحجام المستندات المرفوعة
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 ميجابايت

async def validate_uploaded_file(file: UploadFile) -> bytes:
    if not DocumentProcessor:
        raise HTTPException(status_code=503, detail="معالج المستندات غير متوفر حالياً.")
    filename = file.filename or "document"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in DocumentProcessor.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"صيغة الملف غير مدعومة. {DocumentProcessor.allowed_formats_message()}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="المخطوطة المرفوعة ضخمة جداً، الحد الأقصى المسموح به هو 20 ميجابايت.",
        )
    return content

# دالة بناء حالة البداية لوكيل LangGraph
def create_initial_state(text: str = "", drafts: Optional[List[Dict[str, str]]] = None, **kwargs) -> dict:
    base_state = {
        "input_text": text,
        "current_text": text,
        "manuscript": "",
        "editor_notes": [],
        "revision_count": 0,
        "status": "processing",
        "memory_context": [],
        "violations": [],
        "metric_scores": {},
        "max_attempts": kwargs.get("max_attempts", 1),  
        "reconstruction_attempts": 0,
        "current_phase": "Master Draft"
    }
    if drafts is not None:
        base_state.update({
            "drafts": drafts,
            "primary_draft_title": kwargs.get("primary_draft_title", ""),
            "style": kwargs.get("style", "أدبي"),
            "model_provider": kwargs.get("provider"),  
            "custom_intent": kwargs.get("custom_intent")
        })
    return base_state

# [MODIFY] 3. دالة مركزة المخرجات الموحدة لـ DRY الكود تماماً (ملاحظة 3)
def build_khalil_response(result: dict) -> dict:
    return {
        "manuscript": result.get("manuscript", ""),
        "editor_notes": result.get("editor_notes", []),
        "metric_scores": result.get("metric_scores", {}),
        "violations": result.get("violations", []),
        "token_usage": result.get("token_usage", {}),
        "master_draft_structured": result.get("master_draft_structured", []),
        "atomic_ideas": result.get("atomic_ideas", []),
        "validation_report": result.get("validation_report", {}),
        "status": "completed"
    }

def chunk_text(text: str, max_chunk_size: int = 8000) -> List[str]:
    """تقسيم النصوص والكتب الطويلة جداً إلى أجزاء متساوية لمنع الهلوسة وانفجار الذاكرة"""
    words = text.split()
    chunks = []
    for i in range(0, len(words), max_chunk_size):
        chunks.append(" ".join(words[i:i + max_chunk_size]))
    return chunks

def get_llm_client(engine: str, max_tokens: Optional[int] = None):
    """تهيئة محركات الذكاء الاصطناعي بناءً على مفاتيح البيئة المحلية"""
    llm_kwargs = {"temperature": 0.0}
    if max_tokens is not None:
        llm_kwargs["max_tokens"] = max_tokens

    if engine == "deepseek":
        return ChatOpenAI(
            openai_api_key=os.getenv("DEEPSEEK_API_KEY"),
            openai_api_base="https://api.deepseek.com/v1",
            model_name="deepseek-chat",
            **llm_kwargs,
        )
    elif engine == "gemini":
        if not ChatGoogleGenerativeAI:
            raise HTTPException(status_code=422, detail="حزمة الاتصال بمحرك Gemini غير مثبتة أو مهيأة في السيرفر حالياً.")
        gemini_kwargs = dict(llm_kwargs)
        if max_tokens is not None:
            gemini_kwargs["max_output_tokens"] = max_tokens
            gemini_kwargs.pop("max_tokens", None)
        return ChatGoogleGenerativeAI(
            google_api_key=os.getenv("GOOGLE_API_KEY"),
            model="gemini-1.5-flash",
            **gemini_kwargs,
        )
    elif engine == "openai":
        raise ValueError("محرك OpenAI GPT-4o مُشطب من المنصة v4.2 — استخدم deepseek أو gemini.")
    else:
        raise ValueError(f"المحرك {engine} غير مدعوم سحابياً. المحركات المعتمدة: deepseek، gemini.")

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def invoke_llm_with_retry(llm, prompt):
    """شبكة حماية وإعادة محاولة تلقائية في حال تذبذب اتصال الشبكة المحلية أو الخادم"""
    return llm.invoke(prompt)


def _parse_summary_llm_json(content: str) -> Dict[str, Any]:
    clean = content.strip().replace("```json", "").replace("```", "").strip()
    return json.loads(clean)


def _summary_schema_rules(max_ideas: int) -> str:
    return f"""
        1. استخرج أهم {max_ideas} أفكار جوهرية يرتكز عليها النص. صغ كل فكرة في جملة خبرية وافية المعنى تفهم بمفردها وتطابق لغة العرب الفصحى. يُمنع استخراج عناوين جانية أو جمل مبتورة.
        2. احصر كافة الأرقام، النسب المئوية، الميزانيات، أو التواريخ الحيوية واربط القيمة بسياقها التاريخي أو المالي الفعلي بدقة (افصل الحقلين تماماً).
        3. استخرج أهم 7 كلمات مفتاحية تمثل الكشاف المعجمي الفعلي للنص. يُمنع منعاً باتاً استخراج أدوات الربط أو النفي مثل ("لا"، "بل"، "ما"، "على")، بل استخرج مصطلحات سيادية من صلب الموضوع.
        4. المخرج الوحيد المسموح به هو كائن JSON صالح تماماً مطابق للهيكل أدناه، بدون أي مقدمات أو هوامش تفاعلية زائدة.

        OUTPUT_SCHEMA:
        {{
            "core_ideas": [ {{ "id": 1, "idea": "نص الجملة الخبرية البليغة الكاملة" }} ],
            "numerical_ledger": [ {{ "value": "الرقم أو التاريخ"، "context": "السياق الدلالي الدقيق للرقم" }} ],
            "sovereign_keywords": ["مصطلح1", "مصطلح2"]
        }}"""


def _summarize_semantic_chunks(text: str) -> List[str]:
    """تجزئة دلالية عبر Parser — تغطية كاملة دون قص [:30000]."""
    from processors.json_document_parser import build_semantic_clusters

    clusters, _, _ = build_semantic_clusters(text, None)
    chunks = [c.combined_text.strip() for c in clusters if c.combined_text and c.combined_text.strip()]
    return chunks if chunks else [text]


def _summarize_text_map_reduce(
    llm,
    full_text: str,
    text_chunks: List[str],
    max_ideas: int,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Map-Reduce: كل جزء يُعالج كاملاً — يُمنع قص النص عند [:30000].
    """
    usage_acc: Dict[str, Any] = {
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "llm_calls": 0,
        "estimated": False,
    }

    if len(text_chunks) == 1:
        prompt = f"""
        أنت "المستخلص اللغوي الدلالي v3.6" لـ "مدونة الخليل للتحرير اللغوي".
        مهمتك الحصرية هي تفكيك النص واستخراج جوهره الفكري والرقمي وصياغته بأسلوب خبري بليغ ومكتمل الأركان النحوية.

        قواعد الإنتاج الصارمة (Strict Operational Rules):
        {_summary_schema_rules(max_ideas)}

        النص المراد معالجته دلالياً:
        ---
        {text_chunks[0]}
        ---
        """
        response = invoke_llm_with_retry(llm, prompt)
        chunk_usage = extract_token_usage(
            response,
            prompt_text=prompt,
            completion_text=getattr(response, "content", "") or "",
        )
        merge_usage_accumulator(usage_acc, chunk_usage)
        parsed = _parse_summary_llm_json(response.content)
        return parsed, usage_acc

    per_chunk_ideas = max(3, min(10, (max_ideas // len(text_chunks)) + 2))
    partials: List[Dict[str, Any]] = []

    for idx, chunk in enumerate(text_chunks):
        map_prompt = f"""
        أنت "المستخلص اللغوي الدلالي v3.6" لـ "مدونة الخليل للتحرير اللغوي".
        أمامك الجزء {idx + 1} من {len(text_chunks)} لمخطوطة طويلة — عالج هذا الجزء فقط دون افتراض ما في الأجزاء الأخرى.

        قواعد الإنتاج الصارمة:
        {_summary_schema_rules(per_chunk_ideas)}

        النص (الجزء {idx + 1}/{len(text_chunks)}):
        ---
        {chunk}
        ---
        """
        response = invoke_llm_with_retry(llm, map_prompt)
        chunk_usage = extract_token_usage(
            response,
            prompt_text=map_prompt,
            completion_text=getattr(response, "content", "") or "",
        )
        merge_usage_accumulator(usage_acc, chunk_usage)
        partials.append(_parse_summary_llm_json(response.content))

    reduce_prompt = f"""
    أنت "مجمّع التلخيص الدلالي v3.6" لـ "مدونة الخليل للتحرير اللغوي".
    أمامك {len(partials)} مخرجات JSON جزئية من أجزاء متتابعة لنفس المخطوطة (Map-Reduce).
    دمجها في مخرج واحد متسق: أزل التكرار، واحفظ التنوع، ولا تسقط محاور أو أفكار ظهرت في الأجزاء المتأخرة.

    قواعد الدمج:
    {_summary_schema_rules(max_ideas)}
    5. رقّم core_ideas من 1 إلى {max_ideas} بلا فجوات.
    6. numerical_ledger: دمج بدون تكرار value.
    7. sovereign_keywords: أفضل 7 مصطلحات فريدة من كل الأجزاء.

    المخرجات الجزئية:
    ---
    {json.dumps(partials, ensure_ascii=False)}
    ---
    """
    response = invoke_llm_with_retry(llm, reduce_prompt)
    reduce_usage = extract_token_usage(
        response,
        prompt_text=reduce_prompt,
        completion_text=getattr(response, "content", "") or "",
    )
    merge_usage_accumulator(usage_acc, reduce_usage)
    parsed = _parse_summary_llm_json(response.content)
    return parsed, usage_acc

def build_khalil_summary_response(
    core_ideas: List[Dict],
    numerical_ledger: List[Dict],
    sovereign_keywords: List[str],
    metadata: Dict,
    output_format: str = "json"
) -> Dict:
    """القناة المركزية الموحدة لبناء الهيكل المعرفي المحدث ديناميكياً"""
    extracted_count = metadata.get("ideas_extracted", 5)
    
    response = {
        "summary_analytics": {
            "core_ideas": core_ideas[:extracted_count],
            "numerical_ledger": numerical_ledger[:15],
            "sovereign_keywords": sovereign_keywords[:7],
            "export_content": None,
            "_metadata": metadata
        }
    }

    ideas_lines = [f"{idea['id']}. {idea['idea']}" for idea in core_ideas[:extracted_count]]
    numbers_lines = [f"- **{item['value']}**: {item['context']}" for item in numerical_ledger[:15]]
    
    response["summary_analytics"]["export_content"] = f"""# جَوْهَر المخطوطة — مدونة الخليل الفصيحة

## 💡 الأفكار الجوهرية المعرفية
{"\n".join(ideas_lines) if ideas_lines else '- تعذر استخلاص أفكار متكاملة.'}

## 🔢 الكشاف الرقمي والتواريخ السياقية
{"\n".join(numbers_lines) if numbers_lines else '- لا توجد أرقام حيوية بارزة في النص.'}

## 📌 الكلمات المفتاحية السيادية
{', '.join(sovereign_keywords) if sovereign_keywords else '- لا توجد'}

---
*المحرك السيادي التشغيلي: {metadata.get('engine_description', 'unknown')}*
*الوضع التشغيلي للتثبيت: بيئة التطوير المحلية (Local Machine)*
*تكلفة التوكنات الخارجية: {metadata.get('tokens_consumed', 0)}*
"""
    return response

def build_khalil_response_summary(
    core_ideas: List[Dict],
    numerical_ledger: List[Dict],
    sovereign_keywords: List[str],
    metadata: Dict,
    output_format: str = "json",
    max_ideas: Optional[int] = None
) -> Dict:
    """القناة المركزية الموحدة لتهيئة مخرجات مدونة الخليل شاشات الـ UI"""
    sliced_ideas = core_ideas[:max_ideas] if max_ideas is not None else core_ideas
    response = {
        "summary_analytics": {
            "core_ideas": sliced_ideas,
            "numerical_ledger": numerical_ledger[:15],
            "sovereign_keywords": sovereign_keywords[:10] if sovereign_keywords else ["لا توجد كلمات كافية"],
            "export_content": None,
            "_metadata": metadata
        }
    }

    if output_format == "markdown":
        ideas_lines = [f"{idea['id']}. {idea['idea']}" for idea in sliced_ideas]
        numbers_lines = [f"- **{item['value']}**: {item['context']}" for item in numerical_ledger[:15]]
        
        response["summary_analytics"]["export_content"] = f"""# مستخلص الذروة الدلالية - مدونة الخليل

## 💡 الأفكار الجوهرية
{"\n".join(ideas_lines) if ideas_lines else 'لا توجد أفكار كافية'}

## 🔢 الكشاف الرقمي والتواريخ
{"\n".join(numbers_lines) if numbers_lines else '- لا توجد أرقام بارزة'}

## 📌 الكلمات المفتاحية السيادية
{', '.join(sovereign_keywords[:5]) if sovereign_keywords else 'لا توجد'}

---
*المحرك المستخدم محلياً: {metadata.get('engine', 'unknown')}*
*تكلفة التوكنات الخارجية: {metadata.get('tokens_consumed', 0)}*
"""
    return response


# --- القنوات والمنافذ التنفيذية الحية للمدونة (Endpoints) ---

@app.post("/chat", summary="المحادثة اللغوية الفورية الفصيحة", response_model=KhalilResponse)
async def chat(request: ChatRequest):
    initial_state = create_initial_state(text=request.message)
    try:  
        if not app_graph or startup_error:
            raise HTTPException(status_code=503, detail="عذراً، الخدمة غير متوفرة حالياً بسبب فشل في تهيئة النظام الداخلي.")
        result = await app_graph.ainvoke(initial_state)
    except Exception as e:
        logger.error(f"فشل استدعاء دالة المحادثة في الـ Graph: {str(e)}")
        raise HTTPException(status_code=500, detail="عذراً، فشل المحرك اللغوي في معالجة طلبك الفوري، يرجى المحاولة لاحقاً.")
        
    return build_khalil_response(result)

@app.post("/extract-text", summary="استخراج النص من المسودة المرفوعة")
async def extract_text(file: UploadFile = File(...)):
    content = await validate_uploaded_file(file)
    try:
        extracted_text, source_type = DocumentProcessor.extract_text(
            content, file.filename or "document.docx"
        )
        return {
            "text": extracted_text,
            "filename": file.filename,
            "format": source_type,
            "extension": os.path.splitext(file.filename or "")[1].lower(),
            "size": len(content),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"خلل بنيوي أثناء قراءة ملف الوثيقة: {str(e)}")
        raise HTTPException(status_code=500, detail=f"تعذر استخراج النص: {str(e)}")

@app.post("/preflight-check", summary="فحص جاهزية ونبض المحرك الذكي قبل الإرسال")
async def preflight_check(
    request: PreflightRequest, 
    http_client: httpx.AsyncClient = Depends(lambda: AppState.http_client) 
):
    provider = request.provider.strip().lower()
    
    try:
        llm, model_name = get_llm(provider)
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"فشل تهيئة واستدعاء دوال المحرك [{provider}]: {error_trace}")
        return {
            "status": "error", 
            "message": "عذراً، تعذرت تهيئة المحرك الذكي المختار لخلل داخلي في الملفات.",
            "traceback": error_trace
        }
        
    if provider == "deepseek":
        ds_key = os.getenv("DEEPSEEK_API_KEY")
        if not ds_key:
            return {"status": "error", "message": "تنبيه: تهيئة خادم المساعد المختار غير مكتملة، يرجى تفقّد مفاتيح التهيئة."}
        try:
            response = await http_client.get(
                "https://api.deepseek.com/user/balance", 
                headers={"Authorization": f"Bearer {ds_key}"}
            )
            if response.status_code == 200:
                data = response.json()
                is_available = data.get("is_available", True) if "is_available" in data else float(data.get("total_balance", 0)) > 0
                if is_available:
                    await llm.ainvoke("مرحبا")
                    return {"status": "ready", "message": "تم التحقق من جاهزية الخليل بنجاح والمحرك مستقر"}
                else:
                    return {"status": "error", "message": "اتصال المساعد الذكي نشط ولكن الرصيد الحالي غير كافٍ لإتمام عملية السبك."}
            elif response.status_code == 402:
                return {"status": "error", "message": "رصيد حساب المساعد الذكي لا يسمح بمعالجة النصوص حالياً."}
            else:
                return {"status": "error", "message": f"استجابة غير متوقعة من خادم المساعد المختار (رمز الفشل {response.status_code})."}
        except Exception as e:
            logger.error(f"فشل الاتصال الخارجي بـ DeepSeek API: {str(e)}")
            return {"status": "error", "message": "تعذر تأمين الاتصال بالمحرر الذكي؛ يرجى التحقق من استقرار الشبكة."}
            
    elif provider == "gemini":
        g_key = os.getenv("GOOGLE_API_KEY")
        if not g_key:
            return {"status": "error", "message": "تنبيه: تهيئة خادم المساعد المختار غير مكتملة، يرجى تفقّد مفاتيح التهيئة."}
        if not ChatGoogleGenerativeAI:
            return {"status": "error", "message": "مكتبة المعالجة الأساسية الموجهة لـ لغة الضاد غير متوفرة في الخلفية."}
        try:
            # استخدام محرك سريع وبدون إعادة محاولة للتأكد الفوري من المفتاح
            check_llm = ChatGoogleGenerativeAI(
                model="gemini-2.5-flash", 
                google_api_key=g_key,
                max_retries=0
            )
            await check_llm.ainvoke("مرحبا")
            return {"status": "ready", "message": "تم التحقق من جاهزية الخليل بنجاح والمحرك مستقر"}
        except Exception as e:
            logger.error(f"فشل استدعاء نموذج Gemini الـ API: {str(e)}")
            return {"status": "error", "message": "تعذر تأمين الاتصال بالمحرر الذكي؛ يرجى التحقق من استقرار الشبكة."}
    else:
        return {"status": "error", "message": "المحرر الذكي المختار غير مدرج بالمكتبة، يرجى تحديد اختيار معتمد."}

@app.post("/merge-drafts", summary="سبك الأفكار ودمج المسودات المودعة المتعددة", response_model=KhalilResponse)
async def merge_drafts(request: MergeRequest):
    initial_state = create_initial_state(
        drafts=request.drafts,
        primary_draft_title=request.primary_draft_title,
        style=request.style,
        provider=request.provider,
        custom_intent=request.custom_intent
    )
    
    try:  
        if not app_graph or startup_error:
            raise HTTPException(status_code=503, detail="عذراً، الخدمة غير متوفرة حالياً بسبب فشل في تهيئة النظام الداخلي.")
        result = await app_graph.ainvoke(initial_state)
    except Exception as e:
        logger.error(f"فشل محرك التوجيه الدلالي أثناء سبك ودمج النصوص: {str(e)}")
        raise HTTPException(status_code=500, detail="تعذرت صياغة المخطوطة الكلية؛ فشل النظام في توليف المسودات الممررة.")
        
    return build_khalil_response(result)

@app.post("/upload", summary="تهذيب ومراجعة نص الوثيقة المرفوعة فوراً", response_model=KhalilResponse)
async def upload_document(file: UploadFile = File(...)):
    content = await validate_uploaded_file(file)
    extracted_text, _ = DocumentProcessor.extract_text(content, file.filename or "document.docx")

    if not extracted_text.strip():
        raise HTTPException(status_code=400, detail="تعذر استخراج النص المرجعي؛ المستند المرفوع فارغ تماماً.")

    initial_state = create_initial_state(text=extracted_text)
    
    try:  
        if not app_graph or startup_error:
            raise HTTPException(status_code=503, detail="عذراً، الخدمة غير متوفرة حالياً بسبب فشل في تهيئة النظام الداخلي.")
        result = await app_graph.ainvoke(initial_state)
    except Exception as e:
        logger.error(f"فشل معالجة المخطوطة المرفوعة في الـ Graph: {str(e)}")
        raise HTTPException(status_code=500, detail="تعذر إتمام عملية التهذيب؛ فشل المحرك الدلالي في استقراء بنية الملف.")
        
    return build_khalil_response(result)

@app.post("/summarize", summary="بوابة استخراج الجوهر اللغوي المطور", response_class=JSONResponse)
async def summarize(request: SummaryRequest):
    text_length = len(request.text)
    
    engine = choose_summarizer_engine(
        user_tier=request.user_tier,
        text_length=text_length,
        text=request.text,
        force_engine=request.force_engine
    )
    engine_info = get_engine_description(engine)
    logger.info(f"🎯 إطلاق المحرك السيادي المختار: {engine_info['name']}")

    # معالجة النصوص القصيرة جداً محلياً تلافياً لهدر الموارد والوقت
    if engine == "local_hybrid":
        summary_result = ArabicExtractiveSummarizer.summarize(text=request.text, compression_ratio=request.ratio)
        keywords = ArabicExtractiveSummarizer.extract_keywords(request.text, top_k=5)
        numerical_ledger = ArabicExtractiveSummarizer.extract_numbers(request.text)
        
        raw_summary = summary_result.get("summary", "")
        sentences = [s.strip() for s in raw_summary.split(".") if len(s.strip()) > 15]
        core_ideas = [{"id": i + 1, "idea": sent} for i, sent in enumerate(sentences[:5])]
        
        metadata = {
            "processing_tier": "extractive_hybrid_free",
            "engine": engine,
            "engine_description": engine_info["name"],
            "tokens_consumed": 0,
            "original_sentences": summary_result["_metadata"].get("original_sentences", 0),
            "ideas_extracted": len(core_ideas)
        }
        return JSONResponse(status_code=200, content=build_khalil_summary_response(core_ideas, numerical_ledger, keywords, metadata, request.format))

    # المعالجة الدلالية الفصيحة للكتب والمخطوطات عبر الـ LLMs
    max_ideas = 20 if text_length > 15000 else 5
    
    try:
        llm = get_llm_client(engine)

        text_chunks = _summarize_semantic_chunks(request.text)
        parsed_data, usage = _summarize_text_map_reduce(
            llm, request.text, text_chunks, max_ideas
        )
        tokens_consumed = usage["total_tokens"]
        
        # حساب عدد الجمل الأصلية بدقة تامة باستخدام مقسم الجمل المحلي
        raw_paragraphs = [p.strip() for p in request.text.split('\n') if len(p.strip()) > 30]
        if not raw_paragraphs:
            raw_paragraphs = [request.text.strip()]
        all_sentences = []
        for para in raw_paragraphs:
            sents = ArabicExtractiveSummarizer._split_sentences(para)
            all_sentences.extend(sents)
        original_sentences_count = len(all_sentences)
        
        metadata = {
            "processing_tier": "llm_generative_premium",
            "engine": engine,
            "engine_description": engine_info["name"],
            "tokens_consumed": tokens_consumed,
            "token_usage": usage,
            "original_sentences": original_sentences_count,
            "ideas_extracted": len(parsed_data.get("core_ideas", [])),
            "numbers_extracted": len(parsed_data.get("numerical_ledger", [])),
            "text_characters": text_length,
            "chunks_processed": len(text_chunks),
            "map_reduce": len(text_chunks) > 1,
            "clustering": "semantic_parser_v4.2",
        }
        
        final_response = build_khalil_summary_response(
            core_ideas=parsed_data.get("core_ideas", []),
            numerical_ledger=parsed_data.get("numerical_ledger", []),
            sovereign_keywords=parsed_data.get("sovereign_keywords", []),
            metadata=metadata,
            output_format=request.format
        )
        return JSONResponse(status_code=200, content=final_response)

    except Exception as e:
        logger.error(f"⚠️ فشل عبور الطلب عبر المحرك السحابي [{engine}]: {str(e)}")
        raise HTTPException(status_code=502, detail=f"فشل المحرك الذكي في صياغة الجوهر. السبب: {str(e)}")

@app.post("/consolidate", summary="بوابة الصهر الديناميكي وعكس الهندسة الدلالية v4.0", response_class=JSONResponse)
async def consolidate(request: ConsolidateRequest):
    """مسار مستقل: تفكيك الفوضى البنائية داخل الوثيقة وصهرها إلى بطاقات سيادية."""
    engine = request.force_engine or "deepseek"
    if engine == "local_hybrid" or engine == "openai":
        engine = "deepseek"
    if engine not in ("deepseek", "gemini"):
        raise HTTPException(status_code=422, detail="محرك الصهر v4.2 يقتصر على DeepSeek-V3 أو Gemini Flash.")

    reference_payload = None
    if request.reference_json and request.reference_json.strip():
        try:
            reference_payload = json.loads(request.reference_json)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=422, detail=f"ملف الأصل JSON غير صالح: {exc}")

    if not reference_payload:
        raise HTTPException(
            status_code=422,
            detail=(
                "مسار الصهر v4.0 يتطلب رفع ملف الأصل JSON (منهجية المحاور السبعة). "
                "بدونه يُنشئ النظام عناقيد زائفة ويستهلك توكنات بلا مخرجات."
            ),
        )

    tokens_holder: Dict[str, Any] = {
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "llm_calls": 0,
        "estimated": False,
    }

    def llm_invoke(prompt: str):
        llm = get_llm_client(engine, max_tokens=8192)
        return invoke_llm_with_retry(llm, prompt)

    engine_labels = {
        "deepseek": "deepseek_v3",
        "gemini": "gemini_flash",
    }

    try:
        consolidation = ConsolidationEngine(
            llm_invoke=llm_invoke,
            usage_accumulator=tokens_holder,
        )
        result = consolidation.run(
            text=request.text,
            reference_json=reference_payload,
            custom_intent=request.custom_intent,
            engine_name=engine_labels.get(engine, engine),
        )
        discovered = result["discovered_structure"]

        if not discovered.get("core_ideas"):
            raise HTTPException(
                status_code=502,
                detail="فشل استخلاص البطاقات المعرفية. تحقق من ملف الأصل ومن اتصال المحرك.",
            )

        token_usage = {
            "input_tokens": tokens_holder["input_tokens"],
            "output_tokens": tokens_holder["output_tokens"],
            "total_tokens": tokens_holder["total_tokens"],
            "llm_calls": tokens_holder["llm_calls"],
            "estimated": tokens_holder.get("estimated", False),
        }
        discovered["_metadata"]["tokens_consumed"] = token_usage["total_tokens"]
        discovered["_metadata"]["token_usage"] = token_usage
        discovered["_metadata"]["engine_description"] = get_engine_description(engine)["name"]
        discovered["export_content"] = build_consolidation_export(discovered)

        payload = {
            "status": "completed",
            "token_usage": token_usage,
            "discovered_structure": discovered,
            "summary_analytics": discovered,
        }
        return JSONResponse(status_code=200, content=payload)

    except HTTPException:
        raise
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"فشل تحليل JSON من المحرك: {exc}")
    except Exception as exc:
        logger.error(f"⚠️ فشل مسار الصهر الديناميكي [{engine}]: {exc}")
        raise HTTPException(status_code=502, detail=f"فشل الصهر الديناميكي. السبب: {exc}")

@app.post("/export/docx", summary="تصدير نتائج الصهر إلى Word منسّق (RTL)")
async def export_consolidation_docx(request: DocxExportRequest):
    """تحويل discovered_structure إلى مستند .docx جاهز للطباعة والمشاركة."""
    try:
        docx_bytes = ConsolidationDocxExporter.build(
            discovered_structure=request.discovered_structure,
            title=request.title or "جوهر المخطوطة — مدونة الخليل",
            source_filename=request.source_filename,
        )
        from datetime import datetime
        stamp = datetime.now().strftime("%Y%m%d_%H%M")
        filename = f"khalil_consolidation_{stamp}.docx"
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(docx_bytes)),
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error(f"فشل تصدير DOCX: {exc}")
        raise HTTPException(status_code=500, detail=f"تعذر إنشاء مستند Word: {exc}")

@app.get("/health", summary="فحص صحة واستقرار الخدمة الشامل (Health Check)") 
async def health_check():
    return {
        "status": "healthy",
        "components": {
            "api_engine": "up",
            "version": "2.1.0",
            "deepseek_integration": bool(os.getenv("DEEPSEEK_API_KEY")),
            "gemini_integration": bool(os.getenv("GOOGLE_API_KEY"))
        }
    }

@app.get("/", summary="مؤشر الجاهزية البنائي المباشر لمدونة الخليل")
async def root():
    if startup_error:
        return {
            "status": "error",
            "message": "عطل في تهيئة مكتبات محرك الخليل",
            "traceback": startup_error
        }
    return {
        "message": "مدونة الخليل للتحرير اللغوي تعمل بنجاح وبكامل استقرارها السيادي العربي.",
        "status": "active",
        "version": "2.1.0"
    }
