// The design review page's entry (design-review.html). It runs on the
// development server only: the production build is index.html alone.
if (import.meta.env.DEV) {
  const { startReview } = await import('./review.jsx');
  startReview();
} else {
  document.getElementById('root').textContent = 'Design review is available only in local development.';
}
