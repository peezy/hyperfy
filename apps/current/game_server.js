const models = ['hyperfyToken', 'hyperfyTokenMesh']
const audio = ['coinCollect']
const BODY_NAME = 'HYPERCOIN_Baked002'
const MESH_NAME = 'hypercoin'

const code = new Vector3(-9.359, 3.164, -5.004)
const lobby = new Vector3(-16.2056, 435.0987, 62.9206)
const GAME_COORDS = new Vector3(-38.4927, 5.877, -29.1918)

const modelsConfig = models.map(model => {
  const label = model.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
  return {
    key: model,
    type: 'file',
    kind: 'model',
    label: `${label} Model`,
  }
})

const audioConfig = audio.map(file => {
  const label = file.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
  return {
    key: file,
    type: 'file',
    kind: 'audio',
    label: `${label} SFX`,
  }
})

app.configure([
  ...modelsConfig,
  ...audioConfig,
  {
    key: 'spawns',
    type: 'number',
    initial: 1,
    min: 1,
    step: 1,
    label: 'spawns',
  },
  {
    key: "network",
    type: "switch",
    label: "Network",
    options: [
      { label: "mainnet", value: "mainnet" },
      { label: "devnet", value: "devnet" },
    ],
    defaultValue: "devnet",
  },
  {
    key: "tokenMintMainnet",
    type: "text",
    label: "Mainnet Token Mint",
  },
  {
    key: "tokenMintDevnet",
    type: "text",
    label: "Devnet Token Mint",
  },
])

let TOKEN;
const { network, tokenMintDevnet, tokenMintMainnet } = app.config;
const tokenMint = network === "mainnet" ? tokenMintMainnet : tokenMintDevnet;
TOKEN = tokenMint;

