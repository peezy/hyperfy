import chokidar from 'chokidar'
import path from 'path'
import fs from 'fs/promises'
import { System } from './System'

// Debounce function to prevent rapid firing for multiple save events
function debounce(func, timeout = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      func.apply(this, args)
    }, timeout)
  }
}

export class AssetWatcher extends System {
  constructor(world) {
    super(world)
    this.watcher = null
  }

  async init(options) {
    if (!this.world.assetsDir) {
      console.warn('[AssetWatcher] assetsDir not configured. File watching disabled.')
      return
    }

    // Watch for changes to .js files in the assets directory
    // We only care about files like script-*.js
    const watchPath = path.join(this.world.assetsDir)

    this.watcher = chokidar.watch(watchPath, {
      ignored: (path, stats) => stats?.isFile() && !path.endsWith('.js'), // only watch js files
      persistent: true,
      ignoreInitial: true, // Don't fire 'add' events on startup
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    })

    // console.log(`[AssetWatcher] Watching for script changes in: ${this.world.assetsDir}`)

    // list all js files in the assets directory
    const jsFiles = (await fs.readdir(this.world.assetsDir)).filter(file => file.endsWith('.js'))
    // console.log(`[AssetWatcher] Found ${jsFiles.length} script files in ${this.world.assetsDir}`)

    this.watcher
      .on('change', debounce(filePath => this.handleFileChange(filePath), 500))
      // .on('add', debounce(filePath => this.handleFileChange(filePath), 500)) // Could handle newly added scripts if needed
      .on('error', error => console.error(`[AssetWatcher] Error: ${error}`))
  }

  handleFileChange(filePath) {
    const filename = path.basename(filePath)
    // console.log(`[AssetWatcher] File changed: ${filename}`)

    if (!filename.startsWith('script-') || !filename.endsWith('.js')) {
      // Not a script file we manage this way
      return
    }

    const blueprintIdMatch = filename.match(/^script-(.+?)\.js$/)
    if (!blueprintIdMatch || !blueprintIdMatch[1]) {
      console.warn(`[AssetWatcher] Could not parse blueprintId from ${filename}`)
      return
    }
    const blueprintId = blueprintIdMatch[1]

    const blueprint = this.world.blueprints.get(blueprintId)
    if (!blueprint) {
      console.warn(`[AssetWatcher] Script file ${filename} changed, but no blueprint found with id ${blueprintId}`)
      return
    }

    // Increment version and update script URL
    const newVersion = blueprint.version + 1
    const baseFilename = `script-${blueprintId}.js` // The actual filename on disk
    const newScriptUrlInBlueprint = `asset://${baseFilename}?v=${newVersion}`

    // console.log(
    //   `[AssetWatcher] Updating blueprint ${blueprintId} ('${blueprint.name || 'Unnamed'}') to version ${newVersion} due to change in ${filename}`,
    // )

    // Modify the blueprint. This will trigger app rebuilds on the server.
    this.world.blueprints.modify({
      id: blueprintId,
      version: newVersion,
      script: newScriptUrlInBlueprint,
    })

    // Broadcast the modification to clients
    this.world.network.send('blueprintModified', {
      id: blueprintId,
      version: newVersion,
      script: newScriptUrlInBlueprint,
    })
  }

  destroy() {
    if (this.watcher) {
      this.watcher.close()
      // console.log('[AssetWatcher] Stopped watching asset files.')
    }
  }
} 