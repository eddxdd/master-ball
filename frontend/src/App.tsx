import { useEffect, useState, useCallback } from "react";
import "./App.css";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import {
  loadAuthState,
  loginUser,
  registerUser,
  saveAuthState,
  clearAuthState,
  checkHealth,
  getTokenExpiryMs,
  listUsers,
  getUserById,
  createUser,
  deleteUser,
  updateUserRole,
  startGame,
  getTrainerProfile,
  getAdminStats,
  type Card,
} from "./api";
import type { AuthResponse, AuthState, HealthResponse, User, CreateUserPayload, TrainerProfile, LevelInfo, AdminStats } from "./api";
import { BiomeSelectionPage } from "./components/BiomeSelectionPage";
import { WordleGamePage } from "./components/WordleGamePage";
import { CardCaptureModal } from "./components/CardCaptureModal";
import { PokedexPage } from "./components/PokedexPage";
import { AuctionHousePage } from "./components/AuctionHousePage";
import { TrainerLevel, avatarUnlockLevel, bannerUnlockLevel } from "./components/TrainerLevel";

type ApiInspectorProps = {
  title: string;
  lastStatus: number | null;
  lastError: string | null;
  lastData: unknown;
};

/**
 * ApiInspector - Debug component that displays API response details
 * Shows status code, error messages, and raw JSON response data
 * Used on auth and health pages for development/testing
 */
function ApiInspector({
  title,
  lastStatus,
  lastError,
  lastData,
}: ApiInspectorProps) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="panel-body">
        <div className="field">
          <span className="label">Last status:</span>
          <span>{lastStatus ?? "—"}</span>
        </div>
        <div className="field">
          <span className="label">Last error:</span>
          <span className={lastError ? "error" : ""}>
            {lastError ?? "None"}
          </span>
        </div>
        <div className="field">
          <span className="label">Last response JSON:</span>
        </div>
        <pre className="json-viewer">
          {lastData ? JSON.stringify(lastData, null, 2) : "No data yet"}
        </pre>
      </div>
    </section>
  );
}

/**
 * useLastResponse - Custom hook to track the last API response
 * Returns { status, error, data, update } where update() sets all three values
 * Useful for displaying API response info in inspector components
 */
function useLastResponse<T>() {
  const [status, setStatus] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const update = (res: { status: number; error: string | null; data: T | null }) => {
    setStatus(res.status);
    setError(res.error);
    setData(res.data);
  };

  return { status, error, data, update };
}

type StatusState = {
  status: "online" | "offline" | "loading";
  lastCheckedAt: string | null;
};

function StatusPage() {
  const [status, setStatus] = useState<StatusState>({
    status: "loading",
    lastCheckedAt: null,
  });

  /**
   * checkStatus - Pings the /health endpoint and updates status state
   * Sets status to "online" if response is 200 with data, otherwise "offline"
   * Extracts and formats the timestamp from the response
   */
  const checkStatus = async () => {
    const res = await checkHealth();

    if (res.status === 200 && res.data) {
      const timestamp =
        "timestamp" in res.data && typeof res.data.timestamp === "string"
          ? new Date(res.data.timestamp).toLocaleString()
          : new Date().toLocaleString();

      setStatus({
        status: "online",
        lastCheckedAt: timestamp,
      });
    } else {
      setStatus({
        status: "offline",
        lastCheckedAt: null,
      });
    }
  };

  useEffect(() => {
    void checkStatus();
  }, []);

  const isLoading = status.status === "loading";
  const isOnline = status.status === "online";

  return (
    <div className="status-page">
      <div className="status-page-content">
        <section className="home-mew-banner">
          <img
            src="/images/cards/sets/promo/ancientmew.jpg"
            alt="Ancient Mew"
            className="home-mew-card"
          />
        </section>

        <section className="status-intro">
          <h2 className="status-intro-title">Master Ball</h2>
          <p className="status-intro-text">
            A Pokemon-themed Wordle game where you guess Pokemon based on their attributes—biome, 
            type, evolution stage, color, and generation. Choose your biome, make your guesses, 
            and collect rare TCG cards as rewards.
          </p>
          <ul className="status-intro-list">
            <li>🎮 Guess Pokemon in 6 tries based on 6 attributes</li>
            <li>🗺️ Choose from 9 unique biomes with day/night cycles</li>
            <li>🃏 Collect Pokemon TCG cards with 12 rarity tiers</li>
            <li>📚 Complete your Pokedex with all 151 Kanto Pokemon</li>
          </ul>
        </section>

        <section className="status-card">
          <p className="status-title">API Status</p>
          <p
            className={`status-value ${
              isLoading ? "status-loading" : isOnline ? "status-online" : "status-offline"
            }`}
          >
            {isLoading
              ? "Status: Checking..."
              : isOnline
              ? "Status: Online"
              : "Status: Offline"}
          </p>
          {status.lastCheckedAt && (
            <p className="status-meta">Last checked: {status.lastCheckedAt}</p>
          )}
          <button className="primary" type="button" onClick={checkStatus}>
            Refresh status
          </button>
        </section>
      </div>
    </div>
  );
}

/**
 * HealthPage - Development page for testing the /health endpoint
 * Provides manual API health check with response inspector
 */
function HealthPage() {
  const last = useLastResponse<HealthResponse>();

  const handleCheck = async () => {
    const res = await checkHealth();
    last.update(res);
  };

  return (
    <div className="page">
      <section className="panel">
        <h2>Health</h2>
        <p>Call GET /health to check if the server is running.</p>
        <button className="primary" onClick={handleCheck}>
          Check health
        </button>
      </section>

      <ApiInspector
        title="Health Response"
        lastStatus={last.status}
        lastError={last.error}
        lastData={last.data}
      />
    </div>
  );
}

