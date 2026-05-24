import os
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()

google_key = os.getenv("GOOGLE_API_KEY")
gemini_key = os.getenv("GEMINI_API_KEY")

print(f"GOOGLE_API_KEY: {google_key[:10] if google_key else None}...")
print(f"GEMINI_API_KEY: {gemini_key[:10] if gemini_key else None}...")

for key_name, key in [("GOOGLE_API_KEY", google_key), ("GEMINI_API_KEY", gemini_key)]:
    if not key:
        continue
    print(f"\n--- Testing with {key_name} ---")
    models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"]
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


