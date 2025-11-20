import React, { useState } from "react";
import { LoginForm } from "./LoginForm";
import { SignUpForm } from "./SignUpForm";
import { ConfirmSignUpForm } from "./ConfirmSignUpForm";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import "./Auth.css";

type AuthView = "login" | "signup" | "confirm" | "forgot-password";

export const AuthPage: React.FC = () => {
  const [view, setView] = useState<AuthView>("login");
  const [signUpUsername, setSignUpUsername] = useState("");

  const handleSignUpSuccess = (username: string) => {
    setSignUpUsername(username);
    setView("confirm");
  };

  const handleConfirmSuccess = () => {
    alert("Account confirmed! Please sign in.");
    setView("login");
  };

  return (
    <div className="auth-container">
      {view === "login" && (
        <LoginForm
          onSwitchToSignUp={() => setView("signup")}
          onSwitchToForgotPassword={() => setView("forgot-password")}
        />
      )}
      {view === "signup" && (
        <SignUpForm
          onSwitchToLogin={() => setView("login")}
          onSignUpSuccess={handleSignUpSuccess}
        />
      )}
      {view === "confirm" && (
        <ConfirmSignUpForm
          username={signUpUsername}
          onConfirmSuccess={handleConfirmSuccess}
          onSwitchToLogin={() => setView("login")}
        />
      )}
      {view === "forgot-password" && (
        <ForgotPasswordForm onSwitchToLogin={() => setView("login")} />
      )}
    </div>
  );
};
