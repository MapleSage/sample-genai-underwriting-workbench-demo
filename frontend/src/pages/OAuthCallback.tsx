import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { handleOAuthCallback } from "../utils/cognitoOAuth";
import { useOAuth } from "../contexts/OAuthContext";

export const OAuthCallback = () => {
  const navigate = useNavigate();
  const { refreshAuthState } = useOAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double execution
    if (hasProcessed.current) {
      return;
    }
    hasProcessed.current = true;

    const processCallback = async () => {
      const tokens = await handleOAuthCallback();

      if (tokens) {
        // Successfully authenticated, refresh auth state and redirect to home
        refreshAuthState();
        // Small delay to ensure state is updated
        setTimeout(() => {
          navigate("/", { replace: true });
        }, 100);
      } else {
        // Failed to authenticate, redirect to login
        navigate("/login", { replace: true });
      }
    };

    processCallback();
  }, [navigate, refreshAuthState]);

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
      Completing sign in...
    </div>
  );
};
