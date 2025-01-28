import { isString } from 'lodash-es'
import * as THREE from '../extras/three'
import moment from 'moment'

import { Entity } from './Entity'
import { glbToNodes } from '../extras/glbToNodes'
import { createNode } from '../extras/createNode'
import { LerpVector3 } from '../extras/LerpVector3'
import { LerpQuaternion } from '../extras/LerpQuaternion'
import { ControlPriorities } from '../extras/ControlPriorities'
import { getRef } from '../nodes/Node'

const hotEventNames = ['fixedUpdate', 'update', 'lateUpdate']
const internalEvents = ['fixedUpdate', 'updated', 'lateUpdate', 'enter', 'leave', 'chat']

const Modes = {
  ACTIVE: 'active',
  MOVING: 'moving',
  LOADING: 'loading',
  CRASHED: 'crashed',
}

export class App extends Entity {
  constructor(world, data, local) {
    super(world, data, local)
    this.isApp = true
    this.n = 0
    this.worldNodes = new Set()
    this.hotEvents = 0
    this.worldListeners = new Map()
    this.listeners = {}
    this.eventQueue = []
    this.build()
  }

  createNode(name) {
    const node = createNode({ name })
    return node
  }

  async build(crashed) {
    this.building = true
    const n = ++this.n
    // fetch blueprint
    const blueprint = this.world.blueprints.get(this.data.blueprint)
    // fetch script (if any)
    let script
    if (blueprint.script) {
      try {
        script = this.world.loader.get('script', blueprint.script)
        if (!script) script = await this.world.loader.load('script', blueprint.script)
      } catch (err) {
        console.error(err)
        crashed = true
      }
    }
    let root
    // if someone else is uploading glb, show a loading indicator
    if (this.data.uploader && this.data.uploader !== this.world.network.id) {
      root = createNode({ name: 'mesh' })
      root.type = 'box'
      root.width = 1
      root.height = 1
      root.depth = 1
    }
    // otherwise we can load the actual glb
    else {
      try {
        const type = blueprint.model.endsWith('vrm') ? 'avatar' : 'model'
        let glb = this.world.loader.get(type, blueprint.model)
        if (!glb) glb = await this.world.loader.load(type, blueprint.model)
        root = glb.toNodes()
      } catch (err) {
        console.error(err)
        // no model, will use crash block below
      }
    }
    // if script crashed (or failed to load model), show crash-block
    if (crashed || !root) {
      let glb = this.world.loader.get('model', 'asset://crash-block.glb')
      if (!glb) glb = await this.world.loader.load('model', 'asset://crash-block.glb')
      root = glb.toNodes()
    }
    // if a new build happened while we were fetching, stop here
    if (this.n !== n) return
    // unbuild any previous version
    this.unbuild()
    // mode
    this.mode = Modes.ACTIVE
    if (this.data.mover) this.mode = Modes.MOVING
    if (this.data.uploader && this.data.uploader !== this.world.network.id) this.mode = Modes.LOADING
    // setup
    this.blueprint = blueprint
    this.root = root
    this.root.position.fromArray(this.data.position)
    this.root.quaternion.fromArray(this.data.quaternion)
    // activate
    this.root.activate({ world: this.world, entity: this, physics: !this.data.mover })
    // execute script
    if (this.mode === Modes.ACTIVE && script && !crashed) {
      this.abortController = new AbortController()
      this.script = script
      try {
        this.script.exec(this.getWorldProxy(), this.getAppProxy(), this.fetch)
      } catch (err) {
        console.error('script crashed')
        console.error(err)
        return this.crash()
      }
    }
    // if moving we need updates
    if (this.mode === Modes.MOVING) this.world.setHot(this, true)
    // if we're the mover lets bind controls
    if (this.data.mover === this.world.network.id) {
      this.lastMoveSendTime = 0
      this.control = this.world.controls.bind({
        priority: ControlPriorities.ENTITY,
        onScroll: () => {
          return true
        },
      })
    }
    // if remote is moving, set up to receive network updates
    this.networkPos = new LerpVector3(root.position, this.world.networkRate)
    this.networkQuat = new LerpQuaternion(root.quaternion, this.world.networkRate)
    // execute any events we collected while building
    while (this.eventQueue.length) {
      const event = this.eventQueue[0]
      if (event.version > this.blueprint.version) break // ignore future versions
      this.eventQueue.shift()
      this.emit(event.name, event.data, event.networkId)
    }
    // finished!
    this.building = false
  }

  unbuild() {
    // deactivate local node
    this.root?.deactivate()
    // deactivate world nodes
    for (const node of this.worldNodes) {
      node.deactivate()
    }
    this.worldNodes.clear()
    // clear script event listeners
    this.clearEventListeners()
    this.hotEvents = 0
    // release control
    if (this.control) {
      this.control?.release()
      this.control = null
    }
    // cancel update tracking
    this.world.setHot(this, false)
    // abort fetch's etc
    this.abortController?.abort()
    this.abortController = null
  }

