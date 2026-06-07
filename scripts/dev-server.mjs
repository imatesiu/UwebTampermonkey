const publicHost = process.env.PUBLIC_HOST?.trim() || process.env.SERVER_HOST?.trim();

if (!publicHost) {
  throw new Error(
    "Per l'avvio server devi impostare PUBLIC_HOST oppure SERVER_HOST, ad esempio tm.example.com"
  );
}

const publicScheme = process.env.PUBLIC_SCHEME?.trim() || "https";

process.env.HOST ??= "0.0.0.0";
process.env.HTTPS ??= "1";
process.env.PUBLIC_HOST = publicHost;
process.env.DEV_PUBLIC_ORIGIN ??= `${publicScheme}://${publicHost}`;
process.env.LETSENCRYPT_SITE ??= publicHost;

await import("./dev.mjs");
