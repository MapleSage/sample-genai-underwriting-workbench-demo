const CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID || "65ee45ec-2acb-4fd8-98fd-e96aa2fe8e5c";
const TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID || "e9394f90-446d-41dd-8c8c-98ac08c5f090";
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI || window.location.origin + "/auth/callback";
const POST_LOGOUT_REDIRECT_URI = import.meta.env.VITE_POST_LOGOUT_REDIRECT_URI || window.location.origin + "/";

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
