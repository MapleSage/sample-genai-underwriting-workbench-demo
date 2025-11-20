import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { signInWithManagedLogin, isAuthenticated } from "../utils/cognitoOAuth";

export const LoginPage = () => {
  useEffect(() => {
    // Immediately redirect to Cognito - no UI shown
    if (!isAuthenticated()) {
      signInWithManagedLogin();
    }
  }, []);

  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  // This should never be seen - immediate redirect
  return null;
};
