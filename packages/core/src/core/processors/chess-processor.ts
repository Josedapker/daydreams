import { Chess } from "chess.js";

import { LLMClient } from "../llm-client";
import { BaseProcessor } from "../processor";
import type {
    Character,
    ProcessedResult,
} from "../types";
import { LogLevel } from "../types";  // Changed to regular import for enum

export class ChessProcessor extends BaseProcessor {
    private games: Map<string, Chess>;

    constructor(
        protected llmClient: LLMClient,
        protected character: Character,
        logLevel: LogLevel = LogLevel.ERROR
    ) {
        super(
            {
                name: "chess-processor",
                description: "Handles chess game analysis and moves"
            },
            logLevel,
            character,
            llmClient
        );
        this.games = new Map();
    }

    canHandle(content: any): boolean {
        return content.command && ['new', 'move', 'analyze', 'chat'].includes(content.command);
    }

    async process(content: any, otherContext: string): Promise<ProcessedResult> {
        if (!['analyze', 'chat'].includes(content.command)) {
            throw new Error('Invalid command for ChessProcessor');
        }

        const chess = new Chess(content.fen);
        
        if (content.command === 'chat') {
            const prompt = `
Current chess position:
FEN: ${content.fen}
Question: ${content.question}

As Bobby Fischer, please provide your thoughts on this specific question, considering:
1. The current position
2. Concrete tactical and strategic considerations
3. Your experience and chess principles
`;
            const response = await this.llmClient.complete(prompt);
            return {
                content: response.text,
                metadata: {},
                enrichedContext: {
                    timeContext: new Date().toISOString(),
                    summary: "Chess conversation with Bobby Fischer",
                    topics: ["chess", "conversation"],
                    relatedMemories: []
                },
                suggestedOutputs: []
            };
        }

        const game = new Chess(content.fen);
        const legalMoves = game.moves();
        
        const prompt = `You are Bobby Fischer analyzing a chess position. Respond with a JSON object containing your analysis and move choice.

Position FEN: ${content.fen}
Legal moves: ${legalMoves.join(', ')}

Required JSON format:
{
    "analysis": "Brief position analysis",
    "recommendedMove": "chosen move"
}

Rules:
- recommendedMove MUST be one of these legal moves: ${legalMoves.join(', ')}
- Respond with ONLY the JSON object
- No other text or explanation`;

        try {
            const response = await this.llmClient.complete(prompt);
            console.log("\nDebug - Raw LLM response:", response);
            
            // Extract the actual JSON string from the nested response
            const responseText = typeof response === 'string' ? response :
                               typeof response === 'object' && response !== null && 'text' in response ? 
                               response.text : JSON.stringify(response);
            
            // Parse the inner JSON string
            const innerJson = JSON.parse(responseText);
            const parsed = typeof innerJson === 'string' ? JSON.parse(innerJson) : innerJson;
            
            if (!parsed.analysis || !parsed.recommendedMove) {
                throw new Error('Response missing required fields');
            }

            if (!legalMoves.includes(parsed.recommendedMove)) {
                throw new Error(`Illegal move suggested: ${parsed.recommendedMove}. Legal moves are: ${legalMoves.join(', ')}`);
            }

            return {
                content: parsed.analysis,
                metadata: {
                    recommendedMove: parsed.recommendedMove,
                    legalMoves
                },
                enrichedContext: {
                    timeContext: new Date().toISOString(),
                    summary: "Chess game analysis",
                    topics: ["chess", "game analysis"],
                    relatedMemories: []
                },
                suggestedOutputs: []
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error("\nDebug - Error:", errorMessage);
            throw new Error(`Bobby's analysis failed: ${errorMessage}`);
        }
    }
}