import pytest
from httpx import AsyncClient, ASGITransport
import uuid
from unittest.mock import patch

from app.models.models import Document, DocumentStatus, DocumentChunk
from main import app
from app.db.session import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.document import ExtractedData, AuditReport

# Mock test data
MOCK_DOC_ID = uuid.uuid4()

@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest.mark.asyncio
async def test_ingest_endpoint():
    """Test the ingestion endpoint accepts files and returns 202."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        files = {'files': ('test.pdf', b'dummy content', 'application/pdf')}
        
        # We need to mock process_document_task.delay so it doesn't try to use Celery in tests
        with patch('app.api.v1.endpoints.documents.process_document_task.delay') as mock_delay:
            response = await ac.post("/api/v1/ingest", files=files)
            
            assert response.status_code == 202
            data = response.json()
            assert data["message"] == "Files uploaded successfully and are being processed."
            assert len(data["data"]) == 1
            assert data["data"][0]["filename"] == "test.pdf"
            assert data["data"][0]["status"] == "pending"
            assert "document_id" in data["data"][0]
            mock_delay.assert_called_once()

@pytest.mark.asyncio
async def test_extract_endpoint_mocked():
    """Test extraction endpoint with a mocked LLM service."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        mock_extracted_data = ExtractedData(
            parties=["Company A", "Company B"],
            auto_renewal=False,
            confidentiality=True,
            signatories=["John Doe"]
        )
        
        # Mock the service layer directly
        with patch('app.api.v1.endpoints.documents.extract_contract_data') as mock_extract:
            mock_extract.return_value = mock_extracted_data
            
            response = await ac.post(
                "/api/v1/extract", 
                json={"document_id": str(MOCK_DOC_ID)}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["document_id"] == str(MOCK_DOC_ID)
            assert data["extracted_data"]["parties"] == ["Company A", "Company B"]
            mock_extract.assert_called_once()

@pytest.mark.asyncio
async def test_audit_endpoint_mocked():
    """Test audit endpoint with a mocked LLM service."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        mock_audit_report = AuditReport(
            findings=[{
                "clause_type": "Auto-Renewal",
                "severity": "Medium",
                "evidence": "Automatically renews for 1 year.",
                "explanation": "Standard auto-renewal."
            }]
        )
        
        with patch('app.api.v1.endpoints.documents.audit_contract') as mock_audit:
            mock_audit.return_value = mock_audit_report
            
            response = await ac.post(
                "/api/v1/audit", 
                json={"document_id": str(MOCK_DOC_ID)}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["document_id"] == str(MOCK_DOC_ID)
            assert len(data["audit_report"]["findings"]) == 1
            assert data["audit_report"]["findings"][0]["severity"] == "Medium"
            mock_audit.assert_called_once()

@pytest.mark.asyncio
async def test_ask_endpoint_mocked():
    """Test ask endpoint with mocked vector search and LLM."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # We mock the answer_query service function which handles both vector search and LLM
        with patch('app.api.v1.endpoints.ask.answer_query') as mock_answer:
            from app.schemas.ask import AskResponse, Citation
            
            mock_answer.return_value = AskResponse(
                answer="The total liability cap is $50,000.",
                citations=[Citation(doc_id=MOCK_DOC_ID, chunk_index=0)]
            )
            
            response = await ac.post(
                "/api/v1/ask", 
                json={
                    "query": "What is the liability cap?",
                    "document_ids": [str(MOCK_DOC_ID)]
                }
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["answer"] == "The total liability cap is $50,000."
            assert len(data["citations"]) == 1
            assert data["citations"][0]["doc_id"] == str(MOCK_DOC_ID)
            assert data["citations"][0]["chunk_index"] == 0
            mock_answer.assert_called_once()
