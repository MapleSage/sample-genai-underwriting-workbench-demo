# Azure AD Authentication (MSAL) Setup

This project now uses Azure Active Directory (Azure AD) for authentication via MSAL.

## Overview

Follow these steps to register an application in Azure AD and configure the frontend to use MSAL.

## Steps

1. Register an app in Azure AD
   - Go to Azure Portal → Azure Active Directory → App Registrations → New registration
   - Name: `uw-workbench-frontend`
   - Supported account types: Accounts in this organizational directory only (Single tenant) or as necessary
   - Redirect URI: `https://<your-domain>/auth/callback` (or `http://localhost:5173/auth/callback` for local development)
    - After registration, note the **Application (client) ID** and **Directory (tenant) ID**.
    - For this project (SageSure):
       - **Display name**: SageSure
       - **Application (client) ID**: 65ee45ec-2acb-4fd8-98fd-e96aa2fe8e5c
       - **Directory (tenant) ID**: e9394f90-446d-41dd-8c8c-98ac08c5f090

2. Configure Authentication
   - In App Registration → Authentication, add the Redirect URI(s) used in your environment
   - Configure logout redirect to `/` as desired

3. API Permissions (optional)
   - Add `User.Read` permission under Microsoft Graph if you need to read user profile info.
   - Grant admin consent if required for organization.

4. Update Frontend Environment
   - Configure the following environment variables in your deployment environment or `.env.local` for local development:
   - `VITE_AZURE_CLIENT_ID` — Application (client) ID (example: 65ee45ec-2acb-4fd8-98fd-e96aa2fe8e5c)
   - `VITE_AZURE_TENANT_ID` — Directory (tenant) ID (example: e9394f90-446d-41dd-8c8c-98ac08c5f090)
     - `VITE_REDIRECT_URI` — full redirect URI (optional; defaults to window.location.origin + '/auth/callback')
     - `VITE_POST_LOGOUT_REDIRECT_URI` — post logout redirect URI (optional)

5. Test Locally
   - Run `npm run dev` and navigate to `http://localhost:5173`.
   - Click Sign-in; you'll be redirected to Azure AD; after sign-in you'll return to `/auth/callback`.

6. Production
   - Ensure the redirect URIs include the production domain and configure AAD app registration accordingly.

## Notes
 - MSAL stores tokens in localStorage; ensure your environment respects this for single-user sessions.
 - If you were previously using Cognito/AWS Amplify, remove or disable that configuration.
