import { System } from './System'

export class Settings extends System {
  constructor(world) {
    super(world)

    this.model = null
    this.avatar = null
    this.public = null

    this.changes = null
  }

  deserialize(data) {
    this.model = data.model
    this.avatar = data.avatar
    this.public = data.public
    this.emit('change', {
      model: { value: this.model },
      avatar: { value: this.avatar },
      public: { value: this.public },
    })
  }

  serialize() {
    return {
      model: this.model,
      avatar: this.avatar,
      public: this.public,
    }
  }

  preFixedUpdate() {
    if (!this.changes) return
    this.emit('change', this.changes)
    this.changes = null
  }

  modify(key, value) {
    if (this[key] === value) return
    const prev = this[key]
    this[key] = value
    if (!this.changes) this.changes = {}
    if (!this.changes[key]) this.changes[key] = { prev, value: null }
    this.changes[key].value = value
  }

  set(key, value, broadcast) {
    this.modify(key, value)
    if (broadcast) {
      this.world.network.send('settingsModified', { key, value })
    }
  }
}
