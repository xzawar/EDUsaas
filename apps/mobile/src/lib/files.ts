import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { authHeaders, fileUrl } from './api';
import { toast } from '@/components/toast';

/** Downloads a PDF/image with the session header and opens the system share/print sheet. */
export async function openPdf(path: string, name: string) {
  try {
    const target = `${FileSystem.cacheDirectory}${name.replace(/[^\w.-]+/g, '-')}`;
    const r = await FileSystem.downloadAsync(fileUrl(path), target, { headers: await authHeaders() });
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    if (await Sharing.isAvailableAsync())
      await Sharing.shareAsync(r.uri, { mimeType: 'application/pdf', dialogTitle: name });
    else toast('info', `Saved to ${r.uri}`);
  } catch (e) {
    toast('error', e instanceof Error && /HTTP/.test(e.message) ? 'Could not load the file.' : 'No connection.');
  }
}
