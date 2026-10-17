import { beforeEach, describe, expect, it } from 'vitest'
import { loadRecentWorkspace, rememberWorkspace } from './metadata'

describe('recent workspace cache', () => {
  beforeEach(() => localStorage.clear())

  it('restores the last workspace without waiting for a database', async () => {
    await rememberWorkspace('C:\\docs\\writree', 'writree')
    await expect(loadRecentWorkspace()).resolves.toEqual({ rootPath: 'C:\\docs\\writree', name: 'writree' })
  })

  it('ignores a corrupt cache value', async () => {
    localStorage.setItem('writree.recentWorkspace', '{invalid')
    await expect(loadRecentWorkspace()).resolves.toBeNull()
  })
})
