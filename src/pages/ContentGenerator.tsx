import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { BarChart3, Bot, CalendarDays, CheckCircle2, Clipboard, Copy, History, Loader2, Megaphone, PenLine, Save, Send, Sparkles, Target, Trash2, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '../AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { generateSocialMediaContent } from '../lib/gemini';
import { cn } from '@/lib/utils';

type Platform = 'Facebook' | 'Instagram' | 'TikTok' | 'LinkedIn' | 'X';
type Tone = 'Warm local voice' | 'Professional' | 'Funny' | 'Inspirational' | 'Educational';
type Draft = { id: string; topic: string; post: string; hashtags: string[]; createdAt: string };
type CalendarItem = { day: string; idea: string };

const platforms: Platform[] = ['Facebook', 'Instagram', 'TikTok', 'LinkedIn', 'X'];
const tones: Tone[] = ['Warm local voice', 'Professional', 'Funny', 'Inspirational', 'Educational'];
const languages = ['English', 'Chichewa', 'English + Chichewa'];
const goals = ['Engagement', 'Sales', 'Awareness', 'Education', 'Community update'];
const formats = ['Standard post', 'Short caption', 'Story script', 'Video script', 'Carousel outline'];
const storageKey = 'zathu-content-generator-drafts';

const starterIdeas = [
  'Launch a new maize flour brand in Lilongwe',
  'Announce weekend discounts for a small grocery shop',
  'Promote a youth farming workshop',
];

export default function ContentGenerator() {
  const { user, signIn, profile } = useAuth();
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('Malawian customers and community members');
  const [platform, setPlatform] = useState<Platform>('Facebook');
  const [tone, setTone] = useState<Tone>('Warm local voice');
  const [language, setLanguage] = useState('English + Chichewa');
  const [goal, setGoal] = useState('Engagement');
  const [brandName, setBrandName] = useState(profile?.displayName || '');
  const [brandVoice, setBrandVoice] = useState('Friendly, clear, and locally grounded');
  const [contentFormat, setContentFormat] = useState('Standard post');
  const [facts, setFacts] = useState('');
  const [generated, setGenerated] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hooks, setHooks] = useState<string[]>([]);
  const [callToAction, setCallToAction] = useState('');
  const [accuracyNote, setAccuracyNote] = useState('');
  const [qualityScore, setQualityScore] = useState(0);
  const [contentCalendar, setContentCalendar] = useState<CalendarItem[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!brandName && profile?.displayName) {
      setBrandName(profile.displayName);
    }
  }, [brandName, profile?.displayName]);

  const completion = useMemo(() => {
    const filled = [topic, audience, platform, tone, language, goal, brandName, contentFormat].filter(Boolean).length;
    return Math.round((filled / 8) * 100);
  }, [topic, audience, platform, tone, language, goal, brandName, contentFormat]);

  const generateContent = async () => {
    if (!topic.trim()) {
      toast.error('Add a topic or campaign idea first');
      return;
    }

    setLoading(true);
    try {
      const result = await generateSocialMediaContent({ topic, audience, platform, tone, language, goal, brandName, brandVoice, contentFormat, facts });
      setGenerated(result.post);
      setHashtags(result.hashtags || []);
      setHooks(result.hooks || []);
      setCallToAction(result.callToAction || '');
      setAccuracyNote(result.accuracyNote || '');
      setQualityScore(Math.max(0, Math.min(100, Math.round(result.qualityScore || 0))));
      setContentCalendar(result.contentCalendar || []);
      toast.success('Human-feel content generated');
    } catch (error) {
      console.error(error);
      toast.error('AI generation failed. Try again with more details.');
    } finally {
      setLoading(false);
    }
  };

  const publishPost = async () => {
    if (!user) {
      toast.error('Please sign in to publish');
      signIn();
      return;
    }
    if (!generated.trim()) {
      toast.error('Generate content before publishing');
      return;
    }

    setPublishing(true);
    try {
      await addDoc(collection(db, 'posts'), {
        content: `${generated}\n\n${hashtags.map(tag => `#${tag.replace(/^#/, '')}`).join(' ')}`.trim(),
        category: 'Business',
        authorId: user.uid,
        authorName: profile?.displayName || user.displayName || 'Anonymous',
        authorPhoto: profile?.photoURL || user.photoURL || '',
        likesCount: 0,
        commentsCount: 0,
        media: [],
        createdAt: serverTimestamp(),
        source: 'content-generator',
      });
      toast.success('Published to your Zathu feed');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'posts');
    } finally {
      setPublishing(false);
    }
  };

  const copyContent = async () => {
    if (!generated) return;
    await navigator.clipboard.writeText(`${generated}\n\n${hashtags.map(tag => `#${tag.replace(/^#/, '')}`).join(' ')}`.trim());
    toast.success('Copied to clipboard');
  };

  const persistDrafts = (nextDrafts: Draft[]) => {
    setDrafts(nextDrafts);
    localStorage.setItem(storageKey, JSON.stringify(nextDrafts));
  };

  const saveDraft = () => {
    if (!generated) {
      toast.error('Generate content before saving a draft');
      return;
    }
    const nextDrafts = [{ id: crypto.randomUUID(), topic, post: generated, hashtags, createdAt: new Date().toISOString() }, ...drafts].slice(0, 12);
    persistDrafts(nextDrafts);
    toast.success('Draft saved on this device');
  };

  const loadDraft = (draft: Draft) => {
    setTopic(draft.topic);
    setGenerated(draft.post);
    setHashtags(draft.hashtags || []);
    toast.success('Draft loaded');
  };

  const deleteDraft = (draftId: string) => {
    persistDrafts(drafts.filter((draft) => draft.id !== draftId));
    toast.success('Draft removed');
  };

  return (
    <div className="min-h-full bg-slate-50 pb-24">
      <section className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-slate-900 text-white p-5 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur">
            <Sparkles size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-100">Creator Studio</p>
            <h1 className="text-2xl font-black tracking-tight">Social Content Generator</h1>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-emerald-50">
          Create accurate, authentic, human-sounding posts with local context, profile-aware publishing, hooks, hashtags, and a dashboard-ready workflow.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[['Drafts', String(drafts.length)], ['Accuracy', 'Fact-led'], ['Voice', 'Human']].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white/10 p-3 border border-white/10">
              <p className="text-[9px] uppercase font-black text-emerald-100">{label}</p>
              <p className="text-sm font-black">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="p-4 space-y-4">
        <div className="bg-white rounded-3xl border border-border p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black text-sm flex items-center gap-2"><PenLine size={16} className="text-primary" /> Content brief</h2>
              <p className="text-[11px] text-text-muted">The more factual details you provide, the more accurate the output feels.</p>
            </div>
            <div className="text-[10px] font-black text-primary bg-emerald-50 px-2 py-1 rounded-full">{completion}% ready</div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-text-muted">Topic or campaign</label>
            <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Example: Launching a new solar irrigation pump for farmers in Mzuzu" className="min-h-24 rounded-2xl" />
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {starterIdeas.map((idea) => (
                <button key={idea} onClick={() => setTopic(idea)} className="shrink-0 text-[10px] font-bold rounded-full border border-border px-3 py-1.5 hover:border-primary hover:text-primary">{idea}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Audience"><Input value={audience} onChange={(e) => setAudience(e.target.value)} className="rounded-xl text-xs" /></Field>
            <SelectField label="Goal" value={goal} setValue={setGoal} options={goals} />
            <SelectField label="Platform" value={platform} setValue={(v) => setPlatform(v as Platform)} options={platforms} />
            <SelectField label="Format" value={contentFormat} setValue={setContentFormat} options={formats} />
            <SelectField label="Language" value={language} setValue={setLanguage} options={languages} />
            <Field label="Brand / profile"><Input value={brandName} onChange={(e) => setBrandName(e.target.value)} className="rounded-xl text-xs" placeholder="Business or creator name" /></Field>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-text-muted">Tone</label>
            <div className="flex flex-wrap gap-2">
              {tones.map((item) => (
                <button key={item} onClick={() => setTone(item)} className={cn('px-3 py-2 rounded-xl text-[10px] font-black border transition-all', tone === item ? 'bg-primary text-white border-primary' : 'bg-slate-50 border-border text-text-muted')}>
                  {item}
                </button>
              ))}
            </div>
          </div>

          <Field label="Brand voice notes">
            <Textarea value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} placeholder="Example: Honest, neighbourly, not too polished, with simple Chichewa where natural" className="rounded-2xl min-h-16" />
          </Field>

          <Field label="Facts, prices, dates, links, offers">
            <Textarea value={facts} onChange={(e) => setFacts(e.target.value)} placeholder="Add verifiable details the AI must not invent: location, opening hours, price, contact, event date..." className="rounded-2xl min-h-20" />
          </Field>

          <Button onClick={generateContent} disabled={loading} className="w-full rounded-2xl h-12 bg-primary hover:bg-emerald-700 text-white font-black gap-2">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Bot size={18} />}
            Generate authentic post
          </Button>
        </div>

        <div className="bg-white rounded-3xl border border-border p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-sm flex items-center gap-2"><Megaphone size={16} className="text-primary" /> Generated content</h2>
            <button onClick={copyContent} disabled={!generated} className="text-[10px] font-black text-primary flex items-center gap-1 disabled:opacity-30"><Copy size={13} /> Copy</button>
          </div>

          {generated ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 border border-border p-4 whitespace-pre-wrap text-sm leading-relaxed">{generated}</div>
              {hashtags.length > 0 && <div className="flex flex-wrap gap-2">{hashtags.map(tag => <span key={tag} className="text-[10px] font-black bg-emerald-50 text-primary px-2 py-1 rounded-full">#{tag.replace(/^#/, '')}</span>)}</div>}
              <div className="grid grid-cols-2 gap-2">
                <Metric icon={<BarChart3 size={14} />} label="Quality" value={`${qualityScore || 0}%`} />
                <Metric icon={<Target size={14} />} label="CTA" value={callToAction || 'Included'} />
              </div>
              {accuracyNote && <div className="text-xs p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-800"><strong>Accuracy note:</strong> {accuracyNote}</div>}
              {hooks.length > 0 && <div className="space-y-2"><p className="text-[10px] font-black uppercase text-text-muted">Alternative hooks</p>{hooks.map(hook => <div key={hook} className="text-xs p-3 rounded-xl border border-dashed border-border bg-white flex gap-2"><Clipboard size={14} className="text-primary shrink-0" />{hook}</div>)}</div>}
              {contentCalendar.length > 0 && <div className="space-y-2"><p className="text-[10px] font-black uppercase text-text-muted">Mini content calendar</p>{contentCalendar.map(item => <div key={`${item.day}-${item.idea}`} className="text-xs p-3 rounded-xl bg-slate-50 border border-border flex gap-2"><CalendarDays size={14} className="text-primary shrink-0" /><span><strong>{item.day}:</strong> {item.idea}</span></div>)}</div>}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={saveDraft} className="rounded-xl gap-2"><Save size={15} /> Save</Button>
                <Button variant="outline" onClick={copyContent} className="rounded-xl gap-2"><Copy size={15} /> Copy</Button>
                <Button onClick={publishPost} disabled={publishing} className="rounded-xl bg-primary text-white gap-2 col-span-2">{publishing ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />} Publish</Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-text-muted space-y-2">
              <Sparkles className="mx-auto text-slate-300" size={36} />
              <p className="text-sm font-bold">Your generated post will appear here.</p>
              <p className="text-[11px]">Built to avoid generic AI wording and preserve factual accuracy.</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl border border-border p-4 shadow-sm space-y-3">
          <h2 className="font-black text-sm flex items-center gap-2"><History size={16} className="text-primary" /> Saved drafts</h2>
          {drafts.length === 0 ? (
            <p className="text-xs text-text-muted bg-slate-50 border border-dashed border-border rounded-2xl p-4 text-center">No saved drafts yet. Generated content can be saved locally for later editing.</p>
          ) : (
            <div className="space-y-2">
              {drafts.map((draft) => (
                <div key={draft.id} className="rounded-2xl border border-border p-3 bg-slate-50 flex gap-3 items-start">
                  <button onClick={() => loadDraft(draft)} className="flex-1 text-left">
                    <p className="text-xs font-black line-clamp-1">{draft.topic || 'Untitled draft'}</p>
                    <p className="text-[10px] text-text-muted line-clamp-2 mt-1">{draft.post}</p>
                  </button>
                  <button onClick={() => deleteDraft(draft.id)} className="text-text-muted hover:text-red-500" title="Delete draft"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Feature icon={<UserRoundCheck size={18} />} title="Profile ready" text="Uses your profile when publishing to the feed." />
          <Feature icon={<Target size={18} />} title="Accuracy first" text="Separates verified facts from creative wording." />
          <Feature icon={<CalendarDays size={18} />} title="Planner" text="Prepare reusable campaign drafts and hooks." />
          <Feature icon={<CheckCircle2 size={18} />} title="Human feel" text="Natural rhythm, local phrasing, and clear CTAs." />
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><label className="text-[10px] font-black uppercase text-text-muted">{label}</label>{children}</div>;
}

function SelectField({ label, value, setValue, options }: { label: string; value: string; setValue: (value: string) => void; options: string[] }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => setValue(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs h-10">
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </Field>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 border border-border p-3"><div className="flex items-center gap-1 text-primary mb-1">{icon}<span className="text-[9px] font-black uppercase">{label}</span></div><p className="text-xs font-black line-clamp-1">{value}</p></div>;
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl bg-white border border-border p-3 shadow-sm"><div className="text-primary mb-2">{icon}</div><p className="text-xs font-black">{title}</p><p className="text-[10px] text-text-muted leading-relaxed mt-1">{text}</p></div>;
}
