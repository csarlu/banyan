import chalk from 'chalk';
import React from 'react';
import { render } from 'ink';
import { PassThrough } from 'node:stream';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupPolyglotPlayground } from '../src/core/playground.js';
import { loadConfig } from '../src/core/config.js';
import { App } from '../src/ui/App.js';
import { ThemeName } from '../src/ui/theme.js';
import { DocTopicId } from '../src/docs/knowledgeBase.js';
import { tokenize, styledCharsFromTokens } from '@alcalzone/ansi-tokenize';

// Force 24-bit TrueColor on chalk so Ink emits full ANSI / RGB codes even on PassThrough streams
chalk.level = 3;
process.env.FORCE_COLOR = '3';

// Exact 16-color ANSI palette matching Windows Terminal / psmux Catppuccin Mocha scheme
const ANSI_COLORS: Record<string, string> = {
  '\u001b[30m': '#45475a', // Black
  '\u001b[31m': '#f38ba8', // Red
  '\u001b[32m': '#a6e3a1', // Green (success)
  '\u001b[33m': '#f9e2af', // Yellow (warning - soft cream, no harsh orange)
  '\u001b[34m': '#89b4fa', // Blue
  '\u001b[35m': '#cba6f7', // Purple / Magenta
  '\u001b[36m': '#94e2d5', // Cyan (accent / borderActive - soft teal)
  '\u001b[37m': '#cdd6f4', // White (text)
  '\u001b[90m': '#6c7086', // BrightBlack / Gray (muted / border)
  '\u001b[91m': '#f38ba8', // RedBright (critical)
  '\u001b[92m': '#a6e3a1', // GreenBright (primary)
  '\u001b[93m': '#f9e2af', // YellowBright
  '\u001b[94m': '#89b4fa', // BlueBright
  '\u001b[95m': '#cba6f7', // MagentaBright (agent - soft lavender)
  '\u001b[96m': '#89dceb', // CyanBright (secondary - sky cyan)
  '\u001b[97m': '#cdd6f4', // WhiteBright
};

const THEME_BACKGROUNDS: Record<ThemeName, string> = {
  default: '#1e1e2e',
  catppuccin: '#1e1e2e',
  dracula: '#282a36',
  nord: '#2e3440',
  monokai: '#272822',
  solarized: '#002b36',
  matrix: '#0a0f0a',
};

/**
 * Vector SVG symbols (viewBox="0 0 16 16") for all Nerd Font Private Use Area glyphs
 * used across Banyan's TUI, ensuring 100% crisp vector rendering in every browser,
 * OS, and GitHub README viewer without requiring Nerd Fonts installed locally.
 */
