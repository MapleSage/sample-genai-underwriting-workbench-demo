import { PublicClientApplication, InteractionRequiredAuthError } from "@azure/msal-browser";
import { msalConfig, loginRequest, tokenRequest } from "../config/azure";

// Initialize MSAL instance
export const msalInstance = new PublicClientApplication(msalConfig);

// Initialize MSAL - must be called before using
export async function initializeMsal() {
    await msalInstance.initialize();
}

// Sign in with Azure AD using redirect
export async function signInWithAzureAD() {
    try {
        console.debug("signInWithAzureAD: initiating redirect login");
        await msalInstance.loginRedirect(loginRequest);
    } catch (error) {
        console.error("Login failed:", error);
        throw error;
    }
}

// Sign in with Azure AD using popup
export async function signInWithPopup() {
    try {
        const response = await msalInstance.loginPopup(loginRequest);
        return response;
    } catch (error) {
        console.error("Login popup failed:", error);
        throw error;
    }
}

// Handle redirect callback
export async function handleRedirectCallback() {
    try {
        console.debug("handleRedirectCallback: processing redirect promise");
        const response = await msalInstance.handleRedirectPromise();
        console.debug("handleRedirectCallback: response:", response);
        return response;
    } catch (error) {
        console.error("Error handling redirect:", error);
        return null;
    }
}

// Sign out
export async function signOut() {
    const account = msalInstance.getAllAccounts()[0];
    if (account) {
        await msalInstance.logoutRedirect({
            account: account,
            postLogoutRedirectUri: msalConfig.auth.postLogoutRedirectUri,
        });
    }
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
    const accounts = msalInstance.getAllAccounts();
    return accounts.length > 0;
}

// Get the current account
export function getCurrentAccount() {
    const accounts = msalInstance.getAllAccounts();
    return accounts.length > 0 ? accounts[0] : null;
}

// Get access token silently
export async function getAccessToken(): Promise<string | null> {
    const account = getCurrentAccount();

    if (!account) {
        return null;
    }

    try {
        const response = await msalInstance.acquireTokenSilent({
            ...tokenRequest,
            account: account,
        });
        console.debug("acquireTokenSilent: success");
        return response.accessToken;
    } catch (error) {
        console.warn("acquireTokenSilent: failed", error);
        if (error instanceof InteractionRequiredAuthError) {
            console.debug("acquireTokenSilent: interaction required, redirecting to acquire token via redirect");
            try {
                await msalInstance.acquireTokenRedirect({
                    ...tokenRequest,
                    account: account,
                });
                return null;
            } catch (redirectError) {
                console.error("Token acquisition failed:", redirectError);
                return null;
            }
        }
        console.error("Error acquiring token:", error);
        return null;
    }
}

// Get ID token
export async function getIdToken(): Promise<string | null> {
    const account = getCurrentAccount();

    if (!account) {
        return null;
    }

    try {
        const response = await msalInstance.acquireTokenSilent({
            ...tokenRequest,
            account: account,
        });
        return response.idToken;
    } catch (error) {
        console.error("Error acquiring ID token:", error);
        return null;
    }
}

// Get user info
export function getUserInfo() {
    const account = getCurrentAccount();
    if (!account) {
        return null;
    }

    return {
        username: account.username,
        name: account.name,
        email: account.username,
    };
}
