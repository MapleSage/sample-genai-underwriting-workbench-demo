import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { handleOAuthCallback } from "../utils/cognitoOAuth";

export const OAuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const processCallback = async () => {
      const tokens = await handleOAuthCallback();

      if (tokens) {
        // Successfully authenticated, redirect to home
        navigate("/", { replace: true });
      } else {
        // Failed to authenticate, redirect to login
        navigate("/login", { replace: true });
      }
    };

    processCallback();
  }, [navigate]);

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
