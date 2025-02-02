import { Chess } from "chess.js";

import { ChainOfThought } from "../chain-of-thought";
import { LLMClient } from "../llm-client";
import { BaseProcessor } from "../processor";
import type {
    Character,
    ProcessedResult,
} from "../types";
import { LogLevel } from "../types";  // Changed to regular import for enum
import { ChromaVectorDB } from "../vector-db";  // Add this import

export class ChessProcessor extends BaseProcessor {
    private games: Map<string, Chess>;
    private chainOfThought: ChainOfThought;

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
        
        // Modify the context to be more neutral
        this.chainOfThought = new ChainOfThought(
            llmClient,
            new ChromaVectorDB(),
            {
                worldState: `Chess analysis system with expertise in:
                - Strategic position evaluation
                - Opening theory and principles
                - Tactical combinations
                - Endgame technique
                
                Analysis guidelines:
                - Evaluate material balance
                - Consider piece activity and coordination
                - Assess pawn structure
                - Identify tactical opportunities
                - Suggest concrete improvements`
            }
        );
    }

    // Implement the abstract canHandle method
    canHandle(content: any): boolean {
        return content.command && ['new', 'move', 'analyze', 'chat', 'hint'].includes(content.command);
    }

    async process(content: any, otherContext: string): Promise<ProcessedResult> {
        if (!['analyze', 'chat', 'hint'].includes(content.command)) {
            throw new Error('Invalid command for ChessProcessor');
        }
    
        const chess = new Chess(content.fen);
        const legalMoves = chess.moves();
    
        if (content.command === 'analyze' || content.command === 'chat') {
            const prompt = content.command === 'chat' 
                ? `Chess position (FEN: ${content.fen})
                   
                   ${content.question}
                   
                   Please consider:
                   - Material balance
                   - Piece activity
                   - Center control
                   - Development
                   - Key squares
                   
                   End your analysis with a concrete move recommendation.`
                : `Chess position (FEN: ${content.fen})
                   
                   Please provide:
                   - Position evaluation
                   - Key strategic elements
                   - Best candidate moves
                   
                   End your analysis with a concrete move recommendation.`;

            this.logger.debug('process', 'Starting analysis');
            
            try {
                const response = await this.llmClient.complete(prompt);
                this.logger.debug('process', `Analysis response: ${response.text}`);
                
                if (response.text) {
                    const recommendedMove = this.extractRecommendedMove(response.text, legalMoves);
                    this.logger.debug('process', `Extracted move: ${recommendedMove}`);
                    
                    return {
                        content: response.text,
                        metadata: {
                            recommendedMove: recommendedMove || this.selectDefaultMove(legalMoves),
                            legalMoves
                        },
                        enrichedContext: {
                            timeContext: new Date().toISOString(),
                            summary: "Chess analysis",
                            topics: ["chess", "analysis"],
                            relatedMemories: []
                        },
                        suggestedOutputs: []
                    };
                }
                
                return this.createDefaultAnalysis(chess, legalMoves);
            } catch (error) {
                this.logger.error('process', `Analysis failed: ${error}`);
                return this.createDefaultAnalysis(chess, legalMoves);
            }
        }

        if (content.command === 'analyze' || content.command === 'chat') {
                const prompt = content.command === 'chat' 
                    ? `Chess Position Analysis:
                       FEN: ${content.fen}
                       Question: ${content.question}
                       
                       Please analyze this position considering:
                       1. Material balance
                       2. Piece activity
                       3. Center control
                       4. Development
                       5. Tactical themes`
                    : `Chess Position Analysis:
                       FEN: ${content.fen}
                       
                       Please analyze this position considering:
                       1. Material count
                       2. Position evaluation
                       3. Key squares
                       4. Best moves`;
            
                this.logger.debug('process', 'Starting analysis');
                
                try {
                    const response = await this.llmClient.complete(prompt);
                    this.logger.debug('process', `Analysis response: ${response.text}`);
                    
                    if (response.text) {
                        const recommendedMove = this.extractRecommendedMove(response.text, legalMoves);
                        this.logger.debug('process', `Extracted move: ${recommendedMove}`);
                        
                        return {
                            content: response.text,
                            metadata: {
                                recommendedMove: recommendedMove || this.selectDefaultMove(legalMoves),
                                legalMoves
                            },
                            enrichedContext: {
                                timeContext: new Date().toISOString(),
                                summary: "Chess analysis with context",
                                topics: ["chess", "analysis"],
                                relatedMemories: []
                            },
                            suggestedOutputs: []
                        };
                    }
                    
                    return this.createDefaultAnalysis(chess, legalMoves);
                } catch (error) {
                    this.logger.error('process', `Analysis failed: ${error}`);
                    return this.createDefaultAnalysis(chess, legalMoves);
                }
            }

        // Handle hint command
        if (content.command === 'hint') {
            return {
                content: `Legal moves in this position: ${legalMoves.join(', ')}`,
                metadata: {
                    recommendedMove: legalMoves[0],
                    legalMoves
                },
                enrichedContext: {
                    timeContext: new Date().toISOString(),
                    summary: "Chess move suggestions",
                    topics: ["chess", "hints"],
                    relatedMemories: []
                },
                suggestedOutputs: []
            };
        }
        
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
            // Provide default response if empty
            return {
                content: response.text || "In this position, I would focus on developing pieces and controlling the center. Consider moves like d4, Nf3, or Bc4.",
                metadata: {
                    legalMoves
                },
                enrichedContext: {
                    timeContext: new Date().toISOString(),
                    summary: "Chess conversation with Bobby Fischer",
                    topics: ["chess", "conversation"],
                    relatedMemories: []
                },
                suggestedOutputs: []
            };
        }

        // Remove these two lines as we already have chess and legalMoves defined above
        // const game = new Chess(content.fen);
        // const legalMoves = game.moves();
        
        const prompt = `You are Bobby Fischer analyzing a chess position...`;

        try {
            const response = await this.llmClient.complete(prompt);
            console.log("\nDebug - Raw LLM response:", response);
            
            // If we get an empty response, provide a default analysis with better move selection
            if (!response.text) {
                // Prioritize development moves and center control
                const priorityMoves = legalMoves.filter(move => 
                    // Development moves
                    move.includes('N') || move.includes('B') || 
                    // Center pawns
                    move.startsWith('d') || move.startsWith('e') ||
                    // Castle
                    move.includes('O-O')
                );
            
                const recommendedMove = priorityMoves.length > 0 ? 
                    priorityMoves[Math.floor(Math.random() * priorityMoves.length)] : 
                    legalMoves[0];
            
                return {
                    content: "Position analysis unavailable. Making a developing move.",
                    metadata: {
                        recommendedMove,
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
            }
            
            // First, try to extract any JSON-like content from the response
            const responseText = response.text || '';
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            
            const parsed = JSON.parse(jsonMatch[0]);
            
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

    // Add helper method to extract recommended move from analysis
    private extractRecommendedMove(analysis: string, legalMoves: string[]): string | null {
        // Look for move notation in the analysis
        const moveMatch = analysis.match(/\b([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?|O-O(?:-O)?)\b/);
        if (moveMatch && legalMoves.includes(moveMatch[1])) {
            return moveMatch[1];
        }
        return null;
    }

    // Add helper method for selecting default moves
    private selectDefaultMove(legalMoves: string[]): string {
        // Prioritize common strong opening moves
        const preferredMoves = ['e4', 'e5', 'd4', 'd5', 'Nf3', 'Nc6'];
        const defaultMove = preferredMoves.find(move => legalMoves.includes(move));
        return defaultMove || legalMoves[0];
    }

    // Add helper method for creating default analysis
    private createDefaultAnalysis(chess: Chess, legalMoves: string[]): ProcessedResult {
        const defaultMove = this.selectDefaultMove(legalMoves);
        return {
            content: "Position appears balanced. Focus on development and center control.",
            metadata: {
                recommendedMove: defaultMove,
                legalMoves
            },
            enrichedContext: {
                timeContext: new Date().toISOString(),
                summary: "Basic chess analysis",
                topics: ["chess", "analysis"],
                relatedMemories: []
            },
            suggestedOutputs: []
        };
    }
    // Remove the duplicate chat and analyze blocks
    // Delete from here until the end of the file
}