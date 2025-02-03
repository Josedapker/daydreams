import chalk from "chalk";  // Add this import at the top
import { Chess } from "chess.js";
import { createInterface } from "readline";

import {
    defaultCharacter,
} from "../packages/core/src/core/characters/character_bobby_fischer";
import {
    ConversationManager,
} from "../packages/core/src/core/conversation-manager";
import {
    MongoDb,
} from "../packages/core/src/core/db/mongo-db"; // Add MongoDB import
import { chessHandler } from "../packages/core/src/core/io/chess";
import {
    makeFlowLifecycle,
} from "../packages/core/src/core/life-cycle"; // Add this import
import { LLMClient } from "../packages/core/src/core/llm-client";
import { Orchestrator } from "../packages/core/src/core/orchestrator";
import {
    ChessProcessor,
} from "../packages/core/src/core/processors/chess-processor";
import {
    ResearchQuantProcessor,
} from "../packages/core/src/core/processors/research-processor";
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
const conversationManager = new ConversationManager(vectorDb);

// Initialize game processors
const bobby = new ChessProcessor(llm, {
    ...defaultCharacter,
    traits: [
        ...defaultCharacter.traits,
        {
            name: "learning",
            description: "Ability to learn and improve from games",
            strength: 0.9,
            examples: [
                "Studies opponent's previous games",
                "Adapts strategy based on game analysis",
                "Improves opening repertoire through practice"
            ]
        },
        {
            name: "adaptation",
            description: "Ability to adapt to opponent's style",
            strength: 0.8,
            examples: [
                "Adjusts play style based on opponent's tendencies",
                "Changes strategy mid-game when needed",
                "Varies opening choices to counter opponent's preferences"
            ]
        }
    ],
    instructions: {
        ...defaultCharacter.instructions,
        goals: [
            "Win chess games through strategic play",
            "Adapt and learn from each game",
            "Maintain Bobby Fischer's playing style"
        ],
        constraints: [
            "Follow chess rules strictly",
            "Make moves within time controls",
            "Maintain character authenticity"
        ],
        contextRules: [
            "Opening phase: Use 10% of total time",
            "Middle game: Use 60% of total time",
            "Endgame: Use 30% of total time",
            "Analyze games after completion",
            "Study and expand opening repertoire",
            "Adapt to opponent's playing style during the game"
        ]
    }
}, LogLevel.DEBUG);
const researchProcessor = new ResearchQuantProcessor(llm, defaultCharacter, LogLevel.DEBUG);

// Create an orchestrator with correct constructor arguments
// Update Orchestrator initialization with correct config type
// Initialize MongoDB
const kvDb = new MongoDb(
    "mongodb://localhost:27017",
    "chess_games",
    "game_states"
);

await kvDb.connect();
console.log(chalk.green("✅ Game state database connected"));

const orchestrator = new Orchestrator(
    bobby,
    makeFlowLifecycle(kvDb, conversationManager), // Fix: use conversationManager instead of roomManager
    {
        level: LogLevel.DEBUG,
        enableColors: true,
        enableTimestamp: true
    }
);

// Game setup
const gameId = "game1";
const conversation = await conversationManager.createConversation("chess", gameId, {
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
            // Keep existing piece mappings
            'r': '♖', 'n': '♘', 'b': '♗', 'q': '♕', 'k': '♔', 'p': '♙',
            'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚', 'P': '♟'
        };

        const [position, turn] = fen.split(' ');
        const rows = position.split('/');

        board.push('     a   b   c   d   e   f   g   h  ');
        board.push('   ╔═══╤═══╤═══╤═══╤═══╤═══╤═══╤═══╗');  // Fixed top border

        rows.forEach((row, i) => {
            let line = ` ${8 - i} ║`;
            for (const char of row) {
                if (isNaN(Number(char))) {
                    line += ` ${pieces[char]} │`;
                } else {
                    line += ' · │'.repeat(Number(char));
                }
            }
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
    // Update the evaluatePosition function to use colors
    // Add to evaluatePosition function
    // Update evaluatePosition to be async
    async function evaluatePosition(fen: string): Promise<string> {
        const chess = new Chess(fen);
        let evaluation = "";

        // Material evaluation (keep existing code)
        const pieces = chess.board().flat().filter((piece): piece is NonNullable<ReturnType<Chess['board']>[number][number]> => piece !== null);
        const materialCount = pieces.reduce((acc: number, piece) => {
            const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
            const value = values[piece.type.toLowerCase()] || 0;
            return acc + (piece.color === 'w' ? value : -value);
        }, 0);

        evaluation += `\nMaterial: ${materialCount >= 0 ? chalk.green(`+${materialCount}`) : chalk.red(materialCount)}`;

        // Add center control evaluation
        const centerSquares = ['e4', 'e5', 'd4', 'd5'] as const;
        const centerControl = centerSquares.reduce((acc, square) => {
            const piece = chess.get(square as any);  // Type assertion needed for chess.js Square type
            if (piece) {
                return acc + (piece.color === 'w' ? 1 : -1);
            }
            return acc;
        }, 0);

        evaluation += `\nCenter Control: ${centerControl >= 0 ? chalk.green(`+${centerControl}`) : chalk.red(centerControl)}`;

        // Add development score
        const developedPieces = pieces.filter(piece =>
            piece.type !== 'p' && piece.type !== 'k' &&
            (piece.color === 'w' ? piece.square[1] !== '1' : piece.square[1] !== '8')
        ).length;
        evaluation += `\nDeveloped Pieces: ${chalk.blue(developedPieces)}`;

        // Capture threats (keep existing code)
        const threats = chess.moves({ verbose: true }).filter((move) => move.flags.includes('c'));
        if (threats.length > 0) {
            evaluation += `\nThreats: ${chalk.red(threats.map(t => `${t.piece.toUpperCase()}x${t.to}`).join(', '))}`;
        }

        // Enhanced position analysis
        const analysis = await bobby.process({
            command: "analyze",
            gameId,
            fen: game.fen,
            factors: ["pawn structure", "king safety", "piece activity"]
        }, "");

        if (analysis.content) {
            evaluation += `\n\nBobby's Analysis:\n${chalk.cyan(analysis.content)}`;
        }

        return evaluation;
    }

    // Update the game loop to handle async evaluatePosition
    while (true) {
        console.log("\n----------------------------------------");
        console.log("Current Position:");
        console.log(renderBoard(game.fen));
        console.log("\nFEN:", chalk.cyan(game.fen));
        console.log("\nPGN:", chalk.yellow(game.pgn || "Game start"));
        console.log(await evaluatePosition(game.fen));  // Add await here
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

        if (input.toLowerCase() === 'hint') {
            const analysis = await bobby.process({
                command: "analyze",
                gameId,
                fen: game.fen,
                depth: 3,
                requestMoves: true,
                context: {
                    gamePhase: game.pgn ? (game.pgn.split(' ').length < 10 ? "opening" : "middlegame") : "opening",
                    previousMoves: game.pgn || "",
                    playerStyle: "Based on moves played so far"
                }
            }, "");

            const moves = analysis.metadata?.suggestedMoves;
            if (moves && moves.length > 0) {
                console.log("\nBobby's suggestions:");
                moves.forEach((move: string, i: number) => {
                    console.log(chalk.magenta(`${i + 1}. ${move}`));
                });
            } else {
                console.log(chalk.yellow("\nBobby is thinking carefully about this position..."));
            }
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