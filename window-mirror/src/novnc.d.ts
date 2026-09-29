/**
 * noVNC 1.7 ships no type declarations, and there is no maintained @types
 * package for it. This describes the surface this plugin actually uses rather
 * than the whole RFB API, so that a typo in one of these names is still a
 * compile error.
 */
declare module '@novnc/novnc' {
  export interface RFBCredentials {
    username?: string
    password?: string
    target?: string
  }

  export interface RFBOptions {
    shared?: boolean
    credentials?: RFBCredentials
    repeaterID?: string
    wsProtocols?: string[]
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: RFBOptions)
    /** Drop input events instead of sending them. */
    viewOnly: boolean
    /** Scale the remote framebuffer to fit the container element. */
    scaleViewport: boolean
    /** Crop rather than scale when the framebuffer is larger than the container. */
    clipViewport: boolean
    /** With clipViewport, let a drag pan the viewport instead of dragging remotely. */
    dragViewport: boolean
    /** CSS background painted behind the framebuffer. */
    background: string
    disconnect(): void
    sendCtrlAltDel(): void
    /** Send one key transition. `code` is a DOM `KeyboardEvent.code`, or '' when
     *  the character has no physical key behind it. */
    sendKey(keysym: number, code: string, down?: boolean): void
    focus(): void
    blur(): void
  }
}
