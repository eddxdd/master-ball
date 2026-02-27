const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type ApiResponse<T> = {
  status: number;
  data: T | null;
  error: string | null;
};

export type UserRole = "TRAINER" | "ADMIN";

export type User = {
  id: number;
  username: string;
  email: string;
  role: UserRole;
};

export type AuthState = {
  token: string | null;
  user: User | null;
};

type JwtPayload = {
  exp?: number;
};

const decodeJwtPayload = (token: string): JwtPayload | null => {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;

    // JWT uses base64url encoding, so convert before atob.
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = atob(normalized + padding);

    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
};

export const getTokenExpiryMs = (token: string): number | null => {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000;
};

export const isTokenExpired = (token: string, now = Date.now()): boolean => {
  const expiresAt = getTokenExpiryMs(token);
  if (!expiresAt) return true;
  return now >= expiresAt;
};

export const loadAuthState = (): AuthState => {
  try {
    const raw = localStorage.getItem("auth");
    if (!raw) return { token: null, user: null };
    const state = JSON.parse(raw) as AuthState;

    if (!state.token || !state.user) {
      return { token: null, user: null };
    }

    if (isTokenExpired(state.token)) {
      localStorage.removeItem("auth");
      return { token: null, user: null };
    }

    return state;
  } catch {
    return { token: null, user: null };
  }
};

export const saveAuthState = (state: AuthState) => {
  try {
    localStorage.setItem("auth", JSON.stringify(state));
  } catch {
    // ignore
  }
};

export const clearAuthState = () => {
  try {
    localStorage.removeItem("auth");
  } catch {
    // ignore
  }
};

