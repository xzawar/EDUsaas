/**
 * Who runs EDUsaas, for the privacy policy, terms and the account-deletion page (Google Play requires all three).
 * Set these on the deployment before launch: NEXT_PUBLIC_LEGAL_NAME (the business or person that publishes the app),
 * NEXT_PUBLIC_SUPPORT_EMAIL (a monitored inbox) and NEXT_PUBLIC_LEGAL_COUNTRY.
 */
export const LEGAL = {
  name: process.env.NEXT_PUBLIC_LEGAL_NAME || 'EDUsaas',
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || null,
  country: process.env.NEXT_PUBLIC_LEGAL_COUNTRY || 'Pakistan',
  updated: '23 November 2026',
};
