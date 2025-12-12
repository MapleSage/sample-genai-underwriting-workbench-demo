import React, { createContext, useContext, useState, useEffect } from "react";
import {
  isAuthenticated,
  signInWithAzureAD,
  signOut,
  getIdToken,
  handleRedirectCallback,
  initializeMsal,
  getUserInfo,
} from "../utils/azureAuth";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: () => void;
  signOut: () => void;
  getToken: () => Promise<string | null>;
  userInfo: { username: string; name: string | undefined; email: string } | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<{ username: string; name: string | undefined; email: string } | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        // Initialize MSAL
        await initializeMsal();

        // Handle redirect callback only when returning from Azure AD (prevent race conditions)
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        const hasRedirectParams = currentPath === "/auth/callback" || currentSearch.includes("code=") || currentSearch.includes("state=");

        if (hasRedirectParams) {
          console.debug("Found redirect params; handling redirect callback");
          try {
            const response = await handleRedirectCallback();
            if (response) {
              console.debug("Login successful:", response);
            }
          } catch (err) {
            console.error("Error handling redirect callback:", err);
          }
        } else {
          console.debug("No redirect params detected; skipping handleRedirectCallback");
        }

        // Check authentication status
        const authState = isAuthenticated();
        console.debug("Auth state after init:", authState);
        setAuthenticated(authState);

        // Get user info if authenticated
        if (authState) {
          const info = getUserInfo();
          setUserInfo(info);
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  const handleSignIn = () => {
    signInWithAzureAD();
  };

  const handleSignOut = async () => {
    await signOut();
    setAuthenticated(false);
    setUserInfo(null);
  };

  const getToken = async () => {
    return await getIdToken();
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: authenticated,
        isLoading: loading,
        signIn: handleSignIn,
        signOut: handleSignOut,
        getToken,
        userInfo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
