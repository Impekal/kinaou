import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function currentCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

// strictPort is deliberate: KINAOU project data lives in browser storage bound
// to the localhost:4173 origin, so silently falling back to another port would
// show an empty app (and, with an older server still on 4173, stale code).
export default defineConfig({
  plugins: [react()],
  define: {
    __KINAOU_COMMIT__: JSON.stringify(currentCommit()),
    __KINAOU_STARTED__: JSON.stringify(new Date().toISOString())
  },
  server: { host: true, port: 4173, strictPort: true },
  preview: { host: true, port: 4173, strictPort: true }
})
