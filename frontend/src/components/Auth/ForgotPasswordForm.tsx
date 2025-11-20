import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import "./Auth.css";

interface ForgotPasswordFormProps {
  onSwitchToLogin: () => void;
}

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({
  onSwitchToLogin,
}) => {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"request" | "confirm">("request");
  const { forgotPassword, confirmPassword: confirmPasswordReset } = useAuth();

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await forgotPassword(username);
      setStep("confirm");
    } catch (err: any) {
      setError(err.message || "Failed to send reset code");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setLoading(true);

    try {
      await confirmPasswordReset(username, code, newPassword);
      alert(
        "Password reset successful! Please sign in with your new password."
      );
      onSwitchToLogin();
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (step === "request") {
    return (
      <div className="auth-form">
        <h2>Reset Password</h2>
        <p>Enter your username to receive a password reset code.</p>

        <form onSubmit={handleRequestCode}>
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={loading} className="auth-button">
            {loading ? "Sending code..." : "Send Reset Code"}
          </button>
        </form>

        <div className="auth-links">
          <button onClick={onSwitchToLogin} className="link-button">
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-form">
      <h2>Reset Password</h2>
      <p>Enter the code sent to your email and your new password.</p>

      <form onSubmit={handleConfirmReset}>
        {error && <div className="auth-error">{error}</div>}

        <div className="form-group">
          <label htmlFor="code">Reset Code</label>
          <input
            id="code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            placeholder="Enter 6-digit code"
          />
        </div>

        <div className="form-group">
          <label htmlFor="newPassword">New Password</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
          <small>Must be at least 8 characters</small>
        </div>

        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm New Password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" disabled={loading} className="auth-button">
          {loading ? "Resetting password..." : "Reset Password"}
        </button>
      </form>

      <div className="auth-links">
        <button onClick={onSwitchToLogin} className="link-button">
          Back to sign in
        </button>
      </div>
    </div>
  );
};