function AuthPage({
  auth: _auth,
  setAuth,
  onLoginSuccess,
}: {
  auth: AuthState;
  setAuth: (value: AuthState) => void;
  onLoginSuccess?: () => void;
}) {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [rememberMe, setRememberMe] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [loginForm, setLoginForm] = useState({
    usernameOrEmail: "",
    password: "",
  });

  const last = useLastResponse<AuthResponse>();

  /**
   * handleRegister - Submits registration form, saves auth state on success
   * Creates new account with username, email, and password
   * Updates app auth state and persists token to localStorage
   */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await registerUser(registerForm);
    last.update(res);
    if (res.data && !res.error) {
      const newState: AuthState = {
        token: res.data.token,
        user: res.data.user,
      };
      saveAuthState(newState);
      setAuth(newState);
      if (onLoginSuccess) onLoginSuccess();
    }
  };

  /**
   * handleLogin - Submits login form, saves auth state on success
   * Accepts username or email with password
   * Updates app auth state and persists token to localStorage
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await loginUser(loginForm);
    last.update(res);
    if (res.data && !res.error) {
      const newState: AuthState = {
        token: res.data.token,
        user: res.data.user,
      };
      saveAuthState(newState);
      setAuth(newState);
      if (onLoginSuccess) onLoginSuccess();
    }
  };

  return (
    <div className="page">
      <section className="panel auth-panel">
        <div className="auth-layout">
          <aside className="auth-visual">
            <div className="auth-visual-image">
              <img
                src="/images/site/masterball-text.png"
                alt="Master Ball"
                className="auth-masterball"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          </aside>

          <div className="auth-form-wrap">
            <h2>
              {authMode === "login"
                ? "Enter your account information below."
                : "Create your account below."}
            </h2>

            <form
              className="auth-form"
              onSubmit={authMode === "login" ? handleLogin : handleRegister}
            >
              {authMode === "login" ? (
                <>
                  <label className="field">
                    <input
                      type="text"
                      value={loginForm.usernameOrEmail}
                      placeholder="Username or Email"
                      onChange={(e) =>
                        setLoginForm((f) => ({
                          ...f,
                          usernameOrEmail: e.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <input
                      type="password"
                      value={loginForm.password}
                      placeholder="Password"
                      onChange={(e) =>
                        setLoginForm((f) => ({ ...f, password: e.target.value }))
                      }
                      required
                    />
                  </label>
                  <button className="primary auth-action-btn" type="submit">
                    Login
                  </button>
                  <div className="auth-inline-actions">
                    <label className="auth-remember">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <span>Remember me</span>
                    </label>
                    <button type="button" className="auth-forgot-link">
                      Forgot password?
                    </button>
                  </div>
                  <div className="auth-divider">
                    <span>Or</span>
                  </div>
                  <button type="button" className="secondary auth-social-btn">
                    <img
                      src="/images/site/google.png"
                      alt="Google"
                      className="auth-social-icon-img"
                    />
                    Sign in with Google
                  </button>
                  <button type="button" className="secondary auth-social-btn">
                    <img
                      src="/images/site/apple.png"
                      alt="Apple"
                      className="auth-social-icon-img"
                    />
                    Continue with Apple
                  </button>
                  <p className="auth-alt-text">
                    Don't have an account?{" "}
                    <button
                      type="button"
                      className="auth-switch-inline"
                      onClick={() => setAuthMode("register")}
                    >
                      Sign up
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <label className="field">
                    <input
                      type="text"
                      value={registerForm.username}
                      placeholder="Username"
                      onChange={(e) =>
                        setRegisterForm((f) => ({ ...f, username: e.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <input
                      type="email"
                      value={registerForm.email}
                      placeholder="Email"
                      onChange={(e) =>
                        setRegisterForm((f) => ({ ...f, email: e.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <input
                      type="password"
                      value={registerForm.password}
                      placeholder="Password"
                      onChange={(e) =>
                        setRegisterForm((f) => ({ ...f, password: e.target.value }))
                      }
                      required
                    />
                  </label>
                  <button className="primary auth-action-btn" type="submit">
                    Register
                  </button>
                  <div className="auth-inline-actions">
                    <label className="auth-remember">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <span>Remember me</span>
                    </label>
                    <button type="button" className="auth-forgot-link">
                      Forgot password?
                    </button>
                  </div>
                  <div className="auth-divider">
                    <span>Or</span>
                  </div>
                  <button type="button" className="secondary auth-social-btn">
                    <img
                      src="/images/site/google.png"
                      alt="Google"
                      className="auth-social-icon-img"
                    />
                    Sign in with Google
                  </button>
                  <button type="button" className="secondary auth-social-btn">
                    <img
                      src="/images/site/apple.png"
                      alt="Apple"
                      className="auth-social-icon-img"
                    />
                    Continue with Apple
                  </button>
                  <p className="auth-alt-text">
                    Already have an account?{" "}
                    <button
                      type="button"
                      className="auth-switch-inline"
                      onClick={() => setAuthMode("login")}
                    >
                      Sign in
                    </button>
                  </p>
                </>
              )}
            </form>

          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * AdminAuthPage - Admin-only page showing auth debug info
 * Displays current auth state and last auth API response
 */