const NERD_FONT_SYMBOLS: Record<string, string> = {
  // U+E0A0: Powerline Git Branch
  E0A0: '<path d="M5 3a2 2 0 1 0-1 3.73v2.54A2 2 0 1 0 5 13a2 2 0 0 0-.1-2h3.1a3 3 0 0 0 3-3V6.73A2 2 0 1 0 9.5 5v3a1.5 1.5 0 0 1-1.5 1.5H5V6.73A2 2 0 0 0 5 3z"/>',
  // U+E606: Python
  E606: '<path d="M7.8 1.5c-2.6 0-2.4 1.1-2.4 1.1v1.2h2.5v.4H4.2S2 4 2 6.6s1.9 2.5 1.9 2.5h1.1V7.9s-.1-1.9 1.9-1.9h2.5s1.8 0 1.8-1.7V2.8s.2-1.3-3.4-1.3zm-1.4.8a.6.6 0 1 1 0 1.2.6.6 0 0 1 0-1.2zM8.2 14.5c2.6 0 2.4-1.1 2.4-1.1v-1.2H8.1v-.4h3.7S14 12 14 9.4s-1.9-2.5-1.9-2.5H11v1.2s.1 1.9-1.9 1.9H6.6s-1.8 0-1.8 1.7v1.5s-.2 1.3 3.4 1.3zm1.4-.8a.6.6 0 1 1 0-1.2.6.6 0 0 1 0 1.2z"/>',
  // U+E612: Config / Symlink file
  E612: '<path d="M3 1.5A1.5 1.5 0 0 0 1.5 3v10A1.5 1.5 0 0 0 3 14.5h10a1.5 1.5 0 0 0 1.5-1.5V5.5L10.5 1.5H3zm6.5 1.5L13 6.5H9.5V3zM5 8.5h4.5v-1.2L12 9.2l-2.5 1.9V9.9H5V8.5z"/>',
  // U+E627: Go (Golang emblem)
  E627: '<path d="M1.5 5.5h3l-.4 1H1.1l.4-1zm-.8 2h2.8l-.4 1H.3l.4-1zm1 2h2.2l-.4 1H1.3l.4-1zM7.5 4.2c-2.1 0-3.6 1.6-3.6 3.8 0 2.1 1.4 3.8 3.6 3.8 1.8 0 3.1-1.1 3.4-2.8H8v-1.3h4.3c.1 2.9-1.8 5.4-4.8 5.4-2.9 0-5-2.1-5-5.1s2.1-5.1 5-5.1c1.7 0 3.2.8 4.1 2.1l-1.2.9c-.6-.9-1.7-1.7-2.9-1.7zm6 1.3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm0 1.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z"/>',
  // U+E718: Node.js Hexagon
  E718: '<path d="M8 1L2 4.5v7L8 15l6-3.5v-7L8 1zm0 2.1l4.2 2.4v4.9L8 12.9l-4.2-2.5V5.5L8 3.1zm-.7 2.4v3.8l-1.8-1-.7 1.1 2.5 1.5 1.4-.8V5.5H7.3z"/>',
  // U+E77F: .NET / C# Hexagon
  E77F: '<path d="M8 1L2 4.5v7L8 15l6-3.5v-7L8 1zm-1.8 4.2c1.1 0 2 .5 2.5 1.3l-1.1.7c-.3-.5-.8-.8-1.4-.8-1.1 0-1.9.8-1.9 2.1s.8 2.1 1.9 2.1c.6 0 1.1-.3 1.4-.8l1.1.7c-.5.8-1.4 1.3-2.5 1.3-1.9 0-3.3-1.4-3.3-3.3s1.4-3.3 3.3-3.3zm4.3.3h.8v1.2h1v-.8h.8v.8h.8v.8h-.8v1h.8v.8h-.8v1h-.8v-1h-1v1h-.8v-1h-.8v-.8h.8v-1h-.8v-.8h.8V5.5zm.8 2v1h1v-1h-1z"/>',
  // U+E7A8: Rust Gear
  E7A8: '<path d="M8 1l1.1 1.6 1.9-.6.3 1.9 1.9.4-.6 1.8 1.4 1.3-1.4 1.3.6 1.8-1.9.4-.3 1.9-1.9-.6L8 15l-1.1-1.6-1.9.6-.3-1.9-1.9-.4.6-1.8L2 8.6l1.4-1.3-.6-1.8 1.9-.4.3-1.9 1.9.6L8 1zm0 3.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zm-1.6 2h1.9c.9 0 1.5.5 1.5 1.2 0 .5-.3.9-.8 1.1l1 1.5H8.7l-.8-1.3h-.4v1.3H6.4V6.2zm1.1 1v.9h.7c.3 0 .5-.2.5-.45S8.5 7.2 8.2 7.2h-.7z"/>',
  // U+F002: Search Magnifier
  F002: '<path d="M6.8 2a4.8 4.8 0 1 0 3 8.6l3.3 3.3 1.2-1.2-3.3-3.3A4.8 4.8 0 0 0 6.8 2zm0 1.6a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z"/>',
  // U+F00C: Checkmark
  F00C: '<path d="M13.8 3.2L6.2 10.8 2.5 7.1 1.1 8.5l5.1 5.1 9-9-1.4-1.4z"/>',
  // U+F013: Gear / Config
  F013: '<path d="M7 1.5h2l.4 1.8c.5.2 1 .5 1.4.8l1.8-.6 1 1.7-1.4 1.2c.1.5.1 1.1 0 1.6l1.4 1.2-1 1.7-1.8-.6c-.4.3-.9.6-1.4.8L9 14.5H7l-.4-1.8c-.5-.2-1-.5-1.4-.8l-1.8.6-1-1.7 1.4-1.2c-.1-.5-.1-1.1 0-1.6L2.4 5.2l1-1.7 1.8.6c.4-.3.9-.6 1.4-.8L7 1.5zm1 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/>',
  // U+F02B: Tag
  F02B: '<path d="M2 2h5.2l6.8 6.8-5.2 5.2L2 7.2V2zm2.5 1.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>',
  // U+F02D: Book
  F02D: '<path d="M3.5 2A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14H13v-1.5H3.8a.8.8 0 0 1 0-1.6H13V2H3.5zm1.5 2h6v1.5H5V4zm0 2.8h6v1.2H5V6.8z"/>',
  // U+F05A: Info Circle
  F05A: '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm-.8 3.2h1.6v1.6H7.2V4.7zm0 2.8h1.6v4.2H7.2V7.5z"/>',
  // U+F065: Expand
  F065: '<path d="M2 2h4.5v1.5H4.6l2.6 2.6-1.1 1.1-2.6-2.6v1.9H2V2zm12 0v4.5h-1.5V4.6L9.9 7.2 8.8 6.1l2.6-2.6H9.5V2H14zM6.1 8.8l1.1 1.1-2.6 2.6h1.9V14H2V9.5h1.5v1.9l2.6-2.6zm3.8 0l2.6 2.6V9.5H14V14H9.5v-1.5h1.9L8.8 9.9l1.1-1.1z"/>',
  // U+F06A: Critical Exclamation Circle
  F06A: '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm-.9 3h1.8v4.8H7.1V4.5zm0 6.2h1.8v1.8H7.1v-1.8z"/>',
  // U+F071: Warning Triangle
  F071: '<path d="M8 1.8L1 14.2h14L8 1.8zm-.8 4.4h1.6v3.6H7.2V6.2zm0 4.6h1.6v1.6H7.2v-1.6z"/>',
  // U+F07B: Folder Closed
  F07B: '<path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3.4l1.6 1.6H13A1.5 1.5 0 0 1 14.5 5v7.5A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5v-9z"/>',
  // U+F07C: Folder Open
  F07C: '<path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3.4l1.6 1.6H13A1.5 1.5 0 0 1 14.5 5v1.5H3.2L1.5 12V3.5zm2.3 4.5h11.4l-1.8 5.5H2L3.8 8z"/>',
  // U+F0AC: Globe
  F0AC: '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 1.4c.9 0 1.8 1.4 2.1 3.6H5.9c.3-2.2 1.2-3.6 2.1-3.6zM4.5 6.5c.1-1.4.5-2.6 1.1-3.3A5.1 5.1 0 0 0 3 6.5h1.5zm-1.5 1.4h1.5c.1 1.7.6 3.2 1.3 4.1A5.1 5.1 0 0 1 3 7.9zm2.9 0h4.2c-.2 2.4-1.1 4.2-2.1 4.2s-1.9-1.8-2.1-4.2zm4.5-1.4c-.1-1.4-.5-2.6-1.1-3.3A5.1 5.1 0 0 1 13 6.5h-1.6zm-.2 5.5c.7-.9 1.2-2.4 1.3-4.1H13a5.1 5.1 0 0 1-2.8 4.1z"/>',
  // U+F0AD: Wrench (Auto-Fix)
  F0AD: '<path d="M11.6 1.6a3.8 3.8 0 0 0-3.3 5.5L2.2 13.2a1.4 1.4 0 0 0 2 2l6.1-6.1a3.8 3.8 0 0 0 4.1-5.9l-2.2 2.2-1.8-.4-.4-1.8 2.2-2.2a3.8 3.8 0 0 0-.6.6z"/>',
  // U+F0C1: Chain Link
  F0C1: '<path d="M6.8 9.2a3 3 0 0 0 4.2 0l2.2-2.2a3 3 0 0 0-4.2-4.2L7.7 4.1l1.1 1.1 1.3-1.3a1.5 1.5 0 1 1 2.1 2.1l-2.2 2.2a1.5 1.5 0 0 1-2.1 0L6.8 9.2zm2.4-2.4a3 3 0 0 0-4.2 0L2.8 9a3 3 0 0 0 4.2 4.2l1.3-1.3-1.1-1.1-1.3 1.3a1.5 1.5 0 1 1-2.1-2.1l2.2-2.2a1.5 1.5 0 0 1 2.1 0l1.1-1z"/>',
  // U+F0C5: Copy / Files
  F0C5: '<path d="M4.5 1.5h7A1.5 1.5 0 0 1 13 3v7.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 10.5V3a1.5 1.5 0 0 1 1.5-1.5zm0 1.5v7.5h7V3h-7zM1.5 5H3v7.5c0 .4.3.8.8.8H10v1.5H3.5A2 2 0 0 1 1.5 12.8V5z"/>',
  // U+F0E7: Bolt / Live
  F0E7: '<path d="M9.5 1L3.5 9h4.2L6.5 15l6-8H8.3L9.5 1z"/>',
  // U+F0EB: Lightbulb
  F0EB: '<path d="M8 1.5a4.8 4.8 0 0 0-2.8 8.7c.4.3.8.9.8 1.5v.3h4v-.3c0-.6.4-1.2.8-1.5A4.8 4.8 0 0 0 8 1.5zM6.2 13h3.6v1.2a.8.8 0 0 1-.8.8H7a.8.8 0 0 1-.8-.8V13z"/>',
  // U+F120: Terminal
  F120: '<path d="M2 3.5l4.5 3.8L2 11.1V9.3l2.4-2L2 5.3V3.5zm5.5 7h6.5V12H7.5v-1.5z"/>',
  // U+F126: Git Fork / Branch
  F126: '<path d="M4.5 2a2 2 0 1 0 .8 3.8v2.4a2 2 0 1 0 1.4 0V7.8h2.6a2.5 2.5 0 0 0 2.5-2.5V4.8a2 2 0 1 0-1.4 0v.5a1.1 1.1 0 0 1-1.1 1.1H6.7v-.6A2 2 0 0 0 4.5 2z"/>',
  // U+F127: Broken Link
  F127: '<path d="M3 2l10 12-1.1 1L9.5 12.1l-.8.8a3 3 0 0 1-4.2-4.2l1.8-1.8L2 2.9 3 2zm7.2 1a3 3 0 0 1 4.2 4.2l-1.8 1.8-1.1-1.1 1.8-1.8a1.5 1.5 0 1 0-2.1-2.1L9.4 5.8 8.3 4.7 10.2 3z"/>',
  // U+F132: Shield
  F132: '<path d="M8 1.2L2.2 3.5v4.3c0 3.8 2.5 6.4 5.8 7.5 3.3-1.1 5.8-3.7 5.8-7.5V3.5L8 1.2zm0 2v10.2c-2.3-.9-4.1-2.9-4.1-5.6V4.6L8 3.2z"/>',
  // U+F19D: Graduation Cap (Tutorial)
  F19D: '<path d="M8 2L1 5.5 8 9l5.5-2.75V11H15V5.5L8 2zm-4.2 5.2v3.1C3.8 11.8 5.7 13 8 13s4.2-1.2 4.2-2.7V7.2L8 9.3 3.8 7.2z"/>',
  // U+F1BB: Banyan Tree
  F1BB: '<path d="M8 1.2a3.5 3.5 0 0 0-3.3 2.4A3.2 3.2 0 0 0 2 6.7a3.2 3.2 0 0 0 2.8 3.2h2.4v3.3H5v1.3h6v-1.3H8.8V9.9h2.4A3.2 3.2 0 0 0 14 6.7a3.2 3.2 0 0 0-2.7-3.1A3.5 3.5 0 0 0 8 1.2z"/>',
  // U+F401: Repo Book
  F401: '<path d="M3.5 1.5A1.5 1.5 0 0 0 2 3v10a1.5 1.5 0 0 0 1.5 1.5H6v1.5l1.5-1 1.5 1v-1.5h4V1.5H3.5zm.5 1.5h7.5v8H4V3zm-.2 9.5h8.2v1H3.8a.5.5 0 0 1 0-1z"/>',
  // U+F417: Git Commit Node
  F417: '<path d="M8 4.2a3.8 3.8 0 0 0-3.6 2.8H1v2h3.4a3.8 3.8 0 0 0 7.2 0H15V7h-3.4A3.8 3.8 0 0 0 8 4.2zm0 1.8a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>',
  // U+F418: Git Branch / Merge
  F418: '<path d="M4.5 2a2 2 0 1 0 .8 3.8v4.4a2 2 0 1 0 1.4 0V8.5h2.3a2.5 2.5 0 0 0 2.5-2.5V5.8a2 2 0 1 0-1.4 0V6a1.1 1.1 0 0 1-1.1 1.1H6.7V5.8A2 2 0 0 0 4.5 2z"/>',
  // U+F444: Dot / Dirty Indicator
  F444: '<circle cx="8" cy="8" r="4.2"/>',
  // U+F469: Inspector Pulse / Radar
  F469: '<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 1.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm-3.2 5h1.6l1-2.2 1.4 4.4 1.1-2.2h1.3v-1.2h-2l-.4.8-1.4-4.4-1.6 3.6H4.8V8z"/>',
  // U+F487: Package Box
  F487: '<path d="M8 1.2L2 4.2v7.6l6 3 6-3V4.2l-6-3zm0 1.7l4.2 2.1L8 7.1 3.8 5 8 2.9zm-4.5 3.4l3.8 1.9v4.6l-3.8-1.9V6.3zm9 0v4.6l-3.8 1.9V8.2l3.8-1.9z"/>',
  // U+F53F: Palette
  F53F: '<path d="M8 1.5a6.5 6.5 0 0 0 0 13c1.1 0 1.8-.7 1.8-1.6 0-.4-.2-.8-.4-1.1-.2-.3-.3-.6-.3-.9 0-.8.6-1.4 1.4-1.4H12a2.5 2.5 0 0 0 2.5-2.5C14.5 3.9 11.6 1.5 8 1.5zM4.8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm2.2-1.8a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3.2 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm2 2a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>',
  // U+F544: Robot Agent
  F544: '<path d="M7.2 1.2h1.6v1.6h3.2A1.8 1.8 0 0 1 13.8 4.6v6.8a1.8 1.8 0 0 1-1.8 1.8H4a1.8 1.8 0 0 1-1.8-1.8V4.6A1.8 1.8 0 0 1 4 2.8h3.2V1.2zM5.5 5.8a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm5 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM5 10.2v1.3h6v-1.3H5z"/>',
  // U+F5FD: Layers / Env
  F5FD: '<path d="M8 1.8L1.5 5.2 8 8.6l6.5-3.4L8 1.8zm-4.8 5.7L1.5 8.4 8 11.8l6.5-3.4-1.7-.9L8 10.2 3.2 7.5zm0 2.8L1.5 11.2 8 14.6l6.5-3.4-1.7-.9L8 13 3.2 10.3z"/>',
};

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isHorizontalBoxChar(ch: string): boolean {
  return ch === '─' || ch === '┄' || ch === '═' || ch === '━';
}

