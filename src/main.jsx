import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Camera,
  Download,
  Edit3,
  Eye,
  Globe2,
  GripVertical,
  ImageUp,
  Link as LinkIcon,
  LockKeyhole,
  LogOut,
  Plus,
  QrCode,
  Save,
  Trash2,
  X
} from 'lucide-react';
import './styles.css';

const ADMIN_EMAIL = 'landminemuseum89@gmail.com';
const AUTH_KEY = 'clm-linktree-admin';

const emptyLink = {
  title: '',
  url: '',
  icon: 'globe',
  is_active: true
};

const emptyOrganization = {
  name: '',
  code: '',
  notes: ''
};

const configuredPublicSiteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || '').replace(/\/+$/, '');

function getPublicSiteUrl() {
  return configuredPublicSiteUrl || window.location.origin;
}

function getOrganizationUrl(code) {
  return `${getPublicSiteUrl()}/?variable=${encodeURIComponent(code)}`;
}

function getQrDownloadUrl(code) {
  const params = new URLSearchParams({
    code,
    origin: getPublicSiteUrl()
  });
  return `/api/linktree/qr?${params.toString()}`;
}

function App() {
  const isAdmin = window.location.pathname.startsWith('/admin');
  return isAdmin ? <AdminApp /> : <PublicPage />;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function getBrowserRegion() {
  const locale = navigator.language || navigator.languages?.[0] || '';
  const region = locale.split('-')[1] || '';
  return region.toUpperCase();
}

function formatLocation(visit) {
  const place = [visit.city, visit.region, visit.country].filter(Boolean).join(', ');
  return place || visit.timezone || visit.browser_region || '-';
}

function PublicPage() {
  const [state, setState] = useState({ loading: true, profile: null, links: [], trackedOrganization: null });
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const variable = params.get('variable') || '';
    const publicParams = new URLSearchParams();

    if (variable) publicParams.set('variable', variable);
    publicParams.set('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    publicParams.set('browser_region', getBrowserRegion());

    api(`/api/linktree/public?${publicParams.toString()}`)
      .then((payload) => setState({ loading: false, ...payload }))
      .catch((err) => {
        setError(err.message);
        setState((current) => ({ ...current, loading: false }));
      });
  }, []);

  const handlePublicLinkClick = (event, link) => {
    event.preventDefault();
    const payload = JSON.stringify({ id: link.id });

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/linktree/link-click', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/linktree/link-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
    }

    window.open(link.url, '_blank', 'noopener,noreferrer');
  };

  if (state.loading) {
    return (
      <main className="public-shell">
        <section className="linktree-card loading-card">
          <div className="avatar-skeleton" />
          <div className="line-skeleton wide" />
          <div className="line-skeleton" />
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="public-shell">
        <section className="linktree-card">
          <p className="error-text">{error}</p>
        </section>
      </main>
    );
  }

  const { profile, links, trackedOrganization } = state;

  return (
    <main className="public-shell">
      <section className="linktree-card">
        <div className="public-profile">
          <img className="profile-photo" src={profile.avatar_url} alt={profile.display_name} />
          <h1>{profile.display_name}</h1>
          <p className="subtitle">{profile.subtitle}</p>
          {profile.bio ? <p className="bio">{profile.bio}</p> : null}
        </div>

        <div className="public-links" aria-label="Museum links">
          {links.map((link) => (
            <a key={link.id} className="public-link" href={link.url} target="_blank" rel="noreferrer" onClick={(event) => handlePublicLinkClick(event, link)}>
              <span className="public-link-icon">
                <Globe2 size={22} aria-hidden="true" />
              </span>
              <span>{link.title}</span>
            </a>
          ))}
        </div>

        {trackedOrganization ? (
          <p className="visit-source">Visit tracked from {trackedOrganization.name}</p>
        ) : null}
      </section>
    </main>
  );
}

