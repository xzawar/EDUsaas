# Google Play: Data safety, content rating and target audience

These answers describe what the code in this repository actually does (checked on 23 November 2026). If you add an
analytics, crash-reporting or ads SDK later, these answers must change.

## Data safety

**Does your app collect or share any of the required user data types?** Yes.

**Is all of the user data collected by your app encrypted in transit?** Yes (HTTPS only; the store build refuses
plain-http servers).

**Do you provide a way for users to request that their data is deleted?** Yes:
`https://<your-domain>/delete-account`.

### Data collected

None of this data is **shared** with third parties (service providers that host data for you do not count as sharing).
None is used for advertising or marketing. All of it is required for the app to work (not optional), except where
noted.

| Category                 | Data type                                                                                  | Purpose                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Personal info            | Name                                                                                       | App functionality, Account management                      |
| Personal info            | Email address (staff accounts)                                                             | Account management                                         |
| Personal info            | User IDs (username)                                                                        | Account management                                         |
| Personal info            | Address (student records, entered by the school)                                           | App functionality                                          |
| Personal info            | Phone number (guardian and teacher contact, entered by the school)                         | App functionality                                          |
| Personal info            | Other info (date of birth, gender, class, roll number)                                     | App functionality                                          |
| Financial info           | Purchase history (school fee bills, payments and receipts)                                 | App functionality                                          |
| Financial info           | Other financial info (salaries and payslips for staff)                                     | App functionality                                          |
| Photos and videos        | Photos (payment screenshots, optional profile photos)                                      | App functionality. Collected only when the user picks one. |
| App activity             | Other user-generated content (leave reasons, notices, support messages, marks)             | App functionality                                          |
| App info and performance | Diagnostics — only if you set `SENTRY_DSN` on the server (server errors, no personal data) | Analytics                                                  |
| Device or other IDs      | Device or other IDs (push-notification token)                                              | App functionality (notifications)                          |

**Not collected:** location, contacts, calendar, SMS or call logs, audio, files and docs, web browsing, installed apps,
health and fitness, advertising ID.

## Permissions to explain (if asked)

| Permission    | Why                                                                            |
| ------------- | ------------------------------------------------------------------------------ |
| Camera        | Take a photo of a payment proof or a student photo, only when the user taps it |
| Notifications | Notices, marks, leave answers and fee reminders                                |
| Biometrics    | Optional app lock, checked on the phone                                        |

The app does **not** request READ_MEDIA_IMAGES or storage access; it uses Android's photo picker.

## Content rating questionnaire (IARC)

- Category: **Reference, News, or Educational**
- Violence, sexual content, profanity, drugs, gambling: **No**
- Users can interact or exchange content: **Yes** (notices from schools and teachers; support messages). There is no
  open chat between users and no public posting.
- Shares the user's location: **No**
- Digital purchases: **No**

Expected rating: Everyone / PEGI 3.

## Target audience and content

Students (some under 13) use the app, so in **Target audience** select the age groups your schools teach (for example
**9–12, 13–15, 16–17, 18+**). This puts the app under Google Play's **Families policy**. The app meets it as it stands:

- no ads and no ad SDKs
- no analytics or tracking SDKs in the app
- no location
- accounts are created by schools, not by children
- the privacy policy explains children's data

In the **Ads** section answer **No, my app does not contain ads**.

## News, government, financial features

- News app: No
- Government app: No
- Financial features: **No** (fees are paid to the school outside the app; the app records them and shows the
  school's bank details).
- Health: No
