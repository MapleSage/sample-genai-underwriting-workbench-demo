import React, { createContext, useContext, useState, useEffect } from "react";
import {
  CognitoUser,
  AuthenticationDetails,
  CognitoUserPool,
  CognitoUserAttribute,
} from "amazon-cognito-identity-js";
import { cognitoConfig } from "../config/cognito";

interface AuthContextType {
  user: CognitoUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
  confirmSignUp: (username: string, code: string) => Promise<void>;
  resendConfirmationCode: (username: string) => Promise<void>;
  forgotPassword: (username: string) => Promise<void>;
  confirmPassword: (
    username: string,
    code: string,
    newPassword: string
  ) => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const userPool = new CognitoUserPool({
  UserPoolId: cognitoConfig.userPoolId,
  ClientId: cognitoConfig.userPoolWebClientId,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<CognitoUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const currentUser = userPool.getCurrentUser();
    if (currentUser) {
      currentUser.getSession((err: Error | null, session: any) => {
        if (err) {
          console.error("Session error:", err);
          setIsLoading(false);
          return;
        }
        if (session.isValid()) {
          setUser(currentUser);
        }
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  const signIn = async (username: string, password: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: username,
        Password: password,
      });

      const cognitoUser = new CognitoUser({
        Username: username,
        Pool: userPool,
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (result) => {
          setUser(cognitoUser);
          resolve();
        },
        onFailure: (err) => {
          reject(err);
        },
        newPasswordRequired: (userAttributes, requiredAttributes) => {
          // Handle new password required
          reject(new Error("New password required"));
        },
      });
    });
  };

  const signUp = async (
    username: string,
    email: string,
    password: string
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const attributeList = [
        new CognitoUserAttribute({
          Name: "email",
          Value: email,
        }),
      ];

      userPool.signUp(username, password, attributeList, [], (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  };

  const confirmSignUp = async (
    username: string,
    code: string
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: username,
        Pool: userPool,
      });

      cognitoUser.confirmRegistration(code, true, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  };

  const resendConfirmationCode = async (username: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: username,
        Pool: userPool,
      });

      cognitoUser.resendConfirmationCode((err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  };

  const forgotPassword = async (username: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: username,
        Pool: userPool,
      });

      cognitoUser.forgotPassword({
        onSuccess: () => {
          resolve();
        },
        onFailure: (err) => {
          reject(err);
        },
      });
    });
  };

  const confirmPassword = async (
    username: string,
    code: string,
    newPassword: string
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: username,
        Pool: userPool,
      });

      cognitoUser.confirmPassword(code, newPassword, {
        onSuccess: () => {
          resolve();
        },
        onFailure: (err) => {
          reject(err);
        },
      });
    });
  };

  const signOut = () => {
    const currentUser = userPool.getCurrentUser();
    if (currentUser) {
      currentUser.signOut();
    }
    setUser(null);
  };

  const getIdToken = async (): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      const currentUser = userPool.getCurrentUser();
      if (!currentUser) {
        resolve(null);
        return;
      }

      currentUser.getSession((err: Error | null, session: any) => {
        if (err) {
          reject(err);
          return;
        }
        if (session.isValid()) {
          resolve(session.getIdToken().getJwtToken());
        } else {
          resolve(null);
        }
      });
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        signIn,
        signUp,
        signOut,
        confirmSignUp,
        resendConfirmationCode,
        forgotPassword,
        confirmPassword,
        getIdToken,
      }}>
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
