export type PortraitTurn = 'idle' | 'face' | 'front' | 'still';

/** Idle orbit, a speaking ease-to-camera, a hard front hold, or no automatic turn. */
export function portraitTurn(state: { attention: boolean; playing: boolean; dragging: boolean; speaking: boolean; warmedUp: boolean }): PortraitTurn {
  if (state.attention) return 'front';
  if (state.dragging) return 'still';
  if (state.speaking) return 'face';
  if (state.playing && state.warmedUp) return 'idle';
  return 'still';
}
