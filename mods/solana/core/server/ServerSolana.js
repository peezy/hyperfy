import { isNumber } from 'lodash-es'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { uuid } from '../../../../src/core/utils.js'
import { System } from '../../../../src/core/systems/System.js'

const connection = new Connection(process.env.RPC_URL)

const worldTokenMintAddress = process.env.WORLD_TOKEN_MINT_ADDRESS
const worldAddress = process.env.WORLD_PUBLIC_KEY
const worldPrivateKey = process.env.WORLD_PRIVATE_KEY

const template = 'Connect to world:\n{address}'

let worldKeypair
if (worldPrivateKey) {
  const secretKey = Buffer.from(worldPrivateKey, 'base64')
  worldKeypair = Keypair.fromSecretKey(secretKey)
}

export default class ServerSolana extends System {
  static name = 'solana'
  constructor(world) {
    super(world)
    this.callbacks = {}
  }

  init() {
    this.world.network.onWalletConnect = this.onWalletConnect.bind(this)
    this.world.network.onWalletDisconnect = this.onWalletDisconnect.bind(this)
    this.world.network.onDepositResponse = this.onDepositResponse.bind(this)
    this.world.network.onWithdrawResponse = this.onWithdrawResponse.bind(this)

    const self = this
    this.world.inject({
      // Add custom player properties and methods
      player: {
        // Custom method for wallet (still available for backward compatibility)
        solana: {
          get(player) {
            return player.data.custom?.['solana']
          },
        },
        connect(entity, player) {
          return self.connect(player)
        },
        disconnect(entity, player) {
          return self.disconnect(player)
        },
        deposit(entity, player, amount) {
          return self.deposit(entity, player, amount)
        },
        withdraw(entity, player, amount) {
          return self.withdraw(entity, player, amount)
        },
      },
    })
  }

  connect(player) {
    this.world.network.sendTo(player.data.id, 'walletConnect')
  }

  disconnect(player) {
    // Use customProp instead of setting wallet directly
    player.modify({
      customProp: { key: 'solana', value: null },
      // wallet: null // For backward compatibility
    })
    this.world.network.sendTo(player.data.id, 'walletDisconnect')
    this.world.network.send('entityModified', {
      id: player.data.id,
      customProp: { key: 'solana', value: null },
      wallet: null, // For backward compatibility
    })
  }

  onWalletConnect({ id }, { address, signature }) {
    const player = this.world.entities.getPlayer(id)
    if (!player) return
    const publicKey = new PublicKey(address)
    const decodedSignature = bs58.decode(signature)
    const text = template.replace('{address}', address)
    const message = new TextEncoder().encode(text)
    const isValid = nacl.sign.detached.verify(message, decodedSignature, publicKey.toBytes())
    if (!isValid) return
    // Use customProp instead of setting wallet directly
    player.modify({
      customProp: { key: 'solana', value: address },
      // wallet: address // For backward compatibility
    })
    this.world.network.send('entityModified', {
      id: player.data.id,
      customProp: { key: 'solana', value: address },
      // wallet: address // For backward compatibility
    })
  }

  onWalletDisconnect({ id }) {
    const player = this.world.entities.getPlayer(id)
    if (!player) return
    // Use customProp instead of setting wallet directly
    player.modify({
      customProp: { key: 'solana', value: null },
      // wallet: null // For backward compatibility
    })
    this.world.network.send('entityModified', {
      id: player.data.id,
      customProp: { key: 'solana', value: null },
      // wallet: null // For backward compatibility
    })
  }

  deposit(entity, player, amount) {
    return new Promise(async (resolve, reject) => {
      const hook = entity.getDeadHook()
      try {
        // Access wallet through custom data, fallback to direct property for compatibility
        const playerAddress = player.data.custom?.['solana']
        if (!playerAddress) return reject('not_connected')
        if (!isNumber(amount)) return reject('amount_invalid')
        // make public keys
        const tokenMintPublicKey = new PublicKey(worldTokenMintAddress)
        const worldPublicKey = new PublicKey(worldAddress)
        const playerPublicKey = new PublicKey(playerAddress)
        // get token accounts
        const worldTokenAccount = await getAssociatedTokenAddress(tokenMintPublicKey, worldPublicKey)
        const playerTokenAccount = await getAssociatedTokenAddress(tokenMintPublicKey, playerPublicKey)
        // init tx
        const tx = new Transaction()
        // ensure world has token account
        try {
          await getAccount(connection, worldTokenAccount)
        } catch (error) {
          if (error.name === 'TokenAccountNotFoundError') {
            tx.add(
              createAssociatedTokenAccountInstruction(
                playerPublicKey, // player pays
                worldTokenAccount,
                worldPublicKey,
                tokenMintPublicKey
              )
            )
          } else {
            throw error
          }
        }
        // ensure player has token account
        try {
          await getAccount(connection, playerTokenAccount)
        } catch (error) {
          if (error.name === 'TokenAccountNotFoundError') {
            tx.add(
              createAssociatedTokenAccountInstruction(
                playerPublicKey, // player pays
                playerTokenAccount,
                playerPublicKey,
                tokenMintPublicKey
              )
            )
          } else {
            throw error
          }
        }
        // add transfer instruction
        const adjustedAmount = amount * Math.pow(10, 6) // human to 6 decimal token
        tx.add(
          createTransferInstruction(
            playerTokenAccount, // source
            worldTokenAccount, // destination
            playerPublicKey, // owner
            adjustedAmount, // amount
            [], // multisigners
            TOKEN_PROGRAM_ID // program ID
          )
        )
        // get latest blockhash + set player as fee payer
        const { blockhash } = await connection.getLatestBlockhash()
        tx.recentBlockhash = blockhash
        tx.feePayer = playerPublicKey
        // serialize the transaction
        const serializedTx = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString('base64')
        // stop if dead
        if (hook.dead) return
        // setup and wait for response
        const depositId = uuid()
        this.callbacks[depositId] = async ({ serializedSignedTx }) => {
          delete this.callbacks[depositId]
          if (hook.dead) return
          try {
            const tx = Transaction.from(Buffer.from(serializedSignedTx, 'base64'))
            const receivedAmount = getAmountFromTx(tx)
            if (receivedAmount !== amount) return reject('amount_mismatch')
            const signature = await connection.sendRawTransaction(tx.serialize())
            const confirmation = await connection.confirmTransaction(signature)
            if (hook.dead) return console.warn('tx confirmed but app is dead? signature:', signature)
            resolve({ signature })
          } catch (err) {
            if (hook.dead) return
            console.error(err)
            reject('failed')
          }
        }
        // send to player to sign
        this.world.network.sendTo(player.data.id, 'depositRequest', { depositId, serializedTx })
      } catch (err) {
        if (hook.dead) return
        console.error(err)
        reject('failed')
      }
    })
  }

