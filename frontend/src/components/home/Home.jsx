import React, { useEffect, useReducer, useRef, useState } from 'react';

import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion';
import { getToken } from '../../services/session';
import { homeReducer, initialState } from './homeModel';
import HomeNav from './HomeNav';
import Hero from './Hero';
import Steps from './Steps';
import ProductPreview from './ProductPreview';
import Closing from './Closing';
import HomeFooter from './HomeFooter';

/* The homepage, in the Studio design (styles/studio.css). Its sample people
 * are made up, and the candidate file at the top and the product preview
 * further down always show the same one (homeModel.js). */

const TITLE = 'ResuMate — See the person. Find the fit.';
const PAPER = '#f6f3eb';

export default function Home() {
  const [state, dispatch] = useReducer(homeReducer, initialState);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const still = reduced || paused;
  const previewRef = useRef(null);
  const tabRefs = useRef({});

  // A manager who is already signed in goes straight to the dashboard.
  const forManager = path => (getToken() ? '/hiring' : path);

  // The design's tab title, and a cream browser bar on phones, while it is open.
  useEffect(() => {
    const bar = document.querySelector('meta[name="theme-color"]');
    const before = { title: document.title, bar: bar?.getAttribute('content') };
    document.title = TITLE;
    bar?.setAttribute('content', PAPER);
    return () => {
      document.title = before.title;
      if (bar && before.bar) bar.setAttribute('content', before.bar);
    };
  }, []);

  // Open a preview tab with the keyboard on it.
  const openTab = (tab) => {
    dispatch({ type: 'show', tab });
    tabRefs.current[tab]?.focus({ preventScroll: true });
  };

  // ...and bring the preview into view: from the menu, and from inside it.
  const showInPreview = (tab) => {
    openTab(tab);
    previewRef.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div id="top" className={still ? 'studio motion-paused' : 'studio'}>
      <HomeNav signInTo={forManager('/hiring/login')} onShow={showInPreview} />
      <main>
        <Hero person={state.person} onChoose={person => dispatch({ type: 'choose', person })}
          startHiringTo={forManager('/hiring/register')} />
        <Steps />
        <ProductPreview sectionRef={previewRef} tabRefs={tabRefs} state={state} dispatch={dispatch}
          openTab={openTab} showInPreview={showInPreview} />
        <Closing onMeetNext={() => dispatch({ type: 'meetNext' })} startHiringTo={forManager('/hiring/register')} />
      </main>
      <HomeFooter reduced={reduced} paused={paused} onToggleMotion={() => setPaused(p => !p)} />
    </div>
  );
}
