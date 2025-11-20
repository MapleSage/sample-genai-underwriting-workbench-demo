import { useEffect } from "react";
import { useOAuth } from "../contexts/OAuthContext";
import { Navigate } from "react-router-dom";
import "../components/Auth/Auth.css";

export const LoginPage = () => {
  const { isAuthenticated, signIn } = useOAuth();

  useEffect(() => {
    // Auto-redirect to Cognito Managed Login
    if (!isAuthenticated) {
      signIn();
    }
  }, [isAuthenticated, signIn]);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="auth-container">
      <div className="auth-form">
        <h2>Redirecting to Sign In...</h2>
        <p>You will be redirected to the secure login page.</p>
        <button
          onClick={signIn}
          className="auth-button"
          style={{ marginTop: "20px" }}>
          Click here if not redirected
        </button>
      </div>
    </div>
  );
};
