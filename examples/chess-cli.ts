import { createInterface } from "readline";

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
import {
    ResearchQuantProcessor,
} from "../packages/core/src/core/processors/research-processor";
import { RoomManager } from "../packages/core/src/core/room-manager";
import { LogLevel } from "../packages/core/src/core/types";
import { ChromaVectorDB } from "../packages/core/src/core/vector-db";
import { WebSocket, WebSocketServer } from 'ws';

// Initialize LLM first since it's used by other components
const llm = new LLMClient({
    model: "openai/gpt-4",
    temperature: 0.2,
    maxTokens: 500
});

// Initialize vector storage and room management
const vectorDb = new ChromaVectorDB();
const roomManager = new RoomManager(vectorDb);

// Initialize game processors
const bobby = new ChessProcessor(llm, defaultCharacter, LogLevel.DEBUG);
const researchProcessor = new ResearchQuantProcessor(llm, defaultCharacter, LogLevel.DEBUG);

// Create an orchestrator with correct constructor arguments
const orchestrator = new Orchestrator(
    roomManager,
    vectorDb,
    bobby,  // Pass the processor
    new MongoDb("mongodb://localhost:27017"), // Add MongoDB instance
    {
        level: LogLevel.DEBUG,
        enableColors: true
    }
);

// Game setup
const gameId = "game1";
const gameRoom = await roomManager.createRoom("chess", gameId, {
    name: "Chess Game vs Bobby Fischer",
    description: "Interactive chess game against Bobby Fischer AI",
    metadata: {
        startTime: new Date(),
        playerColor: "white"
    }
});

// Define game state type
interface GameState {
    gameId: string;
    fen: string;
    pgn?: string;
    status: 'new' | 'ongoing' | 'ended' | string;
    possibleMoves: string[];
    lastMove?: any;
    analysis?: {
        isCheck: boolean;
        isCheckmate: boolean;
        isStalemate: boolean;
        isDraw: boolean;
        possibleMoves: string[];
    };
}

// Remove this duplicate declaration
// const bobby = new ChessProcessor(llm, defaultCharacter, LogLevel.DEBUG);

// Add type check for handler
if (!chessHandler || !chessHandler.execute) {
    throw new Error("Chess handler not properly initialized");
}

// Create a typed handler to avoid repeated checks
const handler = chessHandler.execute.bind(chessHandler);

const wss = new WebSocketServer({ port: 3000 });

wss.on('connection', (ws) => {
    console.log('Client connected');
    let currentGame: GameState;

    const initGame = async () => {
        currentGame = await handler({
            command: "new",
            gameId: "game1"
        }) as GameState;
        return currentGame;
    };

    initGame().catch(console.error);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());

            if (data.type === 'move') {
                try {
                    const result = await handler({
                        command: "move",
                        gameId: "game1",
                        move: data.move,
                        fen: data.fen
                    });

                    currentGame = result as GameState;

                    if (currentGame.status !== 'ongoing') {
                        ws.send(JSON.stringify({
                            type: 'game_over',
                            status: currentGame.status
                        }));
                        return;
                    }

                    // Get Bobby's analysis and move
                    const analysis = await bobby.process({
                        command: "analyze",
                        gameId: "game1",
                        fen: currentGame.fen
                    }, "");

                    const bobbyMove = analysis.metadata.recommendedMove;
                    if (bobbyMove) {
                        const result = await handler({
                            command: "move",
                            gameId: "game1",
                            move: bobbyMove,
                            fen: currentGame.fen
                        });

                        currentGame = result as GameState;
                        ws.send(JSON.stringify({
                            type: 'move',
                            move: bobbyMove,
                            fen: currentGame.fen
                        }));
                    }
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: error instanceof Error ? error.message : 'Invalid move'
                    }));
                }
            } else if (data.type === 'chat') {
                const response = await bobby.process({
                    command: "chat",
                    gameId: "game1",
                    fen: currentGame.fen,
                    question: "What do you think about the current position?"
                }, "");

                ws.send(JSON.stringify({
                    type: 'message',
                    message: response.content
                }));
            } else if (data.type === 'analyze') {
                const analysis = await bobby.process({
                    command: "analyze",
                    gameId: "game1",
                    fen: data.position
                }, "");

                ws.send(JSON.stringify({
                    type: 'message',
                    message: analysis.content
                }));
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Internal server error'
            }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

