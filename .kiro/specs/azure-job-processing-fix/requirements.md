# Requirements Document

## Introduction

This specification addresses the incomplete Azure deployment of the GenAI Underwriting Workbench. The original AWS sample has been partially migrated to Azure with AKS deployment and Cognito authentication working correctly. However, the document processing pipeline is incomplete, causing uploaded jobs to get stuck in "pending" status instead of being processed through extraction and analysis stages.

## Glossary

- **UW Workbench**: The GenAI Underwriting Workbench application
- **Job**: A document processing request created when a user uploads insurance documents
- **Service Bus**: Azure Service Bus queue used for asynchronous job processing
- **Blob Storage**: Azure Blob Storage for storing uploaded PDF documents
- **Cosmos DB**: Azure Cosmos DB for storing job metadata and analysis results
- **AKS**: Azure Kubernetes Service where the application is deployed
- **Worker**: Background process that listens to Service Bus queue and processes documents
- **API Handler**: REST API service that handles frontend requests
- **Document Extract Function**: Azure Function that extracts text and data from PDF documents
- **Analysis Function**: Azure Function that performs AI-powered underwriting analysis

## Requirements

### Requirement 1

**User Story:** As a user, I want my uploaded documents to be processed automatically, so that I can view analysis results without manual intervention.

#### Acceptance Criteria

1. WHEN a user uploads a document THEN the system SHALL create a job with status "pending" and enqueue a message to Service Bus
2. WHEN a message is added to Service Bus THEN the worker SHALL receive and process it within 30 seconds
3. WHEN the worker processes a job THEN the system SHALL update job status from "pending" to "processing"
4. WHEN document extraction completes THEN the system SHALL update job status to "completed" and store extracted data in Cosmos DB
5. WHEN any processing step fails THEN the system SHALL update job status to "failed" and log error details

### Requirement 2

**User Story:** As a developer, I want to deploy the complete processing pipeline to AKS, so that the Azure version matches the AWS functionality.

#### Acceptance Criteria

1. WHEN deploying to AKS THEN the system SHALL create both API handler and worker deployments
2. WHEN the worker starts THEN the system SHALL authenticate using workload identity and connect to Service Bus
3. WHEN the worker connects to Service Bus THEN the system SHALL begin listening for messages on the document-extraction queue
4. WHEN the API handler receives upload requests THEN the system SHALL generate SAS tokens for Blob Storage and enqueue processing messages
5. WHEN querying job status THEN the API SHALL return current status from Cosmos DB including any error messages

### Requirement 3

**User Story:** As a user, I want to see real-time job status updates, so that I know when my documents are being processed.

#### Acceptance Criteria

1. WHEN a job status changes THEN the system SHALL persist the new status to Cosmos DB immediately
2. WHEN the frontend polls for job status THEN the API SHALL return the current status within 1 second
3. WHEN a job is processing THEN the system SHALL update progress indicators (e.g., "extracting page 3 of 10")
4. WHEN a job completes THEN the system SHALL make analysis results available via the API
5. WHEN a job fails THEN the system SHALL provide a user-friendly error message explaining what went wrong

### Requirement 4

**User Story:** As an operations engineer, I want proper CORS configuration, so that the frontend at https://uw.sagesure.io can communicate with the API.

#### Acceptance Criteria

1. WHEN the frontend makes API requests THEN the system SHALL include CORS headers allowing https://uw.sagesure.io
2. WHEN the frontend sends OPTIONS preflight requests THEN the system SHALL respond with appropriate CORS headers
3. WHEN the API responds THEN the system SHALL include headers for GET, POST, PUT, DELETE, OPTIONS methods
4. WHEN the API responds THEN the system SHALL allow Authorization, Content-Type, and standard headers
5. WHEN CORS validation fails THEN the system SHALL return a 403 status with clear error messaging

### Requirement 5

**User Story:** As a developer, I want the worker to handle PDF processing correctly, so that documents are converted to images and text is extracted.

#### Acceptance Criteria

1. WHEN the worker receives a job message THEN the system SHALL download the PDF from Blob Storage using SAS token
2. WHEN the PDF is downloaded THEN the system SHALL convert each page to an image format suitable for AI processing
3. WHEN images are generated THEN the system SHALL send them to Azure OpenAI for text extraction and analysis
4. WHEN extraction completes THEN the system SHALL store structured data (key-value pairs, classifications) in Cosmos DB
5. WHEN the PDF has multiple pages THEN the system SHALL process pages in batches to optimize performance

### Requirement 6

**User Story:** As a user, I want AI-powered analysis of my documents, so that I can quickly identify underwriting risks and insights.

#### Acceptance Criteria

1. WHEN document extraction completes THEN the system SHALL trigger analysis using Azure OpenAI GPT-4
2. WHEN performing analysis THEN the system SHALL identify medical history, risk factors, and discrepancies
3. WHEN analysis completes THEN the system SHALL store results with structured sections (summary, risks, recommendations)
4. WHEN the user views results THEN the API SHALL return formatted analysis with page references
5. WHEN analysis identifies critical risks THEN the system SHALL highlight them prominently in the results

### Requirement 7

**User Story:** As a developer, I want comprehensive error handling and logging, so that I can troubleshoot issues when jobs fail.

#### Acceptance Criteria

1. WHEN any component encounters an error THEN the system SHALL log the error with context (job ID, step, timestamp)
2. WHEN the worker fails to process a message THEN the system SHALL retry up to 3 times with exponential backoff
3. WHEN retries are exhausted THEN the system SHALL move the message to a dead-letter queue
4. WHEN errors occur THEN the system SHALL update job status with specific error details
5. WHEN viewing logs THEN operators SHALL be able to trace a job through all processing stages

### Requirement 8

**User Story:** As a developer, I want the deployment to be idempotent and automated, so that I can reliably deploy updates.

#### Acceptance Criteria

1. WHEN running the deployment script THEN the system SHALL check for existing resources before creating new ones
2. WHEN updating deployments THEN the system SHALL perform rolling updates without downtime
3. WHEN deployment completes THEN the system SHALL verify all pods are healthy before marking success
4. WHEN deployment fails THEN the system SHALL rollback to the previous working version
5. WHEN deploying THEN the system SHALL output all necessary endpoints and configuration values
