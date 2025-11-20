import React from 'react';
import { motion } from 'framer-motion';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'neon';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', isLoading, className, ...props }) => {
  const baseStyles = "relative px-6 py-2 font-cyber uppercase tracking-wider text-sm font-bold transition-all duration-200 clip-path-polygon disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-cyber-panel border border-blue-500 text-blue-400 hover:bg-blue-900/30 hover:text-white hover:shadow-[0_0_15px_rgba(0,243,255,0.5)]",
    secondary: "bg-transparent border border-slate-600 text-slate-400 hover:border-slate-400 hover:text-white",
    danger: "bg-red-900/20 border border-red-500 text-red-500 hover:bg-red-900/50 hover:text-white hover:shadow-[0_0_15px_rgba(255,0,0,0.5)]",
    neon: "bg-neon-blue text-black border border-white hover:bg-white hover:shadow-[0_0_20px_#00f3ff]",
  };

  return (
    <motion.button 
      whileTap={{ scale: 0.95 }}
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
          LOADING...
        </span>
      ) : children}
    </motion.button>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input 
    {...props}
    className={`w-full bg-black/50 border border-blue-900/50 text-neon-blue px-4 py-2 font-mono focus:outline-none focus:border-neon-blue focus:shadow-[0_0_10px_rgba(0,243,255,0.2)] placeholder-slate-600 ${props.className}`}
  />
);

export const GlitchText: React.FC<{ text: string, className?: string }> = ({ text, className }) => (
  <h1 className={`font-cyber font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-blue via-white to-neon-purple animate-pulse ${className}`}>
    {text}
  </h1>
);
