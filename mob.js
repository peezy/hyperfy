app.configure([
  {
    key: 'walk',
    type: 'file',
    kind: 'emote',
    label: 'Walk',
  },
  {
    key: 'run',
    type: 'file',
    kind: 'emote',
    label: 'Run',
  },
  {
    key: 'idle',
    type: 'file',
    kind: 'emote',
    label: 'Idle',
  },
  {
    key: 'talk',
    type: 'file',
    kind: 'emote',
    label: 'Talk',
  },
  {
    key: 'death',
    type: 'file',
    kind: 'emote',
    label: 'Death',
  },
])

let deathEmote = null
if (props.death?.url) {
  deathEmote = props.death.url + '?l=0' // loop=false
}

const NETWORK_RATE = 1 / 5

// Vector and math utilities for hit calculation
const forward = new Vector3(0, 0, -1)
const npcPosition = new Vector3()
const npcDirection = new Vector3()
const hitPosition = new Vector3()
const npcQuaternion = new Quaternion()
const hitPositionArray = []

const avatar = app.get('avatar')

const collider = app.create('collider', {
  type: 'box',
  size: [0.3, 1.6, 0.3],
  height: 1.6,
})
// collider.trigger = true

// avatar.add(body)

if (world.isServer) {
  const state = app.state
  state.ready = true
  state.position = app.position.toArray()
  state.quaternion = app.quaternion.toArray()
  state.emote = 'idle'
  state.isDead = false // Add isDead state flag
  app.send('init', state)

  // Hardcoded range limit (editable in script)
  const range = 50 // Maximum distance from origin in meters

  const initialPosition = app.position.clone()

  // Controller
  const ctrl = app.create('controller', {
    position: app.position.toArray(),
    radius: 0.3,
    height: 1,
    // tag: "MOBABA"
  })
  ctrl.tag = `MOB:${app.instanceId}`
  ctrl.layer = 'environment'
  world.add(ctrl)
  // world.add(body)

  // avatar.position.set(0, 0, 0);
  // avatar.rotation.set(0, 0, 0);
  ctrl.add(avatar)
  // ctrl.add(body)
  ctrl.add(collider)
  console.log(ctrl)

  // Create a rigidbody that we can remove on death
  const body = app.create('rigidbody')
  body.type = 'kinematic'
  world.add(body)

  const q1 = new Quaternion()
  const FORWARD = new Vector3(0, 0, -1)

  // Movement variables
  const dir = new Vector3(0.7, 0, 1).normalize()
  const move = new Vector3()
  const gravity = 8
  const walkSpeed = 1.7 // Speed for walking mode
  const runSpeed = 5.0 // Faster speed for running mode

  // Direction change variables
  let frameCounter = 0
  let nextDirectionChange = 180 // Starting interval
  const minTurnInterval = 120 // ~2 seconds
  const maxTurnInterval = 300 // ~5 seconds
  let directionIndex = 0
  const directionAngles = [
    0,
    Math.PI / 4,
    Math.PI / 2,
    (3 * Math.PI) / 4,
    Math.PI,
    (5 * Math.PI) / 4,
    (3 * Math.PI) / 2,
    (7 * Math.PI) / 4,
  ]

  // Action variables
  let action = 'idle' // 'walk', 'run', 'idle', or 'talk'
  let previousAction = 'idle'
  let actionCounter = 0
  const idleDuration = 450 // ~7.5 seconds at 60 FPS
  const talkDuration = 300 // ~5 seconds at 60 FPS

  let isDead = false

  // Pseudo-random sequence for variation
  let seed = 12345
  function pseudoRandom() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff // Normalize to 0-1
  }

  // Function to set direction based on pre-defined angles
  function updateDirection() {
    const theta = directionAngles[directionIndex]
    dir.set(Math.cos(theta), 0, Math.sin(theta)).normalize()
    directionIndex = (directionIndex + 1) % directionAngles.length
    nextDirectionChange = minTurnInterval + Math.floor(pseudoRandom() * (maxTurnInterval - minTurnInterval))
  }

  // Function to add slight drift to direction
  function driftDirection(delta) {
    const driftAmount = 0.1 * delta
    const driftAngle = pseudoRandom() * driftAmount - driftAmount / 2
    const newX = dir.x * Math.cos(driftAngle) - dir.z * Math.sin(driftAngle)
    const newZ = dir.x * Math.sin(driftAngle) + dir.z * Math.cos(driftAngle)
    dir.set(newX, 0, newZ).normalize()
  }

  // Function to check range and adjust direction if exceeded
  function checkRangeAndAdjust() {
    const currentPosition = ctrl.position
    const distanceFromOrigin = currentPosition.distanceTo(initialPosition)

    if (distanceFromOrigin > range) {
      // Turn back toward the origin
      dir.subVectors(initialPosition, currentPosition).normalize()
      dir.y = 0
      nextDirectionChange = frameCounter + 60 // Force direction change in ~1 second
    }
  }

  // Function to update NPC action and animation
  function updateAction() {
    if (isDead) return
    if (action === 'walk' || action === 'run') {
      if (frameCounter >= nextDirectionChange) {
        updateDirection()
        frameCounter = 0
        const rand = pseudoRandom()
        if (rand < 0.2) {
          // 20% chance to idle
          action = 'idle'
          actionCounter = 0
          avatar.emote = props.idle?.url
        } else if (rand < 0.3) {
          // 10% chance to talk (20% to 30%)
          action = 'talk'
          actionCounter = 0
          avatar.emote = props.talk?.url
        } else if (rand < 0.5 && action === 'walk') {
          // 20% chance to switch to running (30% to 50%)
          action = 'run'
          actionCounter = 0
          avatar.emote = props.run?.url
        } else if (rand < 0.7 && action === 'run') {
          // 20% chance to switch to walking (50% to 70%)
          action = 'walk'
          actionCounter = 0
          avatar.emote = props.walk?.url
        }
      }
    } else if (action === 'idle' && actionCounter >= idleDuration) {
      action = 'walk' // Default back to walking after idle
      actionCounter = 0
      avatar.emote = props.walk?.url
    } else if (action === 'talk' && actionCounter >= talkDuration) {
      action = 'walk' // Default back to walking after talking
      actionCounter = 0
      avatar.emote = props.walk?.url
    }

    // Don't update animation if attacking or if action hasn't changed
    if (!isDead && previousAction !== action) {
      avatar.emote = props[action]?.url
      previousAction = action
    }
  }

  let health = 150
  world.on(app.instanceId, (args, _) => {
    console.log(health, health > 0, health <= 0)
    if (health < 0) return
    health -= args[0]
    if (health <= 0) {
      // Handle death directly instead of emitting event
      handleMobDeath()
    }
  })

  // Function to handle death on the server
  function handleMobDeath() {
    console.log('handling mob death')
    isDead = true
    state.isDead = true
    avatar.emote = deathEmote + '?l=0' // loop=false

    // Remove rigidbody on death
    world.remove(body)

    // Send updated state to clients
    app.send('dead', deathEmote)
    app.send('state', state)
  }

  let elapsed = 0
  app.on('fixedUpdate', delta => {
    frameCounter++
    actionCounter++

    // Skip movement logic if dead
    if (!isDead) {
      driftDirection(delta)
      checkRangeAndAdjust()

      // Update action and animations
      updateAction()

      // Calculate and apply movement
      if (action === 'walk' || action === 'run') {
        move.copy(dir)
        move.y -= gravity
        const speed = action === 'run' ? runSpeed : walkSpeed
        move.multiplyScalar(speed * delta)
        ctrl.move(move)
      } else {
        // Idle or talking: only apply gravity
        move.set(0, -gravity, 0).multiplyScalar(delta)
        ctrl.move(move)
      }

      // Update orientation to match movement direction
      q1.setFromUnitVectors(FORWARD, dir)
      avatar.quaternion.copy(q1)
    } else {
      // Still apply gravity for the dead mob, but don't apply any horizontal movement
      move.set(0, -gravity, 0).multiplyScalar(delta)
      ctrl.move(move)
    }

    // Send network updates
    elapsed += delta

    // Only update position if not dead
    if (elapsed > NETWORK_RATE) {
      app.send('move', [ctrl.position.toArray(), avatar.quaternion.toArray()])
      app.send('emote', action)
      app.send('state', state)
      elapsed = 0
    }
  })
}

