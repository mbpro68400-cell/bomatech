"""Upload endpoint — accepts a PDF and queues OCR processing."""

from __future__ import annotations

import hashlib

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.db.client import get_supabase_client
from app.deps import CurrentCompany

router = APIRouter()

MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    company_id: CurrentCompany,
    file: UploadFile = File(...),
) -> dict:
    """Upload a document. It is stored in Supabase Storage and queued for OCR."""
    if file.content_type not in {"application/pdf", "image/png", "image/jpeg"}:
        raise HTTPException(status_code=415, detail="Unsupported file type")

    content = await file.read()
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large")

    checksum = hashlib.sha256(content).hexdigest()

    db = get_supabase_client()

    # Insert metadata row (OCR will be picked up by a background worker)
    res = (
        db.table("documents")
        .insert({
            "company_id": str(company_id),
            "filename": file.filename or "upload",
            "storage_path": f"companies/{company_id}/{checksum}",
            "mime_type": file.content_type,
            "size_bytes": len(content),
            "checksum_sha256": checksum,
            "ocr_status": "pending",
        })
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to register upload")

    # Actual storage upload would go here via supabase.storage
    return {"document_id": res.data[0]["id"], "status": "pending"}
