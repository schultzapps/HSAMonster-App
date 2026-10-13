// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// The help center is built into /help/ and deployed alongside the hand-written
// site at the repo root (see .github/workflows/deploy-pages.yml).
export default defineConfig({
	site: 'https://hsamonster.com',
	base: '/help',
	integrations: [
		starlight({
			title: 'HSA Monster Help',
			description: 'Guides and answers for HSA Monster, the HSA receipt and reimbursement tracker.',
			logo: { src: './src/assets/appicon.png', alt: 'HSA Monster' },
			favicon: '/favicon.png',
			customCss: ['./src/styles/custom.css'],
			markdown: { headingLinks: false },
			components: {
				SocialIcons: './src/components/SocialIcons.astro',
				ThemeProvider: './src/components/ThemeProvider.astro',
				ThemeSelect: './src/components/ThemeSelect.astro',
			},
			head: [
				{ tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
				{ tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true } },
				{
					tag: 'link',
					attrs: {
						rel: 'stylesheet',
						href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap',
					},
				},
				{ tag: 'meta', attrs: { property: 'og:image', content: 'https://hsamonster.com/images/social-preview.jpg' } },
				{ tag: 'script', attrs: { async: true, src: 'https://www.googletagmanager.com/gtag/js?id=G-NM2GJWXE40' } },
				{
					tag: 'script',
					content:
						"window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-NM2GJWXE40');",
				},
			],
			sidebar: [
				{ label: 'Getting Started', items: [{ autogenerate: { directory: 'getting-started' } }] },
				{ label: 'Expenses & Receipts', items: [{ autogenerate: { directory: 'expenses' } }] },
				{ label: 'Reimbursements', items: [{ autogenerate: { directory: 'reimbursements' } }] },
				{ label: 'HSA Accounts', items: [{ autogenerate: { directory: 'accounts' } }] },
				{ label: 'Family & Sharing', items: [{ autogenerate: { directory: 'family' } }] },
				{ label: 'Sync, Export & Privacy', items: [{ autogenerate: { directory: 'data' } }] },
			],
		}),
	],
});
