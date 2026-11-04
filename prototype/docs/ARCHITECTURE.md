# Architecture

## Stack

Next.js App Router + serverless route handlers, TypeScript, Prisma, PostgreSQL, local/R2 storage abstraction.

## Role model

Platform: Platform Owner, Platform Admin.
School: School Admin, Principal, Admissions Officer, Teacher, Student.
Class Incharge is a designation stored on a section, not a separate role.

## Main data flow

Tenant -> Academic Year -> Class -> Section -> current student placement.

Teacher assignments link Teacher + Section + Subject and are the source of teacher access scope for attendance, marks, search, and timetable.

## Deferred

Fees/payroll, universities, parent accounts, AI, SMS/WhatsApp, white-label domains, MFA, native mobile apps.
