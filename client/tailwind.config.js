/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        claude: {
          bg: '#212121',
          sidebar: '#171717',
          surface: '#2f2f2f',
          border: 'rgba(255,255,255,0.1)',
          text: '#ececec',
          muted: '#8e8ea0',
          hover: 'rgba(255,255,255,0.06)',
          accent: '#cc785c',
        },
      },
      animation: {
        'bounce-dot': 'bounce 1.2s infinite',
      },
    },
  },
  plugins: [],
};
