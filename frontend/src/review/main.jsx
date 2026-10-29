if (import.meta.env.DEV) {
  const { startReview } = await import('./review.jsx');
  startReview();
} else {
  document.getElementById('root').textContent = 'Design review is available only in local development.';
}
