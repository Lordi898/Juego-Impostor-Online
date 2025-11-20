import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { GameState, Player, GamePhase, Role, PeerData, MAX_PLAYERS, ChatMessage } from './types';
import { Button, Input, GlitchText } from './components/UI';
import { PlayerCard } from './components/PlayerCard';
import { generateBotAvatar, generateSecretWord, getBotMove, checkImpostorGuess } from './services/geminiService';
import { Send, Copy, Users, ShieldAlert, BrainCircuit } from 'lucide-react';

// Initial State
const INITIAL_STATE: GameState = {
  phase: GamePhase.LOBBY,
  players: [],
  secretWord: '',
  category: '',
  turnIndex: 0,
  round: 1,
  messages: [],
  clues: []
};

export default function App() {
  // Local UI State
  const [myId, setMyId] = useState<string>('');
  const [hostId, setHostId] = useState<string>('');
  const [myName, setMyName] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [inputClue, setInputClue] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);

  // PeerJS Refs
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const isHostRef = useRef(false);
  
  // Bot Processing Flag
  const isProcessingBotRef = useRef(false);

  // --- Initialization ---

  const initializePeer = (overrideId?: string) => {
    const peer = new Peer(overrideId, {
        debug: 2,
        secure: true, // OBLIGATORIO: Para que funcione en Vercel (HTTPS)
        config: {
          // Esto ayuda a conectar ordenadores en diferentes casas (WiFis distintas)
          iceServers: [
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ],
        },
    });    
    peer.on('open', (id) => {
      setMyId(id);
      setIsConnected(true);
      console.log("My Peer ID:", id);
    });

    peer.on('connection', (conn) => {
      handleConnection(conn);
    });

    peer.on('error', (err) => {
      console.error("Peer Error:", err);
      // Simple reconnection logic could go here
    });

    peerRef.current = peer;
  };

  const handleConnection = (conn: DataConnection) => {
    conn.on('open', () => {
      console.log("New connection from:", conn.peer);
      connectionsRef.current.set(conn.peer, conn);

      // If Host, handle new player join logic via data channel
    });

    conn.on('data', (data: any) => {
      handleDataPacket(data, conn.peer);
    });

    conn.on('close', () => {
      console.log("Connection closed:", conn.peer);
      connectionsRef.current.delete(conn.peer);
      // Handle player disconnect in state
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p => p.id === conn.peer ? { ...p, connected: false } : p)
      }));
    });
  };

  useEffect(() => {
    initializePeer();
    return () => {
      peerRef.current?.destroy();
    };
  }, []);

  // --- Networking Helpers ---

  const broadcast = useCallback((data: PeerData) => {
    connectionsRef.current.forEach(conn => {
      if (conn.open) conn.send(data);
    });
  }, []);

  const sendToHost = (data: PeerData) => {
    const conn = connectionsRef.current.get(hostId);
    if (conn && conn.open) {
      conn.send(data);
    }
  };

  // --- State Management (Host Only mostly) ---

  const updateGameState = useCallback((newState: GameState) => {
    setGameState(newState);
    broadcast({ type: 'SYNC_STATE', payload: newState });
  }, [broadcast]);

  const handleDataPacket = (data: PeerData, senderId: string) => {
    // Handle State Sync (Client)
    if (data.type === 'SYNC_STATE') {
      setGameState(data.payload);
      // Check if role just got assigned (Game Start)
      if (data.payload.phase === GamePhase.PLAYING && gameState.phase === GamePhase.LOBBY) {
        setShowRoleModal(true);
      }
      return;
    }

    // Only Host processes Actions
    if (!isHostRef.current) return;

    let newState = { ...gameState };

    switch (data.type) {
      case 'ACTION_JOIN':
        // Check if player exists
        const existingPlayer = newState.players.find(p => p.id === senderId);
        if (existingPlayer) {
          existingPlayer.connected = true;
        } else {
          if (newState.players.length >= MAX_PLAYERS) return;
          newState.players.push({
            id: senderId,
            name: data.payload.name,
            isBot: false,
            avatarUrl: `https://api.dicebear.com/9.x/avataaars/svg?seed=${senderId}`,
            isAlive: true,
            isHost: false,
            connected: true
          });
        }
        updateGameState(newState);
        break;

      case 'ACTION_MOVE':
        // Process Clue
        if (newState.players[newState.turnIndex].id !== senderId) return; // Not your turn
        newState.clues.push({ playerId: senderId, clue: data.payload.clue });
        
        // Add to chat log
        newState.messages.push({
          id: Date.now().toString(),
          playerId: senderId,
          playerName: newState.players.find(p => p.id === senderId)?.name || 'Unknown',
          text: `Clue: ${data.payload.clue}`,
          timestamp: Date.now(),
          isSystem: true
        });

        // Next turn
        newState.turnIndex = (newState.turnIndex + 1) % newState.players.length;
        updateGameState(newState);
        break;

      case 'ACTION_GUESS':
        // Impostor Guess
        const { word } = data.payload;
        const impostor = newState.players.find(p => p.id === senderId);
        if (impostor?.role !== Role.IMPOSTOR) return;

        // Async check handled outside switch usually, but here we inline for simplicity
        checkImpostorGuess(word, newState.secretWord).then(isCorrect => {
            const finalState = { ...gameState }; // fresh ref
            finalState.phase = GamePhase.GAME_OVER;
            finalState.winner = isCorrect ? Role.IMPOSTOR : Role.CIVILIAN;
            finalState.messages.push({
                id: Date.now().toString(),
                playerId: 'system',
                playerName: 'SYSTEM',
                text: `Impostor guessed "${word}". Result: ${isCorrect ? 'VICTORY' : 'DEFEAT'}`,
                timestamp: Date.now(),
                isSystem: true
            });
            updateGameState(finalState);
        });
        break;
    }
  };

  // --- Host Game Logic Actions ---

  const startGame = async () => {
    if (gameState.players.length < 3) {
      alert("Need at least 3 players!");
      return;
    }

    // 1. Generate Word
    const { word, category } = await generateSecretWord();

    // 2. Assign Roles
    const players = [...gameState.players];
    // Reset previous data
    players.forEach(p => { p.role = Role.CIVILIAN; p.isAlive = true; });
    
    const impostorIndex = Math.floor(Math.random() * players.length);
    players[impostorIndex].role = Role.IMPOSTOR;

    const newState: GameState = {
      ...gameState,
      phase: GamePhase.PLAYING,
      secretWord: word,
      category: category,
      players: players,
      turnIndex: 0,
      round: 1,
      clues: [],
      messages: [...gameState.messages, {
        id: Date.now().toString(),
        playerId: 'system',
        playerName: 'SYSTEM',
        text: `Game Started! Category: ${category}`,
        timestamp: Date.now(),
        isSystem: true
      }]
    };
    updateGameState(newState);
  };

  const addBot = async () => {
    const botId = `bot-${Date.now()}`;
    const botName = `Unit-${Math.floor(Math.random() * 999)}`;
    const avatar = await generateBotAvatar(botName);
    
    const newBot: Player = {
      id: botId,
      name: botName,
      isBot: true,
      avatarUrl: avatar,
      isAlive: true,
      isHost: false,
      connected: true
    };
    
    const newState = { ...gameState, players: [...gameState.players, newBot] };
    updateGameState(newState);
  };

  // --- Bot Turn Logic (Effect) ---

  useEffect(() => {
    if (!isHostRef.current || gameState.phase !== GamePhase.PLAYING) return;

    const currentPlayer = gameState.players[gameState.turnIndex];
    
    if (currentPlayer?.isBot && !isProcessingBotRef.current) {
      isProcessingBotRef.current = true;

      // Simulate "Thinking" time
      setTimeout(async () => {
        const history = gameState.clues.map(c => {
          const pName = gameState.players.find(p => p.id === c.playerId)?.name;
          return `${pName}: "${c.clue}"`;
        });

        const isImpostor = currentPlayer.role === Role.IMPOSTOR;
        
        // AI Logic
        let clue = await getBotMove(isImpostor, gameState.secretWord, history, currentPlayer.name);
        
        // Broadcast Move
        // Create a local action packet to feed into handleDataPacket logic
        // Or simply update state directly since we are Host
        const newState = { ...gameState };
        newState.clues.push({ playerId: currentPlayer.id, clue });
        newState.messages.push({
          id: Date.now().toString(),
          playerId: currentPlayer.id,
          playerName: currentPlayer.name,
          text: `Clue: ${clue}`,
          timestamp: Date.now(),
          isSystem: true
        });
        newState.turnIndex = (newState.turnIndex + 1) % newState.players.length;
        
        updateGameState(newState);
        isProcessingBotRef.current = false;

      }, 2000 + Math.random() * 3000); // Random delay 2-5s
    }
  }, [gameState.turnIndex, gameState.phase, gameState.players, gameState.secretWord, updateGameState]);


  // --- User Actions ---

  const joinGame = () => {
    if (!myName) return alert("Enter name");
    if (!hostId) return alert("Enter Host ID");
    
    const conn = peerRef.current?.connect(hostId);
    if (conn) {
      conn.on('open', () => {
        setIsConnected(true);
        connectionsRef.current.set(hostId, conn);
        conn.send({ type: 'ACTION_JOIN', payload: { name: myName } });
        
        // Setup listener for this specific connection
        conn.on('data', (data: any) => handleDataPacket(data, hostId));
      });
    }
  };

  const createGame = () => {
    if (!myName) return alert("Enter name");
    isHostRef.current = true;
    setHostId(myId); // I am host
    
    const me: Player = {
      id: myId,
      name: myName,
      isBot: false,
      avatarUrl: `https://api.dicebear.com/9.x/avataaars/svg?seed=${myId}`,
      isAlive: true,
      isHost: true,
      connected: true
    };
    setGameState(prev => ({ ...prev, players: [me] }));
  };

  const sendClue = () => {
    if (!inputClue.trim()) return;
    
    if (isHostRef.current) {
        // Directly update
        handleDataPacket({ type: 'ACTION_MOVE', payload: { clue: inputClue } }, myId);
    } else {
        sendToHost({ type: 'ACTION_MOVE', payload: { clue: inputClue } });
    }
    setInputClue('');
  };

  const submitGuess = () => {
    const guess = prompt("IMPOSTOR GUESS: If you are wrong, you might lose immediately. What is the secret word?");
    if (guess) {
        if(isHostRef.current) {
             handleDataPacket({ type: 'ACTION_GUESS', payload: { word: guess } }, myId);
        } else {
            sendToHost({ type: 'ACTION_GUESS', payload: { word: guess } });
        }
    }
  };

  // --- Render Helpers ---

  const myPlayer = gameState.players.find(p => p.id === myId);
  const isMyTurn = gameState.phase === GamePhase.PLAYING && gameState.players[gameState.turnIndex]?.id === myId;

  if (!isConnected && !myId) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Initializing Neural Link...</div>;
  }

  // LOBBY / JOIN SCREEN
  if (gameState.players.length === 0 || (!isHostRef.current && gameState.players.length === 0)) {
    return (
      <div className="min-h-screen bg-[url('https://images.unsplash.com/photo-1535868463750-c78d9543614f?q=80&w=2076&auto=format&fit=crop')] bg-cover bg-center flex items-center justify-center p-4">
        <div className="bg-black/80 backdrop-blur-md p-8 rounded-xl border border-neon-blue shadow-[0_0_30px_rgba(0,243,255,0.2)] max-w-md w-full">
            <GlitchText text="NEUROSPY" className="text-4xl text-center mb-2" />
            <p className="text-center text-blue-300 mb-8 font-sans tracking-wider">MASSIVE EDITION</p>
            
            <div className="space-y-4">
                <div>
                    <label className="text-xs text-neon-blue uppercase">Códename</label>
                    <Input placeholder="Enter Alias..." value={myName} onChange={e => setMyName(e.target.value)} />
                </div>
                
                <div className="flex gap-2 pt-4">
                    <Button onClick={createGame} className="flex-1">HOST NET</Button>
                </div>

                <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-slate-700"></div>
                    <span className="flex-shrink mx-4 text-slate-500 text-xs">OR CONNECT TO NODE</span>
                    <div className="flex-grow border-t border-slate-700"></div>
                </div>

                <div className="flex gap-2">
                    <Input placeholder="Paste Host ID..." value={hostId} onChange={e => setHostId(e.target.value)} />
                    <Button onClick={joinGame} variant="secondary">JOIN</Button>
                </div>
            </div>
        </div>
      </div>
    );
  }

  // MAIN GAME UI
  return (
    <div className="min-h-screen bg-cyber-dark text-slate-200 font-sans flex flex-col md:flex-row overflow-hidden">
        
        {/* LEFT: GAME AREA */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
            {/* HEADER */}
            <header className="p-4 border-b border-slate-800 bg-black/60 backdrop-blur flex justify-between items-center z-10">
                <div className="flex items-center gap-4">
                    <GlitchText text="NEUROSPY" className="text-xl md:text-2xl" />
                    <div className="hidden md:block px-3 py-1 bg-slate-900 rounded text-xs text-slate-400 font-mono">
                        ID: {hostId} 
                        <button onClick={() => navigator.clipboard.writeText(hostId)} className="ml-2 text-neon-blue hover:text-white"><Copy size={14}/></button>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {gameState.phase === GamePhase.PLAYING && (
                        <div className="bg-slate-900 px-4 py-1 rounded border border-slate-700">
                            <span className="text-xs text-slate-500 uppercase mr-2">Category</span>
                            <span className="text-neon-green font-bold">{gameState.category}</span>
                        </div>
                    )}
                    {isHostRef.current && gameState.phase === GamePhase.LOBBY && (
                         <Button onClick={startGame} variant="neon">INITIATE SEQUENCE</Button>
                    )}
                </div>
            </header>

            {/* MAIN GRID */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                {gameState.phase === GamePhase.LOBBY && isHostRef.current && (
                    <div className="mb-6 flex justify-center">
                        <Button onClick={addBot} variant="secondary" className="flex items-center gap-2">
                            <BrainCircuit size={16} /> ADD AI UNIT
                        </Button>
                    </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {gameState.players.map((player, idx) => {
                        const isActive = gameState.phase === GamePhase.PLAYING && idx === gameState.turnIndex;
                        const lastClue = gameState.clues.slice().reverse().find(c => c.playerId === player.id)?.clue;
                        return (
                            <PlayerCard 
                                key={player.id} 
                                player={player} 
                                isSelf={player.id === myId}
                                phase={gameState.phase}
                                isActiveTurn={isActive}
                                lastClue={lastClue}
                            />
                        );
                    })}
                </div>
            </main>

            {/* FOOTER CONTROLS */}
            <footer className="p-4 bg-cyber-panel border-t border-neon-blue/30 z-10">
                {gameState.phase === GamePhase.PLAYING ? (
                    <div className="max-w-4xl mx-auto flex gap-4 items-center">
                        {isMyTurn ? (
                            <>
                                <Input 
                                    value={inputClue}
                                    onChange={e => setInputClue(e.target.value)}
                                    placeholder="Transmit Clue..."
                                    onKeyDown={e => e.key === 'Enter' && sendClue()}
                                    autoFocus
                                />
                                <Button onClick={sendClue} variant="neon"><Send size={18} /></Button>
                            </>
                        ) : (
                            <div className="w-full text-center text-slate-500 animate-pulse font-mono">
                                WAITING FOR {gameState.players[gameState.turnIndex]?.name}...
                            </div>
                        )}
                        
                        {/* Impostor Guess Button */}
                        {myPlayer?.role === Role.IMPOSTOR && (
                            <Button onClick={submitGuess} variant="danger" className="whitespace-nowrap">
                                <ShieldAlert size={18} className="mr-2 inline"/> HACK
                            </Button>
                        )}
                    </div>
                ) : gameState.phase === GamePhase.GAME_OVER ? (
                    <div className="text-center">
                        <h2 className="text-3xl font-cyber text-white mb-2">
                            {gameState.winner === Role.IMPOSTOR ? "SECURITY BREACHED - IMPOSTOR WINS" : "THREAT NEUTRALIZED - CIVILIANS WIN"}
                        </h2>
                        <p className="text-neon-blue mb-4">Secret Word: {gameState.secretWord}</p>
                        {isHostRef.current && <Button onClick={startGame}>REBOOT SYSTEM</Button>}
                    </div>
                ) : (
                    <div className="text-center text-slate-500">
                        LOBBY STATUS: {gameState.players.length} NODES CONNECTED
                    </div>
                )}
            </footer>
        </div>

        {/* RIGHT: CHAT / LOGS */}
        <aside className="w-full md:w-80 bg-black/40 border-l border-slate-800 flex flex-col h-64 md:h-screen">
            <div className="p-4 border-b border-slate-800 font-cyber text-sm text-neon-blue">
                DATA LOGS
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar flex flex-col-reverse">
                {[...gameState.messages].reverse().map((msg) => (
                    <div key={msg.id} className={`text-sm ${msg.isSystem ? 'text-yellow-500 font-mono text-xs' : 'text-slate-300'}`}>
                        <span className="text-slate-600 text-xs mr-2">[{new Date(msg.timestamp).toLocaleTimeString([], {hour12:false, hour:'2-digit', minute:'2-digit'})}]</span>
                        {!msg.isSystem && <span className="font-bold text-neon-blue">{msg.playerName}: </span>}
                        {msg.text}
                    </div>
                ))}
            </div>
        </aside>

        {/* ROLE REVEAL MODAL */}
        {showRoleModal && myPlayer && (
            <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center" onClick={() => setShowRoleModal(false)}>
                <div className="text-center animate-bounce">
                    <h1 className="text-6xl font-cyber text-white mb-4">IDENTITY ASSIGNED</h1>
                    <div className={`text-4xl font-bold ${myPlayer.role === Role.IMPOSTOR ? 'text-red-500' : 'text-green-500'}`}>
                        {myPlayer.role}
                    </div>
                    {myPlayer.role === Role.CIVILIAN ? (
                        <p className="mt-4 text-xl text-white">Secret: <span className="text-neon-blue border-b-2 border-neon-blue">{gameState.secretWord}</span></p>
                    ) : (
                        <p className="mt-4 text-xl text-white">Hack the system. Don't get caught.</p>
                    )}
                    <p className="mt-8 text-slate-500 text-sm blink">TAP TO START</p>
                </div>
            </div>
        )}
    </div>
  );
}
