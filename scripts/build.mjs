import 'dotenv-flow/config'
import fs from 'fs-extra'
import path from 'path'
import { fork, execSync } from 'child_process'
import * as esbuild from 'esbuild'
import { fileURLToPath } from 'url'
import { polyfillNode } from 'esbuild-plugin-polyfill-node'

const dev = process.argv.includes('--dev')
const dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(dirname, '../')
const buildDir = path.join(rootDir, 'build')

// await fs.emptyDir(buildDir)
await fs.emptyDir(path.join(buildDir, 'public'))

// Generate packets module first, as it's needed by both client and server
await generatePacketsModule()

/**
 * Generate a consolidated packets module
 * This ensures consistent packet IDs between client and server
 */
async function generatePacketsModule() {
  const packetsDir = path.join(rootDir, 'src/mods/core/packets')
  const packetsOutputDir = path.join(rootDir, 'src/core/.gen')
  const packetsOutputFile = path.join(packetsOutputDir, 'generated-packets.js')
  
  try {
    // Ensure output directory exists
    await fs.ensureDir(packetsOutputDir)
    
    let allPacketNames = []
    
    // Check if the packets directory exists
    if (await fs.pathExists(packetsDir)) {
      const entries = await fs.readdir(packetsDir, { withFileTypes: true })
      
      // Filter for JS files
      const packetFiles = entries
        .filter(entry => 
          entry.isFile() && 
          ['.js', '.mjs'].includes(
            path.extname(entry.name).toLowerCase()
          )
        );
      
      // Collect all packet names from each file
      for (const file of packetFiles) {
        const filePath = path.join(packetsDir, file.name)
        const fileUrl = `file://${filePath}`
        
        try {
          // Import the packet definition file
          const module = await import(fileUrl)
          const packetNames = module.default
          
          if (Array.isArray(packetNames)) {
            // Add each packet name to the collection
            for (const name of packetNames) {
              if (!allPacketNames.includes(name)) {
                allPacketNames.push(name)
              }
            }
          }
        } catch (err) {
          console.error(`Error processing packet definition file ${file.name}:`, err)
        }
      }
      
      console.log(`Found ${allPacketNames.length} custom packet definitions`)
    }
    
    // Create the module content
    const moduleContent = `// GENERATED FILE - DO NOT EDIT
// This file is auto-generated during the build process.
// Custom packet definitions are collected from src/mods/core/packets/*.js

// Original built-in packet names
export const builtInPackets = [
  'snapshot',
  'command',
  'chatAdded',
  'chatCleared',
  'blueprintAdded',
  'blueprintModified',
  'entityAdded',
  'entityModified',
  'entityEvent',
  'entityRemoved',
  'playerTeleport',
  'playerPush',
  'playerSessionAvatar',
  'settingsModified',
  'spawnModified',
  'kick',
  'ping',
  'pong',
]

// Custom packet names collected from mods
export const customPackets = [
  ${allPacketNames.map(name => `'${name}'`).join(',\n  ')}
]

// Combined packet names (built-in + custom)
export const allPackets = [
  ...builtInPackets,
  ...customPackets
]
`
    
    // Write the module file
    await fs.writeFile(packetsOutputFile, moduleContent)
    console.log(`Generated packets module with ${allPacketNames.length} custom packets`)
    
    return allPacketNames.length
  } catch (err) {
    console.error('Error generating packets module:', err)
    return 0
  }
}

/**
 * Generate a module that collects and exports all mod components
 * This allows component mods to be bundled with the client
 */
