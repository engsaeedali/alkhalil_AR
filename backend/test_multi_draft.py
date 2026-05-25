import sys
import os
import json

# Add backend to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Route prints to logger and avoid leaking API keys
from utils.logger_config import setup_logger
import builtins, os
logger = setup_logger("test_multi_draft")
_original_print = builtins.print
_sensitive_vals = [os.getenv(k, "") for k in ("DEEPSEEK_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY")]

def _safe_print(*args, **kwargs):
    try:
        s = " ".join(str(a) for a in args)
        for v in _sensitive_vals:
            if v:
                s = s.replace(v, "<REDACTED_API_KEY>")
        logger.info(s)
    except Exception:
        _original_print(*args, **kwargs)

builtins.print = _safe_print

from agent.graph import app_graph
try:
    from termcolor import colored
except ImportError:
    def colored(text, color=None, on_color=None, attrs=None):
        return text

def test_multi_draft_merger():
    print(colored("--- Starting V2 Multi-Draft Merger Test ---", "cyan"))
    
    # 1. Construct 3 drafts (Primary and two auxiliary drafts with additions)
    primary_content = """
    تعتبر البحوث العلمية والمنهجيات الأكاديمية الركيزة الأساسية لتطور المجتمعات المعاصرة. إن السعي المستمر وراء المعرفة يتطلب انضباطاً صارماً في تصميم الدراسات واختيار العينات وتحليل البيانات. يُلاحظ في الآونة الأخيرة أن هناك اهتماماً متزايداً بتطبيقات الذكاء الاصطناعي في تحليل البيانات الضخمة.
    """
    
    draft2_content = primary_content + """
    ومن الضروري استعراض مثال عملي: قصة ماجيك جونسون عام 1979، حيث عُرض عليه خياران؛ إما كاش نقدي فوري أو أسهم في نايكي ورفض الأسهم مما تسبب في خسارته لمليارات لاحقاً.
    """
    
    draft3_content = primary_content + """
    هناك دراسة حالة أخرى مهمة: قصة شركة تسلا ومؤسسها إيلون ماسك عام 2008، حيث كانت الشركة على وشك الإفلاس ولكن تم إنقاذها بتمويل إضافي في اللحظات الأخيرة.
    """
    
    inputs = {
        "drafts": [
            {"title": "المسودة الأساسية", "content": primary_content.strip()},
            {"title": "مسودة نايكي", "content": draft2_content.strip()},
            {"title": "مسودة تسلا", "content": draft3_content.strip()}
        ],
        "primary_draft_title": "المسودة الأساسية",
        "style": "academic",
        "max_attempts": 1,
        "reconstruction_attempts": 0,
        "current_phase": "Master Draft"
    }
    
    print(colored(f"Drafts submitted for merge: {[d['title'] for d in inputs['drafts']]}", "yellow"))
    
    try:
        result = app_graph.invoke(inputs)
        
        print(colored("\n--- Execution Successful ---", "green"))
        
        print(colored("\n--- Extracted Atomic Ideas (من المسودات الفرعية فقط) ---", "cyan"))
        for idea in result.get("atomic_ideas", []):
            print(f"- [{idea['id']}] ({idea['source_draft']}): {idea['content']} [{idea['status']}]")
            
        print(colored("\n--- Validation Report ---", "cyan"))
        print(json.dumps(result.get("validation_report", {}), indent=2, ensure_ascii=False))
        
        print(colored("\n--- Final Manuscript Preview ---", "cyan"))
        print(result.get("manuscript"))
        
        print(colored("\n------------------------", "cyan"))
        print(colored(f"Total Token Usage: {result.get('token_usage')}", "green"))
        
    except Exception as e:
        print(colored("\n--- Execution Failed ---", "red"))
        print(e)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_multi_draft_merger()
