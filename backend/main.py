from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import os
import httpx
from agent.graph import app_graph
from agent.helpers import get_llm
from utils.logger_config import setup_logger

logger = setup_logger("main")

app = FastAPI(title="The Linguistic Engineer Agent", version="2.0.0")

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
    logger.info(f"Received chat request. Input length: {len(request.message)}")
    # Initial state
    initial_state = {
        "input_text": request.message,
        "current_text": request.message,
        "manuscript": "",
        "editor_notes": [],
        "revision_count": 0,
        "status": "processing",
        # Initialize new fields to avoid key errors if graph fails early
        "memory_context": [],
        "violations": [],
        "metric_scores": {}
    }
    
    try:
        # Run the graph
        logger.info("Invoking agent graph...")
        result = await app_graph.ainvoke(initial_state)
        logger.info("Agent graph execution completed successfully.")
        
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
        logger.error(f"Error during chat processing: {str(e)}", exc_info=True)
        raise e

from fastapi import File, UploadFile, HTTPException
from processors.document_processor import DocumentProcessor

@app.post("/extract-text")
async def extract_text(file: UploadFile = File(...)):
    logger.info(f"Extracting text from uploaded file: {file.filename}")
    if not file.filename.endswith(".docx"):
        logger.warning("Invalid file type uploaded for text extraction.")
        raise HTTPException(status_code=400, detail="Only .docx files are supported")
    try:
        content = await file.read()
        extracted_text = DocumentProcessor.extract_text_from_docx(content)
        logger.info(f"Extracted {len(extracted_text)} characters from {file.filename}.")
        return {
            "text": extracted_text,
            "filename": file.filename,
            "size": len(content)
        }
    except Exception as e:
        logger.error(f"Error during text extraction: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to extract text: {str(e)}")

@app.post("/preflight-check")
async def preflight_check(request: PreflightRequest):
    provider = request.provider.strip().lower()
    logger.info(f"Received preflight check request for provider: {provider}")
    
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
    except ImportError:
        ChatGoogleGenerativeAI = None
        
    if provider == "deepseek":
        ds_key = os.getenv("DEEPSEEK_API_KEY")
        if not ds_key:
            return {"status": "error", "message": "مفتاح API الخاص بـ DeepSeek غير موجود في ملف الإعدادات .env"}
        try:
            # First check balance and status
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://api.deepseek.com/user/balance", 
                    headers={"Authorization": f"Bearer {ds_key}"},
                    timeout=5
                )
            if response.status_code == 200:
                data = response.json()
                if data.get("is_available"):
                    # Test query using get_llm
                    llm, model_name = get_llm("deepseek")
                    await llm.ainvoke("Hi")
                    return {"status": "ready", "message": "تم التحقق من اتصال DeepSeek بنجاح والمفتاح نشط."}
                else:
                    return {"status": "error", "message": "اتصال DeepSeek يعمل ولكن الرصيد غير كافٍ (is_available = False)."}
            elif response.status_code == 402:
                return {"status": "error", "message": "رصيد حساب DeepSeek غير كافٍ (Error 402)."}
            else:
                return {"status": "error", "message": f"خادم DeepSeek أرجع رمز الاستجابة {response.status_code}"}
        except Exception as e:
            return {"status": "error", "message": f"فشل الاتصال بمزود الخدمة DeepSeek: {str(e)}"}
            
    elif provider == "gemini":
        g_key = os.getenv("GOOGLE_API_KEY")
        if not g_key:
            return {"status": "error", "message": "مفتاح API الخاص بـ Gemini غير موجود في ملف الإعدادات .env"}
        if not ChatGoogleGenerativeAI:
            return {"status": "error", "message": "مكتبة langchain_google_genai غير مثبتة في بيئة العمل"}
        try:
            llm, model_name = get_llm("gemini")
            await llm.ainvoke("Hi")
            return {"status": "ready", "message": "تم التحقق من اتصال Gemini بنجاح والمفتاح نشط."}
        except Exception as e:
            return {"status": "error", "message": f"فشل الاتصال بمزود الخدمة Gemini: {str(e)}"}
    else:
        return {"status": "error", "message": "مزود خدمة غير معروف. يرجى اختيار Gemini أو DeepSeek."}

@app.post("/merge-drafts")
async def merge_drafts(request: MergeRequest):
    logger.info(f"Received merge request. Drafts: {[d['title'] for d in request.drafts]}")
    # Construct initial state for the LangGraph workflow
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
        # Initialize legacy compatibility fields
        "input_text": "",
        "current_text": "",
        "manuscript": "",
        "editor_notes": [],
        "memory_context": [],
        "violations": [],
        "metric_scores": {}
    }
    
    try:
        logger.info("Invoking agent graph for multi-draft merge...")
        result = await app_graph.ainvoke(initial_state)
        logger.info("Agent graph execution for merge completed successfully.")
        
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
        logger.error(f"Error during merge processing: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Merge processing failed: {str(e)}")

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    logger.info(f"Received file upload: {file.filename}")
    if not file.filename.endswith(".docx"):
        logger.warning("Invalid file type uploaded.")
        raise HTTPException(status_code=400, detail="Only .docx files are supported")
    
    content = await file.read()
    extracted_text = DocumentProcessor.extract_text_from_docx(content)
    logger.info(f"Extracted {len(extracted_text)} characters from document.")
    
    if not extracted_text:
        raise HTTPException(status_code=400, detail="Could not extract text from document")

    # Run the graph on the extracted text
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
        logger.info("Invoking agent graph for document...")
        result = await app_graph.ainvoke(initial_state)
        logger.info("Agent graph execution for document completed.")
        
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
        logger.error(f"Error during document processing: {str(e)}", exc_info=True)
        raise e

@app.get("/")
async def root():
    return {"message": "The Linguistic Engineer is Online", "status": "sovereign", "version": "v2"}
