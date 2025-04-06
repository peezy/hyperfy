const code = new Vector3(-9.359, 3.164, -5.004)
const lobby = new Vector3(-16.2056, 435.0987, 62.9206)
const game = new Vector3(-38.4927, 5.877, -29.1918)

const originalPosition = new Vector3().copy(app.position)
const originalRotation = new Quaternion().copy(app.quaternion)

const MESH_NAME = 'plasma_bullet'

const animations = [
  'idle',
  'run',
  'walk',
  'jump',
  'walkBack',
  'walkLeft',
  'walkRight',
  'sprintLeft',
  'sprintRight',
  'walkBackLeft',
  'walkBackRight',
  'sprintBackRight',
  'sprintBackLeft',
  'walkForwardLeft',
  'walkForwardRight',
  'sprintForwardRight',
  'sprintForwardLeft',
  'sprintBackward',
  'death',
]
const audioFiles = ['machineGunFire']
const models = ['plasmaBullets']

const animationConfig = animations.map(animation => {
  const label = animation.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
  return {
    key: animation,
    type: 'file',
    kind: 'emote',
    label: `${label} Animation`,
  }
})

const audioConfig = audioFiles.map(file => {
  const label = file.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
  return {
    key: file,
    type: 'file',
    kind: 'audio',
    label: `${label} Audio`,
  }
})

const modelsConfig = models.map(model => {
  const label = model.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
  return {
    key: model,
    type: 'file',
    kind: 'model',
    label: `${label} Model`,
  }
})

app.configure([...animationConfig, ...audioConfig, ...modelsConfig])

let muzzleFlashMesh = null
let plasmaBulletsMesh = null
const loadModels = async () => {
  const meshLoad = await world.load('model', props.plasmaBullets?.url)
  if (!meshLoad) console.log('wrong plasma bullets mesh model or rename mesh')
  plasmaBulletsMesh = meshLoad.get(MESH_NAME)
  if (!plasmaBulletsMesh) return console.log('wrong plasma bullets model or rename mesh')
  muzzleFlashMesh = app.get('muzzle_flash')
  if (!muzzleFlashMesh) return console.log('wrong gun model or rename mesh')
  muzzleFlashMesh.active = false
  app.send('loaded')
}
loadModels()

