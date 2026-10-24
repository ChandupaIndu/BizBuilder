export type SectionKey = 'about' | 'offerings' | 'contact';
export type BuilderSite = {
  id: string; businessId: string; businessName: string; template: string; slug: string; published: boolean;
  brand: string; heading: string; description: string; about: string; image: string; button: string;
  email: string; phone: string; color: string; sections: SectionKey[];
};

export const templates = [
  { id: 'cafe', name: 'Cafe & restaurant', category: 'Food & drink', color: '#a84e37', heading: 'A table worth gathering around', description: 'Seasonal plates, good coffee, and a warm welcome every day.', image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1400&q=85' },
  { id: 'clothing', name: 'Clothing store', category: 'Retail', color: '#526b58', heading: 'Good things, made to be worn', description: 'Thoughtful pieces for the everyday, made with care.', image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1400&q=85' },
  { id: 'salon', name: 'Salon & beauty', category: 'Beauty', color: '#a45f74', heading: 'A little time, just for you', description: 'Feel-good hair, thoughtful care, and a moment to unwind.', image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1400&q=85' },
  { id: 'services', name: 'Professional services', category: 'Services', color: '#52647a', heading: 'Good work starts with a conversation', description: 'Clear advice and thoughtful support for your next big step.', image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=85' },
];

const storageKey = 'bizbuilder-local-sites';
export function readSites(): BuilderSite[] {
  try { return JSON.parse(localStorage.getItem(storageKey) || '[]') as BuilderSite[]; } catch { return []; }
}
export function writeSites(sites: BuilderSite[]) { localStorage.setItem(storageKey, JSON.stringify(sites)); }
export function makeSite(business: { id: string; name: string; description?: string; email?: string; phone?: string }, templateId: string): BuilderSite {
  const template = templates.find((item) => item.id === templateId) || templates[0];
  return { id: crypto.randomUUID(), businessId: business.id, businessName: business.name, template: template.id,
    slug: `${business.name}-${Math.random().toString(36).slice(2, 6)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), published: false,
    brand: business.name, heading: template.heading, description: business.description || template.description, about: business.description || `Welcome to ${business.name}. We believe the details matter, and we are here to make every visit a good one.`,
    image: template.image, button: 'Get in touch', email: business.email || '', phone: business.phone || '', color: template.color, sections: ['about', 'offerings', 'contact'] };
}
