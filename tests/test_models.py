import os
from google import genai
client = genai.Client()
models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro']
for model in models:
    try:
        response = client.models.generate_content(model=model, contents="Hello")
        print(f"Success: {model}")
    except Exception as e:
        print(f"Failed: {model} - {e}")