const buildHeaders = (token?: string | null) => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, options);
    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const errorMessage =
        typeof body === "string"
          ? body
          : (body?.error as string) ?? JSON.stringify(body);

      return {
        status: res.status,
        data: null,
        error: errorMessage,
      };
    }

    return {
      status: res.status,
      data: body as T,
      error: null,
    };
  } catch (error) {
    return {
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

// Specific API helpers

export type HealthResponse = {
  status: string;
  timestamp: string;
};

export const checkHealth = () =>
  request<HealthResponse>("/health", {
    method: "GET",
  });

export type RegisterPayload = {
  username: string;
  email: string;
  password: string;
};

export type LoginPayload = {
  usernameOrEmail: string;
  password: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export const registerUser = (payload: RegisterPayload) =>
  request<AuthResponse>("/auth/register", {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

export const loginUser = (payload: LoginPayload) =>
  request<AuthResponse>("/auth/login", {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

// Backward-compatible aliases during transition
export const registerTrainer = registerUser;
export const loginTrainer = loginUser;

export type CreateUserPayload = {
  username: string;
  email: string;
  password: string;
  role?: UserRole;
};

export const listUsers = (token: string) =>
  request<User[]>("/users", {
    method: "GET",
    headers: buildHeaders(token),
  });

export const getUserById = (id: number, token: string) =>
  request<User>(`/users/${id}`, {
    method: "GET",
    headers: buildHeaders(token),
  });

export const createUser = (payload: CreateUserPayload, token: string) =>
  request<User>("/users", {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });

export const deleteUser = (id: number, token: string) =>
  request<void>(`/users/${id}`, {
    method: "DELETE",
    headers: buildHeaders(token),
  });

export type UpdateUserRolePayload = {
  role: UserRole;
};

export const updateUserRole = (id: number, payload: UpdateUserRolePayload, token: string) =>
  request<User>(`/users/${id}/role`, {
    method: "PATCH",
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });

// Biome types
export type Biome = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
};

export type Pokemon = {
  id: number;
  name: string;
  pokedexNumber: number;
  type1: string;
  type2: string | null;
  evolutionStage: number;
  fullyEvolved: boolean;
  color: string;
  generation: number;
  imageUrl: string | null;
};

export const CARD_PLACEHOLDER_IMAGE = '/images/cards/sets/Pokemon-Card-Back.png';

export type Card = {
  id: number;
  tcgdexId: string;
  pokemonName: string;
  setName: string;
  setDisplayName?: string;
  rarity: string;
  tier: number;
  imageUrl: string;
  imageUrlLarge: string | null;
  pokemon?: Pokemon;
};

export type GuessFeedback = {
  type1: 'correct' | 'partial' | 'wrong';
  type2: 'correct' | 'partial' | 'wrong';
  evolutionStage: 'correct' | 'wrong';
  fullyEvolved: 'correct' | 'wrong';
  color: 'correct' | 'wrong';
  generation: 'correct' | 'wrong';
};

export type Guess = {
  guessNum: number;
  pokemon: Pokemon;
  feedback: GuessFeedback;
};

export type Game = {
  id: number;
  biome: Biome;
  timeOfDay: string;
  guessesUsed: number;
  maxGuesses: number;
  completed: boolean;
  won: boolean;
  tier?: number;
  guesses: Guess[];
  answer?: Pokemon;
  offeredCardIds?: number[];
  createdAt: string;
};export type PokedexEntry = {
  id: number;
  cardId: number;
  discovered: string;
  card: Card;
};

export type PokedexStats = {
  totalCards: number;
  collectedCards: number;
  completionPercentage: number;
  cardsByRarity: Record<string, number>;
  cardsByBiome: Array<{ biome: string; count: number }>;
  rarestCard: Card | null;
};

// Biome API
export const listBiomes = () =>
  request<Biome[]>("/biomes", {
    method: "GET",
  });

export const getBiomeById = (id: number) =>
  request<Biome>(`/biomes/${id}`, {
    method: "GET",
  });

export const getBiomePokemon = (id: number, timeOfDay: 'day' | 'night') =>
  request<Pokemon[]>(`/biomes/${id}/pokemon?timeOfDay=${timeOfDay}`, {
    method: "GET",
  });

// Game API
export type StartGamePayload = {
  biomeId: number;
  timeOfDay: 'day' | 'night';
};

export type SubmitGuessPayload = {
  pokemonId: number;
};

export type CaptureCardPayload = {
  cardId: number;
};

export const startGame = (payload: StartGamePayload, token: string) =>
  request<Game>("/games", {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });

export const getGame = (id: number, token: string) =>
  request<Game>(`/games/${id}`, {
    method: "GET",
    headers: buildHeaders(token),
  });

export const submitGuess = (gameId: number, payload: SubmitGuessPayload, token: string) =>
  request<{
    guess: Guess;
    gameCompleted: boolean;
    won: boolean;
    tier?: number;
    answer?: Pokemon;
    offeredCards?: Card[];
  }>(`/games/${gameId}/guess`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });

export type LevelInfo = {
  level: number;
  currentXp: number;
  xpNeeded: number;
  progressPercent: number;
  totalXp: number;
  leveledUp: boolean;
  prevLevel: number;
};

export type CaptureCardResponse = {
  id: number;
  card: Card;
  xpGained: number;
  levelInfo: LevelInfo;
};

export const captureCard = (gameId: number, payload: CaptureCardPayload, token: string) =>
  request<CaptureCardResponse>(`/games/${gameId}/capture`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });

export type TrainerProfile = {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  level: number;
  currentXp: number;
  xpNeeded: number;
  progressPercent: number;
  totalXp: number;
};

export const getTrainerProfile = (token: string) =>
  request<TrainerProfile>("/users/me", {
    method: "GET",
    headers: buildHeaders(token),
  });

export const getGameHistory = (token: string) =>
  request<Game[]>("/games/history", {
    method: "GET",
    headers: buildHeaders(token),
  });

// Admin API
export type AdminStats = {
  totals: {
    users: number;
    gamesCompleted: number;
    captures: number;
    pokedexEntries: number;
    gamesLast7Days: number;
  };
  recentUsers: { id: number; username: string; role: string; level: number; experience: number; createdAt: string }[];
  topTrainers: { id: number; username: string; level: number; experience: number }[];
  rarityBreakdown: { rarity: string; count: number }[];
};

export const getAdminStats = (token: string) =>
  request<AdminStats>('/admin/stats', {
    method: 'GET',
    headers: buildHeaders(token),
  });

// Pokedex API
export const getPokedex = (token: string) =>
  request<PokedexEntry[]>("/pokedex", {
    method: "GET",
    headers: buildHeaders(token),
  });

export const getPokedexStats = (token: string) =>
  request<PokedexStats>("/pokedex/stats", {
    method: "GET",
    headers: buildHeaders(token),
  });

export const getPokedexCard = (cardId: number, token: string) =>
  request<PokedexEntry>(`/pokedex/${cardId}`, {
    method: "GET",
    headers: buildHeaders(token),
  });

// ---- Auction House API ----

export type UserCardInstance = {
  id: number;
  obtained: string;
};

export type CollectionEntry = {
  card: Card;
  quantity: number;
  instances: UserCardInstance[];
};

export type AuctionUser = {
  id: number;
  username: string;
};

export type AuctionOfferedCard = {
  id: number;
  cardId: number;
  userId: number;
  obtained: string;
  card: Card & { pokemon: Pokemon };
  user: AuctionUser;
};

export type Auction = {
  id: number;
  creatorId: number;
  offeredUserCardId: number;
  wantedCardId: number;
  status: "active" | "completed" | "cancelled";
  completedById: number | null;
  completedUserCardId: number | null;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  offeredUserCard: AuctionOfferedCard;
  wantedCard: Card & { pokemon: Pokemon };
  creator: AuctionUser;
  completedBy: AuctionUser | null;
  canFulfill?: boolean;
};

export type CreateAuctionPayload = {
  offeredUserCardId: number;
  wantedCardId: number;
};

export type AcceptAuctionPayload = {
  userCardId: number;
};

export const getCollection = (token: string) =>
  request<CollectionEntry[]>("/pokedex/collection", {
    method: "GET",
    headers: buildHeaders(token),
  });

export const getAuctions = (token: string) =>
  request<Auction[]>("/auctions", {
    method: "GET",
    headers: buildHeaders(token),
  });

export const getMyAuctions = (token: string) =>
  request<Auction[]>("/auctions/my", {
    method: "GET",
    headers: buildHeaders(token),
  });

export const createAuction = (payload: CreateAuctionPayload, token: string) =>
  request<Auction>("/auctions", {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });

export type AcceptAuctionResponse = {
  message: string;
  xpGained: number;
  levelInfo: {
    level: number;
    currentXp: number;
    xpNeeded: number;
    progressPercent: number;
    totalXp: number;
  } | null;
};

export const acceptAuction = (auctionId: number, payload: AcceptAuctionPayload, token: string) =>
  request<AcceptAuctionResponse>(`/auctions/${auctionId}/accept`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });

export const cancelAuction = (auctionId: number, token: string) =>
  request<{ message: string }>(`/auctions/${auctionId}`, {
    method: "DELETE",
    headers: buildHeaders(token),
  });