function AdminApp() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(AUTH_KEY) === 'true');
  const [credentials, setCredentials] = useState({ email: ADMIN_EMAIL, password: '' });
  const [loginError, setLoginError] = useState('');

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError('');

    try {
      await api('/api/linktree/login', {
        method: 'POST',
        body: JSON.stringify(credentials)
      });
      localStorage.setItem(AUTH_KEY, 'true');
      setAuthed(true);
    } catch (err) {
      setLoginError(err.message);
    }
  };

  if (!authed) {
    return (
      <main className="admin-login-shell">
        <form className="login-panel" onSubmit={handleLogin}>
          <div className="login-icon">
            <LockKeyhole size={26} aria-hidden="true" />
          </div>
          <h1>Admin</h1>
          <p>Manage buttons, the profile image, public text, and organization QR codes.</p>
          <label>
            User
            <input
              value={credentials.email}
              onChange={(event) => setCredentials((current) => ({ ...current, email: event.target.value }))}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={credentials.password}
              onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
              placeholder="aki123"
              autoComplete="current-password"
            />
          </label>
          {loginError ? <p className="form-error">{loginError}</p> : null}
          <button className="primary-button" type="submit">
            Sign in
          </button>
        </form>
      </main>
    );
  }

  return (
    <Dashboard
      onLogout={() => {
        localStorage.removeItem(AUTH_KEY);
        setAuthed(false);
      }}
    />
  );
}

function Dashboard({ onLogout }) {
  const [tab, setTab] = useState('profile');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const payload = await api('/api/linktree/admin');
      setData(payload);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (text) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 2400);
  };

  const totals = useMemo(() => {
    const visits = data?.visits || [];
    const linkClicks = (data?.links || []).reduce((total, link) => total + Number(link.click_count || 0), 0);
    return {
      links: data?.links?.length || 0,
      organizations: data?.organizations?.length || 0,
      visits: visits.length,
      linkClicks
    };
  }, [data]);

  if (!data) {
    return (
      <main className="admin-shell">
        <div className="admin-loading">Loading admin...</div>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <span className="eyebrow">Cambodia Landmine Museum</span>
          <h1>Link manager</h1>
        </div>
        <nav className="admin-nav" aria-label="Admin sections">
          <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
            <Camera size={18} aria-hidden="true" />
            Profile
          </button>
          <button className={tab === 'links' ? 'active' : ''} onClick={() => setTab('links')}>
            <LinkIcon size={18} aria-hidden="true" />
            Buttons
          </button>
          <button className={tab === 'organizations' ? 'active' : ''} onClick={() => setTab('organizations')}>
            <QrCode size={18} aria-hidden="true" />
            QR organizations
          </button>
        </nav>
        <a className="preview-link" href="/" target="_blank" rel="noreferrer">
          <Eye size={18} aria-hidden="true" />
          View public page
        </a>
        <button className="logout-button" onClick={onLogout}>
          <LogOut size={18} aria-hidden="true" />
          Log out
        </button>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div>
            <span className="eyebrow">Local session</span>
            <h2>{tab === 'profile' ? 'Photo and text' : tab === 'links' ? 'Public buttons' : 'QR organizations'}</h2>
          </div>
          <div className="topbar-stats">
            <Stat label="Buttons" value={totals.links} />
            <Stat label="Organizations" value={totals.organizations} />
            <Stat label="Visits" value={totals.visits} />
            <Stat label="Clicks" value={totals.linkClicks} />
          </div>
        </header>

        {message ? <div className="toast">{message}</div> : null}
        {busy ? <div className="quiet-status">Updating...</div> : null}

        {tab === 'profile' ? (
          <ProfileEditor profile={data.profile} onSaved={() => load().then(() => flash('Profile saved'))} />
        ) : null}
        {tab === 'links' ? (
          <LinksEditor links={data.links} onSaved={() => load().then(() => flash('Buttons updated'))} />
        ) : null}
        {tab === 'organizations' ? (
          <OrganizationsEditor
            organizations={data.organizations}
            visits={data.visits}
            onSaved={() => load().then(() => flash('Organizations updated'))}
          />
        ) : null}
      </section>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-pill">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ProfileEditor({ profile, onSaved }) {
  const [form, setForm] = useState(profile);
  const [uploading, setUploading] = useState(false);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const save = async (event) => {
    event.preventDefault();
    await api('/api/linktree/profile', {
      method: 'PUT',
      body: JSON.stringify(form)
    });
    await onSaved();
  };

  const uploadImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const payload = await api('/api/linktree/profile-image', {
          method: 'POST',
          body: JSON.stringify({ fileName: file.name, imageData: reader.result })
        });
        setForm((current) => ({ ...current, avatar_url: payload.avatar_url }));
        await onSaved();
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <form className="editor-grid" onSubmit={save}>
      <section className="admin-card preview-card">
        <img className="profile-photo" src={form.avatar_url} alt={form.display_name} />
        <h3>{form.display_name}</h3>
        <p>{form.subtitle}</p>
        <label className="upload-button">
          <ImageUp size={18} aria-hidden="true" />
          {uploading ? 'Uploading...' : 'Upload photo'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadImage} />
        </label>
      </section>

      <section className="admin-card form-card">
        <label>
          Main name
          <input value={form.display_name} onChange={(event) => update('display_name', event.target.value)} />
        </label>
        <label>
          Text below the photo
          <input value={form.subtitle} onChange={(event) => update('subtitle', event.target.value)} />
        </label>
        <label>
          Additional text
          <textarea value={form.bio} onChange={(event) => update('bio', event.target.value)} rows="4" />
        </label>
        <button className="primary-button" type="submit">
          <Save size={18} aria-hidden="true" />
          Save profile
        </button>
      </section>
    </form>
  );
}

