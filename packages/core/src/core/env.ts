import { z } from "zod";

const envSchema = z.object({
    // Only require OpenAI API key and Chroma URL for the chess game
    OPENAI_API_KEY: z.string(),
    CHROMA_URL: z.string().default("http://localhost:8000"),
    
    // Make all other variables optional since they're not needed for chess
    TWITTER_USERNAME: z.string().optional(),
    TWITTER_PASSWORD: z.string().optional(),
    TWITTER_EMAIL: z.string().optional(),
    STARKNET_RPC_URL: z.string().optional(),
    STARKNET_ADDRESS: z.string().optional(),
    STARKNET_PRIVATE_KEY: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    GRAPHQL_URL: z.string().optional(),
    DISCORD_TOKEN: z.string().optional(),
    TELEGRAM_TOKEN: z.string().optional(),
    TELEGRAM_API_ID: z.string().optional(),
    TELEGRAM_API_HASH: z.string().optional(),
    HYPERLIQUID_MAIN_ADDRESS: z.string().optional(),
    HYPERLIQUID_WALLET_ADDRESS: z.string().optional(),
    HYPERLIQUID_PRIVATE_KEY: z.string().optional(),
    WEBSOCKET_URL: z.string().default("ws://localhost:8080"),
    DRY_RUN: z
        .preprocess((val) => val === "1" || val === "true", z.boolean())
        .default(true),
    TELEGRAM_STARTUP_CHAT_ID: z.string().optional(),
    TELEGRAM_USER_SESSION: z.string().optional(),
});

export const env = envSchema.parse(process.env);
