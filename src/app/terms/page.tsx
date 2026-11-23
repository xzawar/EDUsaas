import type { Metadata } from 'next';
import { Contact, LegalPage } from '@/components/LegalPage';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = { title: 'Terms of use · EDUsaas' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <p>
        These terms cover your use of EDUsaas, provided by {LEGAL.name}. By signing in you agree to them. Your school’s
        own rules also apply to how you use it.
      </p>
      <h2>Your account</h2>
      <ul>
        <li>Your school creates your account. Keep your password private and don’t share your account.</li>
        <li>Tell your school if you think someone else has used your account.</li>
        <li>Your school can switch off or change your account, for example when you leave.</li>
      </ul>
      <h2>Using the service</h2>
      <ul>
        <li>Use EDUsaas only for school purposes and only for records you are allowed to see.</li>
        <li>
          Don’t upload anything false, illegal or harmful, try to get into other people’s accounts, or interfere with
          the service.
        </li>
        <li>Payment proofs you send must be real. Fees are paid to your school, not to EDUsaas.</li>
      </ul>
      <h2>Schools</h2>
      <p>
        Schools are responsible for the records they enter and for having the right to keep them. Their use is also
        covered by their subscription plan.
      </p>
      <h2>Availability</h2>
      <p>
        We work to keep EDUsaas running and your data safe, but we can’t promise it will never be interrupted. The app
        keeps some work on your phone when you’re offline and sends it when you reconnect.
      </p>
      <h2>Liability</h2>
      <p>
        EDUsaas is provided as it is. To the extent the law allows, {LEGAL.name} is not liable for indirect losses or
        for decisions made from records entered by schools.
      </p>
      <h2>Changes and contact</h2>
      <p>
        We may update these terms and will say so in the app. Questions: <Contact />.
      </p>
    </LegalPage>
  );
}
