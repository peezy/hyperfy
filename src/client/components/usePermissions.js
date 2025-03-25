import { useEffect, useState } from 'react'
import { hasRole } from '../../core/utils'

export function usePermissions(world) {
  const [perms, setPerms] = useState(() => {
    const isAdmin = hasRole(world.entities.player?.data.roles, 'admin')
    const isBuilder = isAdmin || world.config.public
    return { isAdmin, isBuilder }
  })
  useEffect(() => {
    function update() {
      const isAdmin = hasRole(world.entities.player?.data.roles, 'admin')
      const isBuilder = isAdmin || world.config.public
      setPerms({ isAdmin, isBuilder })
    }
    world.config.on('change', update)
    return () => {
      world.config.off('change', update)
    }
  }, [])
  return perms
}
