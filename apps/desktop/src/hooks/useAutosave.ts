import { useEffect } from 'react'
import { saveRecovery } from '../infra/metadata'
import { useWorkspaceStore } from '../store/workspaceStore'

export function useAutosave() {
  const workspace = useWorkspaceStore((state) => state.workspace)
  const activePath = useWorkspaceStore((state) => state.activePath)
  const document = useWorkspaceStore((state) => (state.activePath ? state.documents[state.activePath] : undefined))
  const saveActive = useWorkspaceStore((state) => state.saveActive)

  useEffect(() => {
    if (!workspace || !activePath || !document || document.saveState !== 'dirty') return

    const recoveryTimer = window.setTimeout(() => {
      void saveRecovery(workspace.rootPath, activePath, document.markdown)
    }, 500)
    const saveTimer = window.setTimeout(() => void saveActive(), 1500)

    return () => {
      window.clearTimeout(recoveryTimer)
      window.clearTimeout(saveTimer)
    }
  }, [activePath, document?.markdown, document?.saveState, saveActive, workspace])
}
