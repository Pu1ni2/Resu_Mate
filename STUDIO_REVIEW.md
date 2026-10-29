# Studio workspace review

Branch: `studio-workspace`. Includes the Studio workspace redesign and motion polish.

Run the frontend with `npm run dev -- --host 127.0.0.1 --port 3007 --strictPort` from `frontend/`.

Open **http://localhost:3007/design-review.html** for the design review. The selector at the top opens actual page components using fictional people and illustrative results. Review storage stays in memory; API calls are intercepted, and recording is disabled. Refreshing restores the sample collection. This entry is excluded from the production build.

The live application remains at **http://localhost:3007/** and uses its existing authentication and backend configuration.

## Page coverage

| Area | What changed |
| --- | --- |
| Hiring workspace | Shared Studio frame, responsive four-section navigation, light-only theme, notifications and shortcuts |
| Candidates | Search and sort, selectable candidate files, upload area, honest collection counts, direct dossier navigation |
| Candidate file | Overview, Résumé, Research, Evaluation, Interviews; contextual discussion, email and export actions |
| Screening | Role brief and illustrated process, selected-candidate scope, restyled ranked results |
| Interviews | Latest invitation/status per candidate, filters, report access, clear loading/error states |
| Insights | Existing candidate analytics and interview results in the Studio palette |
| Sourcing | Role brief, source choices, live evidence panels, run history, shortlist and outreach |
| Jarvis | Cream workspace, terracotta sculpture and orbital detail, restyled conversations and results |
| Candidate portal | Résumé, analysis, four advisor modes, interview invitations and results |
| Interview rooms | Voice and avatar welcome/consent screens, live controls, transcript and report presentation |
| How it works | Public interactive workflow and tool explanations at `/how-it-works` |

The landing page and sign-in layouts are retained. No backend changes or new runtime dependencies were required. Candidate shortlist stages and permanent fit scores were not invented; screening results remain specific to a run. Original résumé access still depends on configured file storage. Existing evaluation gates, server invitations, email drafts, consent, and report access rules remain in place.

## Depth and motion

- Screening uses layered résumé papers and a terracotta role brief. The scanning effect runs only while a screening request is pending. The review simulates a short request delay so this state can be inspected.
- Interviews use a sculptural terracotta sound wave. Live voice movement follows existing speech/microphone state, without requesting additional recording access.
- The candidate portal has a sculptural sun and sage orbit on the résumé welcome page.
- Candidate files gain layered edges, a short opening lift, and quiet section entrances.
- Insights reveal actual bar values on entering view, with details available on hover or keyboard focus. Values remain accessible throughout the reveal, and zero values stay zero.

Decorative entrances settle after playing once. Reduced-motion preferences remove the movement. These additions use CSS and existing browser capabilities, without new runtime packages.

## Verification

- Production build passes.
- Full frontend suite passes: 627 tests across 73 files, including review destination rendering, candidate-file navigation, stale response handling, screening scope and activity, chart reveals, microphone-driven visuals, interview status/error states, consent, reports, sourcing and assistant flows.
- Local review entry and source module respond successfully on port 3007.
- Review fixtures are absent from the production bundle.
- Browser visual inspection was unavailable because local browser use is disabled in Work settings. Desktop/mobile layouts still need visual review in the browser.
- Live backend, microphone/camera, third-party services and real invitation delivery were not exercised during this design review.
