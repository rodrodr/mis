import { municipalities, profileSlug, loadProfile } from './profiles';
// PROFILE_LIMIT=20 builds a sample (size measurement); unset builds all 5,571.
export function profilePaths(langs: (string | null)[]) {
  const lim = Number(process.env.PROFILE_LIMIT) || Infinity;
  const rows = municipalities().slice(0, lim);
  return langs.flatMap((lang) => rows.map((r) => ({
    params: { ...(lang ? { lang } : {}), slug: profileSlug(r[0], r[1]) },
    props: { code: r[0] },
  })));
}
export { loadProfile };
