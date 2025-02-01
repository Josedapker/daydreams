import chalk from "chalk";
import { WebSocketServer } from "ws";

import {
    defaultCharacter,
} from "../packages/core/src/core/character_bobby_fischer";
import { MongoDb } from "../packages/core/src/core/db/mongo-db";
import { chessHandler } from "../packages/core/src/core/io/chess";
import { LLMClient } from "../packages/core/src/core/llm-client";
import { Orchestrator } from "../packages/core/src/core/orchestrator";
import {
    ChessProcessor,
} from "../packages/core/src/core/processors/chess-processor";
import { RoomManager } from "../packages/core/src/core/room-manager";
import { LogLevel } from "../packages/core/src/core/types";
import { ChromaVectorDB } from "../packages/core/src/core/vector-db";

async function main() {
    const loglevel = LogLevel.DEBUG;

    // Initialize core dependencies
    const vectorDb = new ChromaVectorDB("chess_agent", {
        chromaUrl: "http://localhost:8000",
        logLevel: loglevel,
    });

    await vectorDb.purge(); // Clear previous session data
    const roomManager = new RoomManager(vectorDb);

    const llmClient = new LLMClient({
        model: "anthropic/claude-3-opus-20240229",
        temperature: 0.3,
    });

    // Initialize processor with Bobby Fischer personality
    const chessProcessor = new ChessProcessor(
        llmClient,
        defaultCharacter,
        loglevel
    );

    // Initialize database for game states
    const scheduledTaskDb = new MongoDb(
        "mongodb://localhost:27017",
        "chess_games",
        "game_states"
    );

    await scheduledTaskDb.connect();
    console.log(chalk.green("✅ Game state database connected"));

    // Initialize core system
    const orchestrator = new Orchestrator(
        roomManager,
        vectorDb,
        chessProcessor,
        scheduledTaskDb,
        {
            level: loglevel,
            enableColors: true,
            enableTimestamp: true,
        }
    );

    // Register the chess game handler
    // Update the handler registration
    orchestrator.registerIOHandler(chessHandler);

    // Set up WebSocket server for real-time game updates
    const wss = new WebSocketServer({ port: 8080 });
    console.log(chalk.green("✅ WebSocket server running on port 8080"));

    wss.on("connection", (ws) => {
        console.log(chalk.blue("🎮 New player connected"));
        
        ws.on("message", async (data) => {
            try {
                const message = JSON.parse(data.toString());
                const result = await orchestrator.dispatchToInput(
                    "chess_game",
                    message,
                    `Game session ${message.gameId}`,
                    undefined // Changed from {} to undefined for the optional parameter
                );
                ws.send(JSON.stringify(result));
            } catch (error) {
                console.error(chalk.red("Error processing move:"), error);
                ws.send(JSON.stringify({ error: error.message }));
            }
        });
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
        console.log(chalk.yellow("\nShutting down..."));
        wss.close();
        process.exit(0);
    });
}

main().catch((error) => {
    console.error(chalk.red("Fatal error:"), error);
    process.exit(1);
});