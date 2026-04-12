import type { LinkAdapter } from '../types.js';

const adapter: LinkAdapter = {
  id: 'noodleking',
  title: 'Noodle King',
  icon: 'crown',
  url: 'https://www.noodleking.at/menus',
  type: 'link',
  cuisine: ['Asiatisch', 'Nudeln'],
  stampCard: true,
  edenred: true,
  coordinates: { lat: 48.2262, lon: 16.3929 },
};

export default adapter;