  onDepositResponse(socket, data) {
    this.callbacks[data.depositId]?.(data)
  }

  withdraw(entity, player, amount) {
    return new Promise(async (resolve, reject) => {
      const hook = entity.getDeadHook()
      try {
        // Access wallet through custom data, fallback to direct property for compatibility
        const playerAddress = player.data.custom?.['solana']
        if (!playerAddress) return reject('not_connected')
        if (!isNumber(amount)) return reject('amount_invalid')
        if (!worldKeypair) return reject('wallet_not_configured')
        // make public keys
        const tokenMintPublicKey = new PublicKey(worldTokenMintAddress)
        const worldPublicKey = new PublicKey(worldAddress)
        const playerPublicKey = new PublicKey(playerAddress)
        // get token accounts
        const worldTokenAccount = await getAssociatedTokenAddress(tokenMintPublicKey, worldPublicKey)
        const playerTokenAccount = await getAssociatedTokenAddress(tokenMintPublicKey, playerPublicKey)
        // init tx
        const tx = new Transaction()
        // ensure player has token account
        try {
          await getAccount(connection, playerTokenAccount)
        } catch (error) {
          if (error.name === 'TokenAccountNotFoundError') {
            tx.add(
              createAssociatedTokenAccountInstruction(
                playerPublicKey, // player pays
                playerTokenAccount,
                playerPublicKey,
                tokenMintPublicKey
              )
            )
          } else {
            throw error
          }
        }
        // add transfer instruction (game sends tokens to player)
        const adjustedAmount = amount * Math.pow(10, 6) // human to 6 decimal token
        tx.add(
          createTransferInstruction(
            worldTokenAccount, // source (world's token account)
            playerTokenAccount, // destination (player's token account)
            worldPublicKey, // owner (world is the owner/signer of the source account)
            adjustedAmount, // amount
            [], // multisigners
            TOKEN_PROGRAM_ID // program ID
          )
        )
        // get latest blockhash + set player as fee payer
        const { blockhash } = await connection.getLatestBlockhash()
        tx.recentBlockhash = blockhash
        tx.feePayer = playerPublicKey // player still pays the transaction fee
        // serialize the transaction (no signatures yet)
        const serializedTx = Buffer.from(
          tx.serialize({ requireAllSignatures: false, verifySignatures: false })
        ).toString('base64')
        // stop if dead
        if (hook.dead) return
        // setup and wait for response
        const withdrawId = uuid()
        this.callbacks[withdrawId] = async ({ serializedSignedTx }) => {
          delete this.callbacks[withdrawId]
          if (hook.dead) return
          try {
            const tx = Transaction.from(Buffer.from(serializedSignedTx, 'base64'))
            const receivedAmount = getAmountFromTx(tx)
            if (receivedAmount !== amount) return reject('amount_mismatch')
            tx.partialSign(worldKeypair)
            const signature = await connection.sendRawTransaction(tx.serialize())
            const confirmation = await connection.confirmTransaction(signature)
            if (hook.dead) return console.warn('tx confirmed but app is dead? signature:', signature)
            resolve({ signature })
          } catch (err) {
            if (hook.dead) return
            console.error(err)
            reject('failed')
          }
        }
        // send to player to sign
        this.world.network.sendTo(player.data.id, 'withdrawRequest', { withdrawId, serializedTx })
      } catch (err) {
        if (hook.dead) return
        console.error(err)
        reject('failed')
      }
    })
  }

  onWithdrawResponse(socket, data) {
    this.callbacks[data.withdrawId]?.(data)
  }
}

function getAmountFromTx(tx) {
  // Find the transfer instruction in the transaction
  let tokenAmount = 0
  for (const instruction of tx.instructions) {
    if (instruction.programId.equals(TOKEN_PROGRAM_ID)) {
      // Check if it's a transfer instruction (opcode 3)
      if (instruction.data[0] === 3) {
        // Parse the amount from the instruction data
        // The format is [3 (opcode), amount (u64, 8 bytes), ...rest]
        // This is a simple parsing of a u64 little-endian value
        let rawAmount = 0n
        for (let i = 0; i < 8; i++) {
          rawAmount += BigInt(instruction.data[i + 1]) << BigInt(i * 8)
        }
        // Convert to human-readable form (divide by 10^6 for 6 decimal tokens)
        tokenAmount = Number(rawAmount) / Math.pow(10, 6)
        break
      }
    }
  }
  return tokenAmount
}
