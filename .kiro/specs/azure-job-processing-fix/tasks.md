# Implementation Plan

- [x] 1. Create FastAPI-based API handler with CORS support
  - Create `api-server.py` with FastAPI framework
  - Implement CORS middleware for https://uw.sagesure.io
  - Implement document upload endpoint with SAS token generation
  - Implement job listing and status endpoints
  - Implement analysis and chat endpoints
  - Add health check and readiness endpoints
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 2.4, 2.5_

- [ ] 1.1 Write property test for CORS headers
  - **Property 7: CORS header presence**
  - **Validates: Requirements 4.1**

- [ ] 1.2 Write property test for CORS methods
  - **Property 8: CORS methods**
  - **Validates: Requirements 4.3**

- [ ] 1.3 Write unit tests for API endpoints
  - Test upload endpoint with valid input
  - Test upload endpoint with missing filename
  - Test job status retrieval
  - Test job not found returns 404
  - Test OPTIONS preflight requests
  - _Requirements: 4.2, 4.5_

- [x] 2. Implement Azure SDK client initialization with retry logic
  - Create client factory for Cosmos DB, Blob Storage, and Service Bus
  - Implement managed identity authentication with fallback to connection strings
  - Add exponential backoff retry wrapper
  - Add connection pooling and client reuse
  - _Requirements: 2.2, 7.2_

- [ ] 2.1 Write property test for retry exponential backoff
  - **Property 14: Retry behavior**
  - **Validates: Requirements 7.2**

- [ ] 2.2 Write unit tests for client initialization
  - Test managed identity authentication
  - Test fallback to connection string
  - Test retry logic with transient failures
  - _Requirements: 2.2_

- [x] 3. Implement job creation and Service Bus enqueuing
  - Create job document in Cosmos DB with "pending" status
  - Generate SAS token for blob upload
  - Enqueue message to Service Bus with job details
  - Ensure atomicity (both succeed or both fail)
  - _Requirements: 1.1, 2.4_

- [ ] 3.1 Write property test for job creation atomicity
  - **Property 1: Job creation and enqueuing**
  - **Validates: Requirements 1.1**

- [ ] 3.2 Write unit tests for job creation
  - Test job creation with valid input
  - Test SAS token generation
  - Test Service Bus message format
  - Test error handling when Cosmos DB fails
  - Test error handling when Service Bus fails
  - _Requirements: 1.1, 2.4_

- [x] 4. Create document processing worker
  - Create `worker.py` with Service Bus listener
  - Implement message receive loop with proper error handling
  - Add graceful shutdown handling
  - Add liveness probe file updates
  - _Requirements: 1.2, 2.3_

- [ ] 4.1 Write unit test for worker startup
  - Test worker connects to Service Bus
  - Test worker listens to correct queue
  - _Requirements: 2.2, 2.3_

- [x] 5. Implement job status update logic
  - Create function to update job status in Cosmos DB
  - Ensure status updates are persisted immediately
  - Add progress tracking fields
  - Implement status validation (prevent invalid transitions)
  - _Requirements: 1.3, 3.1, 3.3_

- [ ] 5.1 Write property test for status progression
  - **Property 3: Status progression**
  - **Validates: Requirements 1.3**

- [ ] 5.2 Write property test for status persistence
  - **Property 4: Status persistence**
  - **Validates: Requirements 3.1**

- [ ] 5.3 Write unit tests for status updates
  - Test status update to "processing"
  - Test status update to "completed"
  - Test status update to "failed"
  - Test invalid status transitions are rejected
  - _Requirements: 1.3, 1.4, 1.5_

- [x] 6. Implement PDF download and page conversion
  - Download PDF from Blob Storage using job's blob path
  - Use PyPDF2 or pypdf to read PDF
  - Convert each page to PNG/JPEG image
  - Store images temporarily for processing
  - _Requirements: 5.1, 5.2_

- [ ] 6.1 Write property test for PDF download
  - **Property 9: PDF download success**
  - **Validates: Requirements 5.1**

- [ ] 6.2 Write property test for page conversion completeness
  - **Property 10: Page processing completeness**
  - **Validates: Requirements 5.5**

- [ ] 6.3 Write unit tests for PDF processing
  - Test PDF download with valid blob path
  - Test PDF download with invalid path fails gracefully
  - Test page conversion for single-page PDF
  - Test page conversion for multi-page PDF
  - Test handling of corrupted PDF
  - _Requirements: 5.1, 5.2_

- [x] 7. Implement Azure OpenAI text extraction
  - Create Azure OpenAI client
  - Implement page-by-page text extraction using GPT-4 Vision
  - Extract key-value pairs from each page
  - Classify page types (application, medical, financial)
  - Store extracted data in structured format
  - _Requirements: 5.3, 5.4_

