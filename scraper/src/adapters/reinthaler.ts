import type { LinkAdapter } from '../types.js';

const adapter: LinkAdapter = {
  id: 'reinthaler',
  title: '🍽️ Gasthaus Reinthaler',
  url: 'https://www.gasthaus-reinthaler.at/speisekarte#mittagsmenue',
  type: 'link',
  cuisine: ['Wirtshaus', 'Reservierung erforderlich', 'Mittagsmenüs'],
  coordinates: { lat: 48.21892, lon: 16.39778 },
  mapUrl: 'https://maps.app.goo.gl/HN1hvZRF9ZsyWzKe8',
};

export default adapter;
