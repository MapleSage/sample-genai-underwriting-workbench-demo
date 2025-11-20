import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import "./Auth.css";

interface ConfirmSignUpFormProps {
  username: string;
  onConfirmSuccess: () => void;
  onSwitchToLogin: () => void;
}

export const ConfirmSignUpForm: React.FC<ConfirmSignUpFormProps> = ({
  username,
  onConfirmSuccess,
  onSwitchToLogin,
}) => {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { confirmSignUp, resendConfirmationCode } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await confirmSignUp(username, code);
      onConfirmSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to confirm sign up");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError("");
    setResending(true);

    try {
      await resendConfirmationCode(username);
      alert("Confirmation code resent to your email");
    } catch (err: any) {
      setError(err.message || "Failed to resend code");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-form">
      <h2>Confirm Your Account</h2>
      <p>
        We've sent a confirmation code to your email. Please enter it below.
      </p>

      <form onSubmit={handleSubmit}>
        {error && <div className="auth-error">{error}</div>}

        <div className="form-group">
          <label htmlFor="code">Confirmation Code</label>
          <input
            id="code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            placeholder="Enter 6-digit code"
          />
        </div>

        <button type="submit" disabled={loading} className="auth-button">
          {loading ? "Confirming..." : "Confirm Account"}
        </button>
      </form>

      <div className="auth-links">
        <button
          onClick={handleResendCode}
          disabled={resending}
          className="link-button">
          {resending ? "Resending..." : "Resend code"}
        </button>
        <button onClick={onSwitchToLogin} className="link-button">
          Back to sign in
        </button>
      </div>
    </div>
  );
};
