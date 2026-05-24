import os
import httpx
from dotenv import load_dotenv

load_dotenv()

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