if (world.isClient) {
  if (app.state.ready) {
    init(app.state)
  } else {
    avatar.active = false
    app.on('init', init)
  }

  function init(state) {
    const localPlayer = world.getPlayer()
    avatar.active = true
    world.add(avatar)

    // Define isDead at the top of the function
    let isDead = !!state.isDead

    // Create rigidbody only if not dead
    let body = null
    if (!isDead) {
      body = app.create('rigidbody')
      body.type = 'kinematic'
      body.add(collider)
      world.add(body)
    }

    avatar.position.fromArray(state.position)
    avatar.quaternion.fromArray(state.quaternion)

    if (body) {
      body.setPosition(avatar.position)
    }

    // Set proper emote based on state
    if (isDead) {
      // If the mob is already dead when client connects, we'll wait for emote
      console.log('Connected to already dead mob')
      // if (health <= 0) app.emit('mobDeath', app.instanceId)
      avatar.emote = deathEmote
    } else {
      avatar.emote = props[state.emote]?.url
    }

    let targetPos = new Vector3()
    let targetQua = new Quaternion()

    app.on('move', ([pos, qua]) => {
      targetPos.fromArray(pos)
      targetQua.fromArray(qua)
    })

    app.on('emote', emote => {
      if (isDead) return
      avatar.emote = props[emote]?.url
    })

    app.on('dead', url => {
      console.log('received dead')
      avatar.emote = url || deathEmote // Fall back to props.death if url is not provided
      isDead = true

      // Remove rigidbody on client side as well when death occurs
      if (body) {
        world.remove(body)
        body = null
      }
    })

    // Handle state updates
    app.on('state', newState => {
      // Update isDead state if it changes
      if (newState.isDead !== isDead) {
        isDead = newState.isDead

        // If newly dead, play death animation
        if (isDead) {
          avatar.emote = deathEmote

          // Remove rigidbody if the mob is now dead
          if (body) {
            world.remove(body)
            body = null
          }
        }
      }
    })

    const lerpSpeed = 2 // higher = faster interpolation
    app.on('update', delta => {
      const lerpFactor = 1 - Math.pow(0.1, delta * lerpSpeed)
      avatar.position.lerp(targetPos, lerpFactor)
      avatar.quaternion.slerp(targetQua, lerpFactor)

      // Only update rigidbody position if it exists
      if (body) {
        body.setPosition(avatar.position)
      }
    })
  }
}