async function generateModComponentsModule() {
  const modComponentsDir = path.join(rootDir, 'src/mods/client')
  const modComponentsOutputDir = path.join(rootDir, 'src/mods/.gen')
  const modComponentsOutputFile = path.join(modComponentsOutputDir, 'ModComponents.js')
  
  try {
    // Ensure output directory exists
    await fs.ensureDir(modComponentsOutputDir)
    
    let imports = []
    let exports = []
    
    // Check if the components directory exists
    if (await fs.pathExists(modComponentsDir)) {
      const entries = await fs.readdir(modComponentsDir, { withFileTypes: true })
      
      // Filter for JS/JSX files
      const componentFiles = entries
        .filter(entry => 
          entry.isFile() && 
          ['.js', '.jsx', '.tsx'].includes(
            path.extname(entry.name).toLowerCase()
          )
        );
      
      // Generate imports and exports
      componentFiles.forEach((file, index) => {
        const componentName = path.parse(file.name).name
        const relativePath = path.relative(
          modComponentsOutputDir,
          path.join(modComponentsDir, file.name)
        ).replace(/\\/g, '/')
        
        imports.push(`import ${componentName} from '${relativePath}'`)
        exports.push(`  ${componentName}`)
      })
      
      // Create the module content
      const moduleContent = `${imports.join('\n')}

export const ModComponents = {
${exports.join(',\n')}
}
`
      // Write the module file
      await fs.writeFile(modComponentsOutputFile, moduleContent)
      console.log(`Generated mod components module with ${componentFiles.length} components`)
    } else {
      // Create empty module if directory doesn't exist
      const moduleContent = `export const ModComponents = {}`
      await fs.writeFile(modComponentsOutputFile, moduleContent)
      console.log('Generated empty mod components module (no components directory found)')
    }
  } catch (err) {
    console.error('Error generating mod components module:', err)
    // Create fallback empty module
    const moduleContent = `export const ModComponents = {}`
    await fs.writeFile(modComponentsOutputFile, moduleContent)
  }
}

/**
 * Generate a module that collects mod sidebar buttons and panes
 */
async function generateModSidebarModule() {
  const modSidebarDir = path.join(rootDir, 'src/mods/client/sidebar')
  const modComponentsOutputDir = path.join(rootDir, 'src/mods/.gen')
  const modSidebarOutputFile = path.join(modComponentsOutputDir, 'ModSidebar.js')
  
  try {
    // Ensure output directory exists
    await fs.ensureDir(modComponentsOutputDir)
    
    let imports = []
    let buttonExports = []
    let paneExports = []
    
    // Check if the sidebar directory exists
    if (await fs.pathExists(modSidebarDir)) {
      const entries = await fs.readdir(modSidebarDir, { withFileTypes: true })
      
      // Filter for JS/JSX files
      const sidebarFiles = entries
        .filter(entry => 
          entry.isFile() && 
          ['.js', '.jsx', '.tsx'].includes(
            path.extname(entry.name).toLowerCase()
          )
        );
      
      // Generate imports and exports
      sidebarFiles.forEach((file) => {
        const moduleName = path.parse(file.name).name
        const relativePath = path.relative(
          modComponentsOutputDir,
          path.join(modSidebarDir, file.name)
        ).replace(/\\/g, '/')
        
        imports.push(`import { ${moduleName}Button, ${moduleName}Pane } from '${relativePath}'`)
        buttonExports.push(`  ${moduleName}: ${moduleName}Button`)
        paneExports.push(`  ${moduleName}: ${moduleName}Pane`)
      })
      
      // Create the module content
      const moduleContent = `${imports.join('\n')}

export const ModSidebarButtons = {
${buttonExports.join(',\n')}
}

export const ModSidebarPanes = {
${paneExports.join(',\n')}
}
`
      // Write the module file
      await fs.writeFile(modSidebarOutputFile, moduleContent)
      console.log(`Generated mod sidebar module with ${sidebarFiles.length} sidebar components`)
    } else {
      // Create empty module if directory doesn't exist
      const moduleContent = `// This file will be auto-generated during build
export const ModSidebarButtons = {}
export const ModSidebarPanes = {}`
      await fs.writeFile(modSidebarOutputFile, moduleContent)
      console.log('Generated empty mod sidebar module (no sidebar directory found)')
    }
  } catch (err) {
    console.error('Error generating mod sidebar module:', err)
    // Create fallback empty module
    const moduleContent = `// This file will be auto-generated during build
export const ModSidebarButtons = {}
export const ModSidebarPanes = {}`
    await fs.writeFile(modSidebarOutputFile, moduleContent)
  }
}

/**
 * Generate client mods manifest
 * Scans the client mods directory and bundles the mods,
 * then creates a manifest file with the bundled mod paths
 */
