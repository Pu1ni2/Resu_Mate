import React from 'react';

/* The journey's small drawings, from the approved design: drawn once, as
 * symbols, and placed by each step with <use>. */
export function JourneySymbols() {
  return (
    <svg className="journey-defs" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <symbol id="journey-resume" viewBox="0 0 100 100">
          <path d="M31 19h30l14 14v47H31Z" fill="#fffef9" stroke="#556149" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M61 19v14h14" fill="#e6eadb" stroke="#556149" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="44" cy="40" r="5" fill="#e3b08e" />
          <path d="M37 52c0-8 14-8 14 0M39 61h27M39 68h20" fill="none" stroke="#556149" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M22 29v43" stroke="#b1b99f" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="77" cy="70" r="13" fill="#e3e9d6" stroke="#7c8e66" strokeWidth="1.3" />
          <path d="M72 70h10m-5-5v10" stroke="#556149" strokeWidth="1.5" strokeLinecap="round" />
        </symbol>
        <symbol id="journey-discover" viewBox="0 0 100 100">
          <path d="m63 62 19 19" stroke="#bf4a32" strokeWidth="7" strokeLinecap="round" />
          <path d="m64 63 17 17" stroke="#f1c1a2" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="44" cy="43" r="26" fill="#fffef9" stroke="#bf4a32" strokeWidth="1.7" />
          <circle cx="44" cy="43" r="21" fill="none" stroke="#e7c2aa" strokeWidth="1" />
          <circle cx="44" cy="36" r="7" fill="#e1e7d3" stroke="#667755" strokeWidth="1.4" />
          <path d="M32 54c1-12 23-12 24 0" fill="none" stroke="#667755" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="77" cy="24" r="10" fill="#f6f3eb" stroke="#b5c19f" strokeWidth="1.3" />
          <path d="m73 24 3 3 5-6" fill="none" stroke="#657b4d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="journey-conversation" viewBox="0 0 100 100">
          <path d="M40 43h36a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8h-5l-10 8v-8H40a8 8 0 0 1-8-8V51a8 8 0 0 1 8-8Z" fill="#e0e7d2" stroke="#758565" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M24 22h37a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H40l-12 9v-9h-4a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8Z" fill="#fffef9" stroke="#556149" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M28 35h27M28 43h19" fill="none" stroke="#bf4a32" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="49" cy="68" r="1.5" fill="#758565" />
          <circle cx="57" cy="68" r="1.5" fill="#758565" />
          <circle cx="65" cy="68" r="1.5" fill="#758565" />
        </symbol>
        <symbol id="journey-preparation" viewBox="0 0 100 100">
          <path d="M20 24c12-4 22-1 30 4 9-5 19-8 30-4v50c-11-4-21-1-30 4-8-5-18-8-30-4Z" fill="#fffef9" stroke="#556149" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M50 28v50M28 37l13 2M28 46l13 2M28 55l10 2M59 38l12-2M59 47l12-2" fill="none" stroke="#98a486" strokeWidth="1.3" strokeLinecap="round" />
          <path d="m65 68 17-24 5 4-17 24-7 4Z" fill="#d6926f" stroke="#a64c32" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="m65 68 5 4" stroke="#a64c32" strokeWidth="1.3" />
          <path d="M75 12v8m-4-4h8" stroke="#bf4a32" strokeWidth="1.5" strokeLinecap="round" />
        </symbol>
      </defs>
    </svg>
  );
}

/* The thread that joins the three steps: across the page, or down it where
 * the steps stack. */
export function JourneyThreads() {
  return (
    <>
      <svg className="journey-thread" viewBox="0 0 600 150" preserveAspectRatio="none" aria-hidden="true">
        <path d="M100 66C166 140 229-8 300 66S435 140 500 66" />
      </svg>
      <svg className="journey-thread-vertical" viewBox="0 0 100 300" preserveAspectRatio="none" aria-hidden="true">
        <path d="M46 38C80 81 16 117 46 150S78 223 46 262" />
      </svg>
    </>
  );
}
