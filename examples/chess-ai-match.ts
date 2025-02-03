import chalk from "chalk";
import { Chess } from "chess.js";

import {
    defaultCharacter as bobby,
} from "../packages/core/src/core/characters/character_bobby_fischer";
import {
    kasparovCharacter as garry,
} from "../packages/core/src/core/characters/character_garry_kasparov";
import { chessHandler } from "../packages/core/src/core/io/chess";
import { LLMClient } from "../packages/core/src/core/llm-client";
import {
    ChessProcessor,
} from "../packages/core/src/core/processors/chess-processor";
import { LogLevel } from "../packages/core/src/core/types";

// Add type for chess handler params
interface ChessHandlerParams {
    command: string;
    gameId: string;
    move?: string;
    fen?: string;
}

// Create a typed execute function
const executeChessCommand = (params: ChessHandlerParams): Promise<GameState> => {
    if (!chessHandler.execute) {
        throw new Error("Chess handler not properly initialized");
    }
    return chessHandler.execute(params) as Promise<GameState>;
};

// Add GameState interface
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

// Add renderBoard function
function renderBoard(fen: string): string {
    const board: string[] = [];
    const pieces: Record<string, string> = {
        'r': '♖', 'n': '♘', 'b': '♗', 'q': '♕', 'k': '♔', 'p': '♙',
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

// Helper functions for position evaluation
function calculateMaterial(fen: string): number {
    const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    return fen.split(' ')[0]
        .split('')
        .reduce((sum, char) => {
            const value = values[char.toLowerCase()] || 0;
            return sum + (char === char.toUpperCase() ? value : -value);
        }, 0);
}

function evaluateCenter(fen: string): number {
    const position = fen.split(' ')[0];
    const centerSquares = [
        [4, 4], [4, 5], [5, 4], [5, 5] // e4, e5, d4, d5
    ];
    
    let control = 0;
    const board = position.split('/').map(row => row.split(''));
    
    for (const [rank, file] of centerSquares) {
        const piece = board[8 - rank][file - 1];
        if (piece) {
            control += piece === piece.toUpperCase() ? 1 : -1;
        }
    }
    
    return control;
}

function countDevelopedPieces(fen: string): number {
    const position = fen.split(' ')[0];
    const rows = position.split('/');
    let developed = 0;
    
    // Count pieces that have moved from their starting squares
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const piece = rows[i][j];
            if (!piece || piece.toLowerCase() === 'p' || piece.toLowerCase() === 'k') continue;
            
            // Check if piece has moved from starting rank
            if ((piece === piece.toUpperCase() && i !== 7) || 
                (piece === piece.toLowerCase() && i !== 0)) {
                developed++;
            }
        }
    }
    
    return developed;
}

function analyzePawnStructure(fen: string): {
    doubled: number;
    isolated: number;
    connected: number;
    passed: number;
} {
    const position = fen.split(' ')[0];
    const rows = position.split('/');
    const files = Array(8).fill(0).map(() => Array(8).fill(null));
    
    // Map pawns to files array
    for (let rank = 0; rank < 8; rank++) {
        let fileIndex = 0;
        for (const char of rows[rank]) {
            if (isNaN(Number(char))) {
                if (char.toLowerCase() === 'p') {
                    files[fileIndex][rank] = char === 'P' ? 'white' : 'black';
                }
                fileIndex++;
            } else {
                fileIndex += Number(char);
            }
        }
    }
    
    let doubled = 0;
    let isolated = 0;
    let connected = 0;
    let passed = 0;
    
    // Analyze pawn structure
    for (let file = 0; file < 8; file++) {
        let whitePawns = 0;
        let blackPawns = 0;
        
        // Count pawns in file
        for (let rank = 0; rank < 8; rank++) {
            if (files[file][rank] === 'white') whitePawns++;
            if (files[file][rank] === 'black') blackPawns++;
        }
        
        // Check doubled pawns
        if (whitePawns > 1) doubled++;
        if (blackPawns > 1) doubled--;
        
        // Check isolated pawns
        const hasNeighborPawn = (file > 0 && files[file - 1].some(p => p !== null)) ||
                               (file < 7 && files[file + 1].some(p => p !== null));
        if (!hasNeighborPawn && (whitePawns > 0 || blackPawns > 0)) {
            isolated += whitePawns - blackPawns;
        }
        
        // Check connected pawns
        if (file < 7) {
            for (let rank = 0; rank < 8; rank++) {
                if (files[file][rank] === files[file + 1][rank]) {
                    if (files[file][rank] === 'white') connected++;
                    if (files[file][rank] === 'black') connected--;
                }
            }
        }
    }
    
    return { doubled, isolated, connected, passed };
}

