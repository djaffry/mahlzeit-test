import type { LinkAdapter } from '../types.js';

const adapter: LinkAdapter = {
  id: 'remo',
  title: '🍕 Remo',
  url: 'https://remopizza.at/#Speisekarte',
  type: 'link',
  cuisine: ['Neapolitanische Pizza'],
  outdoor: true,
  coordinates: { lat: 48.2254, lon: 16.3948 },
};

export default adapter;
