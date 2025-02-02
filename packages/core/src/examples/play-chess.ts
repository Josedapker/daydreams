import { Chess } from "chess.js";
import { createInterface } from "readline";

import { ChainOfThought } from "../core/chain-of-thought";
import { defaultCharacter } from "../core/character_bobby_fischer";
import { chessHandler } from "../core/io/chess";  // Add this back
import { LLMClient } from "../core/llm-client";
import { ChessProcessor } from "../core/processors/chess-processor";
import { LogLevel } from "../core/types";
import { ChromaVectorDB } from "../core/vector-db";

// Define game state type
// Update GameState interface to include pgn
interface GameState {
    gameId: string;
    fen: string;
    pgn?: string;  // Add this line
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

// Initialize components
// Update LLM configuration to use o3-mini model
const llm = new LLMClient({
    model: "openai/o3-mini",  // Changed from gpt-4 to o3-mini
    temperature: 0.1,         // Reduced temperature for more consistent analysis
    maxTokens: 500
});

const vectorDb = new ChromaVectorDB();
const chainOfThought = new ChainOfThought(llm, vectorDb);
const bobby = new ChessProcessor(llm, defaultCharacter, LogLevel.DEBUG);

// Fix the evaluatePosition function
function evaluatePosition(fen: string): string {
    const chess = new Chess(fen);
    let evaluation = "";
    
    const pieces = chess.board().flat().filter((piece): piece is NonNullable<ReturnType<Chess['board']>[number][number]> => piece !== null);
    const materialCount = pieces.reduce((acc: number, piece) => {
        const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
        const value = values[piece.type.toLowerCase()] || 0;
        return acc + (piece.color === 'w' ? value : -value);
    }, 0);
    
    evaluation += `\nMaterial: ${materialCount >= 0 ? '+' : ''}${materialCount}`;
    
    const threats = chess.moves({ verbose: true }).filter((move) => move.flags.includes('c'));
    if (threats.length > 0) {
        evaluation += `\nThreats: ${threats.map(t => `${t.piece.toUpperCase()}x${t.to}`).join(', ')}`;
    }
    
    return evaluation;
}


// Add type check and assertion for chessHandler
if (!chessHandler?.execute) {
    throw new Error("Chess handler not properly initialized");
}

// Define handler type
type ChessHandlerParams = {
    command: string;
    gameId: string;
    move?: string;
    fen?: string;
};

// Create a single handler function with proper typing
const executeChessCommand = (params: ChessHandlerParams): Promise<GameState> => {
    // After the check above, we can safely assert that execute exists
    const execute = chessHandler.execute!;
    return execute(params) as Promise<GameState>;
};

async function playChess() {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const gameId = "game1";
    let game = await executeChessCommand({
        command: "new",
        gameId
    });

    if (!game) {
        console.error("Failed to initialize game");
        return;
    }

    console.log("\nWelcome! You're playing as White against Bobby Fischer!");
    console.log("Type moves in algebraic notation (e.g., 'e4', 'Nf3')");
    console.log("Type 'quit' to end the game\n");

    // Add this function at the top of the file
    function renderBoard(fen: string): string {
        const board = [];
        const pieces: { [key: string]: string } = {
            // Black pieces (lowercase in FEN)
            'r': '♖', 'n': '♘', 'b': '♗', 'q': '♕', 'k': '♔', 'p': '♙',
            // White pieces (uppercase in FEN)
            'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚', 'P': '♟'
        };

        const [position, turn] = fen.split(' ');
        const rows = position.split('/');

        board.push('   a b c d e f g h');
        board.push('  ─────────────────');

        // Display rows from 8 to 1 (black at top, white at bottom)
        rows.forEach((row, i) => {
            let line = `${8 - i} │`;
            for (const char of row) {
                if (isNaN(Number(char))) {
                    line += ` ${pieces[char]}`;
                } else {
                    line += ' ·'.repeat(Number(char));
                }
            }
            board.push(line);
        });

        // Add turn indicator
        board.push('');
        board.push(`  ${turn === 'w' ? 'White' : 'Black'} to move`);

        return board.join('\n');
    }

    // Then modify the display part in the game loop
    while (true) {
        // Remove duplicate imports and initializations here
        console.log("\n----------------------------------------");
        console.log("Current Position:");
        console.log(renderBoard(game.fen));
        console.log("\nFEN:", game.fen);
        console.log("\nPGN:", game.pgn || "Game start");
        console.log(evaluatePosition(game.fen));  // Add position evaluation
        console.log("----------------------------------------");
        console.log("\nCommands:");
        console.log("- Enter a move (e.g., 'e4', 'Nf3')");
        console.log("- Type 'analyze' for deep position analysis");
        console.log("- Type 'hint' for move suggestions");
        console.log("- Type 'chat' to talk to Bobby");
        console.log("- Type 'quit' to end the game");

        const input = await new Promise<string>(resolve => {
            rl.question("\nYour input: ", resolve);
        });

        if (input.toLowerCase() === 'quit') break;

        if (input.toLowerCase() === 'analyze') {
            const chess = new Chess(game.fen);
            const threats = chess.moves({ verbose: true }).filter((move) => move.flags.includes('c'));
            
            // Create a more structured prompt
            const prompt = `
Current chess position analysis:
FEN: ${game.fen}
PGN: ${game.pgn || "Game start"}
Material evaluation: ${evaluatePosition(game.fen)}
Actual threats: ${threats.length > 0 ? threats.map(t => `${t.piece.toUpperCase()}x${t.to}`).join(', ') : 'None'}

Please analyze this position focusing on:
1. Material balance
2. Piece activity
3. Control of center
4. Actual threats and tactical opportunities
5. Strategic plans for both sides
`;

            const deepAnalysis = await chainOfThought.think(prompt);
            console.log("\nDetailed Analysis:", deepAnalysis);
            continue;
        }

        if (input.toLowerCase() === 'hint') {
            const chess = new Chess(game.fen);
            const moves = chess.moves({ verbose: true });
            console.log("\nPossible moves:");
            moves.slice(0, 5).forEach(move => {
                console.log(`- ${move.san}: ${move.piece.toUpperCase()} to ${move.to}`);
            });
            continue;
        }

        if (input.toLowerCase() === 'chat') {
            const question = await new Promise<string>(resolve => {
                rl.question("\nWhat would you like to ask Bobby? ", resolve);
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

        const move = await new Promise<string>(resolve => {
            rl.question("\nYour move: ", resolve);
        });

        if (move.toLowerCase() === 'quit') break;

        try {
            // Make player's move with non-null assertion
            try {
                const playerMoveResult = await executeChessCommand({
                    command: "move",
                    gameId,
                    move,
                    fen: game.fen
                });

                game = playerMoveResult as GameState;
                console.log("\n> You played:", move);

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

                const bobbyMove = analysis.metadata?.recommendedMove;
                if (!bobbyMove) {
                    console.log("\nBobby couldn't decide on a move. Starting fresh...");
                    continue;
                }

                const bobbyMoveResult = await executeChessCommand({
                    command: "move",
                    gameId,
                    move: bobbyMove,
                    fen: game.fen
                });

                game = bobbyMoveResult as GameState;  // Fix: use bobbyMoveResult instead of result
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