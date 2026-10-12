import type { DesktopBridge } from '../core/ports'
import { BrowserBridge } from './browserBridge'
import { TauriBridge } from './tauriBridge'

export const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
export const bridge: DesktopBridge = isTauri ? new TauriBridge() : new BrowserBridge()