console.log('WebSocket server started on port 3000');

// Comment out the original game loop since we're using WebSocket now
// async function playChess() { ... }

async function playChess() {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const gameId = "game1";
    let game = await handler({
        command: "new",
        gameId
    }) as GameState;

    if (!game) {
        console.error("Failed to initialize game");
        return;
    }

    console.log("\nWelcome! You're playing as White against Bobby Fischer!");
    console.log("Type moves in algebraic notation (e.g., 'e4', 'Nf3')");
    console.log("Type 'quit' to end the game\n");

    // Add this function at the top of the file
    function renderBoard(fen: string): string {
        const board: string[] = [];
        const pieces: Record<string, string> = {
            // Black pieces (lowercase in FEN)
            'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
            // White pieces (uppercase in FEN)
            'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔', 'P': '♙'
        };

        const [position, turn] = fen.split(' ');
        const rows = position.split('/');

        // Add top border
        board.push('  ┌─────────────────┐');

        // Add board rows with rank numbers on the left
        rows.forEach((row, i) => {
            let line = `${8 - i} │`;
            for (const char of row) {
                if (isNaN(Number(char))) {
                    line += ` ${pieces[char] || char}`;
                } else {
                    line += ' ·'.repeat(Number(char));
                }
            }
            line += ` │`;
            board.push(line);
        });

        // Add bottom border and file letters
        board.push('  └─────────────────┘');
        board.push('    a b c d e f g h');
        board.push('');
        board.push(`  ${turn === 'w' ? 'White' : 'Black'} to move`);

        return board.join('\n');
    }

    // Then modify the display part in the game loop
    while (true) {
        console.log("\n----------------------------------------");
        console.log("Current Position:");
        console.log(renderBoard(game.fen));
        console.log("\nFEN:", game.fen);
        console.log("\nPGN:", game.pgn || "Game start");
        console.log("----------------------------------------");
        console.log("\nCommands:");
        console.log("- Enter a move (e.g., 'e4', 'Nf3')");
        console.log("- Type 'chat' to talk to Bobby");
        console.log("- Type 'analyze' to get Bobby's analysis");
        console.log("- Type 'quit' to end the game");

        const input = await new Promise<string>(resolve => {
            rl.question("\nYour input: ", resolve);
        });

        if (input.toLowerCase() === 'quit') break;

        if (input.toLowerCase() === 'chat') {
            const question = await new Promise<string>(resolve => {
                rl.question("\nAsk Bobby something about the position: ", resolve);
            });

            const response = await bobby.process({
                command: "chat",
                gameId,
                fen: game.fen,
                question
            }, "");

            console.log("\nBobby says:", response.content);
            continue;
        }

        if (input.toLowerCase() === 'analyze') {
            const analysis = await bobby.process({
                command: "analyze",
                gameId,
                fen: game.fen
            }, "");

            console.log("\nBobby's Analysis:", analysis.content);
            continue;
        }

        // Regular move handling
        try {
            // Make player's move
            const result = await handler({
                command: "move",
                gameId,
                move: input,  // Use input instead of move
                fen: game.fen
            });

            game = result as GameState;
            console.log("\n> You played:", input);  // Use input instead of move

            if (game.status !== 'ongoing') {
                console.log(`\nGame Over! Result: ${game.status}`);
                break;
            }

            console.log("\nBobby is thinking...");

            const analysis = await bobby.process({
                command: "analyze",
                gameId,
                fen: game.fen
            }, "");

            console.log("\nBobby's Analysis:", analysis.content);

            const bobbyMove = analysis.metadata.recommendedMove;
            if (!bobbyMove) {
                console.log("\nBobby couldn't decide on a move. Starting fresh...");
                continue;
            }

            try {
                const result = await handler({
                    command: "move",
                    gameId,
                    move: bobbyMove,
                    fen: game.fen
                });

                game = result as GameState;
                console.log("\n> Bobby played:", bobbyMove);

                if (game.status !== 'ongoing') {
                    console.log(`\nGame Over! Result: ${game.status}`);
                    break;
                }
            } catch (error) {
                console.log("\nBobby made an invalid move:", error);
                continue;
            }
        } catch (error) {
            console.log("\nInvalid move! Please try one of the legal moves listed above.");
            continue;
        }
    }

    rl.close();
}

// Start the game
playChess().catch(console.error);