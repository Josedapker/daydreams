import chalk from "chalk";  // Add this import at the top
import { Chess } from "chess.js";
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

// Initialize LLM first since it's used by other components
// Update LLM configuration to match
// Add provider configuration
const provider = process.env.AI_PROVIDER || 'openai';  // Default to OpenAI
const model = 'openai/o1-mini';  // Changed from o3-mini to o1-mini

// Initialize LLM with provider-specific configuration
const llm = new LLMClient({
    model: model,
    temperature: 0.1,
    maxTokens: 500
});

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
            'r': '♖', 'n': '♘', 'b': '♗', 'q': '♕', 'k': '♔', 'p': '♙',
            // White pieces (uppercase in FEN)
            'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚', 'P': '♟'
        };

        const [position, turn] = fen.split(' ');
        const rows = position.split('/');

        board.push('     a   b   c   d   e   f   g   h  ');
        board.push('   ╔═══╤═══╤═══╤═══╤═══╤═══╤═══╤═══╗');

        rows.forEach((row, i) => {
            let line = ` ${8 - i} ║`;
            for (const char of row) {
                if (isNaN(Number(char))) {
                    line += ` ${pieces[char]} │`;
                } else {
                    line += ' · │'.repeat(Number(char));
                }
            }
            // Remove the last separator and add the right border
            line = line.slice(0, -1) + '║';
            board.push(line);

            if (i < 7) {
                board.push('   ╟───┼───┼───┼───┼───┼───┼───┼───╢');
            }
        });

        board.push('   ╚═══╧═══╧═══╧═══╧═══╧═══╧═══╧═══╝');
        board.push('');
        board.push(`     ${turn === 'w' ? 'White' : 'Black'} to move`);

        return board.join('\n');
    }

    // Add evaluatePosition function before the playChess function
    // ... existing code ...
    // Update the evaluatePosition function to use colors
    function evaluatePosition(fen: string): string {
        const chess = new Chess(fen);
        let evaluation = "";
    
        const pieces = chess.board().flat().filter((piece): piece is NonNullable<ReturnType<Chess['board']>[number][number]> => piece !== null);
        const materialCount = pieces.reduce((acc: number, piece) => {
            const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
            const value = values[piece.type.toLowerCase()] || 0;
            return acc + (piece.color === 'w' ? value : -value);
        }, 0);
    
        evaluation += `\nMaterial: ${materialCount >= 0 ? chalk.green(`+${materialCount}`) : chalk.red(materialCount)}`;
    
        const threats = chess.moves({ verbose: true }).filter((move) => move.flags.includes('c'));
        if (threats.length > 0) {
            evaluation += `\nThreats: ${chalk.red(threats.map(t => `${t.piece.toUpperCase()}x${t.to}`).join(', '))}`;
        }
    
        return evaluation;
    }

    // Then modify the display part in the game loop
    while (true) {
        console.log("\n----------------------------------------");
        console.log("Current Position:");
        console.log(renderBoard(game.fen));
        console.log("\nFEN:", chalk.cyan(game.fen));
        console.log("\nPGN:", chalk.yellow(game.pgn || "Game start"));
        console.log(evaluatePosition(game.fen));
        console.log("----------------------------------------");
        console.log("\nCommands:");
        console.log(chalk.green("- Enter a move (e.g., 'e4', 'Nf3')"));
        console.log(chalk.blue("- Type 'analyze' for deep position analysis"));
        console.log(chalk.magenta("- Type 'hint' for move suggestions"));
        console.log(chalk.yellow("- Type 'chat' to talk to Bobby"));
        console.log(chalk.red("- Type 'quit' to end the game"));

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