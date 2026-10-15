/* The sign-in screens' words, as the approved design has them
 * (design-preview/studio-auth.js): the story on the left, the journey under
 * it, and each form's heading and button. */

export const JOURNEYS = {
  hiring: {
    label: 'THE HIRING JOURNEY',
    name: 'Your hiring journey',
    steps: [
      { icon: 'resume', title: 'Bring the experience', text: 'Upload résumés or discover candidates.' },
      { icon: 'discover', title: 'Understand the fit', text: 'Explore skills, evidence, and role requirements.' },
      { icon: 'conversation', title: 'Start the conversation', text: 'Create interviews and review the results.' },
    ],
  },
  candidate: {
    label: 'YOUR NEXT CHAPTER',
    name: 'Your candidate journey',
    steps: [
      { icon: 'resume', title: 'Your résumé', text: 'Explore your experience and strengths.' },
      { icon: 'preparation', title: 'Your preparation', text: 'Get résumé advice and interview practice.' },
      { icon: 'conversation', title: 'Your interview', text: 'Take your invited interview and review your report.' },
    ],
  },
};

export const SCREENS = {
  login: {
    audience: 'hiring',
    story: {
      eyebrow: 'A LITTLE MORE HUMAN', title: ['See the person.', 'Find the fit.'],
      copy: 'A thoughtful workspace for the people behind every résumé.',
      caption: 'Every great hire starts with a closer look.',
    },
    form: {
      eyebrow: 'THE HIRING WORKSPACE', title: 'Welcome back.',
      intro: 'Good hiring starts with a closer look. Pick up where you left off.',
      submit: 'Sign in', busy: 'Signing in…',
    },
  },
  register: {
    audience: 'hiring',
    story: {
      eyebrow: 'BUILD SOMETHING GOOD', title: ['Make room.', 'For great people.'],
      copy: 'Bring your candidates, your questions, and a little curiosity. We’ll help with the details.',
      caption: 'A new workspace. A more considered way to hire.',
    },
    form: {
      eyebrow: 'A FRESH START', title: 'Make room for talent.',
      intro: 'Create your hiring manager account. Your next great hire starts here.',
      submit: 'Create account', busy: 'Creating your account…',
    },
  },
  forgot: {
    audience: 'hiring',
    story: {
      eyebrow: 'PICK UP WHERE YOU LEFT OFF', title: ['A fresh page.', 'A familiar desk.'],
      copy: 'Your next conversation, your next candidate, your next great hire.',
      caption: 'A small reset. Then back to the people who matter.',
    },
    form: {
      eyebrow: 'LET’S GET YOU BACK', title: 'Forgot your password?',
      intro: 'Enter your account email to request a link for choosing a new password.',
      submit: 'Email me a reset link', busy: 'Requesting your link…',
    },
  },
  reset: {
    audience: 'hiring',
    story: {
      eyebrow: 'A FRESH PAGE', title: ['Back to', 'what matters.'],
      copy: 'A few moments here, then back to finding your next great teammate.',
      caption: 'Your workspace is ready when you are.',
    },
    form: {
      eyebrow: 'YOUR NEXT CHAPTER', title: 'Choose a new password.',
      intro: 'Make it at least 8 characters. A memorable phrase works well.',
      submit: 'Save new password', busy: 'Saving your password…',
    },
  },
  candidate: {
    audience: 'candidate',
    story: {
      eyebrow: 'MORE THAN A RÉSUMÉ', title: ['Your story.', 'Your next chapter.'],
      copy: 'Explore your résumé, prepare for your interview, and put your experience into words.',
      caption: 'A place for the story only you can tell.',
    },
    form: {
      eyebrow: 'THE CANDIDATE PORTAL', title: 'Your next chapter.',
      intro: 'Use the email associated with your application. We’ll send you a sign-in code.',
      submit: 'Send access code', busy: 'Requesting your code…',
    },
  },
  code: {
    audience: 'candidate',
    story: {
      eyebrow: 'YOUR STORY CONTINUES', title: ['Ready for', 'what’s next.'],
      copy: 'Your experience is the beginning. Make space for what comes after it.',
      caption: 'A little preparation. A world of possibility.',
    },
    form: {
      eyebrow: 'ONE SMALL STEP', title: 'Check your inbox.',
      intro: 'Enter the 6-digit access code for your application email.',
      submit: 'Verify code', busy: 'Checking your code…',
    },
  },
};