let tokenModelBody = null
let tokenModelMesh = null
const loadModels = async () => {
  const bodyLoad = await world.load('model', props.hyperfyToken?.url)
  if (!bodyLoad) return console.log('upload model')
  tokenModelBody = bodyLoad.get(BODY_NAME)
  if (!tokenModelBody) console.log('wrong token model or rename rigidbody')
  const meshLoad = await world.load('model', props.hyperfyTokenMesh?.url)
  if (!meshLoad) console.log('wrong token mesh model or rename mesh')
  tokenModelMesh = meshLoad.get(MESH_NAME)
  if (!tokenModelMesh) return console.log('wrong token model or rename rigidbody')

  app.send('loaded')
}
loadModels()
if (world.isServer) {
  const solana = app.solana()
  const playerHealth = new Map()
  const activePlayerIds = new Set()
  // const activePlayerWalletsLastDbBalance = new Map()
  let houseMoney = world.get('houseMoney') ?? 0;

  const MAX_HEALTH = 100
  const DEFAULT_HEALTH = 100
  const HOT_INTERVAL = 2
  const HOT_AMOUNT = 5

  const v1 = new Vector3()
  const v2 = new Vector3()
  const v3 = new Vector3()
  const v4 = new Vector3()
  const v5 = new Vector3()
  const q1 = new Quaternion()

  const activeCoins = new Map()
  const coinsToRemove = new Set()

  let token;
  async function initToken() {
    if (!solana?.connection) {
      log("No Solana connection for server balance");
      throw new Error("init failed");
    }

    token = await solana.programs.token(TOKEN);
    if (!token) throw new Error("token not found");

    token.onTransaction((info) => {
      console.log("caught token transaction on scripts!");
      console.log(info);
    });
  }
  initToken()

  function makeCoin(position, ownerId) {
    if (!tokenModelBody) return
    const id = uuid()
    const clone = tokenModelBody.clone(true)
    clone.onTriggerEnter = e => {
      const { playerId } = e

      if (playerId === ownerId) {
        app.send('coinCollected', {
          coinId: id,
          playerId: playerId,
        })
        coinsToRemove.add(id)

        const player = world.getPlayer(playerId)
        const balance = world.get(player.solana)
        world.set(player.solana, balance + 1)
        world.set(`${player.solana}:net`, (world.get(`${player.solana}:net`) ?? 0) + 1)

      }
    }
    world.add(clone)
    clone.setPosition(position)

    activeCoins.set(id, { clone, ownerId })

    setTimeout(() => {
      if (!activeCoins.has(id) || coinsToRemove.has(id)) return;
      console.log('coin not caught, cleaning up')
      app.send('coinCleanup', id)
      houseMoney++
      coinsToRemove.add(id)
    }, 3000)

    return {
      id,
      destroy() {
        coinsToRemove.add(id)
      },
    }
  }

  world.on('joinRequest', async ([playerId, gunId]) => {
    try {
      if (!token) throw new Error('token not initialized');
      const player = world.getPlayer(playerId)
      console.log(player.id, player.solana)
      if (!player?.solana || world.get(player.solana)) throw new Error('invalid player')

      const balance = await token.getServerBalance(playerId)
      if (balance < 1) throw new Error('not enough balance')

      world.set(player.solana, balance)
      // activePlayerWalletsLastDbBalance.set(player.solana, balance)

      // join
      activePlayerIds.add(player.id)
      playerHealth.set(player.id, DEFAULT_HEALTH)
      player.teleport(GAME_COORDS)
      app.send('hyperfy:health', { playerId: player.id, health: DEFAULT_HEALTH, joined: true, balance })
      app.emit('join', [playerId, gunId])
    } catch (e) {
      console.error(e)
      app.emit('joinFailed', [gunId, e.message])
    }

  })
  console.log('init')
  async function exit(playerId) {
    console.log('exiting')
    const player = world.getPlayer(playerId)
    if (!player) return;
    if (!activePlayerIds.has(playerId)) return;

    console.log(playerId)


    try {
      activePlayerIds.delete(playerId)
      playerHealth.delete(playerId)
      app.send('hyperfy:health', { playerId, health: 0, joined: false })

      const finalGameBalance = world.get(player.solana)
      app.emit('exited', playerId)

      console.log('checking floating coins')
      for (const [coinId, { ownerId }] of activeCoins) {
        console.log(coinId, ownerId, ownerId == playerId)
        if (!ownerId == playerId) continue
        app.send('coinCleanup', coinId)
        houseMoney++
        coinsToRemove.add(coinId)
      }

      // const initialBalance = activePlayerWalletsLastDbBalance.get(player.solana)
      // const currentDbBalance = await token.getServerBalance(playerId)

      // let finalBalance = initialBalance;
      // if(currentDbBalance !== initialBalance) finalBalance -= currentDbBalance - initialBalance

      // const diff = finalBalance - finalGameBalance


      const { error } = await token.updateServerBalance(
        playerId,
        finalGameBalance,
        {
          reason: 'game exit settlement',
          initiatedBy: app.instanceId,
        }
      )
      if (error) throw new Error(error.message)
      world.set(player.solana, undefined) //if everything went smoothly, clear the cache



    } catch (e) {
      console.error("error settling game balance!") // panic
    }


  }

  world.on('leave', ({ playerId }) => {
    exit(playerId)
    // console.log(playerId)
    // activePlayerIds.delete(playerId)
    // playerHealth.delete(playerId)
    // app.send('hyperfy:health', { playerId, health: 0 })
  })

  world.on('exit', playerId => {
    exit(playerId)
    // activePlayerIds.delete(playerId)
    // playerHealth.delete(playerId)
    // app.send('hyperfy:health', { playerId, health: playerHealth.get(playerId), joined: false })
  })


  world.on('shoot', ({ shooter, shooterHeight, hitPoint, hitId }) => {
    const offsetY = shooterHeight - 0.35
    const offsetZ = -0.275
    if (playerHealth.get(shooter) <= 0) return
    
    v1.copy(world.getPlayer(shooter).position)
    q1.copy(world.getPlayer(shooter).quaternion)
    v2.set(hitPoint[0], hitPoint[1], hitPoint[2])
    v3.set(0, offsetY, offsetZ)
    v3.applyQuaternion(q1)
    v4.copy(v1).add(v3)
    v5.copy(v2).sub(v4).normalize()
  
    // when i increase this offset, it basically means people can shoot through the wall in front of them if they send a maliscious hit point
    // i need the offset because it compensates for latency
    // the offset cant be less shallow because it will say i hit myself and i cant find the next hit from raycast
    const offsetHead = v4.clone().addScaledVector(v5, 0.2)
    const headToHitDistance = v4.distanceTo(v2)
    
    const playerHit = world.raycast(offsetHead, v5, headToHitDistance)
    
    // TODO for better security, check to see if theres a hit point after the shooter but before the hit point and use that as the hit point
    // room for latency is pretty tight with the 0.05 offset here, so i expect laggy users will get this error 
    if (playerHit && playerHit.playerId === shooter) return
    
    // Change detection logic to use the playerHit result instead of requiring hitId to match
    // We'll completely ignore the client's hitId and trust only our server-side raycast
    let isPlayer = playerHit && playerHit.playerId && playerHit.playerId !== shooter
    
    if (isPlayer) {
      // const hitPlayerId = playerHit.playerId
      if (playerHealth.get(playerHit.playerId) <= 0) return
      
      damageHandler({ hitPlayer: playerHit, amount: 10, crit: false })
      const coin = makeCoin(playerHit.point, shooter)
      app.send('token', {
        shooter,
        point: playerHit.point.toArray(),
        owed: shooter,
        coinId: coin.id,
      })
    }
  })
  
  const damageHandler = ({ hitPlayer, amount }) => {
    let currentHealth = playerHealth.get(hitPlayer.playerId)
    if (!currentHealth || currentHealth <= 0) return


    currentHealth = Math.max(0, currentHealth - amount)
    playerHealth.set(hitPlayer.playerId, currentHealth)

    app.send('hyperfy:health', { playerId: hitPlayer.playerId, health: currentHealth })

    if (currentHealth === 0) {
      app.emit('death', { playerId: hitPlayer.playerId, isDead: true })

      setTimeout(() => {
        if (!activePlayerIds.has(hitPlayer.playerId)) return

        const spawn = Math.floor(Math.random() * props.spawns) + 1
        app.emit(`spawn:${spawn}`, hitPlayer.playerId)
        playerHealth.set(hitPlayer.playerId, DEFAULT_HEALTH)
        app.send('hyperfy:health', { playerId: hitPlayer.playerId, health: DEFAULT_HEALTH })
        app.emit('death', { playerId: hitPlayer.playerId, isDead: false })
      }, 30000)
    }

    const player = world.getPlayer(hitPlayer.playerId)
    let currentBalance = world.get(player.solana)
    currentBalance = Math.max(0, currentBalance - 1)
    console.log({...player, currentBalance})
    world.set(player.solana, currentBalance)
    if (currentBalance < 1) {
      exit(hitPlayer.playerId)
    }
  }

  const healPlayer = (playerId, amount) => {
    if (!activePlayerIds.has(playerId) || !playerHealth.has(playerId) || playerHealth.get(playerId) <= 0) return

    const currentHealth = playerHealth.get(playerId)
    const newHealth = Math.min(MAX_HEALTH, currentHealth + amount)
    playerHealth.set(playerId, newHealth)

    app.send('hyperfy:health', { playerId, health: newHealth })
  }

  let elapsed = 0
  app.on('update', delta => {
    elapsed += delta
    if (elapsed < HOT_INTERVAL) return
    elapsed = 0

    for (const [playerId, health] of playerHealth) {
      if (health > 0 && health < MAX_HEALTH) {
        healPlayer(playerId, HOT_AMOUNT)
      }
    }
  })

  const CACHE_INTERVAL = 5
  let fixedElapsed = 0;
  app.on('fixedUpdate', (delta) => {
    if (coinsToRemove.size > 0) {
      for (const coinId of coinsToRemove) {
        const coinData = activeCoins.get(coinId)
        if (coinData) {
          world.remove(coinData.clone)
          activeCoins.delete(coinId)
        }
      }
      coinsToRemove.clear()
    }
    fixedElapsed += delta;
    if (fixedElapsed < CACHE_INTERVAL) return;

    world.set('houseMoney', houseMoney)
  })
}

