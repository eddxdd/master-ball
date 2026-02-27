import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pino from "pino";
import { pinoHttp } from "pino-http";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import healthRoutes from "./routes/health.js";
import biomeRoutes from "./routes/biomes.js";
import gameRoutes from "./routes/games.js";
import pokedexRoutes from "./routes/pokedex.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import adminRoutes from "./routes/admin.js";
import auctionRoutes from "./routes/auctions.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

// App logger
// Must go before routes to log all requests
const logger = pino({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

// Security middleware - Helmet helps secure Express apps by setting HTTP headers
app.use(helmet());

// CORS configuration - allows frontend to make requests
const corsOptions = {
    origin: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || '*',
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting - protect against brute force attacks
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Limit each IP to 100 requests per windowMs in production
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// HTTP request logger middleware (logs every request)
app.use(
    pinoHttp({
        logger,
        customLogLevel: (_req, res, err) => {
            const statusCode = res.statusCode ?? 200;
            // Check status code first to properly categorize client vs server errors
            // 4xx responses (client errors) should be logged as warn, even if err is present
            if (statusCode >= 400 && statusCode < 500) return 'warn';
            // 5xx responses (server errors) should be logged as error
            if (statusCode >= 500) return 'error';
            // Fallback: if error exists but statusCode is not in 4xx/5xx range, treat as error
            if (err) return 'error';
            return 'info';
        },
    })
);

// Middleware to parse JSON bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/biomes', biomeRoutes);
app.use('/games', gameRoutes);
app.use('/pokedex', pokedexRoutes);
app.use('/health', healthRoutes);
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/admin', adminRoutes);
app.use('/auctions', auctionRoutes);

// Serve frontend static files and SPA fallback (production only)
if (process.env.NODE_ENV === 'production') {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const frontendDist = path.join(__dirname, '..', 'frontend-dist');
    app.use(express.static(frontendDist));
    app.get('/(.*)', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

// Error catcher (must be AFTER routes!)
app.use(errorHandler);

export default app;