import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AuthShell } from "@/components/AuthShell";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME } from "@/config/branding";
import { ApiError } from "@/lib/api";
import { signup } from "@/lib/authApi";
import { useAuthStore } from "@/store/authStore";

const MIN_PASSWORD_LENGTH = 8;

export function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  const signupMutation = useMutation({
    mutationFn: () => signup(email, password, displayName),
    onSuccess: (response) => {
      setAuth(response.access_token, response.user);
      navigate("/", { replace: true });
    },
  });

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const canSubmit = email && password.length >= MIN_PASSWORD_LENGTH && displayName.trim();

  return (
    <div id="signup-page" className="flex min-h-0 flex-1 flex-col">
      <Seo title="Sign up" description={`Create a free ${APP_NAME} account.`} noindex />

      <AuthShell
        title="Create your trainer profile."
        subtitle="Free forever for the core toolkit. No credit card — just a name, email, and password."
      >
        <Card className="border-border/80 shadow-lg shadow-black/10">
          <CardHeader className="gap-1">
            <CardTitle className="text-2xl">Sign up</CardTitle>
            <p className="text-sm text-muted-foreground">
              Under a minute. You can keep browsing everything either way.
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) signupMutation.mutate();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-display-name">Display name</Label>
                <Input
                  id="signup-display-name"
                  autoComplete="nickname"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={passwordTooShort}
                />
                {passwordTooShort && (
                  <p className="text-muted-foreground text-xs">
                    Must be at least {MIN_PASSWORD_LENGTH} characters.
                  </p>
                )}
              </div>

              {signupMutation.isError && (
                <p className="text-destructive text-sm">
                  {signupMutation.error instanceof ApiError
                    ? signupMutation.error.message
                    : "Couldn't create your account."}
                </p>
              )}

              <Button
                type="submit"
                variant="gradient"
                size="lg"
                disabled={!canSubmit || signupMutation.isPending}
              >
                {signupMutation.isPending ? "Creating account..." : "Create free account"}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="link-underline font-medium text-primary">
                Log in
              </Link>
            </p>
          </CardContent>
        </Card>
      </AuthShell>
    </div>
  );
}
