import type { LinkAdapter } from '../types.js';

const adapter: LinkAdapter = {
  id: 'wrapstars',
  title: 'Wrapstars',
  icon: 'truck',
  url: 'https://www.wrapstars.at/pages/food-truck',
  type: 'link',
  cuisine: ['Wraps', 'Food Truck'],
  availableDays: ['Donnerstag'],
  coordinates: { lat: 48.2240, lon: 16.3976 },
};

export default adapter;
