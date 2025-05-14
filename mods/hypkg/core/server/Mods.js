import { System } from "../../../../src/core/systems/System.js"
import { searchPatches } from "hypkg/bin/searchPatches.js"
import { getAppliedPatches } from "hypkg/bin/getAppliedPatches.js"
import { applyPatchFromRepo } from "hypkg/bin/applyPatchFromRepo.js"


export default class Mods extends System {
  static name = 'mods'

  constructor(world) {
    super(world)
    this.patches = []
    this.appliedPatches = []
    this.loading = false
    this.applying = false
  }

  init(options) {
    console.log('Mods init')

    // Load patches when the system initializes
    this.loadPatches()
    this.loadAppliedPatches()
    
    // Setup packet handlers
    this.world.network.onModsRequestPatches = this.onModsRequestPatches.bind(this)
    this.world.network.onModsRequestAppliedPatches = this.onModsRequestAppliedPatches.bind(this)
    this.world.network.onModsApplyPatch = this.onModsApplyPatch.bind(this)
  }

  async loadPatches() {
    if (this.loading) return
    this.loading = true
    
    try {
      this.patches = await searchPatches()
      console.log('Loaded patches:', this.patches)
    } catch (err) {
      console.error('Error loading patches:', err)
    } finally {
      this.loading = false
    }
  }

  async loadAppliedPatches() {
    try {
      this.appliedPatches = await getAppliedPatches()
      console.log('Loaded applied patches:', this.appliedPatches)
    } catch (err) {
      console.error('Error loading applied patches:', err)
    }
  }

  onModsRequestPatches(socket, data) {
    console.log('Client requested patches:', socket.id)
    
    if (this.loading) {
      // If still loading, tell client to wait
      setTimeout(() => {
        if (!this.loading) {
          this.world.network.sendTo(socket.id, 'modsPatches', this.patches)
        }
      }, 1000)
      return
    }
    
    // Send patches to the requesting client
    this.world.network.sendTo(socket.id, 'modsPatches', this.patches)
  }

  onModsRequestAppliedPatches(socket, data) {
    console.log('Client requested applied patches:', socket.id)
    
    // Send applied patches to the requesting client
    this.world.network.sendTo(socket.id, 'modsAppliedPatches', this.appliedPatches)
  }

  async onModsApplyPatch(socket, data) {
    if (this.applying) {
      // Already applying a patch, send error
      this.world.network.sendTo(socket.id, 'modsApplyPatchResult', { 
        success: false,
        message: 'Another patch is currently being applied',
        patch: data
      })
      return
    }

    if (!data || !data.remote || !data.name) {
      // Invalid patch data
      this.world.network.sendTo(socket.id, 'modsApplyPatchResult', { 
        success: false,
        message: 'Invalid patch data',
        patch: data
      })
      return
    }

    this.applying = true
    console.log(`Applying patch: ${data.remote}/${data.name}`)

    try {
      // Apply the patch
      const result = await applyPatchFromRepo(data.name, data.remote)
      
      // Refresh applied patches list
      await this.loadAppliedPatches()
      
      // Send success response
      this.world.network.sendTo(socket.id, 'modsApplyPatchResult', { 
        success: true,
        message: `Successfully applied patch: ${data.remote}/${data.name}`,
        patch: data,
        result
      })
      
      // Broadcast the updated applied patches list to all clients
      this.world.network.broadcast('modsAppliedPatches', this.appliedPatches)
      
    } catch (err) {
      console.error(`Error applying patch ${data.remote}/${data.name}:`, err)
      
      // Send error response
      this.world.network.sendTo(socket.id, 'modsApplyPatchResult', {
        success: false,
        message: `Failed to apply patch: ${err.message || 'Unknown error'}`,
        patch: data
      })
    } finally {
      this.applying = false
    }
  }
}
