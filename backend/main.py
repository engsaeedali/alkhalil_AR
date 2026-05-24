import os
import sys

# تثبيت المسارات لضمان سلامة التجميع على خوادم الإنتاج (Vercel)
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import httpx
from agent.graph import app_graph
from agent.helpers import get_llm
from utils.logger_config import setup_logger
from processors.document_processor import DocumentProcessor

logger = setup_logger("main")

# تهيئة خادم مدونة الخليل بالعنوان الفصيح الرسمي الجديد
app = FastAPI(title="مدونة الخليل للتحرير اللغوي", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str

class MergeRequest(BaseModel):
    drafts: List[Dict[str, str]]
    primary_draft_title: str
    style: str
    target_word_count: Optional[int] = None
    provider: Optional[str] = None
    custom_intent: Optional[str] = None

class PreflightRequest(BaseModel):
    provider: str

@app.post("/chat")
async def chat(request: ChatRequest):
    logger.info(f"بدء استقبال طلب محادثة. حجم النص المدخل: {len(request.message)}")
    initial_state = {
        "input_text": request.message,
        "current_text": request.message,
        "manuscript": "",
        "editor_notes": [],
        "revision_count": 0,
        "status": "processing",
        "memory_context": [],
        "violations": [],
        "metric_scores": {}
    }
    
    try:
        result = await app_graph.ainvoke(initial_state)
        return {
            "manuscript": result.get("manuscript"),
            "editor_notes": result.get("editor_notes"),
            "metric_scores": result.get("metric_scores", {}),
            "violations": result.get("violations", []),
            "token_usage": result.get("token_usage", {}),
            "master_draft_structured": result.get("master_draft_structured", []),
            "atomic_ideas": result.get("atomic_ideas", []),
            "validation_report": result.get("validation_report", {}),
            "status": "completed"
        }
    except Exception as e:
        logger.error(f"خلل أثناء معالجة المحادثة: {str(e)}", exc_info=True)
        raise e

@app.post("/extract-text")
async def extract_text(file: UploadFile = File(...)):
    logger.info(f"جاري استخراج النص من المخطوطة المرفوعة: {file.filename}")
    if not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="عذراً، لا يتم قبول سوى الوثائق بصيغة .docx فقط")
    try:
        content = await file.read()
        extracted_text = DocumentProcessor.extract_text_from_docx(content)
        return {
            "text": extracted_text,
            "filename": file.filename,
            "size": len(content)
        }
    except Exception as e:
        logger.error(f"فشل استخراج النص من الوثيقة: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"فشل استخراج النص: {str(e)}")

@app.post("/preflight-check")
async def preflight_check(request: PreflightRequest):
    """
    منفذ فحص نبض الجاهزية المسبق (طلب مرحبا)
    لتأكيد استقرار المحرك وتطهير الرسائل من الألفاظ الهندسية.
    """
    provider = request.provider.strip().lower()
    logger.info(f"بدء فحص نبض الجاهزية للمساعد الذكي: {provider}")
    
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
    except ImportError:
        ChatGoogleGenerativeAI = None
        
    if provider == "deepseek":
        ds_key = os.getenv("DEEPSEEK_API_KEY")
        if not ds_key:
            return {"status": "error", "message": "تنبيه: تهيئة خادم المساعد المختار غير مكتملة، يرجى تفقّد مفاتيح التهيئة."}
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://api.deepseek.com/user/balance", 
                    headers={"Authorization": f"Bearer {ds_key}"},
                    timeout=5
                )
            if response.status_code == 200:
                data = response.json()
                if data.get("is_available"):
                    llm, model_name = get_llm("deepseek")
                    await llm.ainvoke("مرحبا")
                    return {"status": "ready", "message": "تم التحقق من جاهزية الخليل بنجاح والمحرك مستقر"}
                else:
                    return {"status": "error", "message": "اتصال المساعد الذكي نشط ولكن الرصيد الحالي غير كافٍ لإتمام عملية السبك."}
            elif response.status_code == 402:
                return {"status": "error", "message": "رصيد حساب المساعد الذكي لا يسمح بمعالجة النصوص حالياً."}
            else:
                return {"status": "error", "message": f"استجابة غير متوقعة من خادم المساعد المختار (رمز الفشل {response.status_code})."}
        except Exception as e:
            return {"status": "error", "message": "تعذر تأمين الاتصال بالمحرر الذكي؛ يرجى التحقق من استقرار الشبكة."}
            
    elif provider == "gemini":
        g_key = os.getenv("GOOGLE_API_KEY")
        if not g_key:
            return {"status": "error", "message": "تنبيه: تهيئة خادم المساعد المختار غير مكتملة، يرجى تفقّد مفاتيح التهيئة."}
        if not ChatGoogleGenerativeAI:
            return {"status": "error", "message": "مكتبة المعالجة الأساسية الموجهة لـ لغة الضاد غير متوفرة في الخلفية."}
        try:
            llm, model_name = get_llm("gemini")
            await llm.ainvoke("مرحبا")
            return {"status": "ready", "message": "تم التحقق من جاهزية الخليل بنجاح والمحرك مستقر"}
        except Exception as e:
            return {"status": "error", "message": "تعذر تأمين الاتصال بالمحرر الذكي؛ يرجى التحقق من استقرار الشبكة."}
    else:
        return {"status": "error", "message": "المحرر الذكي المختار غير مدرج بالمكتبة، يرجى تحديد اختيار معتمد."}

