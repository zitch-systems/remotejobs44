// lib/jobs/region-terms.ts — single source of truth for the region/country
// → location-keyword expansion used by both the SSR /jobs page and the
// /api/jobs route. Previously this map was duplicated in both files and had
// drifted: the filter UI (components/jobs/JobsFiltersBar) offers country
// options (singapore, australia, uae, indonesia, philippines, portugal, …)
// that had NO key here, so they silently fell back to a literal
// `location.ilike.%<slug>%` — e.g. `uae` matched nothing because postings say
// "Dubai" / "United Arab Emirates", not "uae". Every value the UI can submit
// now has a curated synonym list (country name + major cities + common
// variants) so the filter behaves consistently instead of half-curated,
// half-literal.
//
// Keep this in sync with the REGIONS + COUNTRIES option lists in
// components/jobs/JobsFiltersBar.tsx.
export const REGION_TERMS: Record<string, string[]> = {
  // ── Regions ──────────────────────────────────────────────────────────
  africa:        ['africa','nigeria','ghana','kenya','south africa','egypt','ethiopia','cameroon','senegal'],
  europe:        ['europe','uk','germany','france','netherlands','spain','italy','sweden','poland','portugal'],
  latam:         ['latin america','latam','brazil','mexico','colombia','argentina','chile'],
  asia:          ['asia','india','singapore','japan','china','korea','indonesia','vietnam','philippines'],
  // "Remote" alone says nothing about eligible countries. A US-only remote
  // opening must not appear in the worldwide filter.
  worldwide:     ['worldwide','work from anywhere'],

  // ── Africa ───────────────────────────────────────────────────────────
  nigeria:       ['nigeria','lagos','abuja','port harcourt'],
  ghana:         ['ghana','accra'],
  kenya:         ['kenya','nairobi'],
  'south-africa':['south africa','johannesburg','cape town','durban','pretoria'],
  egypt:         ['egypt','cairo','alexandria'],
  ethiopia:      ['ethiopia','addis ababa'],
  tanzania:      ['tanzania','dar es salaam','dodoma'],
  rwanda:        ['rwanda','kigali'],
  senegal:       ['senegal','dakar'],
  cameroon:      ['cameroon','douala','yaounde','yaoundé'],

  // ── Americas ─────────────────────────────────────────────────────────
  us:            ['united states','usa','us only','new york','san francisco','los angeles','chicago','austin'],
  canada:        ['canada','toronto','vancouver','montreal','ottawa'],
  brazil:        ['brazil','brasil','são paulo','sao paulo','rio de janeiro'],
  mexico:        ['mexico','méxico','mexico city','guadalajara','monterrey'],
  colombia:      ['colombia','bogota','bogotá','medellin','medellín'],
  argentina:     ['argentina','buenos aires','córdoba','cordoba'],

  // ── Europe ───────────────────────────────────────────────────────────
  uk:            ['uk','united kingdom','london','england','scotland','wales','manchester'],
  germany:       ['germany','deutschland','berlin','munich','münchen','hamburg','frankfurt'],
  france:        ['france','paris','lyon','marseille','toulouse'],
  netherlands:   ['netherlands','holland','amsterdam','rotterdam','the hague','utrecht'],
  spain:         ['spain','españa','espana','madrid','barcelona','valencia'],
  sweden:        ['sweden','sverige','stockholm','gothenburg','göteborg'],
  poland:        ['poland','polska','warsaw','warszawa','krakow','kraków','wroclaw'],
  portugal:      ['portugal','lisbon','lisboa','porto'],

  // ── Asia-Pacific ─────────────────────────────────────────────────────
  india:         ['india','bangalore','bengaluru','mumbai','delhi','hyderabad','pune','chennai'],
  singapore:     ['singapore'],
  australia:     ['australia','sydney','melbourne','brisbane','perth','canberra'],
  indonesia:     ['indonesia','jakarta','bali','surabaya'],
  philippines:   ['philippines','manila','cebu','davao'],

  // ── Middle East ──────────────────────────────────────────────────────
  uae:           ['uae','united arab emirates','dubai','abu dhabi','emirates','sharjah'],
};
