import { css } from '@firebolt-dev/css'
import { PackageXIcon } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Section, Pane, Group } from '../../../../src/client/components/Sidebar.js'

// The button component shown in the sidebar
export function ModsButton() {
  return <PackageXIcon size='1.25rem' />
}

// The pane component shown when the button is clicked
export function ModsPane({ world, hidden }) {
  const [patches, setPatches] = useState([])
  const [appliedPatches, setAppliedPatches] = useState([])
  const [loading, setLoading] = useState(false)
  const [applyingPatch, setApplyingPatch] = useState(null)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)
  const [hasRequested, setHasRequested] = useState(false)
  const [activeTab, setActiveTab] = useState('available') // 'available' or 'applied'
  
  // Register event listeners once on component mount
  useEffect(() => {
    // Listen for response from server with patch data
    const handlePatches = (data) => {
      console.log('Sidebar received patches:', Array.isArray(data) ? data.length : 'none')
      setPatches(data)
      setLoading(false)
    }
    
    const handleAppliedPatches = (data) => {
      console.log('Sidebar received applied patches:', Array.isArray(data) ? data.length : 'none')
      setAppliedPatches(data)
    }
    
    const handleApplyingPatch = (patch) => {
      setApplyingPatch(patch)
      setError(null)
      setSuccessMessage(null)
    }
    
    const handleApplyPatchResult = (result) => {
      setApplyingPatch(null)
      
      if (result.success) {
        setSuccessMessage(result.message || 'Patch applied successfully')
        setTimeout(() => setSuccessMessage(null), 5000)
      } else {
        setError(result.message || 'Failed to apply patch')
      }
    }
    
    const handleError = (err) => {
      setError(err.message || 'Failed to load patches')
      setLoading(false)
    }
    
    // Register global event listeners that stay throughout component lifecycle
    world.on('mods:patches', handlePatches)
    world.on('mods:applied-patches', handleAppliedPatches)
    world.on('mods:applying-patch', handleApplyingPatch)
    world.on('mods:apply-patch-result', handleApplyPatchResult)
    world.on('mods:error', handleError)
    
    return () => {
      // Clean up listeners when component unmounts
      world.off('mods:patches', handlePatches)
      world.off('mods:applied-patches', handleAppliedPatches)
      world.off('mods:applying-patch', handleApplyingPatch)
      world.off('mods:apply-patch-result', handleApplyPatchResult)
      world.off('mods:error', handleError)
    }
  }, [world])
  
  // Separate effect for requesting patches when pane becomes visible
  useEffect(() => {
    if (!hidden && !hasRequested) {
      setLoading(true)
      setHasRequested(true)
      
      // Request patches from server via the client system
      console.log('Sidebar requesting patches')
      world.emit('mods:request-patches')
      world.emit('mods:request-applied-patches')
      
      // Set a timeout in case the server doesn't respond
      const timeout = setTimeout(() => {
        if (loading) {
          setError('Request timed out')
          setLoading(false)
        }
      }, 5000)
      
      return () => {
        clearTimeout(timeout)
      }
    }
  }, [hidden, world, hasRequested, loading])
  
  // Check if a patch is already applied
  const isPatchApplied = (patch) => {
    return appliedPatches.some(
      applied => applied.remote === patch.remote && applied.name === patch.name
    )
  }
  
  // Handle applying a patch
  const handleApplyPatch = (patch) => {
    if (applyingPatch) return
    
    // Reset any previous messages
    setError(null)
    setSuccessMessage(null)
    
    // Request to apply the patch
    world.emit('mods:apply-patch', patch)
  }
  
  // Group patches by remote
  const patchesByRemote = patches.reduce((acc, patch) => {
    if (!acc[patch.remote]) {
      acc[patch.remote] = []
    }
    acc[patch.remote].push(patch)
    return acc
  }, {})
  
  // Group applied patches by remote
  const appliedPatchesByRemote = appliedPatches.reduce((acc, patch) => {
    if (!acc[patch.remote]) {
      acc[patch.remote] = []
    }
    acc[patch.remote].push(patch)
    return acc
  }, {})
  
  return (
    <Pane hidden={hidden}>
      <div
        className='mods-pane'
        css={css`
          background: rgba(11, 10, 21, 0.85);
          border: 0.0625rem solid #2a2b39;
          backdrop-filter: blur(5px);
          border-radius: 1rem;
          display: flex;
          flex-direction: column;
          min-height: 17rem;
          
          .mods-head {
            height: 3.125rem;
            padding: 0 1rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          
          .mods-title {
            font-weight: 500;
            font-size: 1rem;
            line-height: 1;
          }
          
          .mods-tabs {
            display: flex;
            gap: 1rem;
          }
          
          .mods-tab {
            cursor: pointer;
            opacity: 0.6;
            transition: opacity 0.2s;
            
            &:hover {
              opacity: 0.8;
            }
            
            &.active {
              opacity: 1;
              border-bottom: 2px solid white;
            }
          }
          
          .mods-content {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
          }
          
          .patch-item {
            display: flex;
            align-items: center;
            padding: 0.5rem;
            border-radius: 0.5rem;
            margin-bottom: 0.25rem;
            
            &:hover {
              background: rgba(255, 255, 255, 0.05);
            }
          }
          
          .patch-name {
            flex: 1;
            font-size: 0.9rem;
          }
          
          .patch-verified {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 1rem;
            height: 1rem;
            border-radius: 50%;
            background: rgba(43, 189, 125, 0.2);
            color: rgb(43, 189, 125);
            font-size: 0.6rem;
            margin-left: 0.5rem;
          }
          
          .patch-applied {
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(43, 189, 125, 0.2);
            color: rgb(43, 189, 125);
            font-size: 0.7rem;
            padding: 0.15rem 0.5rem;
            border-radius: 0.25rem;
            margin-left: 0.5rem;
          }
          
          .patch-action {
            margin-left: 0.5rem;
            padding: 0.15rem 0.5rem;
            border-radius: 0.25rem;
            font-size: 0.7rem;
            cursor: pointer;
            background: rgba(255, 255, 255, 0.1);
            
            &:hover {
              background: rgba(255, 255, 255, 0.2);
            }
            
            &.disabled {
              opacity: 0.5;
              cursor: not-allowed;
              
              &:hover {
                background: rgba(255, 255, 255, 0.1);
              }
            }
          }
          
          .no-patches {
            color: rgba(255, 255, 255, 0.5);
            font-style: italic;
            padding: 1rem 0;
          }
          
          .loading {
            color: rgba(255, 255, 255, 0.5);
            padding: 1rem 0;
          }
          
          .error {
            color: #ff5555;
            padding: 0.5rem 0;
            margin-bottom: 0.5rem;
            font-size: 0.9rem;
          }
          
          .success {
            color: #55ff7f;
            padding: 0.5rem 0;
            margin-bottom: 0.5rem;
            font-size: 0.9rem;
          }
        `}
      >
        <div className='mods-head'>
          <div className='mods-title'>Mods</div>
          <div className='mods-tabs'>
            <div 
              className={`mods-tab ${activeTab === 'available' ? 'active' : ''}`}
              onClick={() => setActiveTab('available')}
            >
              Available
            </div>
            <div 
              className={`mods-tab ${activeTab === 'applied' ? 'active' : ''}`}
              onClick={() => setActiveTab('applied')}
            >
              Applied
            </div>
          </div>
        </div>
        <div className='mods-content noscrollbar'>
          {/* Status messages */}
          {error && <div className='error'>{error}</div>}
          {successMessage && <div className='success'>{successMessage}</div>}
          
          {/* Available patches tab */}
          {activeTab === 'available' && (
            <>
              {loading ? (
                <div className='loading'>Loading patches...</div>
              ) : patches.length === 0 ? (
                <div className='no-patches'>No patches available</div>
              ) : (
                Object.entries(patchesByRemote).map(([remote, remotePaches]) => (
                  <div key={remote}>
                    <Group label={remote} />
                    {remotePaches.map(patch => {
                      const isApplied = isPatchApplied(patch)
                      return (
                        <div className='patch-item' key={`${patch.remote}/${patch.name}`}>
                          <div className='patch-name'>{patch.name}</div>
                          {patch.isVerified && (
                            <div className='patch-verified' title="Verified patch">✓</div>
                          )}
                          {isApplied && (
                            <div className='patch-applied'>Applied</div>
                          )}
                          {!isApplied && (
                            <div 
                              className={`patch-action ${applyingPatch ? 'disabled' : ''}`}
                              onClick={() => !applyingPatch && handleApplyPatch(patch)}
                            >
                              {applyingPatch && applyingPatch.name === patch.name ? 'Applying...' : 'Apply'}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))
              )}
            </>
          )}
          
          {/* Applied patches tab */}
          {activeTab === 'applied' && (
            <>
              {appliedPatches.length === 0 ? (
                <div className='no-patches'>No patches applied</div>
              ) : (
                Object.entries(appliedPatchesByRemote).map(([remote, remotePaches]) => (
                  <div key={remote}>
                    <Group label={remote} />
                    {remotePaches.map(patch => (
                      <div className='patch-item' key={`${patch.remote}/${patch.name}`}>
                        <div className='patch-name'>{patch.name}</div>
                        {patch.isVerified && (
                          <div className='patch-verified' title="Verified patch">✓</div>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </Pane>
  )
} 