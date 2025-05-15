// GENERATED FILE - DO NOT EDIT
// This file is auto-generated during the build process.
// Custom packet definitions are collected from mods/*/core/packets/*.js

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
  'aiProcessQuery',
  'aiCancelStream',
  'llmEvent'
]

// Combined packet names (built-in + custom)
export const allPackets = [
  ...builtInPackets,
  ...customPackets
]
