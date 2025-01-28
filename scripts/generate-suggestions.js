import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Mock environment required by App class
class Entity {
  onWorldEvent() {}
  offWorldEvent() {}
  worldNodes = new Set()
}

class MockApp extends Entity {
  data = { id: 'app', state: {} }
  blueprint = { 
    version: '1.0.0',
    config: {},
    getConfig: () => {}
  }
  world = {
    network: { id: 'mock', isServer: true, isClient: false },
    entities: { getPlayer: () => null, player: null },
    events: { emit: () => {} },
    chat: { add: () => {} },
    controls: { bind: () => {} }
  }
  root = {
    get: () => null,
    getProxy: () => ({}),
    createNode: () => ({ getProxy: () => ({}) })
  }

  getWorldProxy() { return super.getWorldProxy() }
  getAppProxy() { return super.getAppProxy() }
}

// Instantiate and get proxies
const app = new MockApp()
const appProxy = app.getAppProxy()
const worldProxy = app.getWorldProxy()

function extractSuggestions(proxy, prefix) {
  return Object.entries(Object.getOwnPropertyDescriptors(proxy))
    .filter(([key]) => key !== 'constructor')
    .map(([key, descriptor]) => {
      const isMethod = typeof descriptor.value === 'function'
      
      return {
        label: key,
        kind: isMethod ? 1 : 2, // 1=Method, 2=Property
        insertText: isMethod ? `${key}(\$1)` : key,
        documentation: `${prefix}.${key}`,
        detail: `${prefix} proxy`,
        range: undefined // Monaco will handle positioning
      }
    })
}

const suggestions = [
  ...extractSuggestions(appProxy, 'app'),
  ...extractSuggestions(worldProxy, 'app.world')
]

// Write to public directory
const outputPath = path.join(__dirname, '../src/client/public/suggestions.json')
await fs.ensureDir(path.dirname(outputPath))
await fs.writeJSON(outputPath, suggestions)