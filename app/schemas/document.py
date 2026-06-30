from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import List, Optional
from app.models.models import DocumentStatus

class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    status: DocumentStatus
    created_at: datetime

    class Config:
        from_attributes = True

class DocumentIngestData(BaseModel):
    document_id: UUID
    filename: str
    status: DocumentStatus

class IngestResponse(BaseModel):
    message: str
    data: List[DocumentIngestData]

class DocumentStatusResponse(BaseModel):
    document_id: UUID
    status: DocumentStatus
    ready_for_extraction: bool

    class Config:
        from_attributes = True

class ExtractionRequest(BaseModel):
    document_id: UUID

class LiabilityCap(BaseModel):
    value: Optional[float] = None
    currency: Optional[str] = None

class ExtractedData(BaseModel):
    parties: List[str]
    effective_date: Optional[str] = None
    term: Optional[str] = None
    governing_law: Optional[str] = None
    payment_terms: Optional[str] = None
    termination: Optional[str] = None
    auto_renewal: bool
    confidentiality: bool
    indemnity: Optional[str] = None
    liability_cap: Optional[LiabilityCap] = None
    signatories: List[str]

class ExtractionResponse(BaseModel):
    document_id: UUID
    extracted_data: ExtractedData

class AuditRequest(BaseModel):
    document_id: UUID

class AuditFinding(BaseModel):
    clause_type: str
    severity: str
    evidence: str
    explanation: str

class AuditReport(BaseModel):
    findings: List[AuditFinding]

class AuditResponse(BaseModel):
    document_id: UUID
    audit_report: AuditReport
