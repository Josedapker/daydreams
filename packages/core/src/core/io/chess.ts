import { Chess } from "chess.js";

import type { ActionIOHandler } from "../types";
import { HandlerRole } from "../types";  // Add HandlerRole import

// Store games Map outside the handler
const games = new Map<string, Chess>();

export const chessHandler: ActionIOHandler = {
    role: HandlerRole.ACTION,  // Use proper enum value
    name: 'chess-handler',

    execute: async (command: any) => {
        const { gameId } = command;

        switch (command.command) {
            case 'new': {
                const game = new Chess();
                games.set(gameId, game);  // Use external games Map
                return {
                    gameId,
                    fen: game.fen(),
                    pgn: game.pgn(),
                    status: 'ongoing',
                    possibleMoves: game.moves()
                };
            }
            case 'move': {
                const game = games.get(gameId);  // Use external games Map
                if (!game) {
                    throw new Error('Game not found');
                }

                const move = game.move(command.move);
                if (!move) {
                    throw new Error('Invalid move');
                }

                const status = game.isGameOver() 
                    ? (game.isCheckmate() ? 'checkmate' 
                       : game.isDraw() ? 'draw' 
                       : game.isStalemate() ? 'stalemate' 
                       : 'ended')
                    : 'ongoing';

                return {
                    gameId,
                    fen: game.fen(),
                    pgn: game.pgn({ newline: ' ' }),
                    status,
                    possibleMoves: game.moves()
                };
            }
            default:
                return undefined;
        }
    }
};