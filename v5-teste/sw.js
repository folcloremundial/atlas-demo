// Service worker do Atlas (v5-avisos). Não guarda nada do visitante.
//
// - Página: rede com limite de 3 s; passou disso (ou sem rede), abre a cópia guardada e continua
//   atualizando-a em segundo plano. Uma única cópia da página, qualquer que seja o endereço
//   ("./", "index.html", "?…").
// - Outros arquivos (manifest, ícones, imagem de compartilhar): rede com o mesmo limite, depois a
//   cópia guardada; se não houver, erro de rede — nunca uma página HTML no lugar de uma imagem.
// - VERSAO é trocada pelo empacotador por um resumo do conteúdo publicado: cada publicação nova
//   gera um service worker novo, que limpa os caches antigos ao assumir.
// Recuperação: ver PWA.md ("Como desativar um service worker com problema").
const VERSAO = 'atlas-4aae84f41438';
const PAGINA = new URL('./index.html', self.registration.scope).href;
const ARQUIVOS = ['./index.html', './manifest.webmanifest', './icones/oficial-candidato/atlas-192.png', './icones/oficial-candidato/atlas-512.png'];
const LIMITE_MS = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('atlas-') && k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// rede, mas sem esperar além do limite
function redeComLimite(pedido) {
  const rede = fetch(pedido);
  const prazo = new Promise((resolve) => setTimeout(() => resolve(null), LIMITE_MS));
  return { rede, corrida: Promise.race([rede.catch(() => null), prazo]) };
}

self.addEventListener('fetch', (e) => {
  const pedido = e.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== location.origin) return;
  const ePagina = pedido.mode === 'navigate';
  e.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    const chave = ePagina ? PAGINA : pedido;
    const { rede, corrida } = redeComLimite(pedido);
    // atualiza a cópia guardada quando a rede responder, mesmo depois do limite
    e.waitUntil(rede.then((r) => { if (r.ok && r.type === 'basic') return cache.put(chave, r.clone()); }).catch(() => {}));
    const rapida = await corrida;
    if (rapida && rapida.ok) return rapida;
    const guardada = await cache.match(chave, { ignoreSearch: ePagina });
    if (guardada) return guardada;
    // sem cópia: espera a rede (primeira visita) ou devolve o erro dela
    try { return await rede; } catch {
      return ePagina
        ? new Response('<!doctype html><meta charset="utf-8"><title>Atlas do Folclore</title><p style="font:18px Georgia;padding:24px">Sem conexão e ainda sem cópia guardada. Conecte-se uma vez para o Atlas funcionar sem internet.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        : Response.error();
    }
  })());
});
