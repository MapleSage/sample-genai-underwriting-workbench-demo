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
}

const OAuthContext = createContext<OAuthContextType | undefined>(undefined);

export const OAuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAuthenticated(isAuthenticated());
    setLoading(false);
  }, []);

  const handleSignIn = () => {
    signInWithManagedLogin();
  };

  const handleSignOut = () => {
    signOut();
  };

  const getToken = () => {
    return getIdToken();
  };

  return (
    <OAuthContext.Provider
      value={{
        isAuthenticated: authenticated,
        isLoading: loading,
        signIn: handleSignIn,
        signOut: handleSignOut,
        getToken,
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
