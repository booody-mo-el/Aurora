import React, { useState } from 'react';
import { Check, Edit3, Plus, Shield, Trash2, UserRound } from 'lucide-react';
import type { Profile } from '../types';

const AVATAR_OPTIONS: { id: Profile['avatar']; label: string; bg: string }[] = [
  { id: 'emerald', label: 'Aurora Emerald', bg: 'linear-gradient(135deg,#4ee0af,#1b6955)' },
  { id: 'cobalt', label: 'Midnight Cobalt', bg: 'linear-gradient(135deg,#6ea6ff,#21417d)' },
  { id: 'amber', label: 'Solar Amber', bg: 'linear-gradient(135deg,#f3c368,#87591a)' },
  { id: 'violet', label: 'Nebula Violet', bg: 'linear-gradient(135deg,#b589ff,#4e2b88)' },
  { id: 'rose', label: 'Crimson Rose', bg: 'linear-gradient(135deg,#ff8ca3,#852940)' }
];

export function avatarBackground(avatar: Profile['avatar']) {
  return AVATAR_OPTIONS.find(a => a.id === avatar)?.bg || AVATAR_OPTIONS[0].bg;
}

type ProfilesViewProps = {
  profiles: Profile[];
  activeProfileId: string;
  signedInEmail?: string;
  onSelectProfile: (id: string) => void;
  onCreateProfile: (input: { name: string; avatar: Profile['avatar']; is_kids: boolean; autoplay_next: boolean }) => Promise<void>;
  onUpdateProfile: (id: string, input: Partial<Profile>) => Promise<void>;
  onDeleteProfile: (id: string) => Promise<void>;
  onContinue: () => void;
};

export default function ProfilesView({
  profiles,
  activeProfileId,
  signedInEmail,
  onSelectProfile,
  onCreateProfile,
  onUpdateProfile,
  onDeleteProfile,
  onContinue
}: ProfilesViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<Profile['avatar']>('emerald');
  const [isKids, setIsKids] = useState(false);
  const [autoplayNext, setAutoplayNext] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function startCreate() {
    setEditingId(null);
    setCreating(true);
    setName('');
    setAvatar('cobalt');
    setIsKids(false);
    setAutoplayNext(true);
    setMessage('');
  }

  function startEdit(profile: Profile) {
    setCreating(false);
    setEditingId(profile.id);
    setName(profile.name);
    setAvatar(profile.avatar);
    setIsKids(profile.is_kids);
    setAutoplayNext(profile.autoplay_next);
    setMessage('');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setMessage('Enter a profile name.'); return; }
    setBusy(true);
    setMessage('');
    try {
      if (creating) {
        await onCreateProfile({ name: name.trim(), avatar, is_kids: isKids, autoplay_next: autoplayNext });
        setCreating(false);
      } else if (editingId) {
        await onUpdateProfile(editingId, { name: name.trim(), avatar, is_kids: isKids, autoplay_next: autoplayNext });
        setEditingId(null);
      }
    } catch (e: any) {
      setMessage(e?.message || 'Could not save profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="searchPage profilesPage">
      <p className="eyebrow"><UserRound size={14} /> PROFILE MANAGEMENT</p>
      <h1>Who’s watching <span>Aurora?</span></h1>
      <p className="pageIntro muted">
        {signedInEmail
          ? `Managing viewing profiles for ${signedInEmail}. Each profile keeps its own Continue Watching, My List, search history, and recommendations.`
          : 'Profiles keep separate Continue Watching, My List, and recommendations on this device. Sign in to sync across devices.'}
      </p>

      <div className="profilesGrid">
        {profiles.map(profile => {
          const isActive = profile.id === activeProfileId;
          return (
            <article className={`profileTile ${isActive ? 'active' : ''}`} key={profile.id}>
              <button
                type="button"
                className="profileSelectBtn"
                onClick={() => {
                  onSelectProfile(profile.id);
                  onContinue();
                }}
              >
                <span className="profileAvatarCircle" style={{ background: avatarBackground(profile.avatar) }}>
                  {profile.name.slice(0, 1).toUpperCase()}
                </span>
                <strong>{profile.name}</strong>
                <div className="profileTags">
                  {isActive && <span className="profileTag active"><Check size={11} /> Active</span>}
                  {profile.is_kids && <span className="profileTag kids"><Shield size={11} /> Kids</span>}
                </div>
              </button>
              <div className="profileTileActions">
                <button type="button" onClick={() => startEdit(profile)} aria-label={`Edit ${profile.name}`}>
                  <Edit3 size={13} /> Edit
                </button>
                {profiles.length > 1 && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => onDeleteProfile(profile.id)}
                    aria-label={`Delete ${profile.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </article>
          );
        })}

        {profiles.length < 5 && (
          <button type="button" className="profileAddTile" onClick={startCreate}>
            <span className="profileAvatarCircle add"><Plus size={26} /></span>
            <strong>Add Profile</strong>
            <small>Up to 5 profiles</small>
          </button>
        )}
      </div>

      {(creating || editingId) && (
        <form className="profileEditorCard" onSubmit={handleSubmit}>
          <h2>{creating ? 'Create Profile' : 'Edit Profile'}</h2>
          <label className="authField">
            <span>Profile name</span>
            <input
              type="text"
              maxLength={40}
              required
              placeholder="e.g. Cinema Night or Kids"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </label>

          <div className="avatarPickerRow">
            <span>Avatar color</span>
            <div className="avatarSwatches">
              {AVATAR_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  aria-label={opt.label}
                  className={`avatarSwatch ${avatar === opt.id ? 'selected' : ''}`}
                  style={{ background: opt.bg }}
                  onClick={() => setAvatar(opt.id)}
                />
              ))}
            </div>
          </div>

          <label className="toggleRow">
            <input type="checkbox" checked={isKids} onChange={e => setIsKids(e.target.checked)} />
            <span><strong>Kids Profile</strong> — Filters mature titles and prioritizes family &amp; animation content</span>
          </label>

          <label className="toggleRow">
            <input type="checkbox" checked={autoplayNext} onChange={e => setAutoplayNext(e.target.checked)} />
            <span><strong>Auto-play next title</strong> — Automatically start the next film/episode when playback ends</span>
          </label>

          {message && <p className="formMsg">{message}</p>}

          <div className="profileEditorBtns">
            <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save Profile'}</button>
            <button type="button" className="secondary" onClick={() => { setCreating(false); setEditingId(null); }}>Cancel</button>
          </div>
        </form>
      )}
    </main>
  );
}