if (world.isClient) {
  const v1 = new Vector3()
  const DMG_VISIBLE_DISTANCE = 20
  const localPlayer = world.getPlayer()
  const playerLastHealth = new Map()

  const coinSFX = app.create('audio', {
    src: props.coinCollect?.url,
    volume: 0.75,
    group: 'sfx',
    spatial: false,
  })
  app.add(coinSFX)

  const v2 = new Vector3()
  const activeTokens = new Map()
  const tokensToRemove = new Set()

  const tokenRotationSpeed = 2
  const tokenBobSpeed = 3
  const tokenBobHeight = 0.1
  const tokenInitialY = {}

  app.on('token', ({ shooter, point, owed, coinId }) => {
    if (localPlayer.id !== shooter) return
    const clone = tokenModelMesh.clone()
    clone.position.copy(v2.set(point[0], point[1], point[2]))
    clone.scale.set(0.5, 0.5, 0.5)
    world.add(clone)
    activeTokens.set(coinId, clone)
    tokenInitialY[coinId] = clone.position.y
  })

  app.on('coinCollected', ({ coinId, playerId }) => {
    if (playerId !== localPlayer.id) return
    tokensToRemove.add(coinId)
    coinSFX.stop()
    coinSFX.play()
  })

  app.on('coinCleanup', coinId => {
    console.log('received coinCleanup', coinId, activeTokens, localPlayer)
    if (activeTokens.has(coinId)) tokensToRemove.add(coinId)
  })

  app.on('update', delta => {
    if (activeTokens.size > 0) {
      for (const [coinId, tokenClone] of activeTokens.entries()) {
        tokenClone.rotation.y += tokenRotationSpeed * delta

        if (tokenInitialY[coinId] !== undefined) {
          const bobOffset = Math.sin((Date.now() / 1000) * tokenBobSpeed) * tokenBobHeight
          tokenClone.position.y = tokenInitialY[coinId] + bobOffset
        }
      }
    }

    if (tokensToRemove.size > 0) {
      for (const coinId of tokensToRemove) {
        const tokenClone = activeTokens.get(coinId)
        if (tokenClone) {
          world.remove(tokenClone)
          activeTokens.delete(coinId)
          delete tokenInitialY[coinId]
        }
      }
      tokensToRemove.clear()
    }
  })

  const HEALTH_CONFIG = {
    width: 100,
    height: 10,
    padding: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    healthColor: 'rgba(50, 220, 50, 0.9)',
    maxHealth: 100,
    currentHealth: 100,
  }

  const healthBarContainer = app.create('ui', {
    width: HEALTH_CONFIG.width,
    height: HEALTH_CONFIG.height,
    alignSelf: 'center',
    position: [0.5, 1, 0],
    offset: [0, -20, 0],
    space: 'screen',
    anchorPoint: [0.5, 1],
    backgroundColor: HEALTH_CONFIG.backgroundColor,
    borderRadius: HEALTH_CONFIG.borderRadius,
    padding: HEALTH_CONFIG.padding,
    pointerEvents: false,
  })

  const healthFill = app.create('uiview', {
    width: (HEALTH_CONFIG.currentHealth / HEALTH_CONFIG.maxHealth) * (HEALTH_CONFIG.width - HEALTH_CONFIG.padding * 2),
    height: HEALTH_CONFIG.height - HEALTH_CONFIG.padding * 2,
    backgroundColor: HEALTH_CONFIG.healthColor,
    borderRadius: HEALTH_CONFIG.borderRadius / 2,
    pointerEvents: false,
  })

  healthBarContainer.add(healthFill)

  function updateHealth(newHealth) {
    const healthValue = Math.max(0, Math.min(newHealth, HEALTH_CONFIG.maxHealth))
    HEALTH_CONFIG.currentHealth = healthValue

    const fillWidth = (healthValue / HEALTH_CONFIG.maxHealth) * (HEALTH_CONFIG.width - HEALTH_CONFIG.padding * 2)
    healthFill.width = fillWidth

    if (healthValue > 50) {
      healthFill.backgroundColor = 'rgba(50, 220, 50, 0.9)'
    } else if (healthValue > 25) {
      healthFill.backgroundColor = 'rgba(255, 165, 0, 0.9)'
    } else {
      healthFill.backgroundColor = 'rgba(255, 0, 0, 0.9)'
    }
  }

  app.on('hyperfy:health', ({ playerId, health, joined }) => {
    const previousHealth = playerLastHealth.get(playerId) || health

    if (playerId === localPlayer.id) {
      updateHealth(health)

      if (joined === true) {
        app.add(healthBarContainer)
      }

      if (joined === false) {
        app.remove(healthBarContainer)
      }
    }

    if (health < previousHealth) {
      const amount = previousHealth - health
      const crit = amount >= 20
      showDamage(playerId, amount, crit)
    }

    playerLastHealth.set(playerId, health)
  })

  function showDamage(playerId, amount, crit) {
    const player = world.getPlayer(playerId)
    if (!player) return
    const distance = localPlayer.position.distanceTo(player.position)
    if (distance > DMG_VISIBLE_DISTANCE) return

    const ui = app.create('ui', {
      width: crit ? 30 : 15,
      height: crit ? 30 : 15,
      billboard: 'full',
      alignItems: 'center',
      justifyContent: 'center',
    })

    const text = app.create('uitext', {
      value: amount,
      fontWeight: 800,
      fontSize: crit ? 16 : 8,
      color: crit ? '#d82424' : 'white',
    })

    ui.add(text)
    world.add(ui)
    ui.position.copy(player.position)
    ui.position.y += (player.height || 1.7) + 0.3

    const x = num(-0.5, 0.5, 1)
    const z = num(-0.5, 0.5, 1)
    const dir = new Vector3(x, 1, z)
    const time = 1
    const speed = 0.3
    let elapsed = 0

    function update(delta) {
      v1.copy(dir).multiplyScalar(speed * delta)
      ui.position.add(v1)
      elapsed += delta
      if (elapsed > time) {
        world.remove(ui)
        app.off('update', update)
      }
    }

    app.on('update', update)
  }
}
