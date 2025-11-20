import React from 'react';
import { motion } from 'framer-motion';
import { Player, Role, GamePhase } from '../types';
import { User, Cpu, WifiOff, Crown } from 'lucide-react';

interface PlayerCardProps {
  player: Player;
  isSelf: boolean;
  phase: GamePhase;
  isActiveTurn: boolean;
  lastClue?: string;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({ player, isSelf, phase, isActiveTurn, lastClue }) => {
  
  const isGameOver = phase === GamePhase.GAME_OVER;
  const revealRole = isGameOver || (isSelf && phase !== GamePhase.LOBBY);
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        borderColor: isActiveTurn ? '#00f3ff' : (player.connected ? '#1e293b' : '#ef4444')
      }}
      className={`relative p-3 bg-cyber-panel/80 border-2 backdrop-blur-sm flex flex-col items-center gap-2 overflow-hidden ${isActiveTurn ? 'shadow-[0_0_15px_rgba(0,243,255,0.3)]' : ''}`}
    >
      {/* Active Turn Indicator */}
      {isActiveTurn && (
        <motion.div 
          className="absolute inset-0 bg-neon-blue/5"
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {/* Avatar */}
      <div className="relative group">
        <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden border-2 ${isActiveTurn ? 'border-neon-blue' : 'border-slate-700'}`}>
           <img src={player.avatarUrl} alt={player.name} className="w-full h-full object-cover" />
        </div>
        
        {/* Status Icons */}
        <div className="absolute -bottom-1 -right-1 flex gap-1">
          {player.isHost && <Crown className="w-5 h-5 text-yellow-500 fill-yellow-500/20" />}
          {!player.connected && <WifiOff className="w-5 h-5 text-red-500 bg-black rounded-full p-0.5" />}
        </div>
      </div>

      {/* Name */}
      <div className="text-center z-10 w-full">
        <p className={`font-bold text-sm md:text-base truncate ${player.isBot ? 'text-neon-purple' : 'text-white'}`}>
          {player.name}
        </p>
        {revealRole && (
            <span className={`text-xs px-2 py-0.5 rounded border ${player.role === Role.IMPOSTOR ? 'border-red-500 text-red-400' : 'border-green-500 text-green-400'}`}>
              {player.role === Role.IMPOSTOR ? 'IMPOSTOR' : 'CIVILIAN'}
            </span>
        )}
      </div>

      {/* Last Clue Speech Bubble */}
      {lastClue && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-0 right-0 bg-white text-black text-xs font-bold px-2 py-1 rounded-bl-lg max-w-[80%]"
        >
          "{lastClue}"
        </motion.div>
      )}
    </motion.div>
  );
};