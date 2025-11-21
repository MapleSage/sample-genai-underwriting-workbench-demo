import React, { createContext, useContext, useState, useEffect } from "react";
import {
  isAuthenticated,
  signInWithManagedLogin,
  signOut,
  getIdToken,
} from "../utils/cognitoOAuth";

interface OAuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: () => void;
  signOut: () => void;
  getToken: () => string | null;
  refreshAuthState: () => void;
}

const OAuthContext = createContext<OAuthContextType | undefined>(undefined);

export const OAuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAuthState = () => {
    const authState = isAuthenticated();
    setAuthenticated(authState);
    return authState;
  };

  useEffect(() => {
    checkAuthState();
    setLoading(false);
  }, []);

  const handleSignIn = () => {
    signInWithManagedLogin();
  };

  const handleSignOut = () => {
    signOut();
    setAuthenticated(false);
  };

  const getToken = () => {
    return getIdToken();
  };

  const refreshAuthState = () => {
    checkAuthState();
  };

  return (
    <OAuthContext.Provider
      value={{
        isAuthenticated: authenticated,
        isLoading: loading,
        signIn: handleSignIn,
        signOut: handleSignOut,
        getToken,
        refreshAuthState,
      }}>
      {children}
    </OAuthContext.Provider>
  );
};

export const useOAuth = () => {
  const context = useContext(OAuthContext);
  if (context === undefined) {
    throw new Error("useOAuth must be used within an OAuthProvider");
  }
  return context;
};
