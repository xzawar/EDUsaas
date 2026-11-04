import './globals.css';
import type { Metadata } from 'next';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
export const metadata:Metadata={title:'Education SaaS',description:'Multi-tenant school management platform'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><ServiceWorkerRegister />{children}</body></html>}