function AdminAuthPage({ auth }: { auth: AuthState }) {
  const isLoggedIn = !!auth.token && !!auth.user;

  return (
    <div className="page">
      <section className="panel auth-status-container">
        <div className="auth-status">
          <span className="label">Current auth:</span>
          {isLoggedIn ? (
            <span>
              Logged in as <strong>{auth.user?.username}</strong>{" "}
              (<code>{auth.user?.email}</code>) - Role:{" "}
              <strong>{auth.user?.role === "ADMIN" ? "admin" : "Trainer"}</strong>
            </span>
          ) : (
            <span>Not logged in</span>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Auth Token</h2>
        {auth.token ? (
          <div className="json-viewer">
            <pre>{auth.token}</pre>
          </div>
        ) : (
          <p>No token available. Please log in.</p>
        )}
      </section>

      <section className="panel">
        <h2>User Object</h2>
        {auth.user ? (
          <div className="json-viewer">
            <pre>{JSON.stringify(auth.user, null, 2)}</pre>
          </div>
        ) : (
          <p>No user data available.</p>
        )}
      </section>

      <section className="panel">
        <h2>Auth Debug Information</h2>
        <p>This page shows the current authentication state including the JWT token and user object for debugging purposes.</p>
      </section>
    </div>
  );
}

/**
 * UsersPage - Admin-only page for managing users
 * Provides operations: list all users, fetch by ID, create new user, and delete user
 * Uses ApiInspector to show raw API responses
 */
function UsersPage({ auth }: { auth: AuthState }) {
  const last = useLastResponse<User | User[] | void>();
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [createForm, setCreateForm] = useState<CreateUserPayload>({
    username: "",
    email: "",
    password: "",
    role: "TRAINER",
  });
  const [deleteId, setDeleteId] = useState<string>("");
  const [updateRoleForm, setUpdateRoleForm] = useState({
    userId: "",
    role: "TRAINER" as "TRAINER" | "ADMIN",
  });

  /**
   * handleListUsers - Fetches all users from API and updates local users list
   * Updates the last response state for the API inspector
   */
  const handleListUsers = async () => {
    if (!auth.token) return;
    const res = await listUsers(auth.token);
    last.update(res);
    if (res.data && Array.isArray(res.data)) {
      setUsers(res.data);
    }
  };

  /**
   * handleGetById - Fetches a specific user by numeric ID
   * Validates that the ID is a valid number before making API call
   * Updates the last response state for the API inspector
   */
  const handleGetById = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.token) return;
    const idNum = Number(userId);
    if (!Number.isFinite(idNum)) {
      last.update({
        status: 400,
        error: "Please enter a valid numeric ID",
        data: null,
      } as any);
      return;
    }
    const res = await getUserById(idNum, auth.token);
    last.update(res);
  };

  /**
   * handleCreateUser - Creates a new user with form data
   * On success, appends the new user to the local users list
   * Updates the last response state for the API inspector
   */
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.token) return;
    const res = await createUser(createForm, auth.token);
    last.update(res);
    if (res.data) {
      setUsers((prev) => [...prev, res.data as User]);
      setCreateForm({
        username: "",
        email: "",
        password: "",
        role: "TRAINER",
      });
    }
  };

  /**
   * handleDeleteUser - Deletes a user by numeric ID
   * On success, removes the user from the local users list
   * Updates the last response state for the API inspector
   */
  const handleDeleteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.token) return;
    const idNum = Number(deleteId);
    if (!Number.isFinite(idNum)) {
      last.update({
        status: 400,
        error: "Please enter a valid numeric ID",
        data: null,
      } as any);
      return;
    }
    const res = await deleteUser(idNum, auth.token);
    last.update(res);
    if (res.status === 200 || res.status === 204) {
      setUsers((prev) => prev.filter((u) => u.id !== idNum));
      setDeleteId("");
    }
  };

  /**
   * handleUpdateUserRole - Updates a user's role by numeric ID
   * On success, updates the user in the local users list
   * Updates the last response state for the API inspector
   */
  const handleUpdateUserRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.token) return;
    const idNum = Number(updateRoleForm.userId);
    if (!Number.isFinite(idNum)) {
      last.update({
        status: 400,
        error: "Please enter a valid numeric ID",
        data: null,
      } as any);
      return;
    }
    const res = await updateUserRole(idNum, { role: updateRoleForm.role }, auth.token);
    last.update(res);
    if (res.data) {
      setUsers((prev) =>
        prev.map((u) => (u.id === idNum ? res.data as User : u))
      );
      setUpdateRoleForm({ userId: "", role: "TRAINER" });
    }
  };

  return (
    <div className="page">
      <section className="panel">
        <h2>Users</h2>
        <p>
          Work with the <code>/users</code> endpoints. You can list all
          users, fetch one by ID, create new users, and delete users.
        </p>

        <div className="admin-sections">
        <div className="two-column">
          <div className="panel">
            <h3>List Users</h3>
            <button className="primary" onClick={handleListUsers}>
              Fetch all users
            </button>
            <ul className="user-list">
              {users.map((u) => (
                <li key={u.id}>
                  <strong>
                    #{u.id} {u.username}
                  </strong>{" "}
                  – {u.email} ({u.role})
                </li>
              ))}
              {users.length === 0 && <li>No users loaded yet.</li>}
            </ul>
          </div>

          <div className="panel">
            <h3>Fetch User By ID</h3>
            <form onSubmit={handleGetById}>
              <label className="field">
                <span className="label">User ID</span>
                <input
                  type="number"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="primary">
                Get User
              </button>
            </form>
          </div>
        </div>

        <div className="two-column">
          <div className="panel">
            <h3>Create New User</h3>
            <form onSubmit={handleCreateUser}>
              <label className="field">
                <span className="label">Username</span>
                <input
                  type="text"
                  value={createForm.username}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, username: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span className="label">Email</span>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, email: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span className="label">Password</span>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, password: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span className="label">Role</span>
                <select
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, role: e.target.value as "TRAINER" | "ADMIN" }))
                  }
                >
                  <option value="TRAINER">TRAINER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
              <button type="submit" className="primary">
                Create User
              </button>
            </form>
          </div>

          <div className="panel">
            <h3>Delete User</h3>
            <form onSubmit={handleDeleteUser}>
              <label className="field">
                <span className="label">User ID</span>
                <input
                  type="number"
                  value={deleteId}
                  onChange={(e) => setDeleteId(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="primary" style={{ background: '#c42a4e' }}>
                Delete User
              </button>
            </form>
          </div>

          <div className="panel">
            <h3>Update User Role</h3>
            <form onSubmit={handleUpdateUserRole}>
              <label className="field">
                <span className="label">User ID</span>
                <input
                  type="number"
                  value={updateRoleForm.userId}
                  onChange={(e) =>
                    setUpdateRoleForm((f) => ({ ...f, userId: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span className="label">New Role</span>
                <select
                  value={updateRoleForm.role}
                  onChange={(e) =>
                    setUpdateRoleForm((f) => ({ ...f, role: e.target.value as "TRAINER" | "ADMIN" }))
                  }
                >
                  <option value="TRAINER">TRAINER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
              <button type="submit" className="primary">
                Update Role
              </button>
            </form>
          </div>
        </div>
        </div>
      </section>

      <ApiInspector
        title="Users Last Response"
        lastStatus={last.status}
        lastError={last.error}
        lastData={last.data}
      />
    </div>
  );
}

function AdminStatsPage({ auth }: { auth: AuthState }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.token) return;
    setLoading(true);
    getAdminStats(auth.token).then((res) => {
      if (res.data) setStats(res.data);
      else setError(res.error ?? 'Failed to load stats');
      setLoading(false);
    });
  }, [auth.token]);

  const fmt = (n: number) => n.toLocaleString();

  if (loading) return <div className="page"><div className="admin-stats-loading">Loading stats...</div></div>;
  if (error || !stats) return <div className="page"><div className="admin-stats-loading">{error ?? 'No data'}</div></div>;

  const statCards = [
    { label: 'Users',          value: fmt(stats.totals.users),           icon: 'users'   },
    { label: 'Games completed',value: fmt(stats.totals.gamesCompleted),  icon: 'games'   },
    { label: 'Cards captured', value: fmt(stats.totals.captures),        icon: 'cards'   },
    { label: 'Pokedex entries',value: fmt(stats.totals.pokedexEntries),  icon: 'pokedex' },
    { label: 'Games (7 days)', value: fmt(stats.totals.gamesLast7Days),  icon: 'week'    },
  ];

  return (
    <div className="page admin-stats-page">
      <h2 className="admin-stats-title">Admin Overview</h2>

      <div className="admin-stat-cards">
        {statCards.map(({ label, value }) => (
          <div key={label} className="admin-stat-card">
            <span className="admin-stat-value">{value}</span>
            <span className="admin-stat-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="admin-stats-grid">
        <section className="admin-stats-panel">
          <h3 className="admin-stats-panel-title">Top Trainers</h3>
          <table className="admin-stats-table">
            <thead>
              <tr><th>#</th><th>Trainer</th><th>Level</th><th>Total XP</th></tr>
            </thead>
            <tbody>
              {stats.topTrainers.map((t, i) => (
                <tr key={t.id}>
                  <td className="admin-rank">{i + 1}</td>
                  <td>{t.username}</td>
                  <td><span className="admin-level-badge">Lv.{t.level}</span></td>
                  <td>{fmt(t.experience)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="admin-stats-panel">
          <h3 className="admin-stats-panel-title">Recent Signups</h3>
          <table className="admin-stats-table">
            <thead>
              <tr><th>Trainer</th><th>Role</th><th>Level</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {stats.recentUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>
                    <span className={`admin-role-badge admin-role-badge--${u.role.toLowerCase()}`}>{u.role}</span>
                  </td>
                  <td><span className="admin-level-badge">Lv.{u.level}</span></td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="admin-stats-panel admin-stats-panel--wide">
          <h3 className="admin-stats-panel-title">Captures by Rarity</h3>
          <div className="admin-rarity-bars">
            {stats.rarityBreakdown.map(({ rarity, count }) => {
              const max = stats.rarityBreakdown[0]?.count ?? 1;
              const pct = Math.max(2, (count / max) * 100);
              return (
                <div key={rarity} className="admin-rarity-row">
                  <span className="admin-rarity-name">{rarity}</span>
                  <div className="admin-rarity-bar-wrap">
                    <div className="admin-rarity-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="admin-rarity-count">{fmt(count)}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

type PageId = "home" | "play" | "game" | "pokedex" | "dashboard" | "health" | "auth" | "adminStats" | "adminAuth" | "users" | "auctionHouse";

/**
 * getCroppedImg - Helper function to create cropped image from canvas
 * Takes the original image and crop area, returns base64 data URL
 */
const getCroppedImg = async (imageSrc: string, pixelCrop: Area): Promise<string> => {
  const image = new Image();
  image.src = imageSrc;
  
  await new Promise((resolve) => {
    image.onload = resolve;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('No 2d context');
  }

  // Set canvas size to the crop area size
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // Draw the cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  // Return as base64
  return canvas.toDataURL('image/png');
};

/**
 * UserDashboard - User profile page with avatar/banner selection and account management
 * Features: clickable banner and avatar (opens selection modals), profile fields display,
 * password change section, and account deletion with password confirmation
 * Avatar and banner selections persist in component state (not yet saved to backend)
 */
function UserDashboard({ 
  auth, 
  selectedAvatar, 
  setSelectedAvatar, 
  selectedBanner, 
  setSelectedBanner,
  trainerProfile,
  lastCaptureLevelInfo,
}: { 
  auth: AuthState;
  selectedAvatar: { num: number; type: string; croppedImage?: string; cropArea?: Area } | null;
  setSelectedAvatar: (avatar: { num: number; type: string; croppedImage?: string; cropArea?: Area } | null) => void;
  selectedBanner: { num: number; type: string; croppedImage?: string; cropArea?: Area } | null;
  setSelectedBanner: (banner: { num: number; type: string; croppedImage?: string; cropArea?: Area } | null) => void;
  trainerProfile: TrainerProfile | null;
  lastCaptureLevelInfo: LevelInfo | null;
}) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showImageModal, setShowImageModal] = useState<"avatar" | "banner" | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropType, setCropType] = useState<"avatar" | "banner" | null>(null);
  const [imageToCrop, setImageToCrop] = useState<{ num: number; type: string; name: string } | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  if (!auth.user) return null;

  const isAdmin = auth.user.role === "ADMIN";

  const avatarOptions = [
    { num: 1, type: 'fire', name: 'Chili', title: 'Fire Chef' },
    { num: 2, type: 'grass', name: 'Erika', title: 'Nature Keeper' },
    { num: 3, type: 'water', name: 'Nessa', title: 'Wave Rider' },
    { num: 4, type: 'electric', name: 'Elesa', title: 'Spark Model' },
    { num: 5, type: 'ghost', name: 'Allister', title: 'Shadow Spirit' },
    { num: 6, type: 'fairy', name: 'Diantha', title: 'Fairy Champion' },
    { num: 7, type: 'psychic', name: 'Sabrina', title: 'Mind Master' },
    { num: 8, type: 'poison', name: 'Marnie', title: 'Rebel Punk' },
    { num: 9, type: 'dragon', name: 'Zinnia', title: 'Dragon Tamer' },
  ];

  const currentLevel = trainerProfile?.level ?? 1;

  /**
   * handleImageSelect - Handles avatar/banner selection from modal grid
   * Options are unlocked based on the trainer's current level.
   * Opens cropping interface for both avatars and banners
   */
  const handleImageSelect = (index: number) => {
    const requiredLevel = showImageModal === 'banner'
      ? bannerUnlockLevel(index)
      : avatarUnlockLevel(index);
    if (currentLevel < requiredLevel && !isAdmin) {
      return;
    }
    const selected = avatarOptions[index - 1];
    setImageToCrop(selected);
    setCropType(showImageModal);
    setShowImageModal(null);
    setShowCropModal(true);
  };

  /**
   * onCropComplete - Called when user finishes cropping
   * Saves the cropped area coordinates for final image generation
   */
  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  /**
   * Reset crop state when modal opens with new image
   */
  useEffect(() => {
    if (showCropModal && imageToCrop) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    }
  }, [showCropModal, imageToCrop]);


  /**
   * handleCropSave - Gets the cropped result and saves it
   * Converts the cropped image to base64 and stores it with the avatar/banner selection
   */
  const handleCropSave = async () => {
    if (!imageToCrop || !croppedAreaPixels || !cropType) return;

    try {
      const imagePath = cropType === "avatar"
        ? `/images/profiles/avatars/${imageToCrop.num}-${imageToCrop.type}.png`
        : `/images/profiles/banners/${imageToCrop.num}-${imageToCrop.type}.png`;

      const croppedImage = await getCroppedImg(imagePath, croppedAreaPixels);

      if (cropType === "avatar") {
        setSelectedAvatar({
          num: imageToCrop.num,
          type: imageToCrop.type,
          croppedImage,
          cropArea: croppedAreaPixels,
        });
      } else {
        setSelectedBanner({
          num: imageToCrop.num,
          type: imageToCrop.type,
          croppedImage,
          cropArea: croppedAreaPixels,
        });
      }

      setShowCropModal(false);
      setImageToCrop(null);
      setCropType(null);
    } catch (error) {
      console.error('Error cropping image:', error);
    }
  };

  /**
   * handleCropCancel - Cancels the cropping operation and closes the modal
   */
  const handleCropCancel = () => {
    setShowCropModal(false);
    setImageToCrop(null);
    setCropType(null);
  };

  /**
   * handleDeleteAccount - Validates password and simulates account deletion
   * TODO: Integrate with backend API to actually delete the account
   * Currently just shows an alert after a simulated 1s delay
   */
  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError("");

    if (!deletePassword) {
      setDeleteError("Password is required");
      return;
    }

    setIsDeleting(true);

    // TODO: Call API to delete account with password verification
    // For now, just simulate the action
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setIsDeleting(false);
    setShowDeleteModal(false);
    setDeletePassword("");
    
    // In a real implementation, you would:
    // 1. Call the delete account API endpoint
    // 2. Handle the response
    // 3. Clear auth state and redirect if successful
    alert("Account deletion would happen here. API integration needed.");
  };

  /**
   * closeModal - Resets and closes the delete account modal
   * Clears password input and any error messages
   */
  const closeModal = () => {
    setShowDeleteModal(false);
    setDeletePassword("");
    setDeleteError("");
  };

  return (
    <div className="page dashboard-page">
      <section className="panel dashboard-panel">
        <div 
          className="dashboard-banner" 
          onClick={() => setShowImageModal("banner")}
          style={selectedBanner ? {
            backgroundImage: selectedBanner.croppedImage 
              ? `linear-gradient(to top, rgba(8, 9, 14, 0.4), rgba(8, 9, 14, 0.2)), url(${selectedBanner.croppedImage})`
              : `linear-gradient(to top, rgba(8, 9, 14, 0.4), rgba(8, 9, 14, 0.2)), url(/images/profiles/banners/${selectedBanner.num}-${selectedBanner.type}.png)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          } : {}}
        >
          {!selectedBanner && (
            <div className="dashboard-banner-label">
              <svg className="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              <span>Banner</span>
            </div>
          )}
          <div className="dashboard-hover-camera" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
          </div>
        </div>
        
        <div className="dashboard-content">
          <div className="dashboard-avatar-section">
            <div className="dashboard-avatar" onClick={() => setShowImageModal("avatar")}>
              {selectedAvatar ? (
                <div
                  className="dashboard-avatar-selected"
                  style={{ 
                    backgroundImage: selectedAvatar.croppedImage 
                      ? `url(${selectedAvatar.croppedImage})` 
                      : `url(/images/profiles/avatars/${selectedAvatar.num}-${selectedAvatar.type}.png)` 
                  }}
                />
              ) : (
                <svg className="dashboard-icon dashboard-icon-large" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
              )}
              <div className="dashboard-hover-camera dashboard-hover-camera-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
              </div>
            </div>
          </div>

          <TrainerLevel profile={trainerProfile} captureResult={lastCaptureLevelInfo} />

          <div className="dashboard-fields">
            <div className="dashboard-field-group">
              <label className="dashboard-label">Display Name</label>
              <div className="dashboard-field-row">
                <span className="dashboard-field-value">{auth.user.username}</span>
                <button type="button" className="dashboard-edit-btn">Edit</button>
              </div>
            </div>

            <div className="dashboard-field-group">
              <label className="dashboard-label">Username</label>
              <div className="dashboard-field-row">
                <span className="dashboard-field-value">{auth.user.username}</span>
                <button type="button" className="dashboard-edit-btn">Edit</button>
              </div>
            </div>

            <div className="dashboard-field-group">
              <label className="dashboard-label">Email</label>
              <div className="dashboard-field-row">
                <span className="dashboard-field-value">
                  {auth.user.email.replace(/(.{2})(.*)(@.*)/, "$1******$3")}
                </span>
                <button type="button" className="dashboard-edit-btn">Edit</button>
              </div>
            </div>
          </div>

          <div className="dashboard-section">
            <h3 className="dashboard-section-title">Password and Authentication</h3>
            <button type="button" className="primary">Change Password</button>
          </div>

          <div className="dashboard-section dashboard-danger-section">
            <h3 className="dashboard-section-title">Account Removal</h3>
            <p className="dashboard-section-desc">
              Disabling your account means you can recover it at any time after taking this action.
            </p>
            <button 
              type="button" 
              className="dashboard-danger-btn"
              onClick={() => setShowDeleteModal(true)}
            >
              Delete Account
            </button>
          </div>
        </div>
      </section>

      {showImageModal && (
        <div className="modal-overlay" onClick={() => setShowImageModal(null)}>
          <div className="modal-content image-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                Choose {showImageModal === "avatar" ? "Avatar" : "Banner"}
              </h2>
              <button 
                type="button" 
                className="modal-close"
                onClick={() => setShowImageModal(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className={showImageModal === "banner" ? "banner-grid" : "image-grid"}>
                {[
                  { num: 1, type: "fire", name: "Chili", title: "Fire Chef" },
                  { num: 2, type: "grass", name: "Erika", title: "Nature Keeper" },
                  { num: 3, type: "water", name: "Nessa", title: "Wave Rider" },
                  { num: 4, type: "electric", name: "Elesa", title: "Spark Model" },
                  { num: 5, type: "ghost", name: "Allister", title: "Shadow Spirit" },
                  { num: 6, type: "fairy", name: "Diantha", title: "Fairy Champion" },
                  { num: 7, type: "psychic", name: "Sabrina", title: "Mind Master" },
                  { num: 8, type: "poison", name: "Marnie", title: "Rebel Punk" },
                  { num: 9, type: "dragon", name: "Zinnia", title: "Dragon Tamer" },
                ].map(({ num, type, name }) => {
                  const requiredLevel = showImageModal === 'banner' ? bannerUnlockLevel(num) : avatarUnlockLevel(num);
                  const isLocked = currentLevel < requiredLevel && !isAdmin;
                  return (
                    <button
                      key={num}
                      type="button"
                      className={`image-option ${isLocked ? "image-option-locked" : ""} type-${type}`}
                      onClick={() => handleImageSelect(num)}
                      disabled={isLocked}
                      style={showImageModal === "banner" ? {
                        backgroundImage: `url(/images/profiles/banners/banner-border.png), url(/images/profiles/banners/${num}-${type}.png)`,
                        backgroundSize: "100% 100%, cover",
                        backgroundPosition: "center, center"
                      } : undefined}
                    >
                      {showImageModal === "banner" ? null : (
                        <div className="avatar-card-wrap">
                          <div className={`avatar-card avatar-card-round type-${type}`}>
                            <div
                              className="avatar-card-circle"
                              style={{ backgroundImage: `url(/images/profiles/avatars/${num}-${type}.png)` }}
                              role="img"
                              aria-label={`${name} avatar`}
                            />
                          </div>
                        </div>
                      )}
                      <div className="image-option-hover-bg"></div>
                      {isLocked && (
                        <div className="image-option-lock">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                          </svg>
                          <span className="image-option-lock-level">Lv.{requiredLevel}</span>
                        </div>
                      )}
                      {!isLocked && (
                        <>
                          <div className="image-option-hover-text">Select</div>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {showCropModal && imageToCrop && (
        <div className="modal-overlay" onClick={handleCropCancel}>
          <div className="modal-content crop-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Crop {cropType === 'avatar' ? 'Avatar' : 'Banner'}</h2>
              <button 
                type="button" 
                className="modal-close"
                onClick={handleCropCancel}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="modal-body crop-modal-body">
              <div className="crop-container">
                <Cropper
                  image={
                    cropType === "avatar"
                      ? `/images/profiles/avatars/${imageToCrop.num}-${imageToCrop.type}.png`
                      : `/images/profiles/banners/${imageToCrop.num}-${imageToCrop.type}.png`
                  }
                  crop={crop}
                  zoom={zoom}
                  aspect={cropType === "avatar" ? 1 : 16 / 4.5}
                  cropShape={cropType === "avatar" ? "round" : "rect"}
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
              <div className="crop-controls">
                <label className="crop-control-label">
                  Zoom
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="crop-slider"
                  />
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={handleCropCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-btn-primary"
                onClick={handleCropSave}
              >
                Save {cropType === 'avatar' ? 'Avatar' : 'Banner'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Account</h2>
              <button 
                type="button" 
                className="modal-close"
                onClick={closeModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleDeleteAccount}>
              <div className="modal-body">
                <p className="modal-warning">
                  Are you sure you want to delete your account? This action cannot be undone.
                  All your data will be permanently removed.
                </p>

                <div className="modal-field">
                  <label className="modal-label">
                    Enter your password to confirm
                  </label>
                  <input
                    type="password"
                    className="modal-input"
                    value={deletePassword}
                    onChange={(e) => {
                      setDeletePassword(e.target.value);
                      setDeleteError("");
                    }}
                    placeholder="Password"
                    disabled={isDeleting}
                    autoFocus
                  />
                  {deleteError && (
                    <span className="modal-error">{deleteError}</span>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={closeModal}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn-danger"
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Delete Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * App - Root component with navigation and authentication state
 * Manages:
 * - Page routing (home, dashboard, health, auth, admin)
 * - Auth state persistence and token expiry handling
 * - Conditional navigation based on login/admin status
 * - Auto-logout timer that clears auth when token expires
 */
function App() {
  const [currentPage, setCurrentPage] = useState<PageId>(() => {
    const saved = localStorage.getItem('currentPage');
    return (saved as PageId) || "home";
  });
  const [auth, setAuth] = useState<AuthState>(() => loadAuthState());
  const [selectedAvatar, setSelectedAvatar] = useState<{ num: number; type: string; croppedImage?: string; cropArea?: Area } | null>(null);
  const [selectedBanner, setSelectedBanner] = useState<{ num: number; type: string; croppedImage?: string; cropArea?: Area } | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  
  // Game state
  const [currentGameId, setCurrentGameId] = useState<number | null>(null);
  const [showCardCaptureModal, setShowCardCaptureModal] = useState(false);
  const [cardCaptureModalAlreadyCaptured, setCardCaptureModalAlreadyCaptured] = useState(false);
  const [cardCaptureModalCapturedCardId, setCardCaptureModalCapturedCardId] = useState<number | null>(null);
  const [offeredCards, setOfferedCards] = useState<Card[]>([]);
  const [guaranteedCardId, setGuaranteedCardId] = useState<number | null>(null);
  const [pityCardId, setPityCardId] = useState<number | null>(null);
  const [shouldRefetchGame, setShouldRefetchGame] = useState(false);
  const [trainerProfile, setTrainerProfile] = useState<TrainerProfile | null>(null);
  const [lastCaptureLevelInfo, setLastCaptureLevelInfo] = useState<LevelInfo | null>(null);

  const isAdmin = auth.user?.role === "ADMIN";
  const isLoggedIn = !!auth.token && !!auth.user;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.nav-avatar-wrapper')) {
        setShowAvatarMenu(false);
      }
    };

    if (showAvatarMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showAvatarMenu]);

  useEffect(() => {
    localStorage.setItem('currentPage', currentPage);
  }, [currentPage]);

  // Persist avatar per user (so each account has its own avatar)
  useEffect(() => {
    const userId = auth.user?.id;
    if (userId != null && selectedAvatar) {
      const { croppedImage, ...metadata } = selectedAvatar;
      localStorage.setItem(`selectedAvatar_${userId}`, JSON.stringify(metadata));
    }
  }, [selectedAvatar, auth.user?.id]);

  // Persist banner per user (so each account has its own banner)
  useEffect(() => {
    const userId = auth.user?.id;
    if (userId != null && selectedBanner) {
      const { croppedImage, ...metadata } = selectedBanner;
      localStorage.setItem(`selectedBanner_${userId}`, JSON.stringify(metadata));
    }
  }, [selectedBanner, auth.user?.id]);

  // Load this user's avatar/banner when they log in; clear when they log out
  useEffect(() => {
    const userId = auth.user?.id;

    if (userId == null) {
      setSelectedAvatar(null);
      setSelectedBanner(null);
      setIsLoadingProfile(false);
      return;
    }

    const regenerateCroppedImages = async () => {
      const savedAvatar = localStorage.getItem(`selectedAvatar_${userId}`);
      const savedBanner = localStorage.getItem(`selectedBanner_${userId}`);
      const promises = [];

      if (savedAvatar) {
        try {
          const avatarData = JSON.parse(savedAvatar);
          if (avatarData.cropArea) {
            promises.push(
              getCroppedImg(
                `/images/profiles/avatars/${avatarData.num}-${avatarData.type}.png`,
                avatarData.cropArea
              ).then(croppedImage => {
                setSelectedAvatar({ ...avatarData, croppedImage });
              }).catch(() => setSelectedAvatar(avatarData))
            );
          } else {
            setSelectedAvatar(avatarData);
          }
        } catch {
          setSelectedAvatar(null);
        }
      } else {
        setSelectedAvatar(null);
      }

      if (savedBanner) {
        try {
          const bannerData = JSON.parse(savedBanner);
          if (bannerData.cropArea) {
            promises.push(
              getCroppedImg(
                `/images/profiles/banners/${bannerData.num}-${bannerData.type}.png`,
                bannerData.cropArea
              ).then(croppedImage => {
                setSelectedBanner({ ...bannerData, croppedImage });
              }).catch(() => setSelectedBanner(bannerData))
            );
          } else {
            setSelectedBanner(bannerData);
          }
        } catch {
          setSelectedBanner(null);
        }
      } else {
        setSelectedBanner(null);
      }

      await Promise.all(promises);
      setIsLoadingProfile(false);
    };

    regenerateCroppedImages();
  }, [auth.user?.id]);

  // Fetch trainer profile (level/XP) whenever auth changes
  useEffect(() => {
    if (!auth.token) {
      setTrainerProfile(null);
      return;
    }
    getTrainerProfile(auth.token).then((res) => {
      if (res.data) setTrainerProfile(res.data);
    });
  }, [auth.token]);

  useEffect(() => {
    if (!auth.token || !auth.user) return;

    const expiresAt = getTokenExpiryMs(auth.token);
    if (!expiresAt) {
      clearAuthState();
      setAuth({ token: null, user: null });
      if (currentPage === "adminStats" || currentPage === "dashboard") {
        setCurrentPage("home");
      }
      return;
    }

    const msUntilExpiry = expiresAt - Date.now();
    if (msUntilExpiry <= 0) {
      clearAuthState();
      setAuth({ token: null, user: null });
      if (currentPage === "adminStats" || currentPage === "dashboard") {
        setCurrentPage("home");
      }
      return;
    }

    const logoutTimer = window.setTimeout(() => {
      clearAuthState();
      setAuth({ token: null, user: null });
      if (currentPage === "adminStats" || currentPage === "dashboard") {
        setCurrentPage("home");
      }
    }, msUntilExpiry);

    return () => window.clearTimeout(logoutTimer);
  }, [auth.token, auth.user, currentPage]);

  /**
   * Game handlers
   */
  const handleStartGame = async (biomeId: number, timeOfDay: 'day' | 'night') => {
    if (!auth.token) {
      setCurrentPage("auth");
      return;
    }
    
    try {
      const response = await startGame({ biomeId, timeOfDay }, auth.token);
      if (response.data) {
        setCurrentGameId(response.data.id);
        setCurrentPage("game");
      }
    } catch (error) {
      console.error('Failed to start game:', error);
    }
  };
  
  const handleGameComplete = (won: boolean, tier: number, offeredCards: Card[], guaranteedCardId: number | null, pityCardId: number | null) => {
    console.log('handleGameComplete called:', { won, tier, offeredCards, offeredCardsLength: offeredCards.length });
    
    if (!offeredCards || offeredCards.length !== 3) {
      console.error('Invalid offeredCards:', offeredCards);
      alert('Error: Failed to generate card offers. Please try again.');
      setCurrentPage("play");
      return;
    }
    
    setOfferedCards(offeredCards);
    setGuaranteedCardId(guaranteedCardId ?? offeredCards[0]?.id ?? null);
    setPityCardId(pityCardId);
    setCardCaptureModalAlreadyCaptured(false);
    setCardCaptureModalCapturedCardId(null);
    setShowCardCaptureModal(true);
  };

  const openCardCaptureModalAsViewOnly = (capturedCardId: number | null = null) => {
    setCardCaptureModalAlreadyCaptured(true);
    setCardCaptureModalCapturedCardId(capturedCardId);
    setShowCardCaptureModal(true);
  };
  
  const handleCardCaptured = () => {
    // Close modal and trigger refetch in game page
    setShowCardCaptureModal(false);
    setShouldRefetchGame(true);
    setTimeout(() => setShouldRefetchGame(false), 100);
  };

  const handleCaptureComplete = (_xpGained: number, levelInfo: LevelInfo) => {
    setLastCaptureLevelInfo(levelInfo);
    // Update the cached trainer profile so level display refreshes everywhere
    if (trainerProfile) {
      setTrainerProfile({
        ...trainerProfile,
        level: levelInfo.level,
        currentXp: levelInfo.currentXp,
        xpNeeded: levelInfo.xpNeeded,
        progressPercent: levelInfo.progressPercent,
        totalXp: levelInfo.totalXp,
      });
    }
    // Clear the transient level-up animation after 4s
    setTimeout(() => setLastCaptureLevelInfo(null), 4000);
  };
  
  const handlePlayAgain = () => {
    setShowCardCaptureModal(false);
    setCurrentGameId(null);
    setCurrentPage("play");
  };
  
  const handleExitToHome = () => {
    setShowCardCaptureModal(false);
    setCurrentGameId(null);
    setCurrentPage("home");
  };

  /**
   * renderPage - Routes to the appropriate page component based on currentPage state
   * Implements access control: dashboard requires login, users page requires admin role
   * Shows access denied messages for unauthorized access attempts
   */
  const renderPage = () => {
    switch (currentPage) {
      case "home":
        return <StatusPage />;
      case "play":
        return <BiomeSelectionPage onStartGame={handleStartGame} />;
      case "game":
        if (!currentGameId) {
          setCurrentPage("play");
          return null;
        }
        if (!isLoggedIn) {
          return (
            <div className="page">
              <section className="panel">
                <h2>Access Denied</h2>
                <p>Please log in to play.</p>
              </section>
            </div>
          );
        }
        return (
          <WordleGamePage 
            gameId={currentGameId}
            onGameComplete={handleGameComplete}
            onOpenCardCaptureModal={openCardCaptureModalAsViewOnly}
            shouldRefetch={shouldRefetchGame}
            onBack={() => setCurrentPage("play")}
            auth={auth as { token: string; user: any }}
          />
        );
      case "pokedex":
        if (!isLoggedIn) {
          return (
            <div className="page">
              <section className="panel">
                <h2>Access Denied</h2>
                <p>Please log in to view your Pokedex.</p>
              </section>
            </div>
          );
        }
        return <PokedexPage onBack={() => setCurrentPage("play")} auth={auth as { token: string; user: any }} />;
      case "health":
        return <HealthPage />;
      case "auth":
        return <AuthPage auth={auth} setAuth={setAuth} onLoginSuccess={() => setCurrentPage("dashboard")} />;
      case "dashboard":
        if (!isLoggedIn) {
          return (
            <div className="page">
              <section className="panel">
                <h2>Access Denied</h2>
                <p>Please log in to access your dashboard.</p>
              </section>
            </div>
          );
        }
        return <UserDashboard auth={auth} selectedAvatar={selectedAvatar} setSelectedAvatar={setSelectedAvatar} selectedBanner={selectedBanner} setSelectedBanner={setSelectedBanner} trainerProfile={trainerProfile} lastCaptureLevelInfo={lastCaptureLevelInfo} />;
      case "adminAuth":
        if (!isAdmin) {
          return (
            <div className="page">
              <section className="panel">
                <h2>Access Denied</h2>
                <p>This page is only available to admin users.</p>
              </section>
            </div>
          );
        }
        return <AdminAuthPage auth={auth} />;
      case "users":
        if (!isAdmin) {
          return (
            <div className="page">
              <section className="panel">
                <h2>Access Denied</h2>
                <p>This page is only available to admin users.</p>
              </section>
            </div>
          );
        }
        return <UsersPage auth={auth} />;
      case "adminStats":
        if (!isAdmin) {
          return (
            <div className="page">
              <section className="panel">
                <h2>Access Denied</h2>
                <p>This page is only available to admin users.</p>
              </section>
            </div>
          );
        }
        return <AdminStatsPage auth={auth} />;
      case "auctionHouse":
        if (!isLoggedIn) {
          return (
            <div className="page">
              <section className="panel">
                <h2>Access Denied</h2>
                <p>Please log in to access the Auction House.</p>
              </section>
            </div>
          );
        }
        return <AuctionHousePage auth={auth as { token: string; user: { id: number; username: string } }} onBack={() => setCurrentPage("home")} />;
      default:
        return <StatusPage />;
    }
  };

  return (
    <div className="app">
      {showAvatarMenu && (
        <div 
          className="nav-menu-backdrop" 
          onClick={() => setShowAvatarMenu(false)}
          aria-hidden="true"
        />
      )}
      <header className="app-header">
        <button
          type="button"
          className="app-brand"
          onClick={() => setCurrentPage("home")}
        >
          <div className="neon-triangles" aria-hidden="true">
            <div className="neon-triangle"></div>
            <div className="neon-triangle"></div>
            <div className="neon-triangle"></div>
            <div className="neon-triangle"></div>
            <div className="neon-triangle"></div>
          </div>
          Master Ball
        </button>
        <nav className="nav">
          {!isLoggedIn ? (
            <button
              type="button"
              className={
                currentPage === "auth" ? "nav-link nav-cta active" : "nav-link nav-cta"
              }
              onClick={() => setCurrentPage("auth")}
            >
              Login / Register
            </button>
          ) : (
            <div className="nav-avatar-wrapper">
              {trainerProfile && (
                <div className="nav-level-badge" title={`Level ${trainerProfile.level} Trainer`}>
                  {trainerProfile.level}
                </div>
              )}
              <div 
                  className={`nav-avatar ${selectedAvatar ? `type-${selectedAvatar.type}` : ''}`}
                  onClick={() => setShowAvatarMenu(!showAvatarMenu)}
                >
                {isLoadingProfile ? (
                  <div className="nav-avatar-placeholder">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                ) : selectedAvatar ? (
                  selectedAvatar.croppedImage ? (
                    <img src={selectedAvatar.croppedImage} alt="Avatar" />
                  ) : (
                    <img src={`/images/profiles/avatars/${selectedAvatar.num}-${selectedAvatar.type}.png`} alt="Avatar" />
                  )
                ) : (
                  <div className="nav-avatar-placeholder">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                )}
              </div>
              {showAvatarMenu && (
                <div className="nav-avatar-menu">
                  <button
                    className={`nav-avatar-menu-item ${currentPage === "play" ? "active" : ""}`}
                    onClick={() => {
                      setCurrentPage("play");
                      setShowAvatarMenu(false);
                    }}
                  >
                    Play Wordle
                  </button>
                  <button
                    className={`nav-avatar-menu-item ${currentPage === "pokedex" ? "active" : ""}`}
                    onClick={() => {
                      setCurrentPage("pokedex");
                      setShowAvatarMenu(false);
                    }}
                  >
                    Pokedex
                  </button>
                  <button
                    className={`nav-avatar-menu-item ${currentPage === "auctionHouse" ? "active" : ""}`}
                    onClick={() => {
                      setCurrentPage("auctionHouse");
                      setShowAvatarMenu(false);
                    }}
                  >
                    Auction House
                  </button>
                  <button
                    className={`nav-avatar-menu-item ${currentPage === "dashboard" ? "active" : ""}`}
                    onClick={() => {
                      setCurrentPage("dashboard");
                      setShowAvatarMenu(false);
                    }}
                  >
                    Dashboard
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        className={`nav-avatar-menu-item ${currentPage === "adminStats" ? "active" : ""}`}
                        onClick={() => {
                          setCurrentPage("adminStats");
                          setShowAvatarMenu(false);
                        }}
                      >
                        Stats
                      </button>
                      <button
                        className={`nav-avatar-menu-item ${currentPage === "users" ? "active" : ""}`}
                        onClick={() => {
                          setCurrentPage("users");
                          setShowAvatarMenu(false);
                        }}
                      >
                        Users
                      </button>
                      <button
                        className={`nav-avatar-menu-item ${currentPage === "adminAuth" ? "active" : ""}`}
                        onClick={() => {
                          setCurrentPage("adminAuth");
                          setShowAvatarMenu(false);
                        }}
                      >
                        Auth
                      </button>
                    </>
                  )}
                  <button
                    className="nav-avatar-menu-item logout"
                    onClick={() => {
                      clearAuthState();
                      setAuth({ token: null, user: null });
                      setCurrentPage("home");
                      setShowAvatarMenu(false);
                    }}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>
      </header>
      <main className="app-main">{renderPage()}</main>
      
      {showCardCaptureModal && currentGameId && guaranteedCardId && isLoggedIn && (
        <CardCaptureModal
          gameId={currentGameId}
          offeredCards={offeredCards}
          guaranteedCardId={guaranteedCardId}
          pityCardId={pityCardId}
          alreadyCaptured={cardCaptureModalAlreadyCaptured}
          capturedCardId={cardCaptureModalCapturedCardId}
          onPlayAgain={handlePlayAgain}
          onExit={handleExitToHome}
          onClose={handleCardCaptured}
          onCaptured={handleCaptureComplete}
          selectedAvatar={selectedAvatar}
          trainerProfile={trainerProfile}
          auth={auth as { token: string; user: any }}
        />
      )}
    </div>
  );
}

export default App;
