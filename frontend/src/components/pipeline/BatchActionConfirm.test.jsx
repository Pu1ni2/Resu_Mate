import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { resetFeatures } from '../../services/features';
import BatchActionConfirm from './BatchActionConfirm';

/* The batch dialog said every candidate "can now log in at /candidate/login",
 * whether or not they had been invited or emailed. Its per-candidate Email
 * toggle and its email type never reached the server.
 *
 * The batch was made inside one request: the dialog waited minutes, and a
 * browser that gave up meanwhile lost every result. The server makes it in
 * the background now (POST /api/pipeline/batches), and the dialog follows
 * it, or can be closed while it goes on. */

const LINK = 'https://resumate.example/candidate/login';
const PEOPLE = [
  { candidate_id: 1, name: 'Ada', ats_score: 80, verdict: 'Strong Fit', email: 'ada@x.com' },
  { candidate_id: 2, name: 'Bo', ats_score: 60, verdict: 'Good Fit', email: '' },
];

const ADA_INVITED = {
  candidate_id: 1, name: 'Ada', email: 'ada@x.com', status: 'done', interview_created: true, email_sent: false,
};
const BO_SKIPPED = {
  candidate_id: 2, name: 'Bo', email: '', status: 'skipped', interview_created: false, email_sent: false,
  skipped: "No email address on this résumé, so they can't be invited.",
};
const finished = fields => ({ finished: true, ...fields });

let sent;  // each batch the dialog started

/* The server: each POST answered in turn from `post`, the last answer again
 * once they run out. */
function server({ post = [] } = {}) {
  sent = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    if (String(url).endsWith('/api/features')) {
      return { ok: true, status: 200, json: async () => ({ avatar_interviews: false }) };
    }
    sent.push(JSON.parse(options.body));
    const answer = post[Math.min(sent.length, post.length) - 1];
    return { ok: true, status: 202, json: async () => ({ batch_id: 7, portal_link: LINK, ...answer }) };
  });
}

function open() {
  render(<BatchActionConfirm selectedCandidates={PEOPLE} role="Dev" onClose={vi.fn()} onDone={vi.fn()} />);
}

const confirmButton = () => screen.getByRole('button', { name: /^confirm/i });

async function confirm() {
  fireEvent.click(confirmButton());
  await screen.findByText(/actions complete/i);
}

beforeEach(() => {
  resetFeatures();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the batch dialog', () => {
  it('sends only what the server uses', async () => {
    server({ post: [finished({ total: 2, interviews_created: 1, emails_sent: 0, outcomes: [ADA_INVITED, BO_SKIPPED] })] });
    open();
    expect(screen.queryByText(/email type/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /^email$/i })).toBeNull();
    await confirm();
    expect(sent).toEqual([{
      client_key: expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/), source: 'screening',
      candidate_ids: [1, 2], role: 'Dev', level: 'Mid-Level', num_questions: 8,
      send_emails: false, mode: 'conversational',
    }]);
  });

  it('counts only the candidates who get an interview', () => {
    server();
    open();
    const [ada] = screen.getAllByRole('button', { name: 'Interview' });
    fireEvent.click(ada);
    expect(ada.getAttribute('aria-pressed')).toBe('false');
    expect(confirmButton().textContent).toMatch(/1 candidate$/);
  });

  it('says who was skipped, and gives the link for those not emailed', async () => {
    server({ post: [finished({ total: 2, interviews_created: 1, emails_sent: 0, outcomes: [ADA_INVITED, BO_SKIPPED] })] });
    open();
    await confirm();
    expect(screen.getByText(/no email address on this résumé/i)).toBeTruthy();
    expect(screen.getAllByText('Not emailed')).toHaveLength(2);
    expect(screen.getByLabelText(/candidate sign-in link/i).value).toBe(LINK);
  });

  it('says why an invitation was not emailed', async () => {
    const why = "Email isn't set up on this server. Share the portal link instead.";
    server({ post: [finished({ total: 1, interviews_created: 1, emails_sent: 0, outcomes: [{ ...ADA_INVITED, email_send_error: why }] })] });
    open();
    fireEvent.click(screen.getByLabelText(/email the invitations/i));
    await confirm();
    expect(sent[0].send_emails).toBe(true);
    expect(screen.getByText(why)).toBeTruthy();
  });

  it('needs no link when everyone invited was emailed', async () => {
    server({ post: [finished({ total: 1, interviews_created: 1, emails_sent: 1, outcomes: [{ ...ADA_INVITED, email_sent: true }] })] });
    open();
    await confirm();
    expect(screen.getByText('✓ Invite emailed')).toBeTruthy();
    expect(screen.getByText(/each invited candidate was emailed/i)).toBeTruthy();
    expect(screen.queryByLabelText(/candidate sign-in link/i)).toBeNull();
  });
});
