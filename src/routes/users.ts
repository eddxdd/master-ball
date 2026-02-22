// Router gives us an isolated group of routes under /users
import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcrypt";

// Prisma client instance
import prisma from "../db/prisma.js";

// Auth middleware to protect admin-only routes
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { xpProgress } from "../services/xpSystem.js";

const router = Router();

/**
 * Simple custom error class.
 * We attach an HTTP status code so the global error handler
 * knows what status to return.
 */
class HttpError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Shape of the POST /users request body.
 */
type CreateUserBody = {
  username?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
};

/**
 * Shape of the PATCH /users/:id/role request body.
 */
type UpdateRoleBody = {
  role?: unknown;
};

/**
 * GET /users/me
 * Returns the authenticated user's profile including XP and level progress.
 */
router.get("/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, role: true, level: true, experience: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    const progress = xpProgress(user.experience);
    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      level: progress.level,
      currentXp: progress.currentXp,
      xpNeeded: progress.xpNeeded,
      progressPercent: progress.progressPercent,
      totalXp: user.experience,
    });
  } catch (err) {
    next(err);
    return;
  }
});

/**
 * GET /users
 * Returns a list of all users (admin only).
 */
router.get("/", authenticate, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        // Don't return password hash
      },
    });

    res.json(users);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /users/:id
 * Returns a single user by its numeric ID (admin only).
 */
router.get("/:id", authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isFinite(userId)) {
      throw new HttpError("Invalid user ID", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(user);
  } catch (err) {
    next(err);
    return;
  }
});

/**
 * POST /users
 * Creates a new user (admin only).
 */
router.post("/", authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, email, password, role } = (req.body ?? {}) as CreateUserBody;

    // Validate input
    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      username.trim() === "" ||
      email.trim() === "" ||
      password.trim() === ""
    ) {
      throw new HttpError("username, email, and password are required", 400);
    }

    // Validate role if provided
    const userRole = role === "ADMIN" ? "ADMIN" : "TRAINER";

    // Check if username or email already exists
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username.trim() },
          { email: email.trim() },
        ],
      },
    });

    if (existing) {
      throw new HttpError("Username or email already exists", 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user
    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        email: email.trim(),
        password: hashedPassword,
        role: userRole,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      },
    });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /users/:id
 * Deletes a user by ID (admin only).
 */
router.delete("/:id", authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isFinite(userId)) {
      throw new HttpError("Invalid user ID", 400);
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Delete the user
    await prisma.user.delete({
      where: { id: userId },
    });

    return res.status(204).send();
  } catch (err) {
    next(err);
    return;
  }
});

/**
 * PATCH /users/:id/role
 * Updates a user's role by ID (admin only).
 */
router.patch("/:id/role", authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isFinite(userId)) {
      throw new HttpError("Invalid user ID", 400);
    }

    const { role } = (req.body ?? {}) as UpdateRoleBody;

    // Validate role
    if (role !== "ADMIN" && role !== "TRAINER") {
      throw new HttpError("Role must be either ADMIN or TRAINER", 400);
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update the user's role
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      },
    });

    return res.json(updatedUser);
  } catch (err) {
    next(err);
    return;
  }
});

export default router;