- [ ] 7.1 Write property test for extraction data structure
  - **Property 12: Analysis structure**
  - **Validates: Requirements 6.3**

- [ ] 7.2 Write unit tests for OpenAI extraction
  - Test extraction call with valid image
  - Test extraction response parsing
  - Test key-value pair extraction
  - Test page type classification
  - Test handling of OpenAI rate limits
  - Test handling of OpenAI timeouts
  - _Requirements: 5.3, 5.4_

- [x] 8. Implement underwriting analysis
  - Trigger analysis after extraction completes
  - Send extracted data to Azure OpenAI for comprehensive analysis
  - Identify medical history, risk factors, and discrepancies
  - Generate summary, risks array, and recommendations
  - Store analysis results in Cosmos DB
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 8.1 Write property test for analysis trigger
  - **Property 11: Analysis trigger**
  - **Validates: Requirements 6.1**

- [ ] 8.2 Write unit tests for analysis
  - Test analysis is triggered after extraction
  - Test analysis result structure
  - Test risk identification
  - Test recommendation generation
  - Test analysis storage in Cosmos DB
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 9. Implement comprehensive error handling
  - Add try-catch blocks around all external service calls
  - Log errors with context (jobId, step, timestamp)
  - Update job status to "failed" with error details
  - Implement retry logic with exponential backoff
  - Handle Service Bus message completion and abandonment
  - _Requirements: 1.5, 7.1, 7.2, 7.4_

- [ ] 9.1 Write property test for error logging
  - **Property 13: Error logging**
  - **Validates: Requirements 7.1**

- [ ] 9.2 Write property test for error status update
  - **Property 16: Error status update**
  - **Validates: Requirements 7.4**

- [ ] 9.3 Write unit tests for error handling
  - Test error logging includes required fields
  - Test job status updated to "failed" on error
  - Test retry logic with transient errors
  - Test dead-letter queue after max retries
  - Test Service Bus message abandonment on error
  - _Requirements: 1.5, 7.1, 7.2, 7.3, 7.4_

- [x] 10. Create Dockerfile for API handler
  - Create `Dockerfile.api` with Python 3.11 base image
  - Install FastAPI, uvicorn, and Azure SDK dependencies
  - Copy api-server.py and requirements
  - Set up non-root user for security
  - Expose port 8080
  - Add health check
  - _Requirements: 2.1_

- [x] 11. Create Dockerfile for worker
  - Create `Dockerfile.worker` with Python 3.11 base image
  - Install Azure SDK, PyPDF2, Pillow, and OpenAI dependencies
  - Copy worker.py and requirements
  - Set up non-root user for security
  - Add liveness probe file creation
  - _Requirements: 2.1_

- [x] 12. Update Kubernetes manifests with correct configuration
  - Update ConfigMap with actual Azure resource names
  - Update ServiceAccount with workload identity client ID
  - Update API handler deployment with correct image
  - Update worker deployment with correct image
  - Update ingress with CORS annotations
  - Ensure KEDA ScaledObject is configured for worker autoscaling
  - _Requirements: 2.1, 8.1_

- [x] 13. Create deployment script
  - Create `deploy-azure-complete.sh` script
  - Get Terraform outputs for resource names
  - Build and push Docker images to ACR
  - Update manifests with actual values
  - Apply Kubernetes manifests
  - Wait for deployments to be ready
  - Output API endpoint and verification steps
  - _Requirements: 8.1, 8.2, 8.3, 8.5_

- [ ]* 13.1 Write property test for deployment idempotency
  - **Property 17: Deployment idempotency**
  - **Validates: Requirements 8.1**

- [ ] 14. Checkpoint - Ensure all tests pass, ask the user if questions arise

- [ ] 15. Create integration test script
  - Upload test PDF via API
  - Poll job status until completed
  - Verify job progresses through all states
  - Verify extracted data is populated
  - Verify analysis is populated
  - Test CORS headers in responses
  - Test error handling with invalid PDF
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.3, 3.4, 4.1_

- [ ] 15.1 Write integration tests
  - Test end-to-end document processing
  - Test CORS integration
  - Test error recovery
  - _Requirements: All_

- [ ] 16. Create monitoring and logging configuration
  - Add structured logging to all components
  - Configure log levels via environment variables
  - Add metrics for job processing time
  - Add metrics for queue depth
  - Add metrics for error rates
  - Document key metrics and alerts
  - _Requirements: 7.1, 7.5_

- [ ] 17. Create troubleshooting documentation
  - Document common issues and solutions
  - Document how to check worker logs
  - Document how to check Service Bus queue
  - Document how to manually retry failed jobs
  - Document how to check dead-letter queue
  - _Requirements: 7.5_

- [ ] 18. Final checkpoint - Ensure all tests pass, ask the user if questions arise
