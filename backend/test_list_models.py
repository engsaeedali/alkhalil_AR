import os
import httpx
from dotenv import load_dotenv

load_dotenv()

# Route prints to logger and redact API keys
from utils.logger_config import setup_logger
import builtins
logger = setup_logger("test_list_models")
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

key = os.getenv("GOOGLE_API_KEY")
print(f"Using key: {key[:10]}...")

url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
try:
    response = httpx.get(url, timeout=10.0)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print("Available models:")
        for m in data.get("models", []):
            print(f"- {m.get('name')} (supported methods: {m.get('supportedGenerationMethods')})")
    else:
        print("Error Response:")
        print(response.text)
except Exception as e:
    print(f"Request failed: {e}")
