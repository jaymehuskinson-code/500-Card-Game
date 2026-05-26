/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: '#c9a84c',
        felt: '#1a3a2a',
        'felt-center': '#183524',
        'table-dark': '#0e1c16',
        'card-white': '#f8f6f0',
        'card-back': '#1e3464',
      },
      fontFamily: {
        display: ['"Cinzel"', 'serif'],
        body: ['"Crimson Pro"', 'serif'],
      },
      boxShadow: {
        card: '0 2px 8px rgba(0,0,0,0.4)',
        'card-hover': '0 8px 20px rgba(0,0,0,0.5)',
        'inner-table': 'inset 0 4px 20px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};
