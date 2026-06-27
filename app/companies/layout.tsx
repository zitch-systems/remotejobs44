// /companies metadata now lives in app/companies/page.tsx (a Server
// Component). This layout intentionally exports none — two metadata exports
// on the same route segment silently override each other field-by-field.
export default function CompaniesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
