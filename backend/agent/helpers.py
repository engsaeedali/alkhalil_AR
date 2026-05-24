# -*- coding: utf-8 -*-

"""
تطبيق مساعد المحرر الذكي - الدوال المساعدة للذكاء الاصطناعي وهندسة النصوص
تم فصل هذه الدوال في ملف مستقل لمنع الاستيرادات الدائرية (Circular Imports).
"""

from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from dotenv import load_dotenv, find_dotenv
import os
import json
import re

# Load env vars independently of settings
load_dotenv(find_dotenv())

# Safe import for Google GenAI
try:
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:
    ChatGoogleGenerativeAI = None # prevent crash if dependency fails
    print("WARNING: ChatGoogleGenerativeAI import failed.")

from config.settings import settings
from .prompts import STYLE_DETECTION_PROMPT, STYLE_INSTRUCTIONS
from utils.logger_config import setup_logger

logger = setup_logger("helpers")

def check_deepseek_availability(api_key: str) -> bool:
    """Check key validity and balance before reliance."""
    if not api_key:
        return False
    try:
        import httpx
        # Very simple request to check balance/validity
        response = httpx.get(
            "https://api.deepseek.com/user/balance", 
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=5.0
        )
        if response.status_code != 200:
            return False
        data = response.json()
        if "is_available" in data:
            return bool(data["is_available"])
        if "total_balance" in data:
            try:
                return float(data["total_balance"]) > 0
            except ValueError:
                pass
        return True
    except Exception:
        # Fallback to True if key exists but network has a temporary issue
        return True

def get_llm(provider: Optional[str] = None):
    """Returns a tuple: (LLM_Object, Model_Name_String)"""
    google_key = settings.GOOGLE_API_KEY
    deepseek_key = settings.DEEPSEEK_API_KEY
    
    # Check explicitly requested provider first
    if provider:
        p_clean = provider.strip().lower()
        if p_clean == "deepseek":
            is_deepseek_ok = check_deepseek_availability(deepseek_key)
            if is_deepseek_ok:
                logger.info("Using DeepSeek as requested.")
                llm = ChatOpenAI(
                    model="deepseek-chat",
                    api_key=deepseek_key,
                    base_url="https://api.deepseek.com"
                )
                return llm, "DeepSeek-V3 (Sovereign Engine)"
            else:
                logger.warning("DeepSeek was requested but is not available (invalid key or balance).")
        elif p_clean == "gemini":
            if google_key and ChatGoogleGenerativeAI:
                logger.info("Using Gemini as requested (with resilience retry policy).")
                llm = ChatGoogleGenerativeAI(
                    model="gemini-2.5-flash", 
                    google_api_key=google_key, 
                    temperature=0.7,
                    max_retries=10
                ).with_retry(
                    stop_after_attempt=12,
                    wait_exponential_jitter=True
                )
                return llm, "Gemini Flash (Sovereign Engine)"
            else:
                logger.warning("Gemini was requested but key is missing or library is not installed.")

    # Fallback to standard check sequence
    # 1. Check DeepSeek First (Since Gemini is currently returning 404 NOT_FOUND)
    is_deepseek_ok = check_deepseek_availability(deepseek_key)
    if is_deepseek_ok:
        logger.info("Using DeepSeek as default/fallback.")
        llm = ChatOpenAI(
            model="deepseek-chat",
            api_key=deepseek_key,
            base_url="https://api.deepseek.com"
        )
        return llm, "DeepSeek-V3 (Sovereign Engine)"

    # 2. Check Gemini
    if google_key and ChatGoogleGenerativeAI:
        logger.info("Using Gemini as fallback (with resilience retry policy).")
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash", 
            google_api_key=google_key, 
            temperature=0.7,
            max_retries=10
        ).with_retry(
            stop_after_attempt=12,
            wait_exponential_jitter=True
        )
        return llm, "Gemini Flash (Sovereign Engine)"
    
    # Priority 3: Claude
    if settings.ANTHROPIC_API_KEY and "sk-ant" in settings.ANTHROPIC_API_KEY:
         logger.info("Using Claude Model")
         llm = ChatAnthropic(model="claude-3-5-sonnet-20240620", temperature=0.7)
         return llm, "Claude 3.5 Sonnet"
    
    # Priority 4: OpenAI
    logger.info("Fallback to OpenAI Model")
    llm = ChatOpenAI(model="gpt-4o", temperature=0.7)
    return llm, "GPT-4o"