export function ansiToSvg(
  ansiText: string,
  options: {
    title: string;
    themeName?: ThemeName;
    columns?: number;
    rows?: number;
    fontSize?: number;
  }
): string {
  const themeName = options.themeName || 'default';
  const bgColor = THEME_BACKGROUNDS[themeName] || '#1e1e2e';
  const defaultTextColor = '#cdd6f4';
  const fontSize = options.fontSize || 13;
  const charWidth = 7.8;
  const lineHeight = 19;
  const paddingX = 20;
  const paddingTop = 46;
  const paddingBottom = 20;

  // Split text into lines and clean cursor resets
  const rawLines = ansiText.replace(/\r\n/g, '\n').split('\n');
  while (rawLines.length > 0 && !rawLines[rawLines.length - 1].trim()) {
    rawLines.pop();
  }

  const lineCount = Math.max(options.rows || 32, rawLines.length);
  const width = Math.round((options.columns || 122) * charWidth + paddingX * 2);
  const height = Math.round(lineCount * lineHeight + paddingTop + paddingBottom);

  let tspansHtml = '';
  let iconsHtml = '';

  for (let y = 0; y < rawLines.length; y++) {
    const line = rawLines[y];
    const tokens = tokenize(line);
    const chars = styledCharsFromTokens(tokens);
    const lineY = paddingTop + (y + 1) * lineHeight - 4;

    interface SpanGroup {
      col: number;
      text: string;
      fill: string;
      bold: boolean;
      isHorizRule: boolean;
    }

    const grouped: SpanGroup[] = [];
    let current: SpanGroup | null = null;

    for (let col = 0; col < chars.length; col++) {
      const c = chars[col];
      let fill = defaultTextColor;
      let bold = false;

      for (const s of c.styles) {
        if (s.code === '\u001b[1m') bold = true;

        const rgb = s.code.match(/\u001b\[38;2;(\d+);(\d+);(\d+)m/);
        if (rgb) {
          fill = `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`;
        } else if (ANSI_COLORS[s.code]) {
          fill = ANSI_COLORS[s.code];
        }
      }

      const cp = c.value.codePointAt(0) || 32;

      // Render Nerd Font Private Use Area glyphs as native vector <use> elements
      if (cp >= 0xe000 && cp <= 0xf8ff) {
        if (current) {
          grouped.push(current);
          current = null;
        }
        const hex = cp.toString(16).toUpperCase().padStart(4, '0');
        if (NERD_FONT_SYMBOLS[hex]) {
          const iconX = (paddingX + col * charWidth - 2.2).toFixed(2);
          const iconY = (lineY - 11.2).toFixed(2);
          iconsHtml += `  <use href="#nf-${hex}" x="${iconX}" y="${iconY}" width="12.5" height="12.5" fill="${fill}"/>\n`;
        }
        continue;
      }

      // Skip plain spaces so subsequent tokens get exact x-coordinate pinning
      if (c.value === ' ') {
        if (current) {
          grouped.push(current);
          current = null;
        }
        continue;
      }

      const isHoriz = isHorizontalBoxChar(c.value);
      const isSpecialSymbol = cp > 127 && !isHoriz;

      // Pin non-ASCII symbols (│, ╭, ╮, ╰, ╯, ↳, ●, ○, ←, ▸) to their exact column cell
      if (isSpecialSymbol) {
        if (current) {
          grouped.push(current);
          current = null;
        }
        grouped.push({
          col,
          text: c.value,
          fill,
          bold,
          isHorizRule: false,
        });
        continue;
      }

      if (
        !current ||
        current.fill !== fill ||
        current.bold !== bold ||
        current.isHorizRule !== isHoriz
      ) {
        if (current) grouped.push(current);
        current = { col, text: c.value, fill, bold, isHorizRule: isHoriz };
      } else {
        current.text += c.value;
      }
    }
    if (current) grouped.push(current);

    let lineContent = '';
    for (const g of grouped) {
      const escaped = escapeXml(g.text);
      const xAttr = `x="${(paddingX + g.col * charWidth).toFixed(2)}"`;
      const lenAttr =
        g.isHorizRule && g.text.length > 1
          ? ` textLength="${(g.text.length * charWidth).toFixed(2)}" lengthAdjust="spacingAndGlyphs"`
          : '';
      const weightAttr = g.bold ? ' font-weight="bold"' : '';
      const fillAttr = g.fill !== defaultTextColor ? ` fill="${g.fill}"` : '';

      lineContent += `<tspan ${xAttr}${fillAttr}${weightAttr}${lenAttr}>${escaped}</tspan>`;
    }

    if (lineContent) {
      tspansHtml += `  <text y="${lineY}" xml:space="preserve">${lineContent}</text>\n`;
    }
  }

  const symbolDefs = Object.entries(NERD_FONT_SYMBOLS)
    .map(([hex, inner]) => `    <symbol id="nf-${hex}" viewBox="0 0 16 16">${inner}</symbol>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="auto">
  <defs>
    <style>
      text {
        font-family: 'Cascadia Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', 'SF Mono', monospace;
        font-size: ${fontSize}px;
        fill: ${defaultTextColor};
      }
    </style>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
${symbolDefs}
  </defs>

  <!-- Window Container -->
  <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="10" ry="10" fill="${bgColor}" stroke="#313244" stroke-width="1.5" filter="url(#shadow)"/>

  <!-- Title Bar -->
  <rect x="2" y="2" width="${width - 4}" height="36" rx="10" ry="10" fill="${bgColor}"/>
  <rect x="2" y="24" width="${width - 4}" height="14" fill="${bgColor}"/>
  <line x1="2" y1="36" x2="${width - 2}" y2="36" stroke="#313244" stroke-width="1"/>

  <!-- Window Controls -->
  <circle cx="20" cy="19" r="6" fill="#f38ba8" />
  <circle cx="38" cy="19" r="6" fill="#f9e2af" />
  <circle cx="56" cy="19" r="6" fill="#a6e3a1" />

  <!-- Window Title -->
  <text x="${width / 2}" y="23" text-anchor="middle" font-size="12" font-weight="500" fill="#a6adc8">${escapeXml(options.title)}</text>

  <!-- Terminal Text Content -->
${tspansHtml}
  <!-- Vector Nerd Font Icons -->
${iconsHtml}
</svg>`;
}

interface CaptureOptions {
  playgroundDir: string;
  configPath: string;
  rawConfig: any;
  workspaceName: string;
  workspaceConfig: any;
  tab?: number;
  explainTopic?: DocTopicId | null;
  showLegend?: boolean;
  theme?: ThemeName;
  columns?: number;
  rows?: number;
  waitMs?: number;
}

export async function captureFrame(opts: CaptureOptions): Promise<string> {
  const columns = opts.columns || 122;
  const rows = opts.rows || 34;

  const isDefaultTheme = !opts.theme || opts.theme === 'default';
  chalk.level = isDefaultTheme ? 1 : 3;
  process.env.FORCE_COLOR = isDefaultTheme ? '1' : '3';
  process.stdout.columns = columns;
  process.stdout.rows = rows;
  process.stderr.columns = columns;
  process.stderr.rows = rows;

  const stdout = new PassThrough();
  (stdout as any).columns = columns;
  (stdout as any).rows = rows;
  (stdout as any).isTTY = true;
  (stdout as any).getColorDepth = () => (isDefaultTheme ? 4 : 24);

  const capturedFrames: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = (chunk: any, encoding?: any, cb?: any) => {
    const str = chunk.toString();
    const clean = str.replace(/(\u001B\[2K|\u001B\[1A|\u001B\[\?25[lh]|\u001B\[2J|\u001B\[H)/g, '');
    if (clean.trim()) {
      capturedFrames.push(clean);
    }
    return originalWrite(chunk, encoding, cb);
  };

  const stdin = new PassThrough();
  (stdin as any).isTTY = true;
  (stdin as any).setRawMode = () => {};
  (stdin as any).ref = () => {};
  (stdin as any).unref = () => {};

  const instance = render(
    React.createElement(App, {
      baseCwd: opts.playgroundDir,
      configPath: opts.configPath,
      rawConfig: opts.rawConfig,
      workspaceName: opts.workspaceName,
      workspaceConfig: opts.workspaceConfig,
      showSplashInitially: false,
      startInTutorial: false,
      initialTab: opts.tab ?? 1,
      initialExplainTopic: opts.explainTopic ?? null,
      initialShowLegend: opts.showLegend ?? false,
      initialTheme: opts.theme || 'default',
      initialLocale: 'en',
      onSelectWorktreeForCd: () => {},
    }),
    { stdout, stdin, debug: true }
  );

  await new Promise((r) => setTimeout(r, opts.waitMs || 1500));

  instance.unmount();

  if (capturedFrames.length === 0) {
    throw new Error('No frames captured from Ink UI');
  }

  return capturedFrames[capturedFrames.length - 1];
}

async function run() {
  console.log('🌳 [v1.0.0] Initializing Polyglot Playground for High-DPI English Assets...');
  const pg = await setupPolyglotPlayground();
  console.log(`✔ Polyglot playground ready at: ${pg.playgroundDir}`);

  const loaded = await loadConfig(pg.playgroundDir, pg.workspaceName);
  const outDir = path.resolve(process.cwd(), 'docs', 'assets');
  await fs.mkdir(outDir, { recursive: true });

  const columns = 122;
  const rows = 33;

  const commonOpts = {
    playgroundDir: pg.playgroundDir,
    configPath: loaded.configPath || path.join(pg.playgroundDir, 'banyan.config.json'),
    rawConfig: loaded.rawConfig,
    workspaceName: loaded.workspaceName,
    workspaceConfig: loaded.workspace,
    columns,
    rows,
  };

  try {
    // 1. Tab 1: Worktrees (Console Default Theme)
    console.log('📸 [1/7] Capturing Tab 1: Worktrees (Console Default theme, vector Devicon glyphs)...');
    const frameTab1 = await captureFrame({
      ...commonOpts,
      tab: 1,
      theme: 'default',
    });
    const svgTab1 = ansiToSvg(frameTab1, {
      title: 'bny · polyglot-playground (Tab 1: Worktrees & Active Agents)',
      themeName: 'default',
      columns,
      rows,
    });
    await fs.writeFile(path.join(outDir, 'tab1-worktrees.svg'), svgTab1, 'utf-8');
    console.log('✔ Saved docs/assets/tab1-worktrees.svg');

    // 2. Tab 2: Links & Deps (Console Default Theme)
    console.log('📸 [2/7] Capturing Tab 2: Links & Deps (Master-Detail Topology & Link Inspector)...');
    const frameTab2 = await captureFrame({
      ...commonOpts,
      tab: 2,
      theme: 'default',
    });
    const svgTab2 = ansiToSvg(frameTab2, {
      title: 'bny · polyglot-playground (Tab 2: Polyglot Local Dependency & Link Topology)',
      themeName: 'default',
      columns,
      rows,
    });
    await fs.writeFile(path.join(outDir, 'tab2-junctions.svg'), svgTab2, 'utf-8');
    console.log('✔ Saved docs/assets/tab2-junctions.svg');

    // 3. Tab 3: Health & Collisions (Console Default Theme)
    console.log('📸 [3/7] Capturing Tab 3: Health & Collisions (Master-Detail Collision Forensics & Blast Radius)...');
    const frameTab3 = await captureFrame({
      ...commonOpts,
      tab: 3,
      theme: 'default',
    });
    const svgTab3 = ansiToSvg(frameTab3, {
      title: 'bny · polyglot-playground (Tab 3: Multi-Agent Isolation & Collision Forensics)',
      themeName: 'default',
      columns,
      rows,
    });
    await fs.writeFile(path.join(outDir, 'tab3-health.svg'), svgTab3, 'utf-8');
    console.log('✔ Saved docs/assets/tab3-health.svg');

    // 4. Modal: Interactive Explain ([e]) (Console Default Theme)
    console.log('📸 [4/7] Capturing Interactive Explain Modal ([e])...');
    const frameModal = await captureFrame({
      ...commonOpts,
      tab: 3,
      explainTopic: 'BRANCH_MISMATCH',
      theme: 'default',
    });
    const svgModal = ansiToSvg(frameModal, {
      title: 'bny · Explain [WARN-COLLISION-02] BRANCH_MISMATCH',
      themeName: 'default',
      columns,
      rows,
    });
    await fs.writeFile(path.join(outDir, 'modal-explain.svg'), svgModal, 'utf-8');
    console.log('✔ Saved docs/assets/modal-explain.svg');

    // 5. Modal: Visual Icon & Keybinding Legend ([i]) (Console Default Theme)
    console.log('📸 [5/7] Capturing Visual Icon, Role, Health & Keybinding Legend Modal ([i])...');
    const frameLegend = await captureFrame({
      ...commonOpts,
      tab: 1,
      showLegend: true,
      theme: 'default',
    });
    const svgLegend = ansiToSvg(frameLegend, {
      title: 'bny · Visual Icon, Role, Health & Keybinding Legend ([i])',
      themeName: 'default',
      columns,
      rows,
    });
    await fs.writeFile(path.join(outDir, 'modal-legend.svg'), svgLegend, 'utf-8');
    console.log('✔ Saved docs/assets/modal-legend.svg');

    // 6. Themes Showcase: Dracula theme on Tab 1
    console.log('📸 [6/7] Capturing Dracula Theme Showcase on Tab 1...');
    const frameDracula = await captureFrame({
      ...commonOpts,
      tab: 1,
      theme: 'dracula',
    });
    const svgDracula = ansiToSvg(frameDracula, {
      title: 'bny · polyglot-playground (Dracula Palette)',
      themeName: 'dracula',
      columns,
      rows,
    });
    await fs.writeFile(path.join(outDir, 'theme-dracula.svg'), svgDracula, 'utf-8');
    console.log('✔ Saved docs/assets/theme-dracula.svg');

    // 7. Matrix Theme Showcase
    console.log('📸 [7/7] Capturing Matrix Cyberpunk Theme Showcase on Tab 1...');
    const frameMatrix = await captureFrame({
      ...commonOpts,
      tab: 1,
      theme: 'matrix',
    });
    const svgMatrix = ansiToSvg(frameMatrix, {
      title: 'bny · polyglot-playground (Matrix Neon Palette)',
      themeName: 'matrix',
      columns,
      rows,
    });
    await fs.writeFile(path.join(outDir, 'theme-matrix.svg'), svgMatrix, 'utf-8');
    console.log('✔ Saved docs/assets/theme-matrix.svg');

    console.log('\n🎉 [v1.0.0] All 7 English TUI SVG visual assets generated successfully in docs/assets/!');
  } finally {
    await pg.cleanup();
  }
}

run().catch((err) => {
  console.error('Fatal error generating assets:', err);
  process.exit(1);
});
