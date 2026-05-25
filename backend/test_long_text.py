import sys
import os

# Add backend to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from agent.graph import app_graph
try:
    from termcolor import colored
except ImportError:
    def colored(text, color=None, on_color=None, attrs=None):
        return text

# Route prints to logger and avoid leaking API keys
from utils.logger_config import setup_logger
import builtins, os
logger = setup_logger("test_long_text")
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

def test_long_text_agent():
    print(colored("--- Starting V2 Long Text Agent Test ---", "cyan"))
    
    # Construct a long text with multiple paragraphs to trigger splitting (max_words=1000)
    # Each paragraph has ~100-150 words. We will write 15 paragraphs to get ~1500+ words.
    paragraphs = []
    
    # Academic/Research style paragraph templates
    para_template_academic = """
    تعتبر البحوث العلمية والمنهجيات الأكاديمية الركيزة الأساسية لتطور المجتمعات المعاصرة. إن السعي المستمر وراء المعرفة يتطلب انضباطاً صارماً في تصميم الدراسات واختيار العينات وتحليل البيانات. يُلاحظ في الآونة الأخيرة أن هناك اهتماماً متزايداً بتطبيقات الذكاء الاصطناعي في تحليل البيانات الضخمة. تم إجراء العديد من الدراسات لاستكشاف الأثر الاقتصادي لهذه التقنيات، وتوصي معظم هذه الدراسات بضرورة تبني سياسات تعليمية مرنة تواكب هذا التحول الرقمي المتسارع. يجب أن ندرك أن جودة المخرجات التعليمية ترتبط مباشرة بمدى تكامل المناهج الدراسية مع الاحتياجات الفعلية لسوق العمل المتغير.
    """
    
    # We will replicate this block and slightly vary it to simulate a long paper.
    for i in range(12):
        paragraphs.append(f"الفقرة رقم {i+1} من الدراسة البحثية:\n" + para_template_academic.strip())
        
    input_text = "\n\n".join(paragraphs)
    print(colored(f"Generated input text length: {len(input_text)} characters (~{len(input_text.split())} words)", "yellow"))
    
    inputs = {"input_text": input_text, "revision_count": 0}
    
    try:
        result = app_graph.invoke(inputs)
        
        print(colored("\n--- Execution Successful ---", "green"))
        print(colored(f"Manuscript length: {len(result['manuscript'])} characters", "white"))
        print(colored("\n--- Manuscript Preview ---", "cyan"))
        # Print first 400 chars and last 400 chars
        print(result['manuscript'][:400])
        print("\n...\n")
        print(result['manuscript'][-400:])
        print(colored("\n------------------------", "cyan"))
        print(colored(f"Violations Detected: {len(result['violations'])}", "red"))
        print(colored(f"Metric Scores: {result['metric_scores']}", "blue"))
        print(colored(f"Editor Notes: {result['editor_notes']}", "magenta"))
        print(colored(f"Token Usage: {result['token_usage']}", "green"))
        
    except Exception as e:
        print(colored("\n--- Execution Failed ---", "red"))
        print(e)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_long_text_agent()