def split_text_into_chunks(text: str, max_words: int = 1000) -> list[str]:
    """
    Split text into chunks of maximum `max_words` words, preserving paragraph structures.
    """
    if not text:
        return []
        
    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = []
    current_word_count = 0
    
    for para in paragraphs:
        if not para.strip():
            continue
            
        para_words = para.split()
        para_word_count = len(para_words)
        
        # If a single paragraph is larger than max_words, split by sentences
        if para_word_count > max_words:
            if current_chunk:
                chunks.append("\n\n".join(current_chunk))
                current_chunk = []
                current_word_count = 0
                
            sentences = re.split(r'(?<=[.؟!])\s+', para)
            sub_chunk = []
            sub_word_count = 0
            for sentence in sentences:
                sent_word_count = len(sentence.split())
                if sub_word_count + sent_word_count > max_words:
                    if sub_chunk:
                        chunks.append(" ".join(sub_chunk))
                    sub_chunk = [sentence]
                    sub_word_count = sent_word_count
                else:
                    sub_chunk.append(sentence)
                    sub_word_count += sent_word_count
            if sub_chunk:
                chunks.append(" ".join(sub_chunk))
        else:
            if current_word_count + para_word_count > max_words:
                chunks.append("\n\n".join(current_chunk))
                current_chunk = [para]
                current_word_count = para_word_count
            else:
                current_chunk.append(para)
                current_word_count += para_word_count
                
    if current_chunk:
        chunks.append("\n\n".join(current_chunk))
        
    return chunks

def detect_style(text_sample: str, llm) -> str:
    """
    Call LLM to classify the writing style of the text sample.
    """
    logger.info("Detecting style of the input text...")
    prompt = STYLE_DETECTION_PROMPT.format(text_sample=text_sample[:1200])
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        style = response.content.strip().lower()
        # Clean any extra quotes or newlines
        style = "".join(c for c in style if c.isalnum())
        if style in STYLE_INSTRUCTIONS:
            logger.info(f"Detected style: {style}")
            return style
        else:
            logger.warning(f"LLM returned invalid style: {style}. Defaulting to academic.")
            return "academic"
    except Exception as e:
        logger.error(f"Error during style detection: {str(e)}. Defaulting to academic.")
        return "academic"

def parse_tagged_manuscript(tagged_text: str, primary_title: str) -> list[dict[str, Any]]:
    """
    تحليل النص الموسوم بـ XML Tags وتحويله إلى مصفوفة JSON مهيكلة للـ Frontend.
    تكتيك موفر للتوكنات بنسبة 50% مع ضوابط وقائية كاملة.
    """
    # 1. البحث الصارم عن نمط الوسم بالكامل لتجنب التداخل مع علامات المقارنة مثل (<) أو (>)
    pattern = re.compile(r'<block\s+([^>]+)>(.*?)</block>', re.DOTALL)
    blocks = []
    block_counter = 1
    matches = list(pattern.finditer(tagged_text))
    
    # 2. تحسين آلية التراجع (Improved Paragraph-split Fallback) في حال عدم التوليد بالوسوم
    if not matches:
        logger.warning("No XML blocks found in text. Executing defensive paragraph-split fallback.")
        # إزالة وسوم البداية والنهاية المكسورة إن وجدت بشكل وقائي
        cleaned_text = re.sub(r'</?block[^>]*>', '', tagged_text).strip()
        paragraphs = [p.strip() for p in re.split(r'\n\s*\n', cleaned_text) if p.strip()]
        
        # إذا لم يكن هناك نص بعد التنظيف
        if not paragraphs:
            paragraphs = [cleaned_text] if cleaned_text else [""]

        for p in paragraphs:
            # تمييز العناوين البسيطة (إذا كانت قصيرة ولا تنتهي بعلامة ترقيم)
            is_heading = len(p) < 100 and not p.endswith(('.', '؟', '!', ':', '،'))
            block_type = "heading" if is_heading else "paragraph"
            
            blocks.append({
                "block_id": f"BLK_{block_counter:03d}",
                "type": block_type,
                "is_primary": True,
                "source": primary_title,
                "associated_idea_id": None,
                "text": p
            })
            block_counter += 1
        return blocks
        
    for m in matches:
        attrs_str = m.group(1)
        text_content = m.group(2).strip()
        
        # استخراج الخصائص داخل الوسم
        attrs = {}
        for attr_match in re.finditer(r'(\w+)="([^"]*)"', attrs_str):
            attrs[attr_match.group(1)] = attr_match.group(2)
            
        source = attrs.get("source", primary_title)
        idea_id = attrs.get("idea", None)
        block_type = attrs.get("type", "paragraph")
        
        # التأكد من صحة الحقول
        if idea_id == "":
            idea_id = None
            
        # تحديد ما إذا كانت الكتلة تابعة للمسودة الأساسية بشكل مرن
        is_primary = False
        if source:
            s_clean = source.strip()
            p_clean = primary_title.strip()
            # مطابقة تامة أو مطابقة مرنة مع الكلمات الشهيرة
            if s_clean == p_clean or s_clean in ["المسودة الأساسية", "المسودة الأساسية.docx", "primary", "primary_draft"]:
                is_primary = True
        else:
            is_primary = True
            
        blocks.append({
            "block_id": f"BLK_{block_counter:03d}",
            "type": block_type,
            "is_primary": is_primary,
            "source": source or primary_title,
            "associated_idea_id": idea_id,
            "text": text_content
        })
        block_counter += 1
        
    return blocks
