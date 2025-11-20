import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import "./Auth.css";

interface LoginFormProps {
  onSwitchToSignUp: () => void;
  onSwitchToForgotPassword: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSwitchToSignUp,
  onSwitchToForgotPassword,
}) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signIn(username, password);
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <h2>Sign In</h2>
      <form onSubmit={handleSubmit}>
        {error && <div className="auth-error">{error}</div>}

        <div className="form-group">
          <label htmlFor="username">Username or Email</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        <button type="submit" disabled={loading} className="auth-button">
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="auth-links">
        <button onClick={onSwitchToForgotPassword} className="link-button">
          Forgot password?
        </button>
        <button onClick={onSwitchToSignUp} className="link-button">
          Don't have an account? Sign up
        </button>
      </div>
    </div>
  );
};
