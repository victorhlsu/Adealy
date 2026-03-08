/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_SUPABASE_URL?: string
	readonly VITE_SUPABASE_ANON_KEY?: string
	readonly VITE_AUTH0_DOMAIN?: string
	readonly VITE_AUTH0_CLIENT_ID?: string
	readonly VITE_CLOUDINARY_CLOUD_NAME?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
