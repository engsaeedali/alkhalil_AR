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