if (world.isClient) {
  let overheatStatus
  let pulseTime = 0
  let isPulsing = false
  let dead = false
  const cloneLifetimeMs = 500
  let activeClones = []
  let lastRemoteShotTime = 0

  const OVERHEAT_CONFIG = {
    width: 80,
    height: 10,
    padding: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    overheatColor: 'rgba(255, 50, 50, 0.9)',
    maxOverheat: 100,
    currentOverheat: 0,
    pulseSpeed: 5,
    pulseMinOpacity: 0.4,
    pulseMaxOpacity: 0.9,
  }

  const overheatBarContainer = app.create('ui', {
    width: OVERHEAT_CONFIG.width,
    height: OVERHEAT_CONFIG.height,
    alignSelf: 'center',
    position: [0.5, 1, 0],
    offset: [0, -35, 0],
    space: 'screen',
    anchorPoint: [0.5, 1],
    backgroundColor: OVERHEAT_CONFIG.backgroundColor,
    borderRadius: OVERHEAT_CONFIG.borderRadius,
    padding: OVERHEAT_CONFIG.padding,
    pointerEvents: false,
  })

  const overheatFill = app.create('uiview', {
    width: 0,
    height: OVERHEAT_CONFIG.height - OVERHEAT_CONFIG.padding * 2,
    backgroundColor: OVERHEAT_CONFIG.overheatColor,
    borderRadius: OVERHEAT_CONFIG.borderRadius / 2,
    pointerEvents: false,
  })
  overheatBarContainer.add(overheatFill)

  const dropIndicatorContainer = app.create('ui', {
    width: 120,
    height: 20,
    alignSelf: 'center',
    position: [0.5, 1, 0],
    offset: [0, -70, 0],
    space: 'screen',
    anchorPoint: [0.5, 1],
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    padding: 2,
    pointerEvents: false,
    active: false,
  })

  const dropIndicatorFill = app.create('uiview', {
    width: 0,
    height: 16,
    backgroundColor: 'rgba(150, 30, 30, 0.9)',
    borderRadius: 6,
    pointerEvents: false,
  })

  const dropIndicatorText = app.create('uitext', {
    value: 'Leaving arena...',
    fontSize: 10,
    color: 'white',
    alignSelf: 'center',
    position: [0.5, 0.5, 0],
    anchorPoint: [0.5, 0.5],
    textAlign: 'center',
  })

  dropIndicatorContainer.add(dropIndicatorFill)
  dropIndicatorContainer.add(dropIndicatorText)

  app.on('overheatStatus', data => {
    overheatStatus = data
    updateOverheat(data.overheat, data.coolingDown)
  })

  function updateOverheat(newOverheat, coolingDown) {
    const overheatValue = Math.max(0, Math.min(newOverheat, OVERHEAT_CONFIG.maxOverheat))
    OVERHEAT_CONFIG.currentOverheat = overheatValue

    const fillWidth =
      (overheatValue / OVERHEAT_CONFIG.maxOverheat) * (OVERHEAT_CONFIG.width - OVERHEAT_CONFIG.padding * 2)
    overheatFill.width = fillWidth

    if (overheatValue < 33) {
      overheatFill.backgroundColor = 'rgba(255, 200, 200, 0.9)' // Very light red
    } else if (overheatValue < 66) {
      overheatFill.backgroundColor = 'rgba(255, 120, 120, 0.9)' // Medium red
    } else {
      overheatFill.backgroundColor = 'rgba(255, 30, 30, 0.9)' // Intense red
    }

    isPulsing = coolingDown
    if (coolingDown) {
      pulseTime = 0
      overheatBarContainer.borderWidth = 1
      overheatBarContainer.borderColor = 'rgba(255, 100, 100, 0.8)'
    } else {
      overheatBarContainer.borderWidth = 0
    }
  }

  function updatePulseAnimation(delta) {
    if (isPulsing) {
      pulseTime += delta * OVERHEAT_CONFIG.pulseSpeed
      const pulseOpacity =
        OVERHEAT_CONFIG.pulseMinOpacity +
        (Math.sin(pulseTime) * 0.5 + 0.5) * (OVERHEAT_CONFIG.pulseMaxOpacity - OVERHEAT_CONFIG.pulseMinOpacity)
      const pulseColor = `rgba(255, 30, 30, ${pulseOpacity})`
      overheatFill.backgroundColor = pulseColor
    }
  }

  const v1 = new Vector3()
  const v2 = new Vector3()
  const v3 = new Vector3()
  const v4 = new Vector3()

  const AUDIO_POOL_SIZE = 3
  let audioPool = []
  let currentAudioIndex = 0

  for (let i = 0; i < AUDIO_POOL_SIZE; i++) {
    audioPool[i] = app.create('audio', {
      src: props.machineGunFire?.url,
      volume: 0.75,
      group: 'sfx',
      spatial: true,
      rolloffFactor: 0.1,
    })
    app.add(audioPool[i])
  }

  function playNextAudio() {
    currentAudioIndex = (currentAudioIndex + 1) % AUDIO_POOL_SIZE
    audioPool[currentAudioIndex].stop()
    audioPool[currentAudioIndex].play()
    return audioPool[currentAudioIndex]
  }

  const renderBullet = hitPoint => {
    if (!plasmaBulletsMesh) {
      return;
    }
    const clone = plasmaBulletsMesh.clone()
    clone.position.copy(hitPoint)
    world.add(clone)
    activeClones.push({
      clone: clone,
      lifetime: cloneLifetimeMs / 1000,
      isMain: true,
    })

    const localPlayer = world.getPlayer(localId)
    const distanceToPlayer = localPlayer.position.distanceTo(hitPoint)

    if (distanceToPlayer <= 20) {
      for (let i = 0; i < 10; i++) {
        const splatClone = plasmaBulletsMesh.clone()
        splatClone.position.copy(hitPoint)
        splatClone.scale.multiplyScalar(0.5 + Math.random() * 0.5) // Random sizes
        world.add(splatClone)

        const velocity = new Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5)

        activeClones.push({
          clone: splatClone,
          lifetime: cloneLifetimeMs / 1000,
          velocity: velocity,
          isMain: false,
        })
      }
    }
  }

  let forwardVec = new Vector3(0, 0, -1)
  let currentEffect, holder
  if (!holder && app.state.owner) holder = world.getPlayer(app.state.owner)

  if (app.state.lastPosition && !holder) {
    app.position.set(app.state.lastPosition.x, app.state.lastPosition.y, app.state.lastPosition.z)
    if (app.state.lastQuaternion) {
      app.quaternion.set(
        app.state.lastQuaternion.x,
        app.state.lastQuaternion.y,
        app.state.lastQuaternion.z,
        app.state.lastQuaternion.w
      )
    }
  }

  const { id: localId } = world.getPlayer()
  const controls = app.control()

  let xKeyHoldStartTime = 0
  const xKeyHoldRequired = 2.0
  let isHoldingXKey = false

  const action = app.create('action', {
    label: 'Pick Up',
    distance: 3,
    onTrigger: ({ playerId }) => {
      action.active = false
      app.send('signatureRequest', playerId)
    },
  })
  if (holder) action.active = false
  app.on('toggleAction', bool => action.active = bool)
  app.on('signatureRequest', async (msg) => {
    const solana = app.solana()
    const { success, signature } = await solana.sign(msg)
    if (!success) {
      app.send('toggleAction', true)
      action.active = true;
      return
    }

    app.send('signature', [signature, msg])
  })

  app.on('taken', playerId => {
    holder = world.getPlayer(playerId)
    action.active = false

    if (localId == playerId) {
      world.add(overheatBarContainer)
      holder.setZoomEnabled(false)
      holder.setZoom(1.5)
      holder.setDoubleJumpEnabled(false)

      isHoldingXKey = false
      xKeyHoldStartTime = 0
      if (dropIndicatorContainer.active) {
        world.remove(dropIndicatorContainer)
        dropIndicatorContainer.active = false
        dropIndicatorFill.width = 0
        dropIndicatorFill.backgroundColor = 'rgba(50, 150, 255, 0.9)'
      }
    }
  })

  app.on('dropped', () => {
    if (dropIndicatorContainer.active) {
      world.remove(dropIndicatorContainer)
      dropIndicatorContainer.active = false
      dropIndicatorFill.width = 0
      dropIndicatorFill.backgroundColor = 'rgba(50, 150, 255, 0.9)'
    }

    holder = undefined
    action.active = true
    currentEffect?.cancel();
  })

  app.on('remoteShot', ({ hitPoint, shooter }) => {
    playNextAudio()
    v3.set(hitPoint[0], hitPoint[1], hitPoint[2])
    renderBullet(v3)
    if (shooter === holder.id) {
      muzzleFlashMesh.active = true
      lastRemoteShotTime = world.getTime()
    }
  })

  app.on('death', ({ playerId, isDead }) => {
    if (!holder || holder.id !== playerId) return
    dead = isDead
  })

  controls.keyX.onPress = () => {
    if (!holder || holder.id !== localId) return
    xKeyHoldStartTime = world.getTime()
    isHoldingXKey = true
  }

  controls.keyX.onRelease = () => {
    if (!holder || holder.id !== localId) return
    isHoldingXKey = false
  }

  app.add(action)

  const FIRE_RATE = 0.1
  let shootCooldown = 0
  let animationState = 'idle'
  let isZoomedIn = false
  let isDropping = false

  const ZOOM_CONFIG = {
    normalZoom: 1.5,
    scopedZoom: 0.5,
    zoomInDuration: 0.15,
    zoomOutDuration: 0.45,
  }

  let zoomTransition = {
    active: false,
    startValue: ZOOM_CONFIG.normalZoom,
    targetValue: ZOOM_CONFIG.scopedZoom,
    duration: ZOOM_CONFIG.duration,
    elapsed: 0,
    easeInOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  }

  const onShoot = () => {
    const { quaternion: camQuat, position: camPos } = controls.camera
    v1.copy(forwardVec).applyQuaternion(camQuat).normalize()
    const hit = world.raycast(camPos, v1, Infinity)
    if (!hit) {
      const farPoint = camPos.clone().addScaledVector(v1, 1000)
      playNextAudio()
      return app.send('shoot', {
        shooter: holder.id,
        shooterPosition: holder.position.toArray(),
        shooterQuaternion: holder.quaternion.toArray(),
        shooterHeight: holder.height,
        hitPoint: farPoint.toArray(),
        hitId: null,
      })
    }
    const originalHitPoint = hit.point.clone()
    
    const offsetY = holder.height - 0.35
    const offsetZ = -0.275
    // offset vector
    v2.set(0, offsetY, offsetZ)
    v2.applyQuaternion(holder.quaternion)
    // 
    v1.copy(holder.position).add(v2)
    v4.copy(originalHitPoint).sub(v1).normalize()
    
    // Removed the offsetHead calculation with addScaledVector
    const headToHitDistance = v1.distanceTo(originalHitPoint)

    // Use v1 directly as the raycast origin instead of offsetHead
    // and use the full distance without subtracting any values
    const obstacleBetween = world.raycast(v1, v4, headToHitDistance)
    let hasObstacle = obstacleBetween && obstacleBetween.distance < headToHitDistance
    let isPlayerObstacle = false
    if (hasObstacle) {
      if (obstacleBetween.playerId === holder.id) {
        hasObstacle = false
        isPlayerObstacle = true
      }
    }
    
    // send the original hit point for server to check against server player position
    // we render the obstacle point to simulate
    app.send('shoot', {
      shooter: holder.id,
      shooterPosition: holder.position.toArray(),
      shooterQuaternion: holder.quaternion.toArray(),
      shooterHeight: holder.height,
      hitPoint: originalHitPoint.toArray(),
      // TODO: since we raycasted twice, hit.playerId might be innacurate and overwritten. might need to clone
      hitId: (hit.playerId && hit.playerId !== holder.id) ? hit.playerId : null,
      obstaclePoint: hasObstacle ? obstacleBetween.point : null,
    })
    renderBullet(hasObstacle ? obstacleBetween.point : originalHitPoint)
    playNextAudio()
    if (muzzleFlashMesh) muzzleFlashMesh.active = true
  }

  const onScopeIn = () => {
    if (isZoomedIn) return
    zoomTransition = {
      active: true,
      startValue: ZOOM_CONFIG.normalZoom,
      targetValue: ZOOM_CONFIG.scopedZoom,
      duration: ZOOM_CONFIG.zoomInDuration,
      elapsed: 0,
      easeInOutQuad: t => 1 - Math.pow(1 - t, 3),
    }
    isZoomedIn = true
  }

  const onScopeOut = () => {
    if (!isZoomedIn) return
    zoomTransition = {
      active: true,
      startValue: ZOOM_CONFIG.scopedZoom,
      targetValue: ZOOM_CONFIG.normalZoom,
      duration: ZOOM_CONFIG.zoomOutDuration,
      elapsed: 0,
      easeInOutQuad: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    }
    isZoomedIn = false
  }

  controls.mouseRight.onRelease = () => {
    if (!holder || holder.id !== localId) return
    onScopeOut()
  }

  app.on('update', delta => {
    if (muzzleFlashMesh && muzzleFlashMesh.active && lastRemoteShotTime > 0) {
      const timeSinceLastShot = world.getTime() - lastRemoteShotTime
      if (timeSinceLastShot > 0.1) {
        muzzleFlashMesh.active = false
        lastRemoteShotTime = 0
      }
    }

    if (isHoldingXKey && holder && holder.id === localId) {
      if (!dropIndicatorContainer.active) {
        world.add(dropIndicatorContainer)
        dropIndicatorContainer.active = true
      }

      const holdDuration = world.getTime() - xKeyHoldStartTime
      const holdProgress = Math.min(holdDuration / xKeyHoldRequired, 1)
      dropIndicatorFill.width = holdProgress * 116 // 120 - 2*2 padding

      if (holdProgress >= 1) {
        dropIndicatorFill.backgroundColor = 'rgba(180, 30, 30, 0.9)' // Change to brighter red when ready

        if (!isDropping) {
          isDropping = true
          world.remove(overheatBarContainer)
          holder.setZoomEnabled(true)
          holder.setDoubleJumpEnabled(true)

          app.send('dropped', {
            playerId: localId,
            position: {
              x: app.position.x,
              y: app.position.y,
              z: app.position.z,
            },
            quaternion: {
              x: app.quaternion.x,
              y: app.quaternion.y,
              z: app.quaternion.z,
              w: app.quaternion.w,
            },
          })

          holder = undefined
          currentEffect.cancel()
          action.active = true
          dead = false
          isHoldingXKey = false
        }
      }
    } else if (dropIndicatorContainer.active) {
      world.remove(dropIndicatorContainer)
      dropIndicatorContainer.active = false
      dropIndicatorFill.width = 0
      dropIndicatorFill.backgroundColor = 'rgba(150, 30, 30, 0.9)'
      isDropping = false
    }

    const clonesToKeep = []

    for (let i = 0; i < activeClones.length; i++) {
      const cloneData = activeClones[i]
      cloneData.lifetime -= delta

      if (cloneData.lifetime <= 0) {
        world.remove(cloneData.clone)
      } else {
        if (!cloneData.isMain && cloneData.velocity) {
          cloneData.clone.position.addScaledVector(cloneData.velocity, delta)

          cloneData.velocity.y -= 9.8 * delta

          const scaleDown = 1 - (delta / (cloneLifetimeMs / 1000)) * 2
          cloneData.clone.scale.multiplyScalar(Math.max(0.01, scaleDown))
        }

        clonesToKeep.push(cloneData)
      }
    }

    activeClones = clonesToKeep

    if (!holder?.id || localId !== holder?.id) return

    updatePulseAnimation(delta)
    if (shootCooldown <= 0 && muzzleFlashMesh) {
      muzzleFlashMesh.active = false
    }
    if (shootCooldown > 0) {
      shootCooldown = Math.max(0, shootCooldown - delta)
    }

    if (zoomTransition.active) {
      zoomTransition.elapsed += delta
      const progress = Math.min(zoomTransition.elapsed / zoomTransition.duration, 1)
      const easedProgress = zoomTransition.easeInOutQuad(progress)
      const zoomDifference = zoomTransition.targetValue - zoomTransition.startValue
      holder.setZoom(zoomTransition.startValue + zoomDifference * easedProgress)
      if (progress >= 1) zoomTransition.active = false
    }

    if (dead) {
      if (animationState !== 'death') {
        animationState = 'death'
        if (currentEffect) currentEffect.cancel()
        currentEffect = holder.applyEffect({
          emote: `${props.death.url}?l=0`,
          freeze: true,
          duration: 5,
          snare: 1,
        })

        if (isZoomedIn) {
          onScopeOut()
        }
      }
      return
    }

    const { keyW, keyA, keyS, keyD, keyF, shiftLeft, mouseLeft, mouseRight } = controls
    const isJumping = holder.isInAir()
    const forward = keyW.down
    const backward = keyS.down
    const left = keyA.down
    const right = keyD.down
    const isRunning = shiftLeft.down
    const shoot = mouseLeft.down || keyF.down
    const scope = mouseRight.down

    let newAnimationState = 'idle'

    if (isJumping) {
      newAnimationState = 'jump'
    } else if (forward && left) {
      newAnimationState = isRunning ? 'sprintForwardLeft' : 'walkForwardLeft'
    } else if (forward && right) {
      newAnimationState = isRunning ? 'sprintForwardRight' : 'walkForwardRight'
    } else if (backward && left) {
      newAnimationState = isRunning ? 'sprintBackLeft' : 'walkBackLeft'
    } else if (backward && right) {
      newAnimationState = isRunning ? 'sprintBackRight' : 'walkBackRight'
    } else if (forward) {
      newAnimationState = isRunning ? 'run' : 'walk'
    } else if (backward) {
      newAnimationState = isRunning ? 'sprintBackward' : 'walkBack'
    } else if (left) {
      newAnimationState = isRunning ? 'sprintLeft' : 'walkLeft'
    } else if (right) {
      newAnimationState = isRunning ? 'sprintRight' : 'walkRight'
    }

    if (newAnimationState !== animationState) {
      animationState = newAnimationState
      if (currentEffect) currentEffect.cancel()
      currentEffect = holder.applyEffect({
        emote: props[animationState].url,
        turn: true,
      })
    }

    if (overheatStatus?.coolingDown === true) return
    if (shoot && shootCooldown <= 0 && !isRunning) {
      onShoot()
      shootCooldown = FIRE_RATE
    }

    if (scope && !isZoomedIn && !isRunning && !isJumping) {
      onScopeIn()
    } else if (!scope && isZoomedIn) {
      onScopeOut()
    }

    if (isZoomedIn && (isRunning || isJumping)) onScopeOut()
  })

  app.on('lateUpdate', () => {
    if (!holder) {
      if (!app.position.equals(originalPosition) || !app.rotation.equals(originalRotation)) {
        app.position.copy(originalPosition)
        app.quaternion.copy(originalRotation)
        return
      }
      return
    }
    if (!holder) return
    const matrix = holder.getBoneTransform('leftIndexProximal')
    if (matrix) {
      app.position.setFromMatrixPosition(matrix)
      app.quaternion.setFromRotationMatrix(matrix)
    }
  })
}

