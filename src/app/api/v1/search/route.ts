import { defineRoute } from '@/server/http/route';
import { search, searchQuery } from '@/server/school/search';

/** Role-scoped fuzzy search (teachers: own sections; phone lookup: School Admin and Admissions only). */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.search',
  query: searchQuery,
  handler: async (ctx, { query }) => search(ctx, query),
});
