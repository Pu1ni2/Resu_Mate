/* The talent map's state, built from a sourcing run's events.
 *
 * Pure: no DOM, no requests. The page feeds it the stream's events (batched, at
 * most once per animation frame) or a saved run, and every panel reads from the
 * one state, so the tiles, the map, the log and the shortlist can't disagree.
 */

export const SAMPLE_SIZE = 64; // the live sample grid: four rows of sixteen
export const LOG_SIZE = 50;

/* Why a keyword filter would have missed someone reading found, in the order
 * the panel lists them. */
export const MISS_REASON_LABELS = {
  non_standard_title: 'non-standard title',
  career_pivot: 'career pivot',
  no_brand_employer: 'no brand-name employer',
  thin_profile: 'thin or stale profile',
  other: 'other signals',
};

const EMPTY_COUNTS = { found: 0, judged: 0, shortlisted: 0, byFilter: 0, filterWouldShow: 0 };

export const initialState = {
  status: 'idle', // idle | running | done | stopped | error
  description: '',
  plan: null,
  order: [], // pids in the order found: one map cell each
  people: {}, // pid -> person, plus their judgement once judged
  sample: [], // most recently judged pids, newest first
  current: null, // the latest judged pid: "Judging now"
  log: [], // most recently judged pids, newest first
  reasons: {}, // miss_reason -> count
  counts: EMPTY_COUNTS,
  stats: {}, // the server's latest stats: elapsed, rate, tokens, cost, GitHub's total
  sources: { upload: 0, github: 0, web: 0 },
  warnings: [],
  error: '',
  runId: null,
  profileIds: {}, // pid -> saved profile id, once the run is saved
};

/* Which colour a person's map cell is. */
export function cellState(person) {
  if (!person?.verdict) return 'unread';
  if (person.verdict !== 'shortlist') return 'passed';
  return person.filter_match ? 'short_filter' : 'short_reading';
}

function pushFront(list, pid, limit) {
  return [pid, ...list.filter(p => p !== pid)].slice(0, limit);
}

function countJudgement(draft, person) {
  draft.counts.judged += 1;
  if (person.filter_match) draft.counts.filterWouldShow += 1;
  if (person.verdict === 'shortlist') {
    draft.counts.shortlisted += 1;
    if (person.filter_match) draft.counts.byFilter += 1;
    else if (person.miss_reason) draft.reasons[person.miss_reason] = (draft.reasons[person.miss_reason] || 0) + 1;
  }
}

/* Apply one stream event to a draft whose containers are already copies. */
function applyEvent(draft, event) {
  switch (event.type) {
    case 'plan':
      draft.plan = event.plan;
      break;
    case 'pool':
      draft.sources = { ...draft.sources, ...event.sources };
      break;
    case 'found': {
      const person = event.person;
      if (!person?.pid || draft.people[person.pid]) break;
      draft.people[person.pid] = { ...person };
      draft.order.push(person.pid);
      draft.counts.found += 1;
      break;
    }
    case 'judged': {
      const before = draft.people[event.pid];
      if (!before || before.verdict) break; // unknown, or already judged
      const { type: _type, ...judgement } = event;
      const person = { ...before, ...judgement };
      draft.people[event.pid] = person;
      countJudgement(draft, person);
      draft.current = event.pid;
      draft.sample = pushFront(draft.sample, event.pid, SAMPLE_SIZE);
      draft.log = pushFront(draft.log, event.pid, LOG_SIZE);
      break;
    }
    case 'stats': {
      const { type: _type, ...stats } = event;
      draft.stats = stats;
      break;
    }
    case 'warning':
      if (!draft.warnings.includes(event.message)) draft.warnings.push(event.message);
      break;
    case 'error':
      draft.error = event.message || 'The search stopped unexpectedly.';
      break;
    case 'saved':
      draft.runId = event.run_id;
      draft.profileIds = { ...event.profile_ids };
      break;
    case 'done':
      draft.stats = event.stats || draft.stats;
      draft.status = draft.error ? 'error' : 'done';
      break;
    default:
      break;
  }
}

function draftOf(state) {
  return {
    ...state,
    order: [...state.order],
    people: { ...state.people },
    reasons: { ...state.reasons },
    counts: { ...state.counts },
    warnings: [...state.warnings],
  };
}

/* Rebuild the final state of a saved run: GET /api/sourcer/runs/{id}. */
function fromSavedRun(run, profiles) {
  const draft = draftOf({ ...initialState, status: run.status === 'stopped' ? 'stopped' : 'done' });
  // Fresh containers: these are filled in place below, and must not be the
  // ones initialState holds.
  draft.sources = { upload: 0, github: 0, web: 0 };
  draft.profileIds = {};
  draft.description = run.description || '';
  draft.plan = run.plan || null;
  draft.stats = run.stats || {};
  draft.runId = run.id;
  const judgedOrder = [];
  for (const p of profiles) {
    const person = { ...p };
    delete person.id;
    draft.people[p.pid] = person;
    draft.order.push(p.pid);
    draft.profileIds[p.pid] = p.id;
    draft.sources[p.source] = (draft.sources[p.source] || 0) + 1;
    draft.counts.found += 1;
    countJudgement(draft, person);
    judgedOrder.push(p.pid);
  }
  // Saved profiles come best first, so the sample and log show the strongest.
  draft.sample = judgedOrder.slice(0, SAMPLE_SIZE);
  draft.log = judgedOrder.slice(0, LOG_SIZE);
  draft.current = judgedOrder[0] || null;
  return draft;
}

export function talentMapReducer(state, action) {
  switch (action.type) {
    case 'start':
      return { ...initialState, status: 'running', description: action.description || '' };
    case 'events': {
      if (!action.events?.length) return state;
      const draft = draftOf(state);
      for (const event of action.events) applyEvent(draft, event);
      return draft;
    }
    case 'stopped':
      return state.status === 'running' ? { ...state, status: 'stopped' } : state;
    case 'failed':
      return { ...state, status: 'error', error: action.message || 'The search failed.' };
    case 'loaded':
      return fromSavedRun(action.run, action.profiles || []);
    case 'profileStatus': {
      const person = state.people[action.pid];
      if (!person) return state;
      return { ...state, people: { ...state.people, [action.pid]: { ...person, status: action.status } } };
    }
    default:
      return state;
  }
}

/* The shortlist, best first. Dismissed people stay, marked, so a dismissal can
 * be undone. */
export function shortlistOf(state) {
  return state.order
    .map(pid => state.people[pid])
    .filter(p => p?.verdict === 'shortlist')
    .sort((a, b) => b.score - a.score);
}

/* "Boolean + filters: N" vs "Read everyone: +M", and the reasons behind M. */
export function filterComparisonOf(state) {
  const { shortlisted, byFilter } = state.counts;
  const reasons = Object.keys(MISS_REASON_LABELS).map(key => ({
    key, label: MISS_REASON_LABELS[key], count: state.reasons[key] || 0,
  }));
  return { byFilter, onlyByReading: shortlisted - byFilter, reasons };
}
