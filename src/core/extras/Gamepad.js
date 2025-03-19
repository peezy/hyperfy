// Gamepad button mappings for different controller types
export const GAMEPAD_BUTTON = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  SELECT: 8,
  START: 9,
  L3: 10, // Left stick press
  R3: 11, // Right stick press
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15
}

export const GAMEPAD_AXIS = {
  LEFT_STICK_X: 0,
  LEFT_STICK_Y: 1,
  RIGHT_STICK_X: 2,
  RIGHT_STICK_Y: 3
}

// Deadzone for analog sticks to prevent drift
const STICK_DEADZONE = 0.1

export class GamepadManager {
  constructor() {
    this.gamepads = new Map()
    this.listeners = new Map()
    this.connected = false
    
    // Bind event handlers
    this.handleGamepadConnected = this.handleGamepadConnected.bind(this)
    this.handleGamepadDisconnected = this.handleGamepadDisconnected.bind(this)
    
    // Add event listeners
    window.addEventListener('gamepadconnected', this.handleGamepadConnected)
    window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected)
  }

  // Add hasGamepad method
  hasGamepad(index) {
    return this.gamepads.has(index) && this.gamepads.get(index) !== null
  }

  handleGamepadConnected(event) {
    const gamepad = event.gamepad
    this.gamepads.set(gamepad.index, gamepad)
    this.connected = true
    this.emit('connect', gamepad)
  }

  handleGamepadDisconnected(event) {
    const gamepad = event.gamepad
    this.gamepads.delete(gamepad.index)
    this.connected = this.gamepads.size > 0
    this.emit('disconnect', gamepad)
  }

  update() {
    // Get the latest gamepad states
    const gamepads = navigator.getGamepads()
    
    for (const gamepad of gamepads) {
      if (!gamepad) continue
      
      // Update our stored gamepad state
      this.gamepads.set(gamepad.index, gamepad)
      
      // Process buttons
      gamepad.buttons.forEach((button, index) => {
        if (button.pressed) {
          this.emit('button', { index, gamepad, pressed: true })
        }
      })
      
      // Process axes
      const axes = gamepad.axes.map(axis => {
        // Apply deadzone
        return Math.abs(axis) < STICK_DEADZONE ? 0 : axis
      })
      
      this.emit('axes', { gamepad, axes })
    }
  }

  // Event emitter functionality
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event).add(callback)
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback)
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const callback of this.listeners.get(event)) {
        callback(data)
      }
    }
  }

  // Helper methods for getting gamepad state
  getButton(gamepadIndex, buttonIndex) {
    const gamepad = this.gamepads.get(gamepadIndex)
    if (!gamepad) return false
    return gamepad.buttons[buttonIndex]?.pressed || false
  }

  getAxis(gamepadIndex, axisIndex) {
    const gamepad = this.gamepads.get(gamepadIndex)
    if (!gamepad) return 0
    const value = gamepad.axes[axisIndex] || 0
    return Math.abs(value) < STICK_DEADZONE ? 0 : value
  }

  getStick(gamepadIndex, isRight = false) {
    const xAxis = isRight ? GAMEPAD_AXIS.RIGHT_STICK_X : GAMEPAD_AXIS.LEFT_STICK_X
    const yAxis = isRight ? GAMEPAD_AXIS.RIGHT_STICK_Y : GAMEPAD_AXIS.LEFT_STICK_Y
    
    return {
      x: this.getAxis(gamepadIndex, xAxis),
      y: this.getAxis(gamepadIndex, yAxis)
    }
  }

  destroy() {
    window.removeEventListener('gamepadconnected', this.handleGamepadConnected)
    window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected)
    this.listeners.clear()
    this.gamepads.clear()
  }
} 