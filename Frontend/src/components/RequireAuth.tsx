import { Navigate, Outlet, useLocation } from "react-router";
import { useAuthStore } from "@/store/authStore";

/** Wraps protected routes (e.g. `/account`) in `App.tsx`. Redirects to
 * `/login` when signed out, preserving the attempted location in state so
 * LoginPage can send the user back after a successful login. */
export function RequireAuth() {
  const token = useAuthStore((state) => state.token);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
