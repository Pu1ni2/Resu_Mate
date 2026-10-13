import React from 'react';

import useMediaQuery from '../../hooks/useMediaQuery';
import { TABS } from './samples';
import PreviewPanels from './PreviewPanels';

const STEP = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

/* The product, in Studio's dark chapter: four tabs, each a sample of one part
 * of ResuMate, showing whoever is chosen in the candidate file. The arrow keys,
 * Home and End move between the tabs, as in any tab list. They run down the
 * page on a wide screen and across it below 1100px, and screen readers are
 * told which. */
export default function ProductPreview({ sectionRef, tabRefs, state, dispatch, openTab, showInPreview }) {
  const across = useMediaQuery('(max-width: 1100px)');

  const onKeyDown = (event, index) => {
    let next;
    if (event.key in STEP) next = (index + STEP[event.key] + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    openTab(TABS[next].id);
  };

  return (
    <section className="workflow" id="platform" aria-labelledby="platform-title" ref={sectionRef}>
      <div className="wrap">
        <div className="workflow-top">
          <div><div className="eyebrow">From first look to next step</div><h2 id="platform-title">One flow. <em>A clearer picture.</em></h2></div>
          <p className="demo-tag">Interactive preview</p>
        </div>
        <div className="journey">
          <div className="tabs" role="tablist" aria-label="Explore the hiring workflow" aria-orientation={across ? 'horizontal' : 'vertical'}>
            {TABS.map((tab, i) => {
              const selected = state.tab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(el) => { tabRefs.current[tab.id] = el; }}
                  className="tab" type="button" role="tab" id={`tab-${tab.id}`} aria-controls={`panel-${tab.id}`}
                  aria-selected={selected} tabIndex={selected ? 0 : -1}
                  onClick={() => dispatch({ type: 'show', tab: tab.id })}
                  onKeyDown={event => onKeyDown(event, i)}
                >
                  <span className="num">{tab.number}</span><span className="tab-title">{tab.title}</span><span className="tab-arrow" aria-hidden="true">↗</span>
                </button>
              );
            })}
          </div>
          <div>
            <PreviewPanels
              state={state}
              onView={(person) => { dispatch({ type: 'view', person }); tabRefs.current.evaluate?.focus({ preventScroll: true }); }}
              onInterview={() => openTab('interview')}
              onNextQuestion={() => dispatch({ type: 'nextQuestion' })}
              onPreviewInterview={() => showInPreview('interview')}
            />
            <p className="workflow-note">An illustrative preview with fictional candidates. No résumés are uploaded and no interviews are started.</p>
            <span className="sr-only" role="status" aria-live="polite">{state.announcement}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
