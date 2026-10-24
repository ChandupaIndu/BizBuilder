import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Business, Product, request, User, Website } from './api';
import WebsiteBuilder, { BuilderPreview } from './WebsiteBuilder';
import { readSites } from './siteTemplates';

type Session = { token: string; user: User };
type PublicSite = { id: string; name: string; slug: string; template: string; business: { name: string; description?: string; category?: string; email?: string; phone?: string; products: Product[] }; pages: { id: string; title: string; slug: string; content: string }[] };
const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
function readSession(): Session | null {
  try {
    const stored = localStorage.getItem('bizbuilder-session');
    if (!stored) return null;
    const value = JSON.parse(stored) as Partial<Session>;
    return typeof value.token === 'string' && value.token.length > 0 && value.user &&
      typeof value.user.id === 'string' && typeof value.user.name === 'string' && typeof value.user.email === 'string'
      ? value as Session : null;
  } catch { return null; }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(readSession);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selected, setSelected] = useState<Business | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const publicSlug = window.location.pathname.startsWith('/s/') ? decodeURIComponent(window.location.pathname.slice(3)) : '';
  const [publicSite, setPublicSite] = useState<PublicSite | null>(null);
  const [publicLoading, setPublicLoading] = useState(Boolean(publicSlug));
  const [publicError, setPublicError] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingWebsite, setEditingWebsite] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const list = await request<Business[]>('/businesses', session.token);
      setBusinesses(list);
      if (selected) {
        const current = list.find((item) => item.id === selected.id) || null;
        setSelected(current);
        if (current) setProducts(await request<Product[]>(`/businesses/${current.id}/products`, session.token));
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your workspace'); }
  }, [session, selected?.id]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!session) return;
    let active = true;
    request<{ user: User }>('/auth/me', session.token).catch((e: unknown) => {
      if (!active) return;
      if (e instanceof Error && /invalid|expired|authentication is required|unauthenticated|account no longer exists/i.test(e.message)) {
        setSession(null); setSelected(null); setBusinesses([]); setProducts([]);
      } else setError(e instanceof Error ? e.message : 'Could not verify your saved sign-in.');
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!publicSlug) return;
    request<PublicSite>(`/public/sites/${encodeURIComponent(publicSlug)}`).then(setPublicSite)
      .catch((e: unknown) => setPublicError(e instanceof Error ? e.message : 'This website could not be found.'))
      .finally(() => setPublicLoading(false));
  }, [publicSlug]);
  useEffect(() => {
    if (session) localStorage.setItem('bizbuilder-session', JSON.stringify(session));
    else localStorage.removeItem('bizbuilder-session');
  }, [session]);

  async function submit(event: FormEvent<HTMLFormElement>, action: (data: FormData) => Promise<void>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { await action(new FormData(event.currentTarget)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setBusy(false); }
  }

  async function authenticate(data: FormData) {
    const path = authMode === 'register' ? '/auth/register' : '/auth/login';
    const result = await request<Session>(path, undefined, { method: 'POST', body: JSON.stringify(Object.fromEntries(data)) });
    if (!result?.token || !result.user?.id || !result.user?.name || !result.user?.email) throw new Error('The API did not return a valid sign-in. Please try again.');
    setSession(result); setMessage('You’re in. Let’s get your business online.');
  }

  async function createBusiness(data: FormData) {
    await request('/businesses', session!.token, { method: 'POST', body: JSON.stringify(Object.fromEntries(data)) });
    setMessage('Business profile created.'); await refresh();
  }

  async function createWebsite(data: FormData) {
    const body = Object.fromEntries(data);
    const site = await request<Website>(`/businesses/${selected!.id}/websites`, session!.token, { method: 'POST', body: JSON.stringify(body) });
    setSelected({ ...selected!, website: [site, ...(selected!.website || [])] });
    setMessage('Draft website created.');
  }

  async function createProduct(data: FormData) {
    await request(`/businesses/${selected!.id}/products`, session!.token, { method: 'POST', body: JSON.stringify(Object.fromEntries(data)) });
    setMessage('Product or service added.'); await refresh();
  }

  async function publish(site: Website) {
    setError('');
    try {
      await request(`/websites/${site.id}/${site.status === 'PUBLISHED' ? 'unpublish' : 'publish'}`, session!.token, { method: 'PATCH' });
      setSelected({ ...selected!, website: selected!.website?.map((item) => item.id === site.id ? { ...item, status: site.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' } : item) });
      setMessage(site.status === 'PUBLISHED' ? 'Website moved back to draft.' : 'Your website is live.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update website'); }
  }

  async function savePage(site: Website, pageId: string, data: FormData) {
    await request(`/websites/${site.id}/pages/${pageId}`, session!.token, { method: 'PATCH', body: JSON.stringify({ content: data.get('content') }) });
    setSelected({ ...selected!, website: selected!.website?.map((item) => item.id === site.id ? { ...item, pages: item.pages?.map((page) => page.id === pageId ? { ...page, content: String(data.get('content') || '') } : page) } : item) });
    setMessage('Homepage content saved.');
  }

  function logout() { setSession(null); setSelected(null); setBusinesses([]); setProducts([]); }

  if (publicSlug) {
    const localSite = readSites().find((site) => site.slug === publicSlug && site.published);
    if (localSite) return <main className="public-site"><BuilderPreview site={localSite} /><div className="local-publish-banner">This preview is published locally in this browser.</div></main>;
    return <main className="public-site">
    {publicLoading ? <div className="public-message">Opening this website...</div> : publicError || !publicSite ? <div className="public-message"><span className="brand-mark">b.</span><h1>We couldn’t find this website.</h1><p>{publicError || 'It may be a draft or the address may have changed.'}</p><a className="button primary" href="/">Go to BizBuilder</a></div> : <><nav className="public-nav"><a className="public-brand" href={`/s/${publicSite.slug}`}>{publicSite.business.name}</a><div>{publicSite.pages.map((page) => <a key={page.id} href={`#${page.slug}`}>{page.title}</a>)}</div></nav><section className="public-hero"><span className="eyebrow">{publicSite.business.category || 'WELCOME'}</span><h1>{publicSite.name}</h1><p>{publicSite.business.description || `A little about ${publicSite.business.name}.`}</p><a className="button primary" href="#offerings">Take a look ↗</a></section><div className="public-content">{publicSite.pages.map((page) => <section className="public-page" id={page.slug} key={page.id}><span className="eyebrow">{publicSite.business.name.toUpperCase()}</span><h2>{page.title}</h2><p>{page.content || 'A little more about what makes this business special.'}</p></section>)}{publicSite.business.products.length > 0 && <section className="public-offerings" id="offerings"><span className="eyebrow">MADE / OFFERED WITH CARE</span><h2>A few good things.</h2><div className="public-products">{publicSite.business.products.map((product) => <article key={product.id}><span>{product.type === 'service' ? '✳' : '◇'}</span><h3>{product.name}</h3><p>{product.description}</p>{product.price && <b>${product.price}</b>}</article>)}</div></section>}</div><footer className="public-footer"><span>{publicSite.business.name}</span>{publicSite.business.email && <a href={`mailto:${publicSite.business.email}`}>Get in touch ↗</a>}<small>Made with BizBuilder</small></footer></>}
  </main>;

  }

  if (!session) return <main className="landing">
    <nav className="topbar"><a className="brand" href="#home"><span className="brand-mark">b.</span> bizbuilder</a><a href="#start" className="nav-link">Get started <span>↗</span></a></nav>
    <section className="hero" id="home">
      <div className="hero-copy"><div className="eyebrow"><span className="pulse" /> THE HOME FOR YOUR BUSINESS ONLINE</div>
        <h1>A little business.<br /><em>A big online presence.</em></h1>
        <p className="hero-text">Make a website that feels like you. Show what you do, share what you sell, and give customers a place to find you.</p>
        <a className="button primary hero-button" href="#start">Build your website <span>↗</span></a>
        <div className="hero-note"><div className="avatar-stack"><i>A</i><i>M</i><i>J</i></div><span>Made for the people<br />building something real.</span></div>
      </div>
      <div className="hero-art" aria-label="Illustration of a small business website preview"><div className="sun-disc"/><div className="art-window"><div className="window-top"><b>● ● ●</b><span>yourbusiness.com</span><span>⋯</span></div><div className="mock-nav"><span>GOOD THINGS</span><span>Shop About Contact</span></div><div className="mock-photo"><div className="mock-stamp">MADE<br />WITH<br />CARE</div><div className="mock-caption">A slower kind<br />of Sunday.</div><div className="mock-flower">✿</div></div><div className="mock-bottom"><span>Thoughtful things for everyday living</span><b>EXPLORE THE SHOP ↗</b></div></div><div className="art-label"><span>✳</span> Your story, beautifully told</div><div className="art-sparkle">✳</div></div>
    </section>
    <section className="trust"><span>ONE SIMPLE PLACE TO</span><b>✳ Show up</b><b>✳ Sell more</b><b>✳ Grow your way</b></section>
    <section className="auth-section" id="start"><div className="auth-intro"><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h2>Let’s make it<br />official.</h2><p>Set up your free workspace and start making a home for your business online.</p><div className="auth-proof"><span>01</span> Your business, all in one place</div><div className="auth-proof"><span>02</span> A website you can call your own</div><div className="auth-proof"><span>03</span> No code. Just your good ideas.</div></div>
      <form className="auth-card" onSubmit={(event) => void submit(event, authenticate)}><div className="form-tabs"><button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Create account</button><button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Sign in</button></div><h3>{authMode === 'register' ? 'Your business begins here.' : 'Welcome back.'}</h3><p className="muted">{authMode === 'register' ? 'A few details and you’re on your way.' : 'Pick up right where you left off.'}</p>
        {authMode === 'register' && <label>Your name<input name="name" autoComplete="name" required placeholder="Alex Morgan" /></label>}<label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@yourbusiness.com" /></label><label>Password<input name="password" type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} minLength={8} required placeholder="At least 8 characters" /></label>
        {error && <p className="alert error">{error}</p>}{message && <p className="alert success">{message}</p>}<button className="button primary full" disabled={busy}>{busy ? 'One moment...' : authMode === 'register' ? 'Create my account ↗' : 'Sign in ↗'}</button><small className="legal">By continuing, you agree to our Terms and Privacy Policy.</small></form></section>
    <footer className="footer"><a className="brand" href="#home"><span className="brand-mark">b.</span> bizbuilder</a><span>A good place to grow.</span><span>© 2025 BizBuilder</span></footer>
  </main>;

  if (selected && editingWebsite) return <div className="dashboard"><aside className="sidebar"><a className="brand" href="#workspace"><span className="brand-mark">b.</span> bizbuilder</a></aside><main className="main-panel"><WebsiteBuilder business={selected} onClose={() => setEditingWebsite(false)} /></main></div>;

  return <div className="dashboard"><aside className="sidebar"><a className="brand" href="#workspace"><span className="brand-mark">b.</span> bizbuilder</a><div className="side-label">WORKSPACE</div><button className={`side-item ${!selected ? 'selected' : ''}`} onClick={() => setSelected(null)}><span>▦</span> Overview</button><div className="side-label spaced">YOUR BUSINESSES</div>{businesses.map((business) => <button key={business.id} className={`side-item ${selected?.id === business.id ? 'selected' : ''}`} onClick={() => setSelected(business)}><span className="business-icon">{business.name[0]?.toUpperCase()}</span>{business.name}</button>)}<div className="sidebar-bottom"><div className="profile"><div className="profile-avatar">{session.user.name[0]}</div><div><b>{session.user.name}</b><small>{session.user.email}</small></div><button aria-label="Sign out" onClick={logout}>↗</button></div></div></aside>
    <main className="main-panel"><header className="dash-header"><div className="breadcrumbs">Workspace <span>/</span> {selected?.name || 'Overview'}</div><button className="user-chip" onClick={logout}><span className="profile-avatar">{session.user.name[0]}</span>{session.user.name}<span>⌄</span></button></header>
      <div className="content"><div className="welcome-row"><div><div className="eyebrow">YOUR BUSINESS, BEAUTIFULLY ONLINE</div><h1>{selected ? selected.name : `Good to see you, ${session.user.name.split(' ')[0]}.`}</h1><p className="muted">{selected ? selected.description || 'Your business workspace' : 'Here’s a little space to bring your next idea to life.'}</p></div>{selected && <button className="button outline" onClick={() => setSelected(null)}>← All businesses</button>}</div>
      {error && <p className="alert error">{error}</p>}{message && <p className="alert success">{message}</p>}
      {!selected ? <><div className="section-heading"><div><h2>Your businesses</h2><p className="muted">Everything you’re building, all in one place.</p></div><span className="count-pill">{businesses.length} {businesses.length === 1 ? 'business' : 'businesses'}</span></div><div className="business-grid">{businesses.map((business, index) => <button className="business-card" key={business.id} onClick={() => { setSelected(business); setMessage(''); }}><div className={`card-art art-${index % 3}`}><span className="card-mark">{business.name[0]}</span><span className="card-arrow">↗</span></div><div className="business-card-body"><div><h3>{business.name}</h3><p>{business.category || 'Your business'}</p></div><span className="card-meta">{business._count?.products || 0} items</span></div></button>)}<form className="new-business" onSubmit={(event) => void submit(event, createBusiness)}><div className="plus-mark">+</div><h3>Something new?</h3><p>Start with the basics. You can add all the details later.</p><label>Business name<input name="name" required placeholder="e.g. Sunday Studio" /></label><label>Category<input name="category" placeholder="e.g. Bakery, salon, studio" /></label><label>Short introduction<textarea name="description" rows={2} placeholder="What makes your business special?" /></label><label>Contact email<input name="email" type="email" placeholder="hello@yourbusiness.com" /></label><button disabled={busy} className="button dark full">{busy ? 'Creating...' : 'Create a business ↗'}</button></form></div><div className="tip-banner"><span className="tip-icon">✳</span><div><b>Small steps make a real website.</b><p>Add a business, choose a template, and you’ll be ready to share your story.</p></div><span className="tip-arrow">↗</span></div></> : <><div className="workspace-grid"><div className="panel website-panel"><div className="panel-heading"><div><span className="panel-icon lavender">⌘</span><h2>Your website</h2><p className="muted">A home on the internet that feels like you.</p></div><button className="button primary small" onClick={() => setEditingWebsite(true)}>Open website studio ↗</button></div>{(selected.website || []).map((site) => <div className="site-row" key={site.id}><div className="site-thumb">✿</div><div className="site-info"><b>{site.name}</b>{site.status === 'PUBLISHED' ? <a className="site-url" href={`/s/${site.slug}`} target="_blank" rel="noreferrer">{window.location.host}/s/{site.slug} ↗</a> : <span>{site.slug} · private draft</span>}<small className={site.status === 'PUBLISHED' ? 'live' : 'draft'}>{site.status === 'PUBLISHED' ? '● LIVE' : '● DRAFT'}</small></div><button className="button small outline" onClick={() => void publish(site)}>{site.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}</button></div>)}{(selected.website || []).map((site) => site.pages?.[0] ? <form className="page-edit" key={site.pages[0].id} onSubmit={(event) => void submit(event, (data) => savePage(site, site.pages![0].id, data))}><label>Homepage introduction<textarea name="content" rows={3} defaultValue={site.pages[0].content} placeholder="Tell visitors what makes your business special." /></label><button className="button small outline" disabled={busy}>{busy ? 'Saving...' : 'Save introduction'}</button></form> : null)}<form className="inline-create" onSubmit={(event) => void submit(event, createWebsite)}><label>Website name<input name="name" required placeholder={`The ${selected.name} website`} /></label><label>Starting style<select name="template"><option value="starter">Soft & simple</option><option value="studio">Studio</option><option value="market">Market</option></select></label><button className="button primary full" disabled={busy}>{busy ? 'Creating...' : 'Create a website ↗'}</button></form></div>
        <div className="panel products-panel"><div className="panel-heading"><div><span className="panel-icon peach">◇</span><h2>Products & services</h2><p className="muted">The things your customers come for.</p></div><span className="count-pill">{products.length}</span></div><div className="product-list">{products.map((product) => <div className="product-row" key={product.id}><span className="product-symbol">{product.type === 'service' ? '✳' : '◇'}</span><div><b>{product.name}</b><small>{product.description || (product.type === 'service' ? 'Service' : 'Product')}</small></div><span className="price">{product.price ? `$${product.price}` : '—'}</span></div>)}{products.length === 0 && <p className="empty-state">Your list is ready when you are. Add your first item below.</p>}</div><form className="product-form" onSubmit={(event) => void submit(event, createProduct)}><input name="name" required placeholder="Item or service name"/><div className="product-input-row"><input name="price" type="number" step="0.01" min="0" placeholder="Price (optional)"/><select name="type"><option value="product">Product</option><option value="service">Service</option></select></div><button className="button dark full" disabled={busy}>{busy ? 'Adding...' : 'Add to your list ↗'}</button></form></div></div>
        <div className="preview-banner"><div><span className="eyebrow">A LITTLE SOMETHING TO SHARE</span><h3>Make it yours, then let the world in.</h3><p>Publish your website whenever you’re ready. Drafts stay private until then.</p></div><div className="preview-decoration">✳</div></div></>}
      </div>
    </main><a className="floating-doc" href={`${API}/health`} target="_blank" rel="noreferrer">API status <span>↗</span></a></div>;
}
