import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Business } from './api';
import { BuilderSite, makeSite, readSites, SectionKey, templates, writeSites } from './siteTemplates';

export function BuilderPreview({ site, mode = 'desktop' }: { site: BuilderSite; mode?: 'desktop' | 'mobile' }) {
  const ordered = site.sections;
  return <div className={`builder-preview ${mode}`} style={{ '--site-color': site.color } as CSSProperties}>
    <nav><b>{site.brand || site.businessName}</b><div>{ordered.map((key) => <a key={key} href={`#${key}`}>{key}</a>)}</div><button>{site.button}</button></nav>
    <header style={{ backgroundImage: `linear-gradient(90deg,#171b18bb,#171b1820),url("${site.image}")` }}><small>{site.businessName.toUpperCase()}</small><h1>{site.heading}</h1><p>{site.description}</p><button>{site.button} ↗</button></header>
    {ordered.map((key) => <section key={key} id={key} className={`preview-section ${key}`}>
      {key === 'about' && <><small>OUR STORY</small><h2>A business with a little heart.</h2><p>{site.about}</p></>}
      {key === 'offerings' && <><small>WHAT WE DO</small><h2>Made for your everyday.</h2><div className="preview-cards"><article>Thoughtful service</article><article>Made with care</article><article>Here for you</article></div></>}
      {key === 'contact' && <><small>COME SAY HELLO</small><h2>We’d love to hear from you.</h2><p>{site.email} {site.phone && ` · ${site.phone}`}</p></>}
    </section>)}<footer>{site.brand || site.businessName} <span>Made with BizBuilder</span></footer>
  </div>;
}

export default function WebsiteBuilder({ business, onClose }: { business: Business; onClose: () => void }) {
  const [sites, setSites] = useState(readSites);
  const [site, setSite] = useState<BuilderSite | null>(null);
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [notice, setNotice] = useState('');
  const update = (next: BuilderSite) => { setSite(next); const saved = sites.some((item) => item.id === next.id) ? sites.map((item) => item.id === next.id ? next : item) : [...sites, next]; setSites(saved); writeSites(saved); };
  const toggleSection = (key: SectionKey) => site && update({ ...site, sections: site.sections.includes(key) ? site.sections.filter((item) => item !== key) : [...site.sections, key] });
  const moveSection = (index: number, delta: number) => { if (!site) return; const sections = [...site.sections]; const target = index + delta; if (target < 0 || target >= sections.length) return; [sections[index], sections[target]] = [sections[target], sections[index]]; update({ ...site, sections }); };
  const publish = () => { if (!site) return; const next = { ...site, published: !site.published }; update(next); setNotice(next.published ? `Published locally at /s/${next.slug}. This is saved only in this browser.` : 'Site returned to draft.'); };
  return <div className="builder-shell">
    <div className="builder-top"><button className="button outline" onClick={onClose}>← Workspace</button><div><b>Website studio</b><small>Changes save in this browser</small></div>{site && <button className="button primary" onClick={publish}>{site.published ? 'Unpublish' : 'Publish locally'} ↗</button>}</div>
    {site ? <div className="builder-workspace"><aside className="builder-controls"><button className="back-link" onClick={() => { setSite(null); setNotice(''); }}>← All templates</button><h2>Make it yours</h2><p className="muted">Your preview updates as you edit.</p>
      <label>Business name<input value={site.businessName} onChange={(e) => update({ ...site, businessName: e.target.value, brand: e.target.value })} /></label>
      <label>Logo text<input value={site.brand} onChange={(e) => update({ ...site, brand: e.target.value })} /></label>
      <label>Main heading<input value={site.heading} onChange={(e) => update({ ...site, heading: e.target.value })} /></label>
      <label>Short description<textarea value={site.description} onChange={(e) => update({ ...site, description: e.target.value })} rows={3} /></label>
      <label>About your business<textarea value={site.about} onChange={(e) => update({ ...site, about: e.target.value })} rows={4} /></label>
      <label>Hero image URL<input value={site.image} onChange={(e) => update({ ...site, image: e.target.value })} /></label>
      <label>Button label<input value={site.button} onChange={(e) => update({ ...site, button: e.target.value })} /></label>
      <label>Brand color<div className="color-control"><input type="color" value={site.color} onChange={(e) => update({ ...site, color: e.target.value })} /><span>{site.color}</span></div></label>
      <label>Email<input type="email" value={site.email} onChange={(e) => update({ ...site, email: e.target.value })} /></label>
      <label>Phone<input value={site.phone} onChange={(e) => update({ ...site, phone: e.target.value })} /></label>
      <div className="section-toggles"><b>Website sections</b>{(['about', 'offerings', 'contact'] as SectionKey[]).map((key) => <div key={key}><label><input type="checkbox" checked={site.sections.includes(key)} onChange={() => toggleSection(key)} /> {key[0].toUpperCase() + key.slice(1)}</label>{site.sections.includes(key) && <span><button onClick={() => moveSection(site.sections.indexOf(key), -1)}>↑</button><button onClick={() => moveSection(site.sections.indexOf(key), 1)}>↓</button></span>}</div>)}</div>
      <div className="slug-field">Preview link <code>/s/{site.slug}</code>{site.published && <a href={`/s/${site.slug}`} target="_blank" rel="noreferrer">Open locally ↗</a>}</div>{notice && <p className="local-notice">{notice}</p>}
    </aside><main className="preview-stage"><div className="preview-toolbar"><span>LIVE PREVIEW</span><div><button className={mode === 'desktop' ? 'active' : ''} onClick={() => setMode('desktop')}>▣ Desktop</button><button className={mode === 'mobile' ? 'active' : ''} onClick={() => setMode('mobile')}>▯ Mobile</button></div></div><BuilderPreview site={site} mode={mode} /></main></div> : <div className="template-picker"><div className="eyebrow">A GOOD PLACE TO START</div><h1>Choose a look for {business.name}.</h1><p>Pick a starting point, then shape every detail around your business.</p><div className="template-grid">{templates.map((template) => <button key={template.id} className="template-card" onClick={() => { const existing = sites.find((item) => item.businessId === business.id); const next = existing ? { ...existing } : makeSite(business, template.id); if (!existing) update(next); else setSite(next); }}><div className="template-image" style={{ backgroundImage: `url("${template.image}")` }}><span style={{ background: template.color }}>{template.category}</span></div><div><h3>{template.name}</h3><p>{template.heading}</p><b>{sites.some((item) => item.businessId === business.id) ? 'Continue editing →' : 'Choose template →'}</b></div></button>)}</div><small className="storage-note">Drafts and local publishing are stored in this browser only. Server publishing requires the API database.</small></div>}
  </div>;
}
