import os
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()

# Route prints to logger and redact API keys
from utils.logger_config import setup_logger
import builtins
logger = setup_logger("test_gemini")
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

google_key = os.getenv("GOOGLE_API_KEY")
gemini_key = os.getenv("GEMINI_API_KEY")

print(f"GOOGLE_API_KEY: {google_key[:10] if google_key else None}...")
print(f"GEMINI_API_KEY: {gemini_key[:10] if gemini_key else None}...")

for key_name, key in [("GOOGLE_API_KEY", google_key), ("GEMINI_API_KEY", gemini_key)]:
    if not key:
        continue
    print(f"\n--- Testing with {key_name} ---")
    models = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"]
    for model in models:
        try:
            print(f"Testing model: {model}")
            llm = ChatGoogleGenerativeAI(model=model, google_api_key=key)
            res = llm.invoke("Hello, are you working?")
            print(f"Success with {model} using {key_name}!")
            print(res.content[:50])
            break
        except Exception as e:
            print(f"Error for {model}: {e}")


