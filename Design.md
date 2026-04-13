# Design Specification: 1-Bit Dither-Punk Horror

## 1. Aesthetic Vision

A haunting, high-contrast 1-bit visual style inspired by early Macintosh system graphics, retro-LCD handhelds (like Playdate), and "dither-punk" horror art. The goal is to create a feeling of digital decay and eerie isolation.

## 2. Core Visual Principles

- **Strict Monochrome**: Only pure Black (`#000000`) and pure White (`#FFFFFF`).
- **Dithering as Depth**: Gradients and shadows must be achieved via CSS/SVG patterns or dithered textures, never through gray scales.
- **Silhouette Focus**: Characters and objects should be recognizable by their silhouettes. Use negative space effectively.
- **The "Glow"**: White elements on black backgrounds should feel like they are "burning" through the screen.

## 3. UI Elements

- **Borders**: 3-layer borders: 1px black, 1px white, 1px black.
- **Buttons**: Inverted states. Normal: White text on Black. Hover/Active: Black text on White.
- **Cards**: Sharp corners. No rounded edges. Use dithering for "rare" or "powerful" card backgrounds.
- **Background**: Solid black (`#000000`) with occasional dithered "fog" or "forest" patterns.

## 4. Typography

- **Primary**: A clean, sharp pixel font or a high-legibility geometric sans-serif (e.g., "Silkscreen" or "IBM Plex Mono").
- **Styling**: Uppercase for headers. Letter-spacing for a "clinical" feel.

## 5. Animation

- **Frame-rate**: Consider "stuttery" animations (low FPS feel) to match the retro aesthetic.
- **Transitions**: Hard cuts or "pixel-wipe" transitions.
