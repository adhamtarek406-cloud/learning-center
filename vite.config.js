import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base نسبي عشان يشتغل على GitHub Pages تحت أي اسم مستودع
export default defineConfig({ base: './', plugins: [react()] })