  fixedUpdate(delta) {
    // script fixedUpdate()
    if (this.mode === Modes.ACTIVE && this.script) {
      try {
        this.emit('fixedUpdate', delta)
      } catch (err) {
        console.error('script fixedUpdate crashed', this)
        console.error(err)
        this.crash()
        return
      }
    }
  }

  update(delta) {
    // if we're moving the app, handle that
    if (this.data.mover === this.world.network.id) {
      if (this.control.buttons.ShiftLeft) {
        // if shift is down we're raising and lowering the app
        this.root.position.y -= this.world.controls.pointer.delta.y * delta * 0.5
      } else {
        // otherwise move with the cursor
        const position = this.world.controls.pointer.position
        const hits = this.world.stage.raycastPointer(position)
        let hit
        for (const _hit of hits) {
          const entity = _hit.getEntity?.()
          // ignore self and players
          if (entity === this || entity?.isPlayer) continue
          hit = _hit
          break
        }
        if (hit) {
          this.root.position.copy(hit.point)
        }
        // and rotate with the mouse wheel
        this.root.rotation.y += this.control.scroll.delta * 0.1 * delta
      }

      // periodically send updates
      this.lastMoveSendTime += delta
      if (this.lastMoveSendTime > this.world.networkRate) {
        this.world.network.send('entityModified', {
          id: this.data.id,
          position: this.root.position.toArray(),
          quaternion: this.root.quaternion.toArray(),
        })
        this.lastMoveSendTime = 0
      }
      // if we left clicked, we can place the app
      if (this.control.pressed.MouseLeft) {
        this.data.mover = null
        this.data.position = this.root.position.toArray()
        this.data.quaternion = this.root.quaternion.toArray()
        this.data.state = {}
        this.world.network.send('entityModified', {
          id: this.data.id,
          mover: null,
          position: this.data.position,
          quaternion: this.data.quaternion,
          state: this.data.state,
        })
        this.build()
      }
    }
    // if someone else is moving the app, interpolate updates
    if (this.data.mover && this.data.mover !== this.world.network.id) {
      this.networkPos.update(delta)
      this.networkQuat.update(delta)
    }
    // script update()
    if (this.mode === Modes.ACTIVE && this.script) {
      try {
        this.emit('update', delta)
      } catch (err) {
        console.error('script update() crashed', this)
        console.error(err)
        this.crash()
        return
      }
    }
  }

  lateUpdate(delta) {
    if (this.mode === Modes.ACTIVE && this.script) {
      try {
        this.emit('lateUpdate', delta)
      } catch (err) {
        console.error('script lateUpdate() crashed', this)
        console.error(err)
        this.crash()
        return
      }
    }
  }

  onUploaded() {
    this.data.uploader = null
    this.world.network.send('entityModified', { id: this.data.id, uploader: null })
  }

  modify(data) {
    let rebuild
    if (data.hasOwnProperty('blueprint')) {
      this.data.blueprint = data.blueprint
      rebuild = true
    }
    if (data.hasOwnProperty('uploader')) {
      this.data.uploader = data.uploader
      rebuild = true
    }
    if (data.hasOwnProperty('mover')) {
      this.data.mover = data.mover
      rebuild = true
    }
    if (data.hasOwnProperty('position')) {
      this.data.position = data.position
      this.networkPos.pushArray(data.position)
    }
    if (data.hasOwnProperty('quaternion')) {
      this.data.quaternion = data.quaternion
      this.networkQuat.pushArray(data.quaternion)
    }
    if (data.hasOwnProperty('state')) {
      this.data.state = data.state
      rebuild = true
    }
    if (rebuild) {
      this.build()
    }
  }

  move() {
    this.data.mover = this.world.network.id
    this.build()
    this.world.network.send('entityModified', { id: this.data.id, mover: this.data.mover })
  }

  crash() {
    this.build(true)
  }

  destroy(local) {
    if (this.dead) return
    this.dead = true

    this.unbuild()

    this.world.entities.remove(this.data.id)
    // if removed locally we need to broadcast to server/clients
    if (local) {
      this.world.network.send('entityRemoved', this.data.id)
    }
  }

  on(name, callback) {
    if (!this.listeners[name]) {
      this.listeners[name] = new Set()
    }
    this.listeners[name].add(callback)
    if (hotEventNames.includes(name)) {
      this.hotEvents++
      this.world.setHot(this, this.hotEvents > 0)
    }
  }

  off(name, callback) {
    if (!this.listeners[name]) return
    this.listeners[name].delete(callback)
    if (hotEventNames.includes(name)) {
      this.hotEvents--
      this.world.setHot(this, this.hotEvents > 0)
    }
  }