@app.post("/merge-drafts")
async def merge_drafts(request: MergeRequest):
    logger.info(f"استقبال طلب دمج المسودات للمخطوطات: {[d['title'] for d in request.drafts]}")
    initial_state = {
        "drafts": request.drafts,
        "primary_draft_title": request.primary_draft_title,
        "style": request.style,
        "target_word_count": request.target_word_count,
        "model_provider": request.provider,
        "custom_intent": request.custom_intent,
        "max_attempts": 1,
        "reconstruction_attempts": 0,
        "current_phase": "Master Draft",
        "input_text": "",
        "current_text": "",
        "manuscript": "",
        "editor_notes": [],
        "memory_context": [],
        "violations": [],
        "metric_scores": {}
    }
    
    try:
        logger.info("استدعاء محرك التوجيه الدلالي لسبك ودمج النصوص...")
        result = await app_graph.ainvoke(initial_state)
        return {
            "manuscript": result.get("manuscript"),
            "editor_notes": result.get("editor_notes"),
            "metric_scores": result.get("metric_scores", {}),
            "violations": result.get("violations", []),
            "token_usage": result.get("token_usage", {}),
            "master_draft_structured": result.get("master_draft_structured", []),
            "atomic_ideas": result.get("atomic_ideas", []),
            "validation_report": result.get("validation_report", {}),
            "status": "completed"
        }
    except Exception as e:
        logger.error(f"فشل عملية دمج وسبك النصوص: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"تعذرت صياغة المخطوطة: {str(e)}")

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="تنبيه: الملحق غير مدعوم، يرجى إرفاق مستند .docx")
    
    content = await file.read()
    extracted_text = DocumentProcessor.extract_text_from_docx(content)
    
    if not extracted_text:
        raise HTTPException(status_code=400, detail="تعذر استخراج النص المرجعي؛ المستند فارغ أو مكسور البنية.")

    initial_state = {
        "input_text": extracted_text,
        "current_text": extracted_text,
        "manuscript": "",
        "editor_notes": [],
        "revision_count": 0,
        "status": "processing",
        "memory_context": [],
        "violations": [],
        "metric_scores": {}
    }
    
    try:
        result = await app_graph.ainvoke(initial_state)
        return {
            "manuscript": result.get("manuscript"),
            "editor_notes": result.get("editor_notes"),
            "metric_scores": result.get("metric_scores", {}),
            "violations": result.get("violations", []),
            "token_usage": result.get("token_usage", {}),
            "master_draft_structured": result.get("master_draft_structured", []),
            "atomic_ideas": result.get("atomic_ideas", []),
            "validation_report": result.get("validation_report", {}),
            "status": "completed",
            "original_text": extracted_text
        }
    except Exception as e:
        logger.error(f"خلل أثناء تهذيب المخطوطة المرفوعة: {str(e)}", exc_info=True)
        raise e

@app.get("/")
async def root():
    # النص التعريفي الجذري لمدونة الخليل متوافق مع الفصاحة
    return {
        "message": "مدونة الخليل للتحرير اللغوي تعمل بنجاح وبكامل استقرارها السيادي.",
        "status": "active",
        "version": "v2.1"
    }
