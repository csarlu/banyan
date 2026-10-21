export type ThemeName =
  'default' | 'catppuccin' | 'dracula' | 'nord' | 'monokai' | 'solarized' | 'matrix'

export interface ThemePalette {
  name: ThemeName
  label: string
  primary: string
  secondary: string
  accent: string
  success: string
  warning: string
  critical: string
  agent: string
  text: string
  muted: string
  border: string
  borderActive: string
}

export const THEMES: Record<ThemeName, ThemePalette> = {
  default: {
    name: 'default',
    label: 'Console Default',
    primary: 'greenBright',
    secondary: 'cyanBright',
    accent: 'cyan',
    success: 'green',
    warning: 'yellow',
    critical: 'redBright',
    agent: 'magentaBright',
    text: 'white',
    muted: 'gray',
    border: 'gray',
    borderActive: 'cyan',
  },
  catppuccin: {
    name: 'catppuccin',
    label: 'Catppuccin Mocha',
    primary: '#cba6f7',
    secondary: '#89b4fa',
    accent: '#f5c2e7',
    success: '#a6e3a1',
    warning: '#f9e2af',
    critical: '#f38ba8',
    agent: '#f5c2e7',
    text: '#cdd6f4',
    muted: '#6c7086',
    border: '#45475a',
    borderActive: '#cba6f7',
  },
  dracula: {
    name: 'dracula',
    label: 'Dracula',
    primary: '#bd93f9',
    secondary: '#8be9fd',
    accent: '#ff79c6',
    success: '#50fa7b',
    warning: '#f1fa8c',
    critical: '#ff5555',
    agent: '#ff79c6',
    text: '#f8f8f2',
    muted: '#6272a4',
    border: '#44475a',
    borderActive: '#bd93f9',
  },
  nord: {
    name: 'nord',
    label: 'Arctic Nord',
    primary: '#88c0d0',
    secondary: '#81a1c1',
    accent: '#b48ead',
    success: '#a3be8c',
    warning: '#ebcb8b',
    critical: '#bf616a',
    agent: '#b48ead',
    text: '#eceff4',
    muted: '#4c566a',
    border: '#434c5e',
    borderActive: '#88c0d0',
  },
  matrix: {
    name: 'matrix',
    label: 'Matrix Neon',
    primary: '#00ff66',
    secondary: '#00e5ff',
    accent: '#33ffcc',
    success: '#22ff66',
    warning: '#ffcc00',
    critical: '#ff3355',
    agent: '#ff55ff',
    text: '#ffffff',
    muted: '#6c8074',
    border: '#1a6644',
    borderActive: '#00e5ff',
  },
  monokai: {
    name: 'monokai',
    label: 'Monokai Spectrum',
    primary: '#a6e22e',
    secondary: '#66d9ef',
    accent: '#fd971f',
    success: '#a6e22e',
    warning: '#e6db74',
    critical: '#f92672',
    agent: '#ae81ff',
    text: '#f8f8f2',
    muted: '#75715e',
    border: '#49483e',
    borderActive: '#66d9ef',
  },
  solarized: {
    name: 'solarized',
    label: 'Solarized Cyan',
    primary: '#2aa198',
    secondary: '#268bd2',
    accent: '#b58900',
    success: '#859900',
    warning: '#b58900',
    critical: '#dc322f',
    agent: '#d33682',
    text: '#93a1a1',
    muted: '#586e75',
    border: '#073642',
    borderActive: '#2aa198',
  },
}

export const THEME_ORDER: ThemeName[] = [
  'default',
  'catppuccin',
  'dracula',
  'nord',
  'monokai',
  'solarized',
  'matrix',
]

export function getNextTheme(current: ThemeName): ThemeName {
  return THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length]
}
