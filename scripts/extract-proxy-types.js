import fs from 'fs-extra'
import path from 'path'
import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseJSDoc(comment) {
  if (!comment) return { description: '', params: [], returns: null, type: null }
  
  const lines = comment.trim().split('\n')
  const result = {
    description: '',
    params: [],
    returns: null,
    type: null
  }
  
  let currentDescription = []
  
  lines.forEach(line => {
    line = line.trim().replace(/^\*\s?/, '')
    
    // Parse @param
    const paramMatch = line.match(/@param\s+{([^}]+)}\s+(\[?\w+\]?)\s*-?\s*(.*)/)
    if (paramMatch) {
      const [, type, name, description] = paramMatch
      result.params.push({
        type: type.trim(),
        name: name.replace(/[\[\]]/g, ''),
        optional: name.includes('['),
        description: description.trim()
      })
      return
    }
    
    // Parse @returns
    const returnsMatch = line.match(/@returns?\s+{([^}]+)}\s*-?\s*(.*)/)
    if (returnsMatch) {
      const [, type, description] = returnsMatch
      result.returns = {
        type: type.trim(),
        description: description.trim()
      }
      return
    }
    
    // Parse @type
    const typeMatch = line.match(/@type\s+{([^}]+)}/)
    if (typeMatch) {
      result.type = typeMatch[1].trim()
      return
    }
    
    // If no special tag, add to description
    if (!line.startsWith('@')) {
      currentDescription.push(line)
    }
  })
  
  result.description = currentDescription.join('\n').trim()
  return result
}

function generateMarkdownDocumentation(entry) {
  const docs = []
  
  if (entry.documentation.description) {
    docs.push(entry.documentation.description)
  }
  
  if (entry.documentation.type) {
    docs.push(`\`\`\`typescript\n${entry.type === 'method' ? 'function' : 'property'}: ${entry.documentation.type}\n\`\`\``)
  }
  
  if (entry.documentation.params?.length > 0) {
    docs.push('\n**Parameters:**')
    entry.documentation.params.forEach(param => {
      const optional = param.optional ? '?' : ''
      docs.push(`- \`${param.name}${optional}: ${param.type}\` - ${param.description}`)
    })
  }
  
  if (entry.documentation.returns) {
    docs.push('\n**Returns:**')
    docs.push(`\`${entry.documentation.returns.type}\` - ${entry.documentation.returns.description}`)
  }
  
  return docs.join('\n')
}

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
      const methodName = path.node.key.name
      if (methodName !== 'getAppProxy' && methodName !== 'getWorldProxy') return

      const target = methodName === 'getAppProxy' ? 'app' : 'world'

      if (methodName === 'getAppProxy') {
        path.traverse({
          VariableDeclarator(vdPath) {
            if (vdPath.node.id.name === 'proxy' && vdPath.node.init?.type === 'ObjectExpression') {
              vdPath.node.init.properties.forEach(prop => {
                processProperty(prop, target)
              })
            }
          }
        })
      }

      if (methodName === 'getWorldProxy') {
        path.traverse({
          ReturnStatement(returnPath) {
            if (returnPath.node.argument?.type === 'ObjectExpression') {
              returnPath.node.argument.properties.forEach(prop => {
                processProperty(prop, target)
              })
            }
          }
        })
      }
    }
  })

  function processProperty(prop, target) {
    const entry = {
      name: prop.key.name,
      type: 'property',
      kind: 'property',
      documentation: parseJSDoc(prop.leadingComments?.[0]?.value || '')
    }

    if (prop.type === 'ObjectMethod') {
      entry.type = 'method'
      entry.kind = prop.kind === 'get' ? 'getter' :
                   prop.kind === 'set' ? 'setter' : 'method'
                   
      // Extract parameters for methods
      if (entry.kind === 'method') {
        entry.parameters = prop.params.map(param => ({
          name: param.name,
          type: param.typeAnnotation?.typeAnnotation?.type || 'any'
        }))
      }
    } else if (prop.type === 'ObjectProperty') {
      if (prop.value.type === 'ArrowFunctionExpression' ||
          prop.value.type === 'FunctionExpression') {
        entry.type = 'method'
        entry.kind = 'method'
        entry.parameters = prop.value.params.map(param => ({
          name: param.name,
          type: param.typeAnnotation?.typeAnnotation?.type || 'any'
        }))
      }
    }

    proxies[target].push(entry)
  }

  return proxies
}

function generateSuggestions(proxies) {
  return [
    ...proxies.app.map(entry => ({
      label: entry.name,
      kind: entry.type === 'method' ? 1 : 2, // 1 = Method, 2 = Property
      insertText: entry.type === 'method' && entry.kind !== 'getter' 
        ? generateMethodSnippet(entry)
        : entry.name,
      insertTextRules: entry.type === 'method' && entry.kind !== 'getter' ? 4 : 1, // 4 = InsertAsSnippet
      documentation: {
        value: generateMarkdownDocumentation(entry),
        isTrusted: true,
        supportThemeIcons: true
      },
      detail: `App Proxy ${entry.kind}`,
      sortText: entry.name.toLowerCase() // Ensure case-insensitive sorting
    })),
    ...proxies.world.map(entry => ({
      label: entry.name,
      kind: entry.type === 'method' ? 1 : 2,
      insertText: entry.type === 'method' && entry.kind !== 'getter'
        ? generateMethodSnippet(entry)
        : entry.name,
      insertTextRules: entry.type === 'method' && entry.kind !== 'getter' ? 4 : 1,
      documentation: {
        value: generateMarkdownDocumentation(entry),
        isTrusted: true,
        supportThemeIcons: true
      },
      detail: `World Proxy ${entry.kind}`,
      sortText: entry.name.toLowerCase()
    }))
  ]
}

function generateMethodSnippet(entry) {
  if (!entry.documentation.params?.length) {
    return `${entry.name}()`
  }
  
  const params = entry.documentation.params.map((param, index) => {
    const snippet = `\${${index + 1}:${param.name}}`
    return param.optional ? `[${snippet}]` : snippet
  })
  
  return `${entry.name}(${params.join(', ')})`
}

async function generate() {
  const proxies = await extractProxyMethods()
  const suggestions = generateSuggestions(proxies)
  
  const outputPath = path.join(__dirname, '../src/client/public/suggestions.json')
  await fs.ensureDir(path.dirname(outputPath))
  await fs.writeJSON(outputPath, suggestions, { spaces: 2 })
}

generate().catch(console.error)