function evaluateKingSafety(fen: string): number {
    const position = fen.split(' ')[0];
    const rows = position.split('/');
    let whiteKingSafety = 0;
    let blackKingSafety = 0;
    
    // Find kings
    let whiteKingFile = -1, whiteKingRank = -1;
    let blackKingFile = -1, blackKingRank = -1;
    
    for (let rank = 0; rank < 8; rank++) {
        let file = 0;
        for (const char of rows[rank]) {
            if (char === 'K') {
                whiteKingFile = file;
                whiteKingRank = rank;
            } else if (char === 'k') {
                blackKingFile = file;
                blackKingRank = rank;
            }
            if (isNaN(Number(char))) {
                file++;
            } else {
                file += Number(char);
            }
        }
    }
    
    // Evaluate pawn shelter
    const evaluateShelter = (kingFile: number, kingRank: number, color: 'white' | 'black') => {
        let shelter = 0;
        const pawnChar = color === 'white' ? 'P' : 'p';
        const frontRanks = color === 'white' ? [kingRank - 1, kingRank - 2] : [kingRank + 1, kingRank + 2];
        
        for (const rank of frontRanks) {
            if (rank < 0 || rank >= 8) continue;
            for (let f = Math.max(0, kingFile - 1); f <= Math.min(7, kingFile + 1); f++) {
                if (rows[rank][f] === pawnChar) shelter++;
            }
        }
        return shelter;
    };
    
    whiteKingSafety = evaluateShelter(whiteKingFile, whiteKingRank, 'white');
    blackKingSafety = evaluateShelter(blackKingFile, blackKingRank, 'black');
    
    return whiteKingSafety - blackKingSafety;
}

// Remove this line as we're using executeChessCommand instead
// const handler = chessHandler.execute.bind(chessHandler);

const llm = new LLMClient({
    model: 'openai/o1-mini',
    temperature: 0.1,
    maxTokens: 500
});

// Initialize both players
const fischer = new ChessProcessor(llm, bobby, LogLevel.DEBUG);
const kasparov = new ChessProcessor(llm, garry, LogLevel.DEBUG);

interface GameResult {
    winner: 'Fischer' | 'Kasparov' | 'Draw';
    moves: number;
    endReason: string;
}

