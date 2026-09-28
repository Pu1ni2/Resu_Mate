import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Search, Square } from 'lucide-react';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { Label, Textarea } from '../ui/Input';
import { cn } from '../ui/cn';
import { messageForApiError, sourcerAPI } from '../../services/api';
import { toast } from '../../services/notify';
import { streamRun } from '../../services/sourcerStream';
import { formatCount } from './format';
import { initialState, talentMapReducer } from './talentMapModel';
import StatTiles from './StatTiles';
import LiveSample from './LiveSample';
import PopulationMap from './PopulationMap';
import JudgingNow from './JudgingNow';
import FilterComparison from './FilterComparison';
import LiveLog from './LiveLog';
import TopOfShortlist from './TopOfShortlist';
import ShortlistDrawer from './ShortlistDrawer';
import OutreachModal from './OutreachModal';
import RunHistory from './RunHistory';

/* Find candidates: describe who you want, and watch the whole pool be read.
 *
 * The run streams hundreds of events a minute. They are queued as they arrive
 * and applied once per animation frame, so the page renders at most sixty times
 * a second however fast the stream is. */

const SOURCES = [
  ['uploads', 'Your uploads'],
  ['github', 'GitHub'],
  ['web', 'Web profiles'],
];

const EXAMPLE = 'Backend engineer in Boston, strong Python, has shipped a real product. Ex-founder is a plus.';

// A stopped run is saved by the server after the request ends, so reopening it
// may take a moment: try a few times before giving up.
const REOPEN_TRIES = 4;
const REOPEN_WAIT_MS = 600;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// jsdom and old browsers may lack requestAnimationFrame; a 16ms timer is a frame.
const nextFrame = cb => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(cb, 16));
const cancelFrame = id => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));

function SearchForm({ description, setDescription, sources, setSources, onSubmit, error }) {
  return (
    <Card as="form" padded onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="sourcer-description">Who are you looking for?</Label>
        <Textarea
          id="sourcer-description"
          rows={3}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={EXAMPLE}
          maxLength={2000}
          invalid={Boolean(error)}
          aria-describedby={error ? 'sourcer-error' : undefined}
        />
        <p className="text-[12px] text-ink-subtle">
          Plain words are fine. Say what must be true and what would be a plus; every person found is read against it.
        </p>
      </div>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1.5 text-xs font-semibold text-ink-subtle">Where to look</legend>
        {SOURCES.map(([key, label]) => (
          <label
            key={key}
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]',
              sources[key] ? 'border-accent-line bg-accent-wash text-ink' : 'border-line text-ink-muted',
            )}
          >
            <input
              type="checkbox"
              checked={sources[key]}
              onChange={e => setSources(s => ({ ...s, [key]: e.target.checked }))}
              className="accent-[var(--color-accent)]"
            />
            {label}
          </label>
        ))}
      </fieldset>
      {error && <p id="sourcer-error" role="alert" className="text-[13px] text-critical">{error}</p>}
      <Button type="submit" variant="primary">
        <Search size={16} /> Find candidates
      </Button>
    </Card>
  );
}