async function generateClientModsManifest() {
  const clientModsDir = path.join(rootDir, 'src/mods/core/client')
  const sharedModsDir = path.join(rootDir, 'src/mods/core/shared')
  const clientModsBuildDir = path.join(rootDir, 'build/public/mods/client')
  const sharedClientModsBuildDir = path.join(rootDir, 'build/public/mods/shared')
  const manifestPath = path.join(rootDir, 'build/public/mods-manifest.json')
  const manifest = { mods: [] }

  try {
    // Ensure build directories exist
    await fs.ensureDir(clientModsBuildDir)
    await fs.ensureDir(sharedClientModsBuildDir)

    // Process client-specific mods
    if (await fs.pathExists(clientModsDir)) {
      const entries = await fs.readdir(clientModsDir, { withFileTypes: true })
      
      // Filter for JS/TS files
      const modFiles = entries
        .filter(entry => 
          entry.isFile() && 
          ['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx'].includes(
            path.extname(entry.name).toLowerCase()
          )
        );
      
      // Build each mod file
      for (const entry of modFiles) {
        const srcPath = path.join(clientModsDir, entry.name)
        const fileName = path.parse(entry.name).name
        
        try {
          // Bundle the mod with esbuild
          const result = await esbuild.build({
            entryPoints: [srcPath],
            outdir: clientModsBuildDir,
            entryNames: '[name]-[hash]',
            platform: 'browser',
            format: 'esm',
            bundle: true,
            minify: !dev,
            sourcemap: true,
            metafile: true,
            jsx: 'automatic',
            jsxImportSource: '@firebolt-dev/jsx',
            define: {
              'process.env.NODE_ENV': dev ? '"development"' : '"production"',
              'process.env.CLIENT': 'true',
              'process.env.SERVER': 'false',
            },
            loader: {
              '.js': 'jsx',
            },
            plugins: [
              polyfillNode({}),
            ]
          })
          
          // Find the output file from metafile
          const outputs = Object.keys(result.metafile.outputs)
          const bundledFilePath = outputs.find(file => file.includes(fileName) && file.endsWith('.js'))
          
          if (bundledFilePath) {
            // Get the path relative to the build/public directory
            const relativePath = bundledFilePath.split('build/public')[1]
            manifest.mods.push(relativePath)
            console.log(`Bundled client mod: ${entry.name} -> ${relativePath}`)
          }
        } catch (err) {
          console.error(`Error bundling client mod ${entry.name}:`, err)
        }
      }
    }

    // Process shared mods for client
    if (await fs.pathExists(sharedModsDir)) {
      const entries = await fs.readdir(sharedModsDir, { withFileTypes: true })
      
      // Filter for JS/TS files
      const modFiles = entries
        .filter(entry => 
          entry.isFile() && 
          ['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx'].includes(
            path.extname(entry.name).toLowerCase()
          )
        );
      
      // Build each shared mod for client
      for (const entry of modFiles) {
        const srcPath = path.join(sharedModsDir, entry.name)
        const fileName = path.parse(entry.name).name
        
        try {
          // Bundle the mod with esbuild for client
          const result = await esbuild.build({
            entryPoints: [srcPath],
            outdir: sharedClientModsBuildDir,
            entryNames: '[name]-[hash]',
            platform: 'browser',
            format: 'esm',
            bundle: true,
            minify: !dev,
            sourcemap: true,
            metafile: true,
            jsx: 'automatic',
            jsxImportSource: '@firebolt-dev/jsx',
            define: {
              'process.env.NODE_ENV': dev ? '"development"' : '"production"',
              'process.env.CLIENT': 'true',
              'process.env.SERVER': 'false',
              'process.env.SHARED': 'true',
            },
            loader: {
              '.js': 'jsx',
            },
            plugins: [
              polyfillNode({}),
            ]
          })
          
          // Find the output file from metafile
          const outputs = Object.keys(result.metafile.outputs)
          const bundledFilePath = outputs.find(file => file.includes(fileName) && file.endsWith('.js'))
          
          if (bundledFilePath) {
            // Get the path relative to the build/public directory
            const relativePath = bundledFilePath.split('build/public')[1]
            manifest.mods.push(relativePath)
            console.log(`Bundled shared mod for client: ${entry.name} -> ${relativePath}`)
          }
        } catch (err) {
          console.error(`Error bundling shared mod for client ${entry.name}:`, err)
        }
      }
    }

    // Write the manifest file
    await fs.ensureDir(path.dirname(manifestPath))
    await fs.writeJson(manifestPath, manifest, { spaces: 2 })
    console.log(`Generated client mods manifest with ${manifest.mods.length} mods`)
  } catch (err) {
    console.error('Error generating client mods manifest:', err)
  }
}

/**
 * Generate server mods manifest
 * Scans the server mods directory and bundles the mods,
 * then creates a manifest file with the bundled mod paths
 */
