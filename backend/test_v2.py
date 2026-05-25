import sys
import os

# Add backend to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Route prints to logger and avoid leaking API keys
from utils.logger_config import setup_logger
import builtins, os
logger = setup_logger("test_v2")
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

def test_sovereign_agent():
    print(colored("--- Starting V2 Sovereign Agent Test ---", "cyan"))
    
    input_text = "يمكن تحسين هذا النص ليكون أفضل. نعتذر عن أي تقصير. الاستراتيجية جيدة."
    
    print(colored(f"Input: {input_text}", "yellow"))
    
    inputs = {"input_text": input_text, "revision_count": 0}
    
    try:
        result = app_graph.invoke(inputs)
        
        print(colored("\n--- Execution Successful ---", "green"))
        print(colored(f"Manuscript: {result['manuscript'][:100]}...", "white"))
        print(colored(f"Violations Detected: {len(result['violations'])}", "red"))
        print(colored(f"Metric Scores: {result['metric_scores']}", "blue"))
        print(colored(f"Editor Notes: {result['editor_notes'][:1]}...", "magenta"))
        
    except Exception as e:
        print(colored("\n--- Execution Failed ---", "red"))
        print(e)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_sovereign_agent()