if (world.isServer) {
  const FIRE_RATE = 0.1
  const pendingShots = []
  let lastShotTime = 0
  const OVERHEAT_PER_SHOT = 7.5
  const MAX_OVERHEAT = 100
  const MIN_OVERHEAT = 0
  const RECOVER_PER_SECOND = 25
  const COOLDOWN_TIME = 2
  const OVERHEAT_UPDATES_PER_SECOND = 5
  const state = app.state

  if (state.overheat === undefined) {
    state.overheat = MIN_OVERHEAT
    state.coolingDown = false
    state.cooldownTimer = 0
    state.overheatUpdateCounter = 0
    state.lastShotTime = 0
  }

  app.on('shoot', ({ shooter, shooterHeight, hitPoint, hitId, obstaclePoint }) => {
    if (!state.owner || state.coolingDown) {
      return;
    }

    const serverTime = world.getTime();
    
    if (pendingShots.length >= 3) {
      pendingShots.shift();
    }
    pendingShots.push({ shooter, shooterHeight, hitPoint, hitId, serverTime });
    state.overheat += OVERHEAT_PER_SHOT;

    if (state.overheat >= MAX_OVERHEAT) {
      state.overheat = MAX_OVERHEAT;
      state.coolingDown = true;
      state.cooldownTimer = COOLDOWN_TIME;
      
      pendingShots.length = 0;

      app.send('overheatStatus', {
        overheat: state.overheat,
        coolingDown: state.coolingDown,
      });

      return;
    }

    app.send('overheatStatus', {
      overheat: state.overheat,
      coolingDown: false,
    });
  })

  let nonce = null
  app.on('signatureRequest', (_, pid) => {
    if (state.owner) return
    app.send('toggleAction', false, pid)
    nonce = `${app.instanceId}${pid}${world.getTime() | 0}`
    const msg = `login to pew.bet\n${nonce}`

    app.sendTo(pid, 'signatureRequest', msg)

  })

  app.on('signature', async ([sig, msg], playerId) => {
    try {
      const player = world.getPlayer(playerId)
      if (state.owner || !player.solana || msg.split('\n')[1] !== nonce) throw new Error("invalid!")

      const solana = app.solana()
      const { isValid } = await solana.validateSignature(player.solana, msg, sig)
      if (!isValid) throw new Error("invalid signature!")

      // player.teleport(game)
      app.emit('joinRequest', [playerId, app.instanceId])

    } catch (e) {
      console.error(e)
      app.send('toggleAction', true)
    }
  })

  world.on('joinFailed', ([gunId, errorMsg]) => {
    if(gunId !== app.instanceId) return;

    app.send('toggleAction', true)
  })

  world.on('join', ([playerId, gunId]) => {
    if(gunId !== app.instanceId) return;

    if (playerId !== state.previousOwner) {
      state.overheat = MIN_OVERHEAT
      state.coolingDown = false
      state.cooldownTimer = 0
    }

    //i guess we make them sign here? and send signature to server.

    state.owner = playerId
    state.lastPosition = undefined
    state.lastQuaternion = undefined

    app.send('taken', playerId)
    app.send('overheatStatus', {
      overheat: state.overheat,
      coolingDown: state.coolingDown,
    })
  })

  // app.on('taken', ({ playerId }) => {
  //   const player = world.getPlayer(playerId)
  //   if (playerId !== state.previousOwner) {
  //     state.overheat = MIN_OVERHEAT
  //     state.coolingDown = false
  //     state.cooldownTimer = 0
  //   }

  //   //i guess we make them sign here? and send signature to server.

  //   state.owner = playerId
  //   state.lastPosition = undefined
  //   state.lastQuaternion = undefined

  //   app.send('taken', playerId)
  //   app.send('overheatStatus', {
  //     overheat: state.overheat,
  //     coolingDown: state.coolingDown,
  //   })
  //   player.teleport(game)
  //   app.emit('join', playerId)
  // })

  app.on('toggleAction', (bool, pid) => {
    if (bool && state.owner) return; // if trying to enable and we have owner, return
    if (!bool && !state.owner) return; // if trying to disable and we have no owner, return
    app.send('toggleAction', bool, pid)
  })

  function handlePlayerRelease(playerId, position, quaternion) {
    state.previousOwner = playerId
    state.owner = undefined
    state.lastPosition = position
    state.lastQuaternion = quaternion
    app.send('dropped')
    app.position.copy(originalPosition)
    app.quaternion.copy(originalRotation)
    app.emit('exit', playerId)
  }

  world.on('exited', playerId => {
    if(state.owner !== playerId) return;

    handlePlayerRelease(playerId)
    world.getPlayer(playerId)?.teleport(lobby)
  })

  app.on('dropped', ({ playerId, position, quaternion }) => {
    const player = world.getPlayer(playerId)
    handlePlayerRelease(playerId, position, quaternion)
    player.teleport(lobby)
  })

  app.on('update', delta => {
    if (state.coolingDown) {
      if (pendingShots.length > 0) pendingShots.length = 0
      
      state.cooldownTimer -= delta;
      if (state.cooldownTimer <= 0) {
        state.coolingDown = false
        state.overheat = MIN_OVERHEAT
        state.cooldownTimer = 0
        if (state.owner) {
          app.send('overheatStatus', {
            overheat: state.overheat,
            coolingDown: false,
          })
        }
      }
    }

    if (!state.coolingDown && state.overheat > MIN_OVERHEAT) {
      const recoveryAmount = RECOVER_PER_SECOND * delta
      state.overheat = Math.max(MIN_OVERHEAT, state.overheat - recoveryAmount)

      state.overheatUpdateCounter += 1
      if (state.overheatUpdateCounter >= 1 / (delta * OVERHEAT_UPDATES_PER_SECOND)) {
        state.overheatUpdateCounter = 0

        if (state.owner) {
          app.send('overheatStatus', {
            overheat: state.overheat,
            coolingDown: state.coolingDown,
          })
        }
      }
    }

        // Process pending shots at the regulated fire rate
        const currentTime = world.getTime();

        if (pendingShots.length > 0 && currentTime - lastShotTime >= FIRE_RATE) {
          const shot = pendingShots.shift();
          lastShotTime = currentTime;
          
          if (state.owner) {
            const { position, quaternion } = world.getPlayer(state.owner);
            app.emit('shoot', {
              shooter: shot.shooter,
              shooterPosition: position.toArray(),
              shooterQuaternion: quaternion.toArray(),
              shooterHeight: shot.shooterHeight,
              hitPoint: shot.hitPoint,
              hitId: shot.hitId,
            });
    
            app.send('remoteShot', { hitPoint: shot.hitPoint, shooter: shot.shooter }, shot.shooter);
          }
        }
    
  })

  world.on('death', ({ playerId, isDead }) => {
    if (playerId !== state.owner) return
    app.send('death', { playerId, isDead })
  })

  world.on('leave', ({ playerId }) => {
    if (playerId !== state.owner) return
    handlePlayerRelease(playerId)
  })
}