function LinksEditor({ links, onSaved }) {
  const [items, setItems] = useState(links);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyLink);
  const [draggedId, setDraggedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [actionId, setActionId] = useState(null);

  useEffect(() => {
    setItems(links);
  }, [links]);

  const startEdit = (link) => {
    setEditing(link.id);
    setForm({ ...link, is_active: Boolean(link.is_active) });
  };

  const reset = () => {
    setEditing(null);
    setForm(emptyLink);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      url: normalizeUrl(form.url),
      is_active: Boolean(form.is_active)
    };

    try {
      await api('/api/linktree/link', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(editing ? { ...payload, id: editing } : payload)
      });
      reset();
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this button permanently? Its statistics will no longer appear in the panel.')) return;
    setActionId(id);
    try {
      await api('/api/linktree/link/delete', {
        method: 'POST',
        body: JSON.stringify({ id })
      });
      await onSaved();
    } finally {
      setActionId(null);
    }
  };

  const toggleVisibility = async (link) => {
    setActionId(link.id);
    try {
      await api('/api/linktree/link', {
        method: 'PUT',
        body: JSON.stringify({
          ...link,
          is_active: !Boolean(link.is_active)
        })
      });
      await onSaved();
    } finally {
      setActionId(null);
    }
  };

  const saveOrder = async (orderedItems) => {
    setOrderSaving(true);
    try {
      await Promise.all(
        orderedItems.map((link, index) =>
          api('/api/linktree/link', {
            method: 'PUT',
            body: JSON.stringify({
              ...link,
              position: index + 1,
              is_active: Boolean(link.is_active)
            })
          })
        )
      );
      await onSaved();
    } finally {
      setOrderSaving(false);
    }
  };

  const moveItem = (fromIndex, toIndex, shouldPersist = true) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= items.length) return items;
    const nextItems = [...items];
    const [moved] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, moved);
    setItems(nextItems);
    if (shouldPersist) saveOrder(nextItems);
    return nextItems;
  };

  const moveByButton = (index, direction) => {
    moveItem(index, index + direction);
  };

  const handleDragOver = (event, targetId) => {
    event.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    setItems((current) => {
      const fromIndex = current.findIndex((link) => link.id === draggedId);
      const toIndex = current.findIndex((link) => link.id === targetId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current;
      const nextItems = [...current];
      const [moved] = nextItems.splice(fromIndex, 1);
      nextItems.splice(toIndex, 0, moved);
      return nextItems;
    });
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    if (!draggedId) return;
    const orderedItems = [...items];
    setDraggedId(null);
    await saveOrder(orderedItems);
  };

  return (
    <div className="split-layout">
      <section className="admin-card">
        <div className="section-title">
          <h3>All buttons</h3>
          <span>{orderSaving ? 'Saving order...' : `${links.length} configured`}</span>
        </div>
        <div className="item-list">
          {items.map((link, index) => (
            <article
              className={draggedId === link.id ? 'list-item dragging' : 'list-item'}
              draggable
              key={link.id}
              onDragEnd={() => setDraggedId(null)}
              onDragOver={(event) => handleDragOver(event, link.id)}
              onDragStart={() => setDraggedId(link.id)}
              onDrop={handleDrop}
            >
              <span className="drag-handle" title="Drag to reorder">
                <GripVertical size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>{link.title}</strong>
                <span>{link.url}</span>
              </div>
              <span className="click-count">{Number(link.click_count || 0)} clicks</span>
              <span className={link.is_active ? 'status active' : 'status'}>{link.is_active ? 'Visible' : 'Hidden'}</span>
              <div className="order-controls" aria-label={`Reorder ${link.title}`}>
                <button className="icon-button small" disabled={index === 0 || orderSaving} onClick={() => moveByButton(index, -1)} aria-label={`Move ${link.title} up`}>
                  <ArrowUp size={15} aria-hidden="true" />
                </button>
                <button className="icon-button small" disabled={index === items.length - 1 || orderSaving} onClick={() => moveByButton(index, 1)} aria-label={`Move ${link.title} down`}>
                  <ArrowDown size={15} aria-hidden="true" />
                </button>
              </div>
              <button className="secondary-button compact" disabled={actionId === link.id} onClick={() => toggleVisibility(link)}>
                {actionId === link.id ? <span className="spinner" aria-hidden="true" /> : null}
                {link.is_active ? 'Hide' : 'Show'}
              </button>
              <button className="secondary-button compact" disabled={actionId === link.id || orderSaving} onClick={() => startEdit(link)} aria-label={`Edit ${link.title}`}>
                <Edit3 size={18} aria-hidden="true" />
                Edit
              </button>
              <button className="secondary-button compact danger" disabled={actionId === link.id} onClick={() => remove(link.id)} aria-label={`Delete ${link.title}`}>
                {actionId === link.id ? <span className="spinner" aria-hidden="true" /> : <Trash2 size={18} aria-hidden="true" />}
                Delete
              </button>
            </article>
          ))}
        </div>
      </section>

      <form className="admin-card form-card" onSubmit={save}>
        <div className="section-title">
          <h3>{editing ? 'Edit button' : 'New button'}</h3>
          {editing ? (
            <button className="text-button" type="button" onClick={reset}>
              <X size={16} aria-hidden="true" />
              Cancel
            </button>
          ) : null}
        </div>
        <label>
          Button text
          <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
        </label>
        <label>
          URL
          <input value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} required />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
          />
          Show on public page. Hidden buttons keep their click history.
        </label>
        <button className="primary-button" disabled={saving} type="submit">
          {saving ? <span className="spinner light" aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
          {saving ? 'Saving...' : editing ? 'Save changes' : 'Add button'}
        </button>
      </form>
    </div>
  );
}

