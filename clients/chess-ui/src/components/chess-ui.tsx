import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import './chess-ui.css';

type Square = 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'a7' | 'a8' |
             'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6' | 'b7' | 'b8' |
             'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8' |
             'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7' | 'd8' |
             'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6' | 'e7' | 'e8' |
             'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8' |
             'g1' | 'g2' | 'g3' | 'g4' | 'g5' | 'g6' | 'g7' | 'g8' |
             'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'h7' | 'h8';

type Piece = {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: 'w' | 'b';
};

const PIECE_SYMBOLS: Record<string, string> = {
  'wk': '♔', 'wq': '♕', 'wr': '♖', 'wb': '♗', 'wn': '♘', 'wp': '♙',
  'bk': '♚', 'bq': '♛', 'br': '♜', 'bb': '♝', 'bn': '♞', 'bp': '♟'
};

const ChessSquare = ({ piece, isWhiteSquare, onClick }: { piece: Piece | null, isWhiteSquare: boolean, onClick: () => void }) => (
  <div
    className={`chess-square ${isWhiteSquare ? 'white' : 'black'}`}
    onClick={onClick}
  >
    {piece && (
      <span className={`chess-piece ${piece.color === 'w' ? 'white' : 'black'}`}>
        {PIECE_SYMBOLS[`${piece.color}${piece.type}`]}
      </span>
    )}
  </div>
);

export function ChessUI() {
  const [game] = useState(new Chess());
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [boardState, setBoardState] = useState<(Piece | null)[][]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    const websocket = new WebSocket('ws://localhost:3000');
    
    websocket.onopen = () => {
      console.log('Connected to game server');
      // Add welcome message and instructions when the game starts
      setHistory([
        'Welcome! You\'re playing as White against Bobby Fischer!',
        'Type moves in algebraic notation (e.g., \'e4\', \'Nf3\')',
        'White to move',
        '',
        'Commands:',
        '- Enter a move (e.g., \'e4\', \'Nf3\')',
        '- Type \'chat\' to talk to Bobby',
        '- Type \'analyze\' to get Bobby\'s analysis'
      ]);
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'move') {
        game.move(data.move);
        updateBoardState();
        setHistory(prev => [...prev, `Bobby played ${data.move}`]);
      } else if (data.type === 'message') {
        setHistory(prev => [...prev, `Bobby: ${data.message}`]);
      }
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, []);

  useEffect(() => {
    updateBoardState();
  }, [game]);

  const updateBoardState = () => {
    const newBoard: (Piece | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const square = String.fromCharCode(97 + j) + (8 - i) as Square;
        const piece = game.get(square);
        if (piece) {
          newBoard[i][j] = {
            type: piece.type,
            color: piece.color
          };
        }
      }
    }
    setBoardState(newBoard);
  };

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = command.trim().toLowerCase();
    if (!cmd) return;

    setHistory(prev => [...prev, `> ${cmd}`]);
    setCommand('');

    if (cmd === 'quit') {
      setHistory(prev => [...prev, 'Game ended.']);
      return;
    }

    if (cmd === 'chat') {
      ws?.send(JSON.stringify({ type: 'chat' }));
      return;
    }

    if (cmd === 'analyze') {
      ws?.send(JSON.stringify({ type: 'analyze', position: game.fen() }));
      return;
    }

    try {
      // Validate move format
      const movePattern = /^([NBRQK])?([a-h])?([1-8])?x?([a-h][1-8])(=[NBRQ])?[+#]?$/;
      if (!movePattern.test(cmd) && !cmd.toLowerCase().includes('o-o')) {
        setHistory(prev => [...prev, 'Invalid move format. Please use standard algebraic notation (e.g., e4, Nf3, O-O).']);
        return;
      }

      const move = game.move(cmd);
      if (move) {
        updateBoardState();
        ws?.send(JSON.stringify({ 
          type: 'move', 
          move: cmd,
          fen: game.fen()
        }));
        
        setHistory(prev => [...prev, `Move ${cmd} played successfully.`]);
        setHistory(prev => [...prev, 'Waiting for Bobby\'s move...']);

        // Request Bobby's response move
        ws?.send(JSON.stringify({
          type: 'request_move',
          fen: game.fen()
        }));
      } else {
        setHistory(prev => [...prev, 'Invalid move. The move is not legal in the current position.']);
      }
    } catch (error) {
      setHistory(prev => [...prev, `Error: ${error instanceof Error ? error.message : 'Invalid move'}. Please try again.`]);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex-1 bg-background/95 p-4 rounded-lg border shadow-lg">
        <div className="chess-board">
          {/* Chess squares with pieces */}
          {boardState.map((row, i) => (
            row.map((piece, j) => {
              const isLight = (i + j) % 2 === 0;
              const file = String.fromCharCode(97 + j);
              const rank = 8 - i;
              return (
                <div
                  key={`${i}-${j}`}
                  className={`chess-square ${isLight ? 'white' : 'black'}`}
                  data-square={`${file}${rank}`}
                  data-file={file}
                  data-rank={rank}
                >
                  {piece && PIECE_SYMBOLS[piece.color + piece.type]}
                </div>
              );
            })
          ))}
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="h-48 overflow-y-auto p-2 rounded-lg border bg-background/95">
          {history.map((entry, i) => (
            <div key={i} className="text-sm">{entry}</div>
          ))}
        </div>

        <form onSubmit={handleCommand} className="flex gap-2">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Type your command..."
            className="flex-1 px-3 py-2 rounded-lg border bg-background"
          />
          <button 
            type="submit"
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}