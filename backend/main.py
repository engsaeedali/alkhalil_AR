import os
import sys
import uuid
import logging
from typing import List, Dict, Optional, Any
from contextlib import asynccontextmanager

# 1. تثبيت مسارات النظام لضمان سلامة التجميع (Vercel & Local)
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware  
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
import httpx

from agent.graph import app_graph
from agent.helpers import get_llm
from utils.logger_config import setup_logger
from processors.document_processor import DocumentProcessor  

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
    "http://localhost:3000"  # لضمان استقرار بيئة التطوير المحلية لديك
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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

# دالة فحص أحجام المستندات المرفوعة
ALLOWED_EXTENSIONS = {".docx"}
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 ميجابايت

async def validate_uploaded_file(file: UploadFile) -> bytes:
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="عذراً، لا يتم قبول سوى الوثائق والمخطوطات بصيغة .docx فقط.")
    
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="المخطوطة المرفوعة ضخمة جداً، الحد الأقصى المسموح به هو 15 ميجابايت.")
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


# --- القنوات والمنافذ التنفيذية الحية للمدونة (Endpoints) ---

@app.post("/chat", summary="المحادثة اللغوية الفورية الفصيحة", response_model=KhalilResponse)
async def chat(request: ChatRequest):
    initial_state = create_initial_state(text=request.message)
    try:  
        result = await app_graph.ainvoke(initial_state)
    except Exception as e:
        logger.error(f"فشل استدعاء دالة المحادثة في الـ Graph: {str(e)}")
        raise HTTPException(status_code=500, detail="عذراً، فشل المحرك اللغوي في معالجة طلبك الفوري، يرجى المحاولة لاحقاً.")
        
    return build_khalil_response(result)

@app.post("/extract-text", summary="استخراج النص من المسودة المرفوعة")
async def extract_text(file: UploadFile = File(...)):
    content = await validate_uploaded_file(file)
    try:
        extracted_text = DocumentProcessor.extract_text_from_docx(content)
        return {
            "text": extracted_text,
            "filename": file.filename,
            "size": len(content)
        }
    except Exception as e:
        logger.error(f"خلل بنيوي أثناء قراءة ملف الوثيقة: {str(e)}")
        raise HTTPException(status_code=500, detail="تعذر استخراج النص اللغوي؛ بنية المستند المرفوع تالفة.")

@app.post("/preflight-check", summary="فحص جاهزية ونبض المحرك الذكي قبل الإرسال")
async def preflight_check(
    request: PreflightRequest, 
    http_client: httpx.AsyncClient = Depends(lambda: AppState.http_client) 
):
    provider = request.provider.strip().lower()
    
    try:
        llm, model_name = get_llm(provider)
    except Exception as e:
        logger.error(f"فشل تهيئة واستدعاء دوال المحرك [{provider}]: {str(e)}")
        return {"status": "error", "message": "عذراً، تعذرت تهيئة المحرك الذكي المختار لخلل داخلي في الملفات."}
        
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
        result = await app_graph.ainvoke(initial_state)
    except Exception as e:
        logger.error(f"فشل محرك التوجيه الدلالي أثناء سبك ودمج النصوص: {str(e)}")
        raise HTTPException(status_code=500, detail="تعذرت صياغة المخطوطة الكلية؛ فشل النظام في توليف المسودات الممررة.")
        
    return build_khalil_response(result)

@app.post("/upload", summary="تهذيب ومراجعة نص الوثيقة المرفوعة فوراً", response_model=KhalilResponse)
async def upload_document(file: UploadFile = File(...)):
    content = await validate_uploaded_file(file)
    extracted_text = DocumentProcessor.extract_text_from_docx(content)
    
    if not extracted_text.strip():
        raise HTTPException(status_code=400, detail="تعذر استخراج النص المرجعي؛ المستند المرفوع فارغ تماماً.")

    initial_state = create_initial_state(text=extracted_text)
    
    try:  
        result = await app_graph.ainvoke(initial_state)
    except Exception as e:
        logger.error(f"فشل معالجة المخطوطة المرفوعة في الـ Graph: {str(e)}")
        raise HTTPException(status_code=500, detail="تعذر إتمام عملية التهذيب؛ فشل المحرك الدلالي في استقراء بنية الملف.")
        
    return build_khalil_response(result)

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
    return {
        "message": "مدونة الخليل للتحرير اللغوي تعمل بنجاح وبكامل استقرارها السيادي العربي.",
        "status": "active",
        "version": "2.1.0"
    }
