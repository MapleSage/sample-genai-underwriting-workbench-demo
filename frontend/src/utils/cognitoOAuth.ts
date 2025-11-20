// Cognito OAuth Configuration
const COGNITO_DOMAIN = "us-east-1bdqsu9gjr.auth.us-east-1.amazoncognito.com";
const CLIENT_ID = "5i2dhf6pff75v7i0ukvimddt7";
const REDIRECT_URI = window.location.origin + "/auth/callback";
const LOGOUT_URI = window.location.origin + "/";

// Generate random string for PKCE
function generateRandomString(length: number): string {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
}

// Generate code challenge for PKCE
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Redirect to Cognito Managed Login page
export async function signInWithManagedLogin() {
  const state = generateRandomString(32);
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store for later use
  sessionStorage.setItem("oauth_state", state);
  sessionStorage.setItem("code_verifier", codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state: state,
    scope: "email openid phone",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  // Redirect to Cognito Managed Login
  window.location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`;
}

// Handle OAuth callback
export async function handleOAuthCallback(): Promise<{
  accessToken: string;
  idToken: string;
  refreshToken: string;
} | null> {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  const state = urlParams.get("state");
  const storedState = sessionStorage.getItem("oauth_state");
  const codeVerifier = sessionStorage.getItem("code_verifier");

  if (!code || !state || state !== storedState || !codeVerifier) {
    console.error("Invalid OAuth callback");
    return null;
  }

  // Clean up
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("code_verifier");

  // Exchange code for tokens
  const tokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code: code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  try {
    const response = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenParams.toString(),
    });

    if (!response.ok) {
      throw new Error("Token exchange failed");
    }

    const tokens = await response.json();

    // Store tokens
    localStorage.setItem("access_token", tokens.access_token);
    localStorage.setItem("id_token", tokens.id_token);
    localStorage.setItem("refresh_token", tokens.refresh_token);
    localStorage.setItem(
      "token_expiry",
      String(Date.now() + tokens.expires_in * 1000)
    );

    return tokens;
  } catch (error) {
    console.error("Error exchanging code for tokens:", error);
    return null;
  }
}

// Sign out
export function signOut() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("id_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("token_expiry");

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: LOGOUT_URI,
  });

  window.location.href = `https://${COGNITO_DOMAIN}/logout?${params.toString()}`;
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
  const token = localStorage.getItem("id_token");
  const expiry = localStorage.getItem("token_expiry");

  if (!token || !expiry) {
    return false;
  }

  return Date.now() < parseInt(expiry);
}

// Get ID token
export function getIdToken(): string | null {
  if (!isAuthenticated()) {
    return null;
  }
  return localStorage.getItem("id_token");
}

// Get access token
export function getAccessToken(): string | null {
  if (!isAuthenticated()) {
    return null;
  }
  return localStorage.getItem("access_token");
}

// Refresh tokens
export async function refreshTokens(): Promise<boolean> {
  const refreshToken = localStorage.getItem("refresh_token");

  if (!refreshToken) {
    return false;
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  });

  try {
    const response = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      return false;
    }

    const tokens = await response.json();

    localStorage.setItem("access_token", tokens.access_token);
    localStorage.setItem("id_token", tokens.id_token);
    localStorage.setItem(
      "token_expiry",
      String(Date.now() + tokens.expires_in * 1000)
    );

    return true;
  } catch (error) {
    console.error("Error refreshing tokens:", error);
    return false;
  }
}
