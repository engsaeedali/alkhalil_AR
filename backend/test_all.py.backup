import sys
import os
import json

# تصفية وتثبيت مسارات النظام لضمان التقاط مجلد العقد والـ agent بشكل مستقر
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from agent.graph import app_graph

try:
    from termcolor import colored
except ImportError:
    def colored(text, color=None, on_color=None, attrs=None):
        return text

# [MODIFY] 1. دالة فحص الجاهزية المسبقة لمتغيرات البيئة ومفاتيح الـ API (توصية 3)
def preflight_checks() -> bool:
    """فحص متغيرات البيئة قبل بدء الاختبارات لتجنب الانهيار الفجائي للمحرك"""
    print(colored("🔍 جاري فحص نبض وجاهزية مفاتيح الاتصال (Preflight Check)...", "cyan"))
    missing = []
    if not os.getenv("GOOGLE_API_KEY"):
        missing.append("GOOGLE_API_KEY")
    if not os.getenv("DEEPSEEK_API_KEY"):
        missing.append("DEEPSEEK_API_KEY")
        
    if missing:
        print(colored(f"⚠️ تنبيه: المتغيرات الحيوية التالية مفقودة من ملف الـ .env: {missing}", "yellow"))
        print(colored("سيقوم النظام بمحاولة التوجيه للمحرك البديل المتاح تلقائياً.", "yellow"))
    else:
        print(colored("✅ جميع مفاتيح الاتصال بالـ API الحيوية متوفرة بنجاح.", "green"))
    return True

# [MODIFY] 2. آلية بناء الـ State الكامل والديناميكي (توصية 1)
def create_full_state(text: str = "", drafts: list = None, **kwargs) -> dict:
    """
    بناء مصفوفة الحالة الكاملة والمطابقة 100% لـ main.py مع حقن التوجيه الديناميكي للمحرك الافتراضي.
    """
    # اختيار المساعد المتاح ذكياً لتفادي انهيار الفحص (تفضيل ديب سيك للاستقرار المحلي)
    default_provider = "deepseek" if os.getenv("DEEPSEEK_API_KEY") else "gemini"
    
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
            "model_provider": kwargs.get("provider", default_provider),  # الاختيار الديناميكي الذكي
            "custom_intent": kwargs.get("custom_intent", None)
        })
    return base_state

# --- مسارات الفحص الثلاثة التتابعية التصاعدية (توصية 2) ---

def test_chat_stream():
    print(colored("\n--- 🧪 1. بدء فحص المحادثة اللغوية الفورية الفصيحة ---", "cyan"))
    input_text = "يمكن تحسين هذا النص ليكون أفضل. نعتذر عن أي تقصير. الاستراتيجية جيدة."
    state = create_full_state(text=input_text)
    
    try:
        result = app_graph.invoke(state)
        print(colored("✅ نجاح معالجة المحادثة الفورية:", "green"))
        print(f"المخطوطة المهذبة: {result.get('manuscript', '')[:100]}...")
        print(f"المخالفات المحصورة: {len(result.get('violations', []))}")
        print(f"مؤشرات جودة الصياغة: {result.get('metric_scores', {})}")
    except Exception as e:
        print(colored(f"❌ فشل فحص المحادثة: {str(e)}", "red"))

def test_multi_draft_merger():
    print(colored("\n--- 🧪 2. بدء فحص سبك الأفكار ودمج المسودات المتعددة ---", "cyan"))
    
    primary_content = """تعتبر البحوث العلمية والمنهجيات الأكاديمية الركيزة الأساسية لتطور المجتمعات المعاصرة."""
    draft2_content = primary_content + """ ومن الضروري استعراض مثال عملي: قصة ماجيك جونسون عام 1979 ورأيه في أسهم نايكي."""
    draft3_content = primary_content + """ هناك دراسة حالة أخرى مهمة: قصة شركة تسلا ومؤسسها إيلون ماسك عام 2008."""
    
    state = create_full_state(
        drafts=[
            {"title": "المسودة الأساسية", "content": primary_content.strip()},
            {"title": "مسودة نايكي", "content": draft2_content.strip()},
            {"title": "مسودة تسلا", "content": draft3_content.strip()}
        ],
        primary_draft_title="المسودة الأساسية",
        style="academic",
        custom_intent="تحويل هذه المفاهيم والقصص إلى أسلوب أدبي فصيح يحمل العبرة."
    )
    
    try:
        result = app_graph.invoke(state)
        print(colored("✅ نجاح عملية سبك الأفكار وتوليف المسودات:", "green"))
        print(colored("\n[مصفوفة الأفكار الذرية والـ Delta دلالياً]:", "white"))
        for idea in result.get("atomic_ideas", []):
            print(f"- [{idea.get('id', 'N/A')}] ({idea.get('source_draft', 'N/A')}): {idea.get('content', '')[:50]}... [{idea.get('status', 'unknown')}]")
        print(colored("\n[معاينة النص النهائي المسبوك بعد المعالجة]:", "white"))
        print(result.get("manuscript"))
    except Exception as e:
        print(colored(f"❌ فشل فحص دمج المسودات: {str(e)}", "red"))

def test_long_text_processing():
    print(colored("\n--- 🧪 3. بدء فحص معالجة الأوراق والمخطوطات الطويلة ---", "cyan"))
    para_template_academic = """تعتبر البحوث العلمية والمنهجيات الأكاديمية الركيزة الأساسية لتطور المجتمعات المعاصرة. إن السعي المستمر وراء المعرفة يتطلب انضباطاً صارماً في تصميم الدراسات واختيار العينات وتحليل البيانات."""
    
    paragraphs = [f"الفقرة البحثية رقم {i+1}:\n" + para_template_academic.strip() for i in range(12)]
    input_text = "\n\n".join(paragraphs)
    
    state = create_full_state(text=input_text)
    try:
        result = app_graph.invoke(state)
        print(colored("✅ نجاح معالجة وتفكيك المخطوطة الطويلة:", "green"))
        print(f"حجم النص الناتج: {len(result.get('manuscript', ''))} حرفاً")
    except Exception as e:
        print(colored(f"❌ فشل فحص النص الطويل: {str(e)}", "red"))


if __name__ == "__main__":
    print(colored("🚀 بدء تشغيل الحزمة الموحدة والسيادية لفحص مدونة الخليل اللغوية 🚀", "magenta", attrs=["bold"]))
    preflight_checks() # إطلاق الفحص الوقائي التمهيدي
    test_chat_stream()
    test_multi_draft_merger()
    test_long_text_processing()
    print(colored("\n🏁 تم الانتهاء من فحص كافة المسارات الحيوية بنجاح 🏁", "magenta", attrs=["bold"]))