export async function playMatch(gameId: string = "ai_match_1"): Promise<GameResult> {
    let game = await executeChessCommand({
        command: "new",
        gameId
    });

    let moveCount = 0;
    
    console.log("\nMatch: Bobby Fischer vs Garry Kasparov");
    
    while (true) {
        // Display current position
        console.log(renderBoard(game.fen));
        console.log("\nFEN:", chalk.cyan(game.fen));
        console.log("PGN:", chalk.yellow(game.pgn || "Game start"));
        
        // Get current player
        const currentPlayer = game.fen.split(' ')[1] === 'w' ? fischer : kasparov;
        const playerName = currentPlayer === fischer ? "Fischer" : "Kasparov";
        
        console.log(`\n${playerName} is thinking...`);
        
        const analysis = await currentPlayer.process({
            command: "analyze",
            gameId,
            fen: game.fen,
            context: {
                gamePhase: moveCount < 10 ? "opening" : moveCount < 30 ? "middlegame" : "endgame",
                gameHistory: {
                    pgn: game.pgn,
                    currentPosition: game.fen,
                    moveNumber: Math.floor(moveCount / 2) + 1,
                    lastMove: game.lastMove
                },
                position: {
                    material: calculateMaterial(game.fen),
                    centerControl: evaluateCenter(game.fen),
                    development: countDevelopedPieces(game.fen),
                    pawnStructure: analyzePawnStructure(game.fen),
                    kingPosition: evaluateKingSafety(game.fen)
                },
                style: currentPlayer === fischer ? {
                    type: "classical",
                    preferences: "piece activity, center control, pawn structure",
                    openingRepertoire: "1.e4 player, Ruy Lopez specialist"
                } : {
                    type: "dynamic",
                    preferences: "initiative, attacking chances, piece mobility",
                    openingRepertoire: "Sicilian Defense, King's Indian specialist"
                }
            }
        }, `As ${currentPlayer === fischer ? 'Bobby Fischer' : 'Garry Kasparov'}, analyze this position:
        
        1. Review the game history and identify key turning points
        2. Evaluate the current position:
           - Material balance: ${calculateMaterial(game.fen)}
           - Center control: ${evaluateCenter(game.fen)}
           - Development: ${countDevelopedPieces(game.fen)}
           - Pawn structure: ${JSON.stringify(analyzePawnStructure(game.fen))}
           - King safety: ${evaluateKingSafety(game.fen)}
        
        3. Consider your preferred playing style and suggest a move that aligns with:
           ${currentPlayer === fischer ? 
          '- Classical positional play\n- Clear tactical solutions\n- Strong pawn structure' :
          '- Dynamic piece play\n- Complex tactical opportunities\n- King safety vs. attack'
        }
        
        Provide your analysis and concrete move recommendation.`);

        // Increment move counter
        moveCount++;

        console.log(`\n${playerName}'s Analysis:`, analysis.content);
        
        const move = analysis.metadata.recommendedMove;
        if (!move) {
            console.log(`\n${playerName} couldn't decide on a move.`);
            break;
        }

        // Add after the existing evaluation functions
        function validateMove(fen: string, move: string): boolean {
            try {
                const chess = new Chess(fen);
                const validMoves = chess.moves({ verbose: true });
                return validMoves.some(m => m.san === move);
            } catch (error) {
                return false;
            }
        }
        
        // Add function to prevent repetitive moves
        function isRepetitiveMove(move: string, pgn: string): boolean {
            const moves = pgn.split(' ').slice(-6);
            const lastThreeMoves = moves.filter(m => m === move);
            return lastThreeMoves.length >= 2;
        }
        
        // Modify the playMatch function's move execution section
        try {
            let selectedMove = move;
            if (!validateMove(game.fen, selectedMove)) {
                console.log(`\n${playerName} suggested invalid move: ${selectedMove}`);
                break;
            }
        
            if (isRepetitiveMove(selectedMove, game.pgn || '')) {
                console.log(`\n${playerName} is making repetitive moves, suggesting alternative...`);
                // Get alternative move from possible moves
                const alternativeMoves = game.possibleMoves.filter(m => m !== selectedMove);
                if (alternativeMoves.length === 0) {
                    console.log(`\nNo alternative moves available.`);
                    break;
                }
                selectedMove = alternativeMoves[0];
            }
        
            const result = await executeChessCommand({
                command: "move",
                gameId,
                move: selectedMove,
                fen: game.fen
            });

            game = result;
            console.log(`\n> ${playerName} played: ${move}`);

            if (game.status !== 'ongoing') {
                console.log(`\nGame Over! Result: ${game.status}`);
                break;
            }

            // Add delay between moves
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.log(`\n${playerName} made an invalid move:`, error);
            break;
        }
    }
    // When game ends, determine the winner
    let winner: GameResult['winner'];
    let endReason = game.status;
    
    if (game.status.includes('checkmate')) {
        winner = game.fen.split(' ')[1] === 'w' ? 'Kasparov' : 'Fischer';
    } else {
        winner = 'Draw';
    }

    return {
        winner,
        moves: moveCount,
        endReason
    };
}

// Only run standalone game if this file is run directly
if (require.main === module) {
    playMatch().catch(console.error);
}