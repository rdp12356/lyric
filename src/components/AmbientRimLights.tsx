import React from 'react';
import { ColorPalette, RimLightConfig } from '../types';

interface AmbientRimLightsProps {
  config: RimLightConfig;
  palette: ColorPalette;
  audioEnergy: { bass: number; mid: number; treble: number; overall: number; beat?: number };
  isPlaying: boolean;
  reducedEffects?: boolean;
}

export const AmbientRimLights: React.FC<AmbientRimLightsProps> = ({
  config,
  palette,
  audioEnergy,
  isPlaying,
  reducedEffects = false
}) => {
  if (!config.enabled) return null;

  // Dynamic beat multiplier based on audio FFT and reactivity slider
  const beatScale = isPlaying ? 1 + config.beatReactivity * (audioEnergy.bass * 1.1 + (audioEnergy.beat || 0) * 0.4) : 1;

  const effectiveThickness = Math.max(2, Math.round(Math.min(config.thickness, reducedEffects ? 13 : 48) * (isPlaying ? 0.9 + audioEnergy.overall * 0.3 : 1.0)));
  const effectiveBlur = Math.round(Math.min(config.blur * beatScale, reducedEffects ? 24 : 180));
  const effectiveOpacity = Math.min(1.0, config.intensity * (config.mode === 'static' ? 0.55 : isPlaying ? 0.08 + audioEnergy.overall * 0.8 + audioEnergy.bass * 0.45 + (audioEnergy.beat || 0) * 0.25 : 0.12));

  // Mode-specific styles
  const getGlowStyles = () => {
    const cAccent = palette.accent;
    const cSecondary = palette.secondary;
    const cDominant = palette.dominant;

    // The regular multi-layer inset shadows are expensive on mobile GPUs.
    if (reducedEffects) return {
      boxShadow: `inset 0 0 ${effectiveBlur}px ${effectiveThickness}px ${cAccent}`,
      opacity: Math.min(0.7, effectiveOpacity),
      transition: 'opacity 0.14s ease-out'
    };

    switch (config.mode) {
      case 'pulse':
        return {
          boxShadow: `
            inset 0 0 ${effectiveBlur}px ${effectiveThickness}px ${cAccent},
            inset 0 0 ${Math.round(effectiveBlur * 0.5)}px ${Math.round(effectiveThickness * 0.5)}px ${cSecondary},
            0 0 ${effectiveBlur * 1.5}px ${cAccent}
          `,
          opacity: effectiveOpacity,
          transition: 'all 0.08s cubic-bezier(0.2, 0.8, 0.4, 1)'
        };

      case 'wave':
        return {
          boxShadow: `
            inset 0 0 ${effectiveBlur}px ${effectiveThickness}px ${cAccent},
            inset 0 0 ${effectiveBlur * 1.8}px ${cSecondary}
          `,
          opacity: effectiveOpacity,
          transition: 'box-shadow 0.25s ease-out, opacity 0.2s ease-out'
        };

      case 'liquid':
        return {
          boxShadow: `
            inset 0 0 ${effectiveBlur * 1.2}px ${effectiveThickness * 1.2}px ${cSecondary},
            inset 0 0 ${effectiveBlur * 0.6}px ${effectiveThickness * 0.5}px ${cAccent},
            0 0 ${effectiveBlur * 1.8}px ${cDominant}
          `,
          opacity: effectiveOpacity,
          filter: `brightness(${1 + audioEnergy.treble * 0.2})`,
          transition: 'all 0.12s ease-out'
        };

      case 'static':
        return {
          boxShadow: `inset 0 0 ${effectiveBlur}px ${effectiveThickness}px ${cAccent}`,
          opacity: effectiveOpacity,
          transition: 'opacity 0.3s ease'
        };

      case 'aurora':
      default:
        return {
          boxShadow: `
            inset 0 0 ${effectiveBlur * 1.3}px ${effectiveThickness}px ${cAccent},
            inset 0 0 ${effectiveBlur * 0.7}px ${Math.round(effectiveThickness * 0.5)}px ${cSecondary},
            inset 0 0 ${effectiveBlur * 1.8}px ${Math.round(effectiveThickness * 1.2)}px ${cDominant}
          `,
          opacity: effectiveOpacity,
          transition: 'box-shadow 0.1s ease-out, opacity 0.15s ease-out'
        };
    }
  };

  const glowStyle = getGlowStyles();

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden select-none"
      style={{
        transform: `scale(${isPlaying ? 1.0 + audioEnergy.bass * 0.004 : 1.0})`,
        transition: 'transform 0.07s ease-out'
      }}
      aria-hidden="true"
    >
      {/* Perimeter Rim Light Layer (Synchronized Audio Visualizer) */}
      <div
        className={`absolute inset-0 ${!reducedEffects && config.mode === 'aurora' ? 'animate-aurora' : ''}`}
        style={glowStyle}
      />

      {/* Top Edge Ambient Light Bar */}
      <div
        className="absolute top-0 left-0 right-0 transition-all duration-75"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${palette.secondary} 25%, ${palette.accent} 50%, ${palette.dominant} 75%, transparent 100%)`,
          height: `${effectiveThickness}px`,
          opacity: effectiveOpacity * (0.55 + audioEnergy.treble * 0.45),
          filter: `blur(${Math.max(2, effectiveThickness * 0.75)}px)`
        }}
      />

      {/* Bottom Edge Ambient Light Bar */}
      <div
        className="absolute bottom-0 left-0 right-0 transition-all duration-75"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${palette.dominant} 25%, ${palette.accent} 50%, ${palette.secondary} 75%, transparent 100%)`,
          height: `${effectiveThickness}px`,
          opacity: effectiveOpacity * (0.55 + audioEnergy.bass * 0.45),
          filter: `blur(${Math.max(2, effectiveThickness * 0.75)}px)`
        }}
      />

      {/* Left Edge Ambient Light Bar */}
      <div
        className="absolute top-0 bottom-0 left-0 transition-all duration-75"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${palette.accent} 35%, ${palette.secondary} 70%, transparent 100%)`,
          width: `${effectiveThickness}px`,
          opacity: effectiveOpacity * (0.6 + audioEnergy.mid * 0.4),
          filter: `blur(${Math.max(2, effectiveThickness * 0.75)}px)`
        }}
      />

      {/* Right Edge Ambient Light Bar */}
      <div
        className="absolute top-0 bottom-0 right-0 transition-all duration-75"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${palette.secondary} 35%, ${palette.accent} 70%, transparent 100%)`,
          width: `${effectiveThickness}px`,
          opacity: effectiveOpacity * (0.6 + audioEnergy.bass * 0.4),
          filter: `blur(${Math.max(2, effectiveThickness * 0.75)}px)`
        }}
      />
    </div>
  );
};