  emit(name, a1, a2) {
    if (!this.listeners[name]) return
    for (const callback of this.listeners[name]) {
      callback(a1, a2)
    }
  }

  onWorldEvent(name, callback) {
    this.worldListeners.set(callback, name)
    this.world.events.on(name, callback)
  }

  offWorldEvent(name, callback) {
    this.worldListeners.delete(callback)
    this.world.events.off(name, callback)
  }

  clearEventListeners() {
    // local
    this.listeners = {}
    // world
    for (const [callback, name] of this.worldListeners) {
      this.world.events.off(name, callback)
    }
    this.worldListeners.clear()
  }

  onEvent(version, name, data, networkId) {
    if (this.building || version > this.blueprint.version) {
      this.eventQueue.push({ version, name, data, networkId })
    } else {
      this.emit(name, data, networkId)
    }
  }

  fetch = async (url, options = {}) => {
    try {
      const resp = await fetch(url, {
        ...options,
        signal: this.abortController.signal,
      })
      const secureResp = {
        ok: resp.ok,
        status: resp.status,
        statusText: resp.statusText,
        headers: Object.fromEntries(resp.headers.entries()),
        json: async () => await resp.json(),
        text: async () => await resp.text(),
        blob: async () => await resp.blob(),
      }
      return secureResp
    } catch (err) {
      console.error(err)
      // this.crash()
    }
  }

  getWorldProxy() {
    const entity = this
    const world = this.world
    return {
      /**
       * A unique ID for the current server or client.
       * @type {string}
       */
      get networkId() {
        return world.network.id
      },
  
      /**
       * Whether the script is currently executing on the server.
       * @type {boolean}
       */
      get isServer() {
        return world.network.isServer
      },
  
      /**
       * Whether the script is currently executing on the client.
       * @type {boolean}
       */
      get isClient() {
        return world.network.isClient
      },
  
      /**
       * Adds a node into world-space, outside of the apps local hierarchy.
       * @param {object} pNode - The node to add to world-space
       */
      add(pNode) {
        const node = getRef(pNode)
        if (!node) return
        if (node.parent) {
          node.parent.remove(node)
        }
        entity.worldNodes.add(node)
        node.activate({ world, entity, physics: true })
      },
  
      /**
       * Removes a node from world-space, outside of the apps local hierarchy.
       * @param {object} pNode - The node to remove from world-space
       */
      remove(pNode) {
        const node = getRef(pNode)
        if (!node) return
        if (node.parent) return // its not in world
        if (!entity.worldNodes.has(node)) return
        entity.worldNodes.delete(node)
        node.deactivate()
      },
  
      /**
       * Adds a node into world-space, maintaining its current world transform.
       * @param {object} pNode - The node to attach to world-space
       */
      attach(pNode) {
        const node = getRef(pNode)
        if (!node) return
        const parent = node.parent
        if (!parent) return
        parent.remove(node)
        node.matrix.copy(node.matrixWorld)
        node.matrix.decompose(node.position, node.quaternion, node.scale)
        node.activate({ world, entity, physics: true })
        entity.worldNodes.add(node)
      },
  
      /**
       * Subscribes to world events.
       * Currently only 'enter' and 'leave' are available which let you know when a player enters or leaves the world.
       * @param {string} name - The event name to subscribe to
       * @param {Function} callback - The callback function to execute when the event occurs
       */
      on(name, callback) {
        entity.onWorldEvent(name, callback)
      },
  
      /**
       * Unsubscribes from world events.
       * @param {string} name - The event name to unsubscribe from
       * @param {Function} callback - The callback function to remove
       */
      off(name, callback) {
        entity.offWorldEvent(name, callback)
      },
  
      /**
       * Emits a custom event to the world. Cannot emit internal events.
       * @param {string} name - The name of the event to emit
       * @param {*} data - The data to pass with the event
       */
      emit(name, data) {
        if (internalEvents.includes(name)) {
          return console.error(`apps cannot emit internal events (${name})`)
        }
        world.events.emit(name, data)
      },
  
      /**
       * Returns the current high-resolution timestamp.
       * @returns {number} The current timestamp in milliseconds
       */
      getTime() {
        return performance.now()
      },
  
      /**
       * Returns formatted timestamp string.
       * @param {string} [format] - Optional moment.js format string
       * @returns {string} The formatted timestamp
       */
      getTimestamp(format) {
        if (!format) return moment().toISOString()
        return moment().format(format)
      },
  
      /**
       * Sends a chat message.
       * @param {string} msg - The message to send
       * @param {boolean} [broadcast] - Whether to broadcast the message
       */
      chat(msg, broadcast) {
        if (!msg) return
        world.chat.add(msg, broadcast)
      },
  
      /**
       * Gets a player proxy object by ID.
       * @param {string} [playerId] - Optional player ID. If omitted, returns the current player
       * @returns {object|undefined} The player proxy object if found
       */
      getPlayer(playerId) {
        const player = world.entities.getPlayer(playerId || world.entities.player?.data.id)
        return player?.getProxy()
      },
    }
  }

