"""A small local-only mock API to support frontend development.

Endpoints:
- POST /documents/upload -> { uploadUrl, jobId }
- POST /documents/upload_batch -> [{ filename, uploadUrl, jobId }]
- GET /jobs -> list jobs
- GET /jobs/{jobId} -> job details
- PUT /mock-storage/{jobId}/{filename} -> accept upload and mark job in progress/completed

This is intentionally lightweight and does not require Azure/Cosmos; it's for local testing only.
"""
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
import uuid
import os
import asyncio

app = FastAPI(title="Dev Mock API")

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "dev_storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

jobs: Dict[str, Dict] = {}

class UploadRequest(BaseModel):
    filename: str
    contentType: Optional[str] = None
    insuranceType: Optional[str] = "life"

@app.post("/documents/upload")
async def upload_document(req: UploadRequest):
    job_id = f"job-{uuid.uuid4().hex}"
    filename = req.filename
    upload_url = f"http://localhost:8080/mock-storage/{job_id}/{filename}"

    jobs[job_id] = {
        "jobId": job_id,
        "filename": filename,
        "insuranceType": req.insuranceType,
        "status": "upload_pending",
        "createdAt": "",
        "updatedAt": "",
        "uploadUrl": upload_url,
    }

    return {"uploadUrl": upload_url, "jobId": job_id}

@app.post("/documents/upload_batch")
async def upload_batch(req: List[UploadRequest]):
    results = []
    for r in req:
        job_id = f"job-{uuid.uuid4().hex}"
        filename = r.filename
        upload_url = f"http://localhost:8080/mock-storage/{job_id}/{filename}"
        jobs[job_id] = {
            "jobId": job_id,
            "filename": filename,
            "insuranceType": r.insuranceType,
            "status": "upload_pending",
            "createdAt": "",
            "updatedAt": "",
            "uploadUrl": upload_url,
        }
        results.append({"filename": filename, "uploadUrl": upload_url, "jobId": job_id})
    return results

@app.get("/jobs")
async def list_jobs():
    return list(jobs.values())

@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

@app.put("/mock-storage/{job_id}/{filename}")
async def mock_upload(job_id: str, filename: str, request: Request):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    # Save uploaded content to storage dir
    job_dir = os.path.join(STORAGE_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    file_path = os.path.join(job_dir, filename)

    body = await request.body()
    with open(file_path, "wb") as f:
        f.write(body)

    # Mark job as in progress and schedule completion
    jobs[job_id]["status"] = "in_progress"

    async def complete_job_after_delay():
        await asyncio.sleep(2)
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["extractedData"] = {"summary": "This is mock extracted data."}

    asyncio.create_task(complete_job_after_delay())

    return Response(status_code=200)

@app.get("/mock-storage/{job_id}/{filename}")
async def serve_uploaded_file(job_id: str, filename: str):
    file_path = os.path.join(STORAGE_DIR, job_id, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, media_type="application/pdf")
