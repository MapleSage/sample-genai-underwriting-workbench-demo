import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { isAuthenticated, signInWithAzureAD } from "../utils/azureAuth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faShieldAlt } from "@fortawesome/free-solid-svg-icons";
import "../styles/App.css";

export const LoginPage = () => {
  useEffect(() => {
    // If already authenticated, no need to do anything
    if (isAuthenticated()) {
      return;
    }
  }, []);

  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  const handleSignIn = () => {
    signInWithAzureAD();
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <FontAwesomeIcon icon={faShieldAlt} size="3x" color="#667eea" />
          <h1>GenAI Underwriting Workbench</h1>
          <p>Sign in to continue</p>
        </div>
        <button onClick={handleSignIn} className="login-button">
          <svg
            width="21"
            height="21"
            viewBox="0 0 21 21"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ marginRight: "12px" }}
          >
            <path
              d="M10.5 0L0 10.5L10.5 21L21 10.5L10.5 0Z"
              fill="#F25022"
            />
            <path d="M10.5 0L0 10.5H10.5V0Z" fill="#7FBA00" />
            <path d="M21 10.5L10.5 0V10.5H21Z" fill="#00A4EF" />
            <path d="M10.5 21L21 10.5H10.5V21Z" fill="#FFB900" />
          </svg>
          Sign in with Microsoft
        </button>
        <p className="login-footer">
          Powered by Azure Active Directory
        </p>
      </div>
    </div>
  );
};
