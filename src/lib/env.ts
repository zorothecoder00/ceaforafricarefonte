/* Lecture des variables d'environnement côté serveur.
   Astro les expose via import.meta.env (fichier .env en local) ; Vercel et les scripts (tsx) via process.env. */
export function env(name: string): string | undefined {
  const viaVite = (import.meta as { env?: Record<string, string | undefined> }).env?.[name];
  return viaVite ?? (typeof process !== 'undefined' ? process.env[name] : undefined);
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const isProd = () => env('NODE_ENV') === 'production' || env('VERCEL_ENV') === 'production';
