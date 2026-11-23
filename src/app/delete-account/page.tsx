import type { Metadata } from 'next';
import { Contact, LegalPage } from '@/components/LegalPage';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = { title: 'Delete an account · EDUsaas' };

/** Google Play's account-deletion page: how a person asks for their EDUsaas account and data to be deleted. */
export default function DeleteAccountPage() {
  return (
    <LegalPage title="Delete an EDUsaas account">
      <p>
        EDUsaas accounts are created and managed by schools. You can ask for your account (or your child’s) and the
        information linked to it to be deleted in either of these ways:
      </p>
      <h2>1. Ask your school</h2>
      <p>
        Contact your school office or School Admin and ask them to remove your account. Staff accounts are switched off
        and removed by the School Admin; student accounts are removed when the school withdraws the student.
      </p>
      <h2>2. Ask us</h2>
      <p>
        Email <Contact /> from the email address your school has on file, or use More → Help in the app. Tell us your
        name, your school and your username. We will confirm the request with your school and complete it within 30
        days.
      </p>
      <h2>What is deleted</h2>
      <ul>
        <li>Your sign-in, profile, photo and phone notifications are deleted.</li>
        <li>Attendance, marks, leave and messages linked only to you are deleted.</li>
        <li>
          Fee receipts and payment records may be kept by your school for as long as the law requires for its accounts;
          they are no longer linked to a usable account.
        </li>
        <li>Security logs are kept for up to 12 months and then deleted.</li>
      </ul>
      <p>When a whole school stops using EDUsaas, every account and record of that school is deleted. {LEGAL.name}.</p>
    </LegalPage>
  );
}
