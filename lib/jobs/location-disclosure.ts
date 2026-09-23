// The location field is supplied by a job source. Remote work arrangement
// alone does not establish that an employer can hire in every country.
export function hiringLocationDisclosure(location: string | null | undefined, remote: boolean) {
  const stated = location?.trim() ?? '';
  const unspecified = !stated || /^(remote|hybrid|unknown|(?:location )?not specified|n\/a)$/i.test(stated);
  if (unspecified) return {
    label: 'Hiring countries not stated',
    detail: remote
      ? 'This role is marked remote, but the listing does not name eligible countries. Check the employer posting before applying.'
      : 'The listing does not name an eligible work location. Check the employer posting before applying.',
    uncertain: true,
  };

  if (remote && /^(worldwide|work from anywhere|anywhere)$/i.test(stated)) return {
    label: 'Worldwide stated',
    detail: 'The listing states a worldwide location. Confirm any exceptions and legal hiring requirements with the employer.',
    uncertain: false,
  };

  return {
    label: 'Employer-listed location',
    detail: remote
      ? `Location listed: ${stated}. Remote does not always mean you can work from every country; check the employer posting for restrictions.`
      : `Location listed: ${stated}. Check the employer posting for worksite and eligibility requirements.`,
    uncertain: false,
  };
}
