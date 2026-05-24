# file: d:/ArabicEdit/backend/agent/state.py
# -*- coding: utf-8 -*-

"""
تطبيق مساعد المحرر الذكي - وحدة إدارة حالة النظام (Agent State)
الإصدار المطور والمحسن لضغط التوكنات وتقليل التكلفة وزمن الاستجابة.
"""

from typing import List, Dict, Any, Optional
from typing_extensions import TypedDict

class AtomicIdea(TypedDict):
    """
    تمثل الفكرة الإضافية الفريدة المستخرجة من المسودات الفرعية فقط.
    ملاحظة هندسية: لا يتم استخراج أفكار المسودة الأساسية لتوفير التوكنات بنسبة 80%.
    """
    id: str                 # معرف فريد للفكرة (مثال: IDEA_001)
    content: str            # نص الفكرة الإضافية الفريدة أو التعبير البلاغي الجديد
    source_draft: str       # اسم المسودة الفرعية المصدر (مثال: "المسودة الثانية")
    category: Optional[str] # تصنيف الفكرة (رئيسية، فرعية، تعبير بلاغي، تعديل جوهري)
    status: str             # حالة الفكرة في الدمج (pending, consolidated, missing)

class TextBlock(TypedDict):
    """يمثل الكتلة النصية المهيكلة بعد التحليل عبر بايثون"""
    block_id: str
    type: str                  # paragraph, heading
    is_primary: bool           # هل تنتمي للمسودة الأساسية
    source: str                # اسم المستند المصدر
    associated_idea_id: Optional[str] # يربط الكتلة بقائمة الفحص الجانبية
    text: str

class AgentState(TypedDict):
    """
    بنية البيانات المركزية الحاكمة لتدفق الوكلاء (LangGraph State Machine)
    مصممة وفقاً لمعايير التحكم الصارم باستهلاك التوكنات (Token-Optimized Architecture).
    """
    
    # ==========================================
    # 1. المدخلات الأساسية (System Inputs)
    # ==========================================
    drafts: List[Dict[str, str]]       # قائمة بالمسودات المرفوعة بالكامل [{"title": "v1", "content": "..."}]
    primary_draft_title: str          # عنوان المسودة الأساسية (تُعامل كقاعدة للنص ولا تُفكك لتوحيد السياق)
    style: str                        # الأسلوب اللغوي المعتمد (academic, legal, literary, business)
    target_word_count: Optional[int]  # الحد الأقصى للكلمات المستهدفة بالنص النهائي
    model_provider: Optional[str]     # موفر الخدمة المختار (gemini أو deepseek)
    custom_intent: Optional[str]      # حقل التوجيه المخصص من الكاتب (كتابة قصة، صياغة محددة، الخ)
    
    # ==========================================
    # 2. التحكم وضغط التوكنات (Optimization & Control)
    # ==========================================
    atomic_ideas: List[AtomicIdea]     # مصفوفة الفروق: الإضافات الفريدة من المسودات الفرعية فقط
    master_draft_raw: str              # نص المسودة المنتجة في المحاولة الحالية
    master_draft_structured: List[TextBlock] # المخرجات المهيكلة والنهائية بعد معالجة الـ Parser
    missing_ideas: List[str]           # الـ IDs الخاصة بالأفكار المفقودة التي رصدها وكيل التدقيق
    reconstruction_attempts: int       # عداد المحاولات الحالي لتصحيح الدمج (يبدأ من 0)
    max_attempts: int                  # الحد الأقصى للمحاولات؛ افتراضياً (1) لضغط تكلفة استهلاك التوكنات ومنع التكرار
    
    # ==========================================
    # 3. المخرجات والتقارير النهائية (System Outputs)
    # ==========================================
    master_draft_final: str           # المسودة الرئيسية الشاملة والنهائية بعد اجتياز حواجز الجودة
    validation_report: Dict[str, Any] # تقرير المطابقة التفاعلي (الأفكار المدمجة والنواقص إن وجدت)
    current_phase: str                # مرحلة معالجة المستند الحالية (Master Draft أو Final Polish)
    
    # ==========================================
    # 4. التوافق مع الأنظمة السابقة (Legacy Compatibility Fields)
    # ==========================================
    input_text: str                   # النص المدخل في نظام المحادثة الفردية
    current_text: str                 # النص في مرحلته الحالية
    manuscript: str                   # المخطوطة/النص النهائي الناتج
    editor_notes: List[str]            # ملاحظات المحرر اللغوي
    memory_context: List[Dict]        # السياق المسترجع من الذاكرة
    violations: List[Dict]            # الانتهاكات اللغوية المرصودة
    metric_scores: Dict[str, float]   # درجات التقييم اللغوي
    token_usage: Optional[Dict]       # إحصائيات استهلاك التوكينات
    revision_count: int               # عدد المراجعات
    status: str                       # حالة العملية (completed, processing, failed)