async function generateServerModsManifest() {
  const serverModsDir = path.join(rootDir, 'src/mods/core/server')
  const sharedModsDir = path.join(rootDir, 'src/mods/core/shared')
  const serverModsBuildDir = path.join(rootDir, 'build/mods/server')
  const sharedServerModsBuildDir = path.join(rootDir, 'build/mods/shared')
  const manifestPath = path.join(rootDir, 'build/server-mods-manifest.json')
  const manifest = { mods: [] }

  try {
    // Ensure build directories exist
    await fs.ensureDir(serverModsBuildDir)
    await fs.ensureDir(sharedServerModsBuildDir)

    // Process server-specific mods
    if (await fs.pathExists(serverModsDir)) {
      const entries = await fs.readdir(serverModsDir, { withFileTypes: true })
      
      // Filter for JS/TS files
      const modFiles = entries
        .filter(entry => 
          entry.isFile() && 
          ['.js', '.mjs', '.cjs', '.ts'].includes(
            path.extname(entry.name).toLowerCase()
          )
        );
      
      // Build each mod file
      for (const entry of modFiles) {
        const srcPath = path.join(serverModsDir, entry.name)
        const fileName = path.parse(entry.name).name
        
        try {
          // Bundle the mod with esbuild
          const result = await esbuild.build({
            entryPoints: [srcPath],
            outdir: serverModsBuildDir,
            entryNames: '[name]-[hash]',
            platform: 'node',
            format: 'esm',
            bundle: true,
            minify: false,
            sourcemap: true,
            metafile: true,
            packages: 'external',
            define: {
              'process.env.NODE_ENV': dev ? '"development"' : '"production"',
              'process.env.CLIENT': 'false',
              'process.env.SERVER': 'true',
            },
            plugins: []
          })
          
          // Find the output file from metafile
          const outputs = Object.keys(result.metafile.outputs)
          const bundledFilePath = outputs.find(file => file.includes(fileName) && file.endsWith('.js'))
          
          if (bundledFilePath) {
            // Use file:// URL for Node.js imports
            const absolutePath = path.join(process.cwd(), bundledFilePath)
            const fileUrl = `file://${absolutePath}`
            manifest.mods.push(fileUrl)
            console.log(`Bundled server mod: ${entry.name} -> ${fileUrl}`)
          }
        } catch (err) {
          console.error(`Error bundling server mod ${entry.name}:`, err)
        }
      }
    }

    // Process shared mods for server
    if (await fs.pathExists(sharedModsDir)) {
      const entries = await fs.readdir(sharedModsDir, { withFileTypes: true })
      
      // Filter for JS/TS files
      const modFiles = entries
        .filter(entry => 
          entry.isFile() && 
          ['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx'].includes(
            path.extname(entry.name).toLowerCase()
          )
        );
      
      // Build each shared mod for server
      for (const entry of modFiles) {
        const srcPath = path.join(sharedModsDir, entry.name)
        const fileName = path.parse(entry.name).name
        
        try {
          // Bundle the mod with esbuild for server
          const result = await esbuild.build({
            entryPoints: [srcPath],
            outdir: sharedServerModsBuildDir,
            entryNames: '[name]-[hash]',
            platform: 'node',
            format: 'esm',
            bundle: true,
            minify: false,
            sourcemap: true,
            metafile: true,
            packages: 'external',
            define: {
              'process.env.NODE_ENV': dev ? '"development"' : '"production"',
              'process.env.CLIENT': 'false',
              'process.env.SERVER': 'true',
              'process.env.SHARED': 'true',
            },
            plugins: []
          })
          
          // Find the output file from metafile
          const outputs = Object.keys(result.metafile.outputs)
          const bundledFilePath = outputs.find(file => file.includes(fileName) && file.endsWith('.js'))
          
          if (bundledFilePath) {
            // Use file:// URL for Node.js imports
            const absolutePath = path.join(process.cwd(), bundledFilePath)
            const fileUrl = `file://${absolutePath}`
            manifest.mods.push(fileUrl)
            console.log(`Bundled shared mod for server: ${entry.name} -> ${fileUrl}`)
          }
        } catch (err) {
          console.error(`Error bundling shared mod for server ${entry.name}:`, err)
        }
      }
    }

    // Write the manifest file
    await fs.writeJson(manifestPath, manifest, { spaces: 2 })
    console.log(`Generated server mods manifest with ${manifest.mods.length} mods`)
  } catch (err) {
    console.error('Error generating server mods manifest:', err)
  }
}

