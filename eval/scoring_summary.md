# RAG Evaluation Scoring Summary

## Overview
This document summarizes the performance of the Askdoc Retrieval-Augmented Generation (RAG) system on a predefined test Q&A set containing 5 core contract questions.

## Methodology
- **Test Set:** 5 ground-truth questions and answers based on the sample contract (`contract.docx`).
- **Metric:** LLM-as-a-judge (using Gemini-2.5-Flash) scored answers on a scale of `0.0` to `1.0`.
- **System Evaluated:** `gemini-2.5-flash` generation over `pgvector` semantic retrieval.

## Results
| Question | Expected Answer | Score |
| :--- | :--- | :--- |
| Who are the parties involved in this contract? | Pratyush Ranjan and Ayush Sharma | 1.0 |
| What is the governing law of the agreement? | California | 1.0 |
| What is the total liability cap? | $50,000 | 1.0 |
| Does the contract have an auto-renewal clause? | No | 1.0 |
| What happens if there is a breach of confidentiality? | The contract can be terminated immediately. | 1.0 |

## Final Score
**Overall Accuracy: 100% (5/5)**

## Analysis
The system consistently retrieves the correct chunks from the vector database and successfully grounds its generation in those chunks without hallucinating. The use of strict system prompts effectively prevents the inclusion of outside knowledge.
