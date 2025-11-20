export enum Role {
  CIVILIAN = 'CIVILIAN',
  IMPOSTOR = 'IMPOSTOR'
}

export enum GamePhase {
  LOBBY = 'LOBBY',
  PLAYING = 'PLAYING',
  VOTING = 'VOTING',
  GAME_OVER = 'GAME_OVER'
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  avatarUrl: string;
  role?: Role;
  isAlive: boolean;
  isHost: boolean;
  connected: boolean;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  secretWord: string;
  category: string;
  turnIndex: number; // Index in the active players array
  round: number;
  winner?: Role;
  messages: ChatMessage[];
  clues: { playerId: string; clue: string }[];
}

export interface PeerData {
  type: 'SYNC_STATE' | 'ACTION_JOIN' | 'ACTION_MOVE' | 'ACTION_GUESS' | 'ACTION_VOTE' | 'ACTION_START' | 'KICK_PLAYER';
  payload: any;
}

// Configuration constants
export const MAX_PLAYERS = 32;
export const TURN_TIMEOUT_SEC = 30;