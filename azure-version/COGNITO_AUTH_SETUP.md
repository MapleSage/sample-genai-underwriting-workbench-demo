# AWS Cognito Authentication Setup (Deprecated)

## Overview

This file documents the previous setup using AWS Cognito. The project has been migrated to use Azure Active Directory (MSAL) for authentication. For the current setup, see `AZURE_AD_AUTH_SETUP.md`.

**Please follow azure-version/AZURE_AD_AUTH_SETUP.md for the up-to-date instructions.**

## Configuration

### Cognito Details

- **Region**: us-east-1
- **User Pool ID**: us-east-1_bdqsU9GjR
- **App Client ID**: 5i2dhf6pff75v7i0ukvimddt7
- **App Client Name**: UnderWriter Sage Client

### Features Implemented

✅ **Custom Login UI** - Fully branded login experience
✅ **Sign Up** - New user registration with email verification
✅ **Sign In** - Username/password authentication
✅ **Email Verification** - Confirmation code sent to email
✅ **Forgot Password** - Password reset flow
✅ **Sign Out** - Secure session termination
✅ **Protected Routes** - All app routes require authentication
✅ **JWT Token Management** - Automatic token refresh

## User Flow

### 1. Sign Up

1. User clicks "Sign up" on login page
2. Enters username, email, and password
3. Receives confirmation code via email
4. Enters code to verify account
5. Account is activated

### 2. Sign In

1. User enters username and password
2. JWT token is stored in browser
3. User is redirected to upload page
4. Token is automatically included in API requests

### 3. Forgot Password

1. User clicks "Forgot password"
2. Enters username
3. Receives reset code via email
4. Enters code and new password
5. Password is updated

## Components

### Frontend Components

```
frontend/src/
├── config/
│   └── cognito.ts                    # Cognito configuration
├── contexts/
│   └── AuthContext.tsx               # Authentication state management
├── components/Auth/
│   ├── AuthPage.tsx                  # Main auth page container
│   ├── LoginForm.tsx                 # Login form
│   ├── SignUpForm.tsx                # Registration form
│   ├── ConfirmSignUpForm.tsx         # Email verification
│   ├── ForgotPasswordForm.tsx        # Password reset
│   ├── ProtectedRoute.tsx            # Route protection
│   └── Auth.css                      # Auth UI styles
└── utils/
    └── api.ts                        # API helper with JWT tokens
```

### Key Files Modified

- `frontend/src/main.tsx` - Added AuthProvider
- `frontend/src/App.tsx` - Added protected routes and sign out button

## API Integration

### Automatic Token Inclusion

The app automatically includes JWT tokens in API requests:

```typescript
import { authenticatedFetch } from "./utils/api";

// Instead of:
fetch(url, options);

// Use:
authenticatedFetch(url, options);
```

The JWT token is included in the `Authorization` header:

```
Authorization: Bearer <jwt-token>
```

## Backend Configuration (Optional)

To validate JWT tokens on the Azure Function App backend, you would need to:

1. Install JWT validation library
2. Add middleware to verify Cognito JWT tokens
3. Extract user information from token claims

Example Python code for Azure Functions:

```python
import jwt
from jwt import PyJWKClient

COGNITO_REGION = 'us-east-1'
COGNITO_USER_POOL_ID = 'us-east-1_bdqsU9GjR'
COGNITO_APP_CLIENT_ID = '5i2dhf6pff75v7i0ukvimddt7'

jwks_url = f'https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json'
jwks_client = PyJWKClient(jwks_url)

def verify_token(token):
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        decoded = jwt.decode(
            token,
            signing_key.key,
            algorithms=['RS256'],
            audience=COGNITO_APP_CLIENT_ID
        )
        return decoded
    except Exception as e:
        return None
```

## Testing

### Create Test User

1. Go to https://uw.sagesure.io
2. Click "Sign up"
3. Enter:
   - Username: testuser
   - Email: your-email@example.com
   - Password: (min 8 characters)
4. Check email for verification code
5. Enter code to activate account
6. Sign in with credentials

### Test Protected Routes

1. Try accessing https://uw.sagesure.io/ without logging in
   - Should redirect to /login
2. Sign in
   - Should redirect to upload page
3. Click "Sign Out"
   - Should redirect to /login
   - Session should be cleared

## Security Features

✅ **Password Requirements**: Minimum 8 characters
✅ **Email Verification**: Required before account activation
✅ **JWT Tokens**: Secure, short-lived tokens
✅ **Automatic Token Refresh**: Handled by Cognito SDK
✅ **Secure Password Reset**: Code sent to verified email
✅ **Session Management**: Proper sign out clears all tokens

## Cognito User Pool Settings

Recommended settings in AWS Cognito Console:

### Sign-in Options

- Username
- Email

### Password Policy

- Minimum length: 8 characters
- Require numbers: Yes
- Require special characters: Yes
- Require uppercase: Yes
- Require lowercase: Yes

### MFA (Optional)

- Can enable SMS or TOTP for additional security

### Email Configuration

- Use Cognito's default email (for testing)
- Or configure SES for production

## Troubleshooting

### "User is not confirmed"

- User needs to verify email with confirmation code
- Resend code from confirmation page

### "Incorrect username or password"

- Check username and password are correct
- Password is case-sensitive

### "User does not exist"

- User needs to sign up first
- Or username is incorrect

### Token expired

- Tokens automatically refresh
- If issues persist, sign out and sign in again

## URLs

- **Frontend**: https://uw.sagesure.io
- **Login Page**: https://uw.sagesure.io/login
- **Cognito Console**: https://console.aws.amazon.com/cognito/v2/idp/user-pools/us-east-1_bdqsU9GjR

## Next Steps

1. ✅ Custom login UI implemented
2. ✅ All routes protected
3. ⏳ Add JWT validation to Azure Functions (optional)
4. ⏳ Enable MFA for additional security (optional)
5. ⏳ Configure custom email templates (optional)
6. ⏳ Add social login (Google, Microsoft) (optional)

## Support

For issues with authentication:

1. Check browser console for errors
2. Verify Cognito User Pool is active
3. Check user exists in Cognito Console
4. Verify email was confirmed