function RunHeader({ state, onStop, onNewSearch }) {
  const req = state.plan?.req || {};
  const readFromGithub = state.sources.github || 0;
  const githubTotal = state.stats.github_total || 0;
  const running = state.status === 'running';
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">
          Talent mapping for the <span className="text-accent">entire pool</span>.
        </h1>
        <p className="mt-1 text-[13px] text-ink-subtle">
          {[req.title, req.location, `${formatCount(state.counts.found)} people`].filter(Boolean).join(' · ')}
          {' · '}a written judgement on every single one
        </p>
        {githubTotal > readFromGithub && (
          <p className="mt-0.5 text-[12px] text-ink-faint">
            GitHub reports {formatCount(githubTotal)} matches; this run reads {formatCount(readFromGithub)} of them.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex max-w-md items-center gap-2 truncate rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-ink-muted"
          title={state.description}
        >
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', running ? 'bg-positive motion-safe:animate-pulse' : 'bg-ink-faint')}
            aria-hidden="true"
          />
          <span className="truncate">
            {running && `Screening everyone against "${state.description}"`}
            {state.status === 'done' && 'Every person found has been read'}
            {state.status === 'stopped' && 'Stopped. Everyone judged so far is saved'}
            {state.status === 'error' && 'The search stopped early'}
          </span>
        </span>
        {running ? (
          <Button size="sm" onClick={onStop}><Square size={13} /> Stop</Button>
        ) : (
          <Button size="sm" onClick={onNewSearch}><Search size={13} /> New search</Button>
        )}
      </div>
    </header>
  );
}

export default function SourcerPage() {
  const [state, dispatch] = useReducer(talentMapReducer, initialState);
  const [description, setDescription] = useState('');
  const [sources, setSources] = useState({ uploads: true, github: true, web: true });
  const [editing, setEditing] = useState(true);
  const [formError, setFormError] = useState('');
  const [shortlistOpen, setShortlistOpen] = useState(false);
  const closeShortlist = useCallback(() => setShortlistOpen(false), []);
  const [outreachPid, setOutreachPid] = useState(null);
  const [runs, setRuns] = useState([]);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await sourcerAPI.listRuns();
      setRuns(data.runs || []);
      return data.runs || [];
    } catch {
      return []; // history is a convenience; the page works without it
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function openRun(id) {
    abortRef.current?.abort();
    runTokenRef.current += 1;
    try {
      const { data } = await sourcerAPI.getRun(id);
      dispatch({ type: 'loaded', run: data.run, profiles: data.profiles });
      setDescription(data.run.description || '');
      setEditing(false);
    } catch (err) {
      toast(messageForApiError(err, 'Could not open that search.'), 'error');
    }
  }

  async function deleteRun(id) {
    try {
      await sourcerAPI.deleteRun(id);
      setRuns(rs => rs.filter(r => r.id !== id));
      toast('Search deleted, with everyone it found.', 'success');
    } catch (err) {
      toast(messageForApiError(err, 'Could not delete that search.'), 'error');
    }
  }

  /* After Stop the server saves what was judged, a moment after the request
   * ends. Reopen that saved run so its people can be saved, dismissed and
   * written to, like a finished one. */
  async function reopenStopped(text, token) {
    for (let i = 0; i < REOPEN_TRIES; i += 1) {
      await wait(REOPEN_WAIT_MS);
      // A newer search has started since; this one must not replace it.
      if (runTokenRef.current !== token) return;
      const latest = (await loadHistory())[0];
      if (runTokenRef.current !== token) return;
      if (latest && latest.description === text && latest.status === 'stopped') {
        await openRun(latest.id);
        return;
      }
    }
  }
  const abortRef = useRef(null);
  const queueRef = useRef([]);
  const frameRef = useRef(0);
  const runTokenRef = useRef(0); // which search is current, for late async work

  const flush = useCallback(() => {
    frameRef.current = 0;
    const events = queueRef.current;
    queueRef.current = [];
    if (events.length) dispatch({ type: 'events', events });
  }, []);

  const enqueue = useCallback(event => {
    queueRef.current.push(event);
    if (!frameRef.current) frameRef.current = nextFrame(flush);
  }, [flush]);

  // Leaving the page stops the run; the server keeps what it judged.
  useEffect(() => () => {
    abortRef.current?.abort();
    if (frameRef.current) cancelFrame(frameRef.current);
  }, []);

  async function start(e) {
    e?.preventDefault();
    const text = description.trim();
    if (text.length < 3) return setFormError("Describe who you're looking for.");
    if (!Object.values(sources).some(Boolean)) return setFormError('Choose at least one place to look.');
    setFormError('');
    setEditing(false);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    queueRef.current = [];
    runTokenRef.current += 1;
    const token = runTokenRef.current;
    dispatch({ type: 'start', description: text });
    try {
      const result = await streamRun({ description: text, sources }, enqueue, controller.signal);
      flush();
      if (result.stopped) {
        dispatch({ type: 'stopped' });
        reopenStopped(text, token);
      } else {
        loadHistory();
      }
    } catch (err) {
      flush();
      dispatch({ type: 'failed', message: err.message });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function newSearch() {
    setDescription(state.description || description);
    setEditing(true);
  }

  async function setStatus(pid, status) {
    const id = state.profileIds[pid];
    if (!id) return;
    try {
      await sourcerAPI.setStatus(id, status);
      dispatch({ type: 'profileStatus', pid, status });
    } catch (err) {
      toast(messageForApiError(err, 'Could not update that person. Please try again.'), 'error');
    }
  }

  // Screen readers get a short update every 25 people rather than one per event.
  const step = Math.floor(state.counts.judged / 25);
  const announcement = state.status === 'idle' ? '' : (
    state.status === 'running' && step === 0 ? 'Search started.' :
      `Screened ${state.counts.judged} of ${state.counts.found}. Shortlisted ${state.counts.shortlisted}.`
  );

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6 sm:px-6">
        <Link to="/hiring" className="inline-flex items-center gap-1.5 text-[13px] text-ink-subtle hover:text-ink">
          <ArrowLeft size={14} /> Dashboard
        </Link>

        {editing || state.status === 'idle' ? (
          <div className="mx-auto max-w-2xl space-y-3 pt-6">
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">Find candidates</h1>
            <p className="text-[14px] text-ink-muted">
              Describe who you want. Every person found, in your uploads, on GitHub and on the public web,
              is read against it and given a written judgement; you see who a keyword filter would have missed.
            </p>
            <SearchForm
              description={description}
              setDescription={setDescription}
              sources={sources}
              setSources={setSources}
              onSubmit={start}
              error={formError}
            />
            <RunHistory runs={runs} onOpen={openRun} onDelete={deleteRun} />
          </div>
        ) : (
          <>
            <RunHeader state={state} onStop={stop} onNewSearch={newSearch} />

            {(state.warnings.length > 0 || state.error) && (
              <div className="space-y-1.5" role="status">
                {state.warnings.map(w => (
                  <p key={w} className="flex items-center gap-2 rounded-[10px] border border-caution/30 bg-caution-wash px-3 py-2 text-[13px] text-caution">
                    <AlertTriangle size={14} /> {w}
                  </p>
                ))}
                {state.error && (
                  <p className="flex items-center gap-2 rounded-[10px] border border-critical/30 bg-critical-wash px-3 py-2 text-[13px] text-critical">
                    <AlertTriangle size={14} /> {state.error}
                  </p>
                )}
              </div>
            )}

            <StatTiles counts={state.counts} stats={state.stats} />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <div className="space-y-4">
                <LiveSample state={state} />
                <PopulationMap state={state} />
                <LiveLog state={state} />
              </div>
              <div className="space-y-4">
                <JudgingNow state={state} />
                <FilterComparison state={state} />
                <TopOfShortlist state={state} onOpen={() => setShortlistOpen(true)} />
              </div>
            </div>

            <ShortlistDrawer
              open={shortlistOpen} onClose={closeShortlist} state={state}
              onStatus={setStatus} onDraft={setOutreachPid}
            />
            {outreachPid && state.profileIds[outreachPid] && (
              <OutreachModal
                person={state.people[outreachPid]}
                profileId={state.profileIds[outreachPid]}
                onClose={() => setOutreachPid(null)}
              />
            )}
          </>
        )}

        <p className="sr-only" aria-live="polite">{announcement}</p>
      </div>
    </div>
  );
}