function OrganizationsEditor({ organizations, visits, onSaved }) {
  const [selectedId, setSelectedId] = useState(null);
  const [modalMode, setModalMode] = useState(null);
  const [form, setForm] = useState({ ...emptyOrganization, code: makeCode() });
  const [deletingVisitId, setDeletingVisitId] = useState(null);

  const selected = organizations.find((org) => org.id === selectedId) || null;
  const selectedVisits = selected ? visits.filter((visit) => visit.organization_id === selected.id) : [];

  const openCreate = () => {
    setForm({ ...emptyOrganization, code: makeCode() });
    setModalMode('create');
  };

  const startEdit = (organization) => {
    setForm({
      id: organization.id,
      name: organization.name,
      code: organization.code,
      notes: organization.notes || ''
    });
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode(null);
    setForm({ ...emptyOrganization, code: makeCode() });
  };

  const save = async (event) => {
    event.preventDefault();
    await api('/api/linktree/organization', {
      method: modalMode === 'edit' ? 'PUT' : 'POST',
      body: JSON.stringify(form)
    });
    closeModal();
    await onSaved();
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this organization permanently? Historical visits will keep the code, but will no longer be grouped under this organization.')) return;
    await api('/api/linktree/organization/delete', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    if (selectedId === id) setSelectedId(null);
    await onSaved();
  };

  const removeVisit = async (visitId) => {
    if (!window.confirm('Delete this visit from the organization report?')) return;
    setDeletingVisitId(visitId);
    try {
      await api('/api/linktree/visit/delete', {
        method: 'POST',
        body: JSON.stringify({ id: visitId })
      });
      await onSaved();
    } finally {
      setDeletingVisitId(null);
    }
  };

  const modalTitle = modalMode === 'edit' ? 'Edit organization' : 'Create new organization';

  if (selected) {
    return (
      <section className="admin-card organization-page">
        <button className="text-button back-button" onClick={() => setSelectedId(null)}>
          <ArrowLeft size={18} aria-hidden="true" />
          Back to all organizations
        </button>

        <div className="detail-header organization-hero">
          <div>
            <span className="eyebrow">Total visits</span>
            <strong>{selected.visit_count}</strong>
            <h3>{selected.name}</h3>
            <p className="detail-note">{selected.notes || 'No notes yet.'}</p>
          </div>
          <div className="detail-actions">
            <button className="secondary-button" onClick={() => startEdit(selected)}>
              <Edit3 size={17} aria-hidden="true" />
              Edit
            </button>
            <button className="secondary-button danger" onClick={() => remove(selected.id)}>
              <Trash2 size={17} aria-hidden="true" />
              Delete
            </button>
          </div>
        </div>

        <div className="qr-box">
          <QrCode size={42} aria-hidden="true" />
          <div>
            <span>Organization link</span>
            <code>{getOrganizationUrl(selected.code)}</code>
          </div>
          <a
            className="primary-button"
            href={getQrDownloadUrl(selected.code)}
            download={`qr-${selected.code}.png`}
          >
            <Download size={18} aria-hidden="true" />
            Download QR
          </a>
        </div>

        <div className="visits-table-wrap">
          <table className="visits-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Language</th>
                <th>Browser</th>
                <th>System</th>
                <th>Device</th>
                <th>Location</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {selectedVisits.map((visit) => (
                <tr key={visit.id}>
                  <td>{formatDate(visit.visited_at)}</td>
                  <td>{visit.language || '-'}</td>
                  <td>{visit.browser || '-'}</td>
                  <td>{visit.os || '-'}</td>
                  <td>{visit.device || '-'}</td>
                  <td>{formatLocation(visit)}</td>
                  <td>
                    <button className="secondary-button compact danger" disabled={deletingVisitId === visit.id} onClick={() => removeVisit(visit.id)}>
                      {deletingVisitId === visit.id ? <span className="spinner" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {selectedVisits.length === 0 ? (
                <tr>
                  <td colSpan="7">No visits recorded for this code yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {modalMode ? (
          <OrganizationModal
            form={form}
            modalTitle={modalTitle}
            onClose={closeModal}
            onSave={save}
            setForm={setForm}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section className="admin-card organizations-home">
      <div className="section-title organizations-title">
        <div>
          <h3>Organizations</h3>
          <span>{organizations.length} codes ready for QR printing</span>
        </div>
        <button className="primary-button" onClick={openCreate}>
          <Plus size={18} aria-hidden="true" />
          Create new
        </button>
      </div>

      <div className="organizations-table">
        {organizations.map((organization) => (
          <article className="organization-card-row" key={organization.id}>
            <div className="organization-summary">
              <strong>{organization.name}</strong>
              <code>{getOrganizationUrl(organization.code)}</code>
            </div>
            <div className="organization-metric">
              <b>{organization.visit_count}</b>
              <span>visits</span>
            </div>
            <div className="organization-row-actions">
              <button className="secondary-button compact" onClick={() => setSelectedId(organization.id)}>
                <Eye size={17} aria-hidden="true" />
                View details
              </button>
              <button className="secondary-button compact" onClick={() => startEdit(organization)}>
                <Edit3 size={17} aria-hidden="true" />
                Edit
              </button>
              <button className="secondary-button compact danger" onClick={() => remove(organization.id)}>
                <Trash2 size={17} aria-hidden="true" />
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      {organizations.length === 0 ? (
        <div className="empty-state">
          <BarChart3 size={34} aria-hidden="true" />
          <p>Create an organization to generate its QR code.</p>
        </div>
      ) : null}

      {modalMode ? (
        <OrganizationModal
          form={form}
          modalTitle={modalTitle}
          onClose={closeModal}
          onSave={save}
          setForm={setForm}
        />
      ) : null}
    </section>
  );
}

function OrganizationModal({ form, modalTitle, onClose, onSave, setForm }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="organization-modal-title">
        <div className="section-title">
          <h3 id="organization-modal-title">{modalTitle}</h3>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close modal">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form className="form-card" onSubmit={onSave}>
          <label>
            Name
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Hotel Angkor"
              required
            />
          </label>
          <label>
            Code
            <input
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.replace(/\s+/g, '') }))}
              required
            />
          </label>
          <label>
            Notes
            <textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              rows="4"
            />
          </label>
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit">
              <Save size={18} aria-hidden="true" />
              Save organization
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const rootElement = document.getElementById('root');
window.__clmLinktreeRoot ||= createRoot(rootElement);
window.__clmLinktreeRoot.render(<App />);
