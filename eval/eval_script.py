import json
import asyncio
from openai import AsyncOpenAI
import os

# Ensure API key is set
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("Please set GEMINI_API_KEY to run the evaluation.")
    exit(1)

client = AsyncOpenAI(
    api_key=api_key,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
)

EVAL_PROMPT = """You are an expert evaluator for a RAG system.
Given a question, the expected correct answer, and the actual model answer, rate the actual answer on a scale of 0 to 1.
1 means the answer is correct and captures the essence of the expected answer.
0 means the answer is completely incorrect or contradictory.
Output ONLY a float number (0.0 or 1.0).

Question: {q}
Expected: {e}
Actual: {a}
Score:"""

async def evaluate():
    with open("eval/test_qa_set.json", "r") as f:
        qa_set = json.load(f)

    # Note: In a real eval, we would call the actual RAG API here.
    # For this script demonstration, we assume we have collected the model outputs.
    # We will simulate actual outputs for the purpose of the eval script.
    mock_actual_outputs = [
        "The parties are Pratyush Ranjan and Ayush Sharma.",
        "The governing law is the state of California.",
        "The liability cap is strictly set at $50,000.",
        "No, there is no auto-renewal clause.",
        "Immediate termination of the contract."
    ]

    total_score = 0
    results = []

    for i, item in enumerate(qa_set):
        q = item["question"]
        expected = item["expected_answer"]
        actual = mock_actual_outputs[i]

        prompt = EVAL_PROMPT.format(q=q, e=expected, a=actual)
        response = await client.chat.completions.create(
            model="gemini-2.5-flash",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0
        )
        
        try:
            score = float(response.choices[0].message.content.strip())
        except ValueError:
            score = 0.0
            
        total_score += score
        results.append({
            "question": q,
            "expected": expected,
            "actual": actual,
            "score": score
        })
        print(f"Q: {q} \nScore: {score}\n")

    accuracy = total_score / len(qa_set)
    print(f"Final Accuracy: {accuracy * 100}%")

if __name__ == "__main__":
    asyncio.run(evaluate())
