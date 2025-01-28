import fs from 'fs-extra'
import path from 'path'
import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function extractProxyMethods() {
  const appCode = await fs.readFile(
    path.join(__dirname, '../src/core/entities/App.js'), 
    'utf-8'
  )

  const ast = parse(appCode, {
    sourceType: 'module',
    plugins: ['classProperties', 'objectRestSpread']
  })

  const proxies = {
    app: [],
    world: []
  }

  traverse.default(ast, {
    ClassMethod(path) {
      if (path.node.key.name === 'getAppProxy' || path.node.key.name === 'getWorldProxy') {
        path.traverse({
          ReturnStatement(returnPath) {
            const properties = returnPath.node.argument?.properties || []
            
            properties.forEach(prop => {
              const entry = {
                name: prop.key.name,
                type: 'property',
                kind: 'property'
              }

              // Handle ObjectMethod nodes (including getters/setters)
              if (prop.type === 'ObjectMethod') {
                entry.type = 'method'
                entry.kind = prop.kind === 'get' ? 'getter' : 
                            prop.kind === 'set' ? 'setter' : 'method'
              }
              // Handle ObjectProperty nodes
              else if (prop.type === 'ObjectProperty') {
                if (prop.value.type === 'ArrowFunctionExpression' || 
                    prop.value.type === 'FunctionExpression') {
                  entry.type = 'method'
                  entry.kind = 'method'
                }
              }

              proxies[path.node.key.name === 'getAppProxy' ? 'app' : 'world'].push(entry)
            })
          }
        })
      }
    }
  })

  return proxies
}

function generateSuggestions(proxies) {
  return [
    ...proxies.app.map(entry => ({
      label: entry.name,
      kind: entry.type === 'method' ? 1 : 2,
      // Don't add parentheses for getters
      insertText: entry.type === 'method' && entry.kind !== 'getter' ? 
                 `${entry.name}(\$1)` : entry.name,
      documentation: `app.${entry.name}`,
      detail: `App Proxy ${entry.kind}`
    })),
    ...proxies.world.map(entry => ({
      label: entry.name,
      kind: entry.type === 'method' ? 1 : 2,
      // Don't add parentheses for getters
      insertText: entry.type === 'method' && entry.kind !== 'getter' ? 
                 `${entry.name}(\$1)` : entry.name,
      documentation: `app.world.${entry.name}`,
      detail: `World Proxy ${entry.kind}`
    }))
  ]
}

async function generate() {
  const proxies = await extractProxyMethods()
  const suggestions = generateSuggestions(proxies)
  
  const outputPath = path.join(__dirname, '../src/client/public/suggestions.json')
  await fs.ensureDir(path.dirname(outputPath))
  await fs.writeJSON(outputPath, suggestions)
}

generate().catch(console.error)