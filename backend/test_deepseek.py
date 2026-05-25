import os
import sys
from dotenv import load_dotenv

# Load env vars
load_dotenv(".env")

# Route prints to logger and redact API keys
from utils.logger_config import setup_logger
import builtins
logger = setup_logger("test_deepseek")
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

try:
    from langchain_openai import ChatOpenAI
    print("SUCCESS: langchain_openai imported.")
except ImportError as e:
    print(f"ERROR: Could not import langchain_openai. {e}")
    sys.exit(1)

api_key = os.getenv("DEEPSEEK_API_KEY")
if not api_key:
    print("ERROR: DEEPSEEK_API_KEY not found in .env")
    sys.exit(1)

print(f"API Key found: {api_key[:5]}...")

try:
    llm = ChatOpenAI(
        model="deepseek-chat",
        temperature=0.7,
        api_key=api_key,
        base_url="https://api.deepseek.com"
    )
    print("Attempting to invoke DeepSeek...")
    response = llm.invoke("Hello, are you there?")
    print(f"Response: {response.content}")
except Exception as e:
    print(f"ERROR: LLM invocation failed. {e}")