  getAppProxy() {
    const entity = this
    const world = this.world
    let proxy = {
      /**
       * The instance ID of the current app.
       * Every app has its own unique ID that is shared across all clients and the server.
       * @returns {string} The app instance ID
       */
      get instanceId() {
        return entity.data.id
      },
  
      /**
       * The version of the app instance.
       * This number is incremented whenever the app is modified which includes 
       * but is not limited to updating scripts and models.
       * @returns {string} The app version
       */
      get version() {
        return entity.blueprint.version
      },
  
      /**
       * A plain old javascript object that you can use to store state in.
       * The servers state object is sent to all new clients that connect in their initial snapshot,
       * allowing clients to initialize correctly, eg in the right position/mode.
       * @returns {Object} The app state object
       */
      get state() {
        return entity.data.state
      },
  
      /**
       * Sets the app state object
       * @param {Object} value - The new state object
       */
      set state(value) {
        entity.data.state = value
      },
  
      /**
       * Subscribes to custom networked app events and engine update events like `update`, 
       * `fixedUpdate` and `lateUpdate`.
       * Custom networked events are received when a different client/server sends an event with `app.send(event, data)`.
       * IMPORTANT: Only subscribe to update events when they are needed. The engine is optimized 
       * to completely skip over large amounts of apps that don't need to receive update events.
       * @param {string} name - The event name to subscribe to
       * @param {Function} callback - The callback function to execute when the event occurs
       */
      on(name, callback) {
        entity.on(name, callback)
      },
  
      /**
       * Unsubscribes from custom events and update events.
       * IMPORTANT: Be sure to unsubscribe from update events when they are not needed. 
       * The engine is optimized to completely skip over large amounts of apps that don't 
       * need to receive update events.
       * @param {string} name - The event name to unsubscribe from
       * @param {Function} callback - The callback function to remove
       */
      off(name, callback) {
        entity.off(name, callback)
      },
  
      /**
       * Sends an event across the network.
       * If the caller is on the client, the event is sent to the server. The ignoreSocketId argument is a no-op here.
       * If the caller is on the server, the event is sent to all clients, with the ignoreSocketId argument 
       * allowing you to skip sending to one specific client.
       * @param {string} name - Event name
       * @param {any} data - Payload data
       * @param {number} ignoreSocketId - If on server, ignores networkId for this event sent
       */
      send(name, data, ignoreSocketId) {
        if (internalEvents.includes(name)) {
          return console.error(`apps cannot send internal events (${name})`)
        }
        // NOTE: on the client ignoreSocketId is a no-op because it can only send events to the server
        const event = [entity.data.id, entity.blueprint.version, name, data]
        world.network.send('entityEvent', event, ignoreSocketId)
      },
  
      /**
       * Finds and returns any node with the matching ID from the model the app is using.
       * If your model is made with blender, this is the object "name".
       * NOTE: Blender GLTF exporter renames objects in some cases, eg by removing spaces. 
       * Best practice is to simply name everything in UpperCamelCase with no other characters.
       * @param {string} id - The ID of the node to find
       * @returns {Node|null} The node with the matching ID or null if not found
       */
      get(id) {
        const node = entity.root.get(id)
        if (!node) return null
        return node.getProxy()
      },
  
      /**
       * Creates and returns a node of the specified name.
       * @param {string} name - The name of the node to create
       * @returns {Node} The newly created node
       */
      create(name) {
        const node = entity.createNode(name)
        return node.getProxy()
      },
  
      /**
       * Provides control to a client to respond to inputs and move the camera etc.
       * TODO: only allow on user interaction
       * TODO: show UI with a button to release()
       * @param {Object} options - Control options
       * @returns {Control} The control object
       */
      control(options) {
        // TODO: only allow on user interaction
        // TODO: show UI with a button to release()
        entity.control = world.controls.bind({
          ...options,
          priority: ControlPriorities.APP,
          object: entity,
        })
        return entity.control
      },
  
      /**
       * Sets the configuration function for the entity
       * @param {Function} fn - The configuration function
       */
      configure(fn) {
        entity.getConfig = fn
        entity.onConfigure?.(fn)
      },
  
      /**
       * Gets the configuration object from the app's blueprint.
       * @returns {Object} The app configuration object
       */
      get config() {
        return entity.blueprint.config
      },
    }
    proxy = Object.defineProperties(proxy, Object.getOwnPropertyDescriptors(this.root.getProxy())) // inherit root Node properties
    return proxy
  }
}
