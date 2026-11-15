// The look plan, in one place. Six core values plus two team colours; the dusk lighting
// makes every shade the game needs, so no other colour appears in the code. The same names
// are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#12141a',
  surface: '#1e2228',
  hairline: '#2c323a',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f07a2e',
  lamp: '#ffb648',
  defender: '#7fb4d8',
};

export function shade(name) {
  return PALETTE[name];
}
