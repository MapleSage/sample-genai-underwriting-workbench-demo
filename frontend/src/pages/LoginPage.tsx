import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { signInWithManagedLogin, isAuthenticated } from "../utils/cognitoOAuth";

export const LoginPage = () => {
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    // Check if already authenticated
    if (isAuthenticated()) {
      return;
    }

    // Small delay to ensure page is loaded, then redirect
    const timer = setTimeout(() => {
      setRedirecting(true);
      signInWithManagedLogin();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        fontSize: "18px",
        color: "#667eea",
      }}>
      {redirecting ? "Redirecting to sign in..." : "Loading..."}
    </div>
  );
};