/**
 * Build Client
 */

const clientPublicDir = path.join(rootDir, 'src/client/public')
const clientBuildDir = path.join(rootDir, 'build/public')
const clientHtmlSrc = path.join(rootDir, 'src/client/public/index.html')
const clientHtmlDest = path.join(rootDir, 'build/public/index.html')

await generateModComponentsModule()
await generateModSidebarModule()

{
  const clientCtx = await esbuild.context({
    entryPoints: ['src/client/index.js', 'src/client/particles.js'],
    entryNames: '/[name]-[hash]',
    outdir: clientBuildDir,
    platform: 'browser',
    format: 'esm',
    bundle: true,
    treeShaking: true,
    minify: !dev,
    sourcemap: true,
    metafile: true,
    jsx: 'automatic',
    jsxImportSource: '@firebolt-dev/jsx',
    define: {
      'process.env.NODE_ENV': dev ? '"development"' : '"production"',
    },
    loader: {
      '.js': 'jsx',
    },
    alias: {
      react: 'react', // always use our own local react (jsx)
    },
    plugins: [
      polyfillNode({}),
      {
        name: 'client-finalize-plugin',
        setup(build) {
          build.onEnd(async result => {
            // Generate client mods manifest
            await generateClientModsManifest()
            
            // copy over public files
            await fs.copy(clientPublicDir, clientBuildDir)
            // copy physx wasm to public
            const physxWasmSrc = path.join(rootDir, 'src/core/physx-js-webidl.wasm')
            const physxWasmDest = path.join(rootDir, 'build/public/physx-js-webidl.wasm')
            await fs.copy(physxWasmSrc, physxWasmDest)
            // find js output files
            const metafile = result.metafile
            const outputFiles = Object.keys(metafile.outputs)
            const jsPath = outputFiles
              .find(file => file.includes('/index-') && file.endsWith('.js'))
              .split('build/public')[1]
            const particlesPath = outputFiles
              .find(file => file.includes('/particles-') && file.endsWith('.js'))
              .split('build/public')[1]
            // inject into html and copy over
            let htmlContent = await fs.readFile(clientHtmlSrc, 'utf-8')
            htmlContent = htmlContent.replace('{jsPath}', jsPath)
            htmlContent = htmlContent.replace('{particlesPath}', particlesPath)
            htmlContent = htmlContent.replaceAll('{buildId}', Date.now())
            await fs.writeFile(clientHtmlDest, htmlContent)
          })
        },
      },
    ],
  })
  if (dev) {
    await clientCtx.watch()
  } else {
    await clientCtx.rebuild()
  }
  const buildResult = await clientCtx.rebuild()
  fs.writeFileSync(path.join(buildDir, 'meta.json'), JSON.stringify(buildResult.metafile, null, 2))
}

/**
 * Build Server
 */

let spawn

{
  const serverCtx = await esbuild.context({
    entryPoints: ['src/server/index.js'],
    outfile: 'build/index.js',
    platform: 'node',
    format: 'esm',
    bundle: true,
    treeShaking: true,
    minify: false,
    sourcemap: true,
    packages: 'external',
    define: {
      'process.env.CLIENT': 'false',
      'process.env.SERVER': 'true',
    },
    plugins: [
      {
        name: 'server-finalize-plugin',
        setup(build) {
          build.onEnd(async result => {
            // Generate server mods manifest
            await generateServerModsManifest()
            
            // copy over physx js
            const physxIdlSrc = path.join(rootDir, 'src/core/physx-js-webidl.js')
            const physxIdlDest = path.join(rootDir, 'build/physx-js-webidl.js')
            await fs.copy(physxIdlSrc, physxIdlDest)
            // copy over physx wasm
            const physxWasmSrc = path.join(rootDir, 'src/core/physx-js-webidl.wasm')
            const physxWasmDest = path.join(rootDir, 'build/physx-js-webidl.wasm')
            await fs.copy(physxWasmSrc, physxWasmDest)
            // start the server or stop here
            if (dev) {
              // (re)start server
              spawn?.kill('SIGTERM')
              spawn = fork(path.join(rootDir, 'build/index.js'))
            } else {
              process.exit(1)
            }
          })
        },
      },
    ],
    loader: {},
  })
  if (dev) {
    await serverCtx.watch()
  } else {
    await serverCtx.rebuild()
  }
}
