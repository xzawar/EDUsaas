import type { Metadata } from 'next';
import { Contact, LegalPage } from '@/components/LegalPage';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = { title: 'Privacy policy · EDUsaas' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        EDUsaas is a school management app (website and Android app) published by {LEGAL.name}. Schools use it to run
        attendance, marks, fees, timetables and notices. This policy explains what information the app holds, why, who
        can see it and what you can do about it.
      </p>

      <h2>Who is responsible</h2>
      <p>
        Your school decides what information it keeps about its students, parents and staff, and creates your account.
        EDUsaas stores and processes that information for the school, following the school’s instructions. For questions
        about your school records, ask your school office first. For questions about EDUsaas itself, contact <Contact />
        .
      </p>

      <h2>What we hold</h2>
      <ul>
        <li>
          <strong>Account:</strong> name, username or email, role (student, teacher, office staff), a hashed password
          (we never see your password) and when you last signed in.
        </li>
        <li>
          <strong>Student records the school enters:</strong> class and roll number, admission details, date of birth,
          gender, guardian name and phone, address and an optional photo.
        </li>
        <li>
          <strong>School work:</strong> attendance, test marks and grades, leave requests, timetables, notices and
          support messages.
        </li>
        <li>
          <strong>Fees:</strong> bills, payments, receipts and the payment screenshots parents send as proof.
        </li>
        <li>
          <strong>Staff:</strong> check-in times, salary and payslip records the school keeps.
        </li>
        <li>
          <strong>Technical:</strong> a push-notification token and app version for your phone, and security records
          (time, a one-way hash of the network address, the browser or app name) so we can spot misuse.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> collect your location, contacts, microphone, advertising ID or browsing history.
        There are no ads in EDUsaas, and we never sell or rent personal information.
      </p>

      <h2>Phone permissions</h2>
      <ul>
        <li>
          <strong>Camera and photos:</strong> only when you choose to take or pick a payment screenshot or a photo.
        </li>
        <li>
          <strong>Notifications:</strong> for notices, marks, leave answers and fee reminders. You can turn them off in
          your phone settings.
        </li>
        <li>
          <strong>Fingerprint / face unlock:</strong> optional app lock. It is checked by your phone; nothing about it
          is sent to us.
        </li>
      </ul>

      <h2>How it is used</h2>
      <p>
        Only to run the school services you see in the app: showing records to the right people, sending notifications,
        issuing receipts and keeping the service secure and working. We do not use school data to train AI models or for
        marketing.
      </p>

      <h2>Who can see it</h2>
      <ul>
        <li>
          Inside your school, people see only what their role needs (for example, a teacher sees their own classes; the
          principal sees no fee records). Each school’s data is kept strictly separate from every other school.
        </li>
        <li>
          The EDUsaas team can see school names and plan details. They can look at a school’s records only if that
          school’s admin approves a time-limited support request, and every access is logged.
        </li>
        <li>
          Service providers that host the app for us: our hosting and database providers, file storage for photos and
          payment proofs, the Expo / Google push service for notifications, and (if enabled) an email service for
          password resets and an error-reporting service that receives no personal data.
        </li>
        <li>We share information with authorities only when the law requires it.</li>
      </ul>

      <h2>How it is protected</h2>
      <p>
        All traffic is encrypted (HTTPS). Passwords are stored as one-way hashes. Files are kept in private storage and
        are only handed out to signed-in people allowed to see them. Changes to records are written to an audit log.
      </p>

      <h2>How long we keep it</h2>
      <p>
        For as long as your school uses EDUsaas. When a school leaves, its account and all of its records and files are
        deleted. Schools may archive past years’ report cards and must keep fee records as their own law requires.
      </p>

      <h2>Children</h2>
      <p>
        Student accounts are created by schools, not by children themselves, and are used under the school’s and
        parents’ supervision. If you are a parent and want to see, correct or delete your child’s information, ask the
        school office, or contact us and we will help the school do it.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>See your information in the app at any time.</li>
        <li>Ask your school to correct anything that is wrong.</li>
        <li>
          Ask for your account to be deleted: see{' '}
          <a href="/delete-account" className="underline">
            Delete an account
          </a>
          .
        </li>
      </ul>

      <h2>Changes</h2>
      <p>
        If this policy changes in an important way, we will say so in the app before it takes effect. The date at the
        top shows the latest version.
      </p>

      <h2>Contact</h2>
      <p>
        {LEGAL.name}, {LEGAL.country}. Email: <Contact />
      </p>
    </LegalPage>
  );
}
