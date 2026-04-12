import type { LinkAdapter } from '../types.js';

const adapter: LinkAdapter = {
  id: 'maxbenito',
  title: 'Max & Benito',
  icon: 'bean',
  url: 'https://maxbenito.at/#food',
  type: 'link',
  cuisine: ['Burritos'],
  stampCard: true,
  edenred: true,
  outdoor: true,
  coordinates: { lat: 48.2231, lon: 16.3926 },
};

export default adapter;
