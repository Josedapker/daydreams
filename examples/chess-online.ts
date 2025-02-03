import { WebSocket } from "ws";

import {
    ChessProcessor,
} from "../packages/core/src/core/processors/chess-processor";

interface ChessGameEvent {
    type: 'gameStart' | 'gameEnd' | 'move';
    gameId: string;
    position: string;
    timeLeft?: number;
}

export class OnlineChessConnector {
    private ws: WebSocket;
    
    constructor(
        private processor: ChessProcessor,
        private apiKey: string,
        private platform: 'lichess' | 'chess.com'
    ) {}

    async connectAndPlay() {
        this.ws = new WebSocket(this.getPlatformUrl());
        
        this.ws.on('message', async (data) => {
            try {
                const event = JSON.parse(data.toString()) as ChessGameEvent;
                
                if (event.type === 'gameStart') {
                    await this.handleGame(event);
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        });
    }

    private getPlatformUrl(): string {
        return this.platform === 'lichess' 
            ? 'wss://lichess.org/api/stream/event'
            : 'wss://chess.com/play/socket';
    }

    private async handleGame(event: ChessGameEvent) {
        const response = await this.processor.process({
            command: "analyze",
            gameId: event.gameId,
            fen: event.position,
            timeControl: event.timeLeft
        }, "");

        this.ws.send(JSON.stringify({
            type: 'move',
            move: response.metadata.recommendedMove
        }));
    }
}