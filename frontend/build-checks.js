/* What a production build must have before it's made (vite.config.js).
 *
 * The site calls the API at VITE_API_URL, fixed when it's built. Built
 * without it, the site fell back to an address written into the code: one
 * deployment's API, so any other deployment's site called the wrong server
 * and nothing said so. On Render, which sets RENDER in the build's
 * environment, such a build now fails, and Render keeps serving the site it
 * has. Local and CI builds don't need it.
 */
export function apiUrlProblem(env) {
  if (env.RENDER && !String(env.VITE_API_URL || '').trim()) {
    return "VITE_API_URL isn't set. Set it on the static site to the API's public address "
      + '(e.g. https://api.example.com), then deploy again.';
  }
  return null;
}
