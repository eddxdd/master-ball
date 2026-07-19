import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AuthShell } from "@/components/AuthShell";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME } from "@/config/branding";
import { ApiError } from "@/lib/api";
import { login } from "@/lib/authApi";
import { useAuthStore } from "@/store/authStore";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;

  const loginMutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (response) => {
      setAuth(response.access_token, response.user);
      navigate(redirectTo ?? "/", { replace: true });
    },
  });

  return (
    <div id="login-page" className="flex min-h-0 flex-1 flex-col">
      <Seo title="Log in" description={`Log in to your ${APP_NAME} account.`} noindex />

      <AuthShell
        title="Welcome back, trainer."
        subtitle="Log in to pick up your profile and jump straight into the competitive toolkit."
      >
        <Card className="border-border/80 shadow-lg shadow-black/10">
          <CardHeader className="gap-1">
            <CardTitle className="text-2xl">Log in</CardTitle>
            <p className="text-sm text-muted-foreground">
              Use the email and password for your {APP_NAME} account.
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                loginMutation.mutate();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {loginMutation.isError && (
                <p className="text-destructive text-sm">
                  {loginMutation.error instanceof ApiError
                    ? loginMutation.error.message
                    : "Couldn't log in."}
                </p>
              )}

              <Button
                type="submit"
                variant="gradient"
                size="lg"
                disabled={!email || !password || loginMutation.isPending}
              >
                {loginMutation.isPending ? "Logging in..." : "Log in"}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/signup" className="link-underline font-medium text-primary">
                Sign up free
              </Link>
            </p>
          </CardContent>
        </Card>
      </AuthShell>
    </div>
  );
}
