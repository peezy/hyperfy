import { System } from "../../../../src/core/systems/System.js"

export default class Mods extends System {
  static name = 'mods'

  constructor(world) {
    super(world)
    this.patches = []
    this.appliedPatches = []
    this.lastRequestTime = 0
    this.requestInProgress = false
    this.applyingPatch = null
  }

  init(options) {
    console.log('Client Mods init')
    
    // Setup packet handlers
    this.world.network.onModsPatches = this.onModsPatches.bind(this)
    this.world.network.onModsAppliedPatches = this.onModsAppliedPatches.bind(this)
    this.world.network.onModsApplyPatchResult = this.onModsApplyPatchResult.bind(this)
    
    // Listen for sidebar requests
    this.world.on('mods:request-patches', this.requestPatches.bind(this))
    this.world.on('mods:request-applied-patches', this.requestAppliedPatches.bind(this))
    this.world.on('mods:apply-patch', this.applyPatch.bind(this))
    
    // Share initial data if we have it already
    if (this.patches.length > 0) {
      setTimeout(() => {
        this.world.emit('mods:patches', this.patches)
      }, 500)
    }
    
    if (this.appliedPatches.length > 0) {
      setTimeout(() => {
        this.world.emit('mods:applied-patches', this.appliedPatches)
      }, 500)
    }
  }
  
  requestPatches() {
    // Prevent request spam - only allow requests every 5 seconds
    const now = Date.now()
    if (this.requestInProgress || now - this.lastRequestTime < 5000) {
      // If we have patches already, emit them immediately instead of requesting again
      if (this.patches.length > 0) {
        console.log('Using cached patches instead of requesting new ones')
        this.world.emit('mods:patches', this.patches)
      }
      return
    }
    
    console.log('Requesting patches from server')
    this.requestInProgress = true
    this.lastRequestTime = now
    this.world.network.send('modsRequestPatches', {})
  }
  
  requestAppliedPatches() {
    console.log('Requesting applied patches from server')
    this.world.network.send('modsRequestAppliedPatches', {})
  }
  
  applyPatch(patch) {
    if (this.applyingPatch) {
      this.world.emit('mods:apply-patch-result', {
        success: false,
        message: 'Already applying another patch',
        patch
      })
      return
    }
    
    if (!patch || !patch.remote || !patch.name) {
      this.world.emit('mods:apply-patch-result', {
        success: false,
        message: 'Invalid patch data',
        patch
      })
      return
    }
    
    this.applyingPatch = patch
    this.world.emit('mods:applying-patch', patch)
    
    console.log(`Requesting to apply patch: ${patch.remote}/${patch.name}`)
    this.world.network.send('modsApplyPatch', patch)
  }
  
  onModsPatches(data) {
    console.log('Received patches from server:', Array.isArray(data) ? data.length : 'none')
    this.requestInProgress = false
    this.patches = data || []
    
    // Notify listeners (like the sidebar) that patches are available
    this.world.emit('mods:patches', this.patches)
  }
  
  onModsAppliedPatches(data) {
    console.log('Received applied patches from server:', Array.isArray(data) ? data.length : 'none')
    this.appliedPatches = data || []
    
    // Notify listeners that applied patches are available
    this.world.emit('mods:applied-patches', this.appliedPatches)
  }
  
  onModsApplyPatchResult(data) {
    console.log('Received apply patch result:', data)
    this.applyingPatch = null
    
    // Notify listeners of the result
    this.world.emit('mods:apply-patch-result', data)
    
    // If successful, request the updated list of applied patches
    if (data.success) {
      this.requestAppliedPatches()
    }
  }
} 