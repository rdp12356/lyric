import React from 'react';

interface BlurredCoverBackgroundProps {
  coverUrl: string;
  lite?: boolean;
}

const BlurredCoverBackgroundComponent: React.FC<BlurredCoverBackgroundProps> = ({ coverUrl, lite = false }) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none bg-black">
      {/* Heavily Blurred Album Cover Art - so blurred you can barely make out the shapes */}
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover scale-135 transition-opacity duration-700 transform ${lite ? "blur-[56px] saturate-[120%] brightness-[0.48]" : "blur-[90px] sm:blur-[115px] saturate-[145%] brightness-[0.5]"}`}
          aria-hidden="true"
        />
      ) : null}

      {/* Subtle Uniform Dark Tint for Text Legibility */}
      <div
        className="absolute inset-0 bg-black/35 pointer-events-none"
        aria-hidden="true"
      />

      {/* Gentle Edge Vignette for Screen Depth */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/45 pointer-events-none"
        aria-hidden="true"
      />

      {/* Subtle Fine Grain to Eliminate Color Banding */}
      {!lite && <div
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
        aria-hidden="true"
      />}
    </div>
  );
};

// Album art is static until the song changes. Keep its GPU-heavy blur isolated.
export const BlurredCoverBackground = React.memo(BlurredCoverBackgroundComponent);
