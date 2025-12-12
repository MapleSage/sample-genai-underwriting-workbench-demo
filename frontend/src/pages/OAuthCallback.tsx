import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export const OAuthCallback = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      navigate("/", { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        fontSize: "18px",
        color: "#667eea",
      }}
    >
      Processing sign in...
    </div>
  );
};
