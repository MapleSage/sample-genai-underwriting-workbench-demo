const CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID || "65ee45ec-2acb-4fd8-98fd-e96aa2fe8e5c";
const TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID || "e9394f90-446d-41dd-8c8c-98ac08c5f090";
// Resolve redirect URIs securely: prefer explicit build-time value but
// fallback to the current origin. If a build-time value points at
// localhost but the app is running on a non-localhost origin, prefer
// the runtime origin to avoid redirect-uri mismatch in production.
function resolveRedirectUri(envUri: string | undefined, fallbackPath: string) {
    if (!envUri) return window.location.origin + fallbackPath;
    try {
        const u = new URL(envUri);
        if (u.hostname.includes("localhost") && window.location.hostname !== "localhost") {
            // Running in production but built with a localhost redirect - ignore it
            return window.location.origin + fallbackPath;
        }
        return envUri;
    } catch (e) {
        return window.location.origin + fallbackPath;
    }
}

const REDIRECT_URI = resolveRedirectUri(import.meta.env.VITE_REDIRECT_URI, "/auth/callback");
const POST_LOGOUT_REDIRECT_URI = resolveRedirectUri(import.meta.env.VITE_POST_LOGOUT_REDIRECT_URI, "/");

export const msalConfig = {
    auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        redirectUri: REDIRECT_URI,
        postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI,
    },
    cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false,
    },
};

export const loginRequest = {
    scopes: ["openid", "profile", "email", "User.Read"],
};

export const tokenRequest = {
    scopes: ["openid", "profile", "email"],
};
