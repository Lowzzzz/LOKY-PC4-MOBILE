// ROLLBACK SNAPSHOT — LOKY PC4 MOBILE SEARCH
// Supabase deployment version: 16
// EZBR SHA256: fbb99d498bb3ef2eaccc2f26b1e55b8c89d9f87c1c3a50b6a5f0df8068734726
// Captured from production before R4F10R2 backend correction.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERSION = 11;
const OWNER_DEVICE_HASH = "d1f1016a0ce85e42b8fefe501a87526e035a98e833ac00b38fbf5b1dd020f7b8";
const PROVIDER = "hybrid-local-v2";
const ALLOWED_ORIGINS = new Set([
  "https://lowzzzz.github.io",
  "http://localhost:8794",
  "http://127.0.0.1:8794",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.has(origin);
  return {
    "access-control-allow-origin": allowed ? origin : "https://lowzzzz.github.io",
    "access-control-allow-headers": "content-type,x-loky-device",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "vary": "origin",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}
function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  return origin === "" || ALLOWED_ORIGINS.has(origin);
}
async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("");
}
function dbConfig() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return { url, key };
}
async function dbRpc(name:string,body:any){
  const {url,key}=dbConfig();
  if(!url||!key)throw new Error("SUPABASE_SERVICE_NOT_CONFIGURED");
  const response=await fetch(`${url}/rest/v1/rpc/${name}`,{
    method:"POST",
    headers:{
      "apikey":key,
      "authorization":`Bearer ${key}`,
      "content-type":"application/json",
    },
    body:JSON.stringify(body||{}),
  });
  const text=await response.text();
  let data:any=null;
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!response.ok)throw new Error(`DB_RPC_${response.status}_${String(data?.message||text||"error").slice(0,220)}`);
  return data;
}
async function guestAuthorized(device: string) {
  const { url, key } = dbConfig();
  if (!url || !key || device.length < 16) return null;
  const hash = await sha256(device);
  const now = new Date().toISOString();
  const response = await fetch(
    `${url}/rest/v1/loky_mobile_devices?capability_hash=eq.${encodeURIComponent(hash)}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(now)}&select=id,expires_at&limit=1`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function authorize(req: Request) {
  const device = req.headers.get("x-loky-device") || "";
  if (device.length < 16) return null;
  const hash = await sha256(device);
  if (hash === OWNER_DEVICE_HASH) return { role: "owner" };
  const guest = await guestAuthorized(device);
  return guest ? { role: "guest" } : null;
}
function cleanQuery(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 700);
}
function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g," ")
    .trim();
}
const PR_MUNICIPALITIES=new Set([
  "adjuntas","aguada","aguadilla","aguas buenas","aibonito","anasco","arecibo","arroyo","barceloneta","barranquitas",
  "bayamon","cabo rojo","caguas","camuy","canovanas","carolina","catano","cayey","ceiba","ciales","cidra","coamo","comerio",
  "corozal","culebra","dorado","fajardo","florida","guanica","guayama","guayanilla","guaynabo","gurabo","hatillo","hormigueros",
  "humacao","isabela","jayuya","juana diaz","juncos","lajas","lares","las marias","las piedras","loiza","luquillo","manati","maricao",
  "maunabo","mayaguez","moca","morovis","naguabo","naranjito","orocovis","patillas","penuelas","ponce","quebradillas","rincon",
  "rio grande","sabana grande","salinas","san german","san juan","san lorenzo","san sebastian","santa isabel","toa alta","toa baja",
  "trujillo alto","utuado","vega alta","vega baja","vieques","villalba","yabucoa","yauco"
]);
function cleanIntentPrefix(value:string){
  return String(value||'')
    .replace(/^\s*loky[,:]?\s*/i,'')
    .replace(/^[¿?¡!\s]+|[¿?¡!\s]+$/g,'')
    .replace(/\b(?:busca|búscame|buscame|averigua|averíguame|averiguame|encuentra|investiga|consulta|consúltame|consultame|localiza)\b/gi,' ')
    .replace(/\b(?:por favor|please)\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function localScope(query:string){
  const compact=cleanIntentPrefix(query);
  const match=compact.match(/(?:n[uú]mero\s+de\s+tel[eé]fono|tel[eé]fono)(?:\s+p[uú]blico)?\s+de\s+(.+)/i);
  if(!match)return null;
  let target=match[1].trim();
  let location='';
  const loc=target.match(/^(.+?)\s+en\s+(.+)$/i);
  if(loc){
    target=loc[1].trim();
    location=loc[2].trim().replace(/[?.!,;:]+$/,'');
  }
  if(!target||!location)return null;
  const locationNorm=normalize(location);
  return {
    entity:target,
    location,
    locationNorm,
    countryHint:PR_MUNICIPALITIES.has(locationNorm)?'Puerto Rico':'',
  };
}
function meaningfulTokens(value:string){
  const stop=new Set(["de","la","el","los","las","the","and","pizza","restaurant","store"]);
  return normalize(value).split(/[^a-z0-9]+/).filter(x=>x.length>2&&!stop.has(x));
}
function locationResultMatch(result:any,scope:any){
  if(!scope?.locationNorm)return true;
  const text=normalize(`${result?.title||''} ${result?.snippet||''} ${result?.uri||''}`);
  const locationTokens=meaningfulTokens(scope.locationNorm);
  if(!locationTokens.length)return text.includes(scope.locationNorm);
  const locOk=locationTokens.every(t=>text.includes(t));
  const entityTokens=meaningfulTokens(scope.entity);
  const entityHits=entityTokens.filter(t=>text.includes(t)).length;
  const entityOk=!entityTokens.length||entityHits>=Math.max(1,Math.ceil(entityTokens.length*0.5));
  return locOk&&entityOk;
}
function tollFreePhone(value:string){
  const digits=normalizePhone(value);
  return /^(800|833|844|855|866|877|888)/.test(digits);
}

function phoneIntent(query:string){
  const n=normalize(query);
  return /\b(?:telefono|numero de telefono|phone number|telephone)\b/.test(n);
}
function normalizePhone(value:string){
  const raw=String(value||'').trim();
  const digits=raw.replace(/\D/g,'');
  if(digits.length===11&&digits.startsWith('1'))return digits.slice(1);
  return digits;
}
function displayPhone(value:string){
  const digits=normalizePhone(value);
  if(digits.length===10)return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  return String(value||'').trim();
}
function publicHttpUrl(raw:string){
  try{
    const u=new URL(String(raw||''));
    if(!['http:','https:'].includes(u.protocol))return null;
    const host=u.hostname.toLowerCase();
    if(host==='localhost'||host.endsWith('.local'))return null;
    if(/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host))return null;
    const m=host.match(/^172\.(\d{1,3})\./);
    if(m&&Number(m[1])>=16&&Number(m[1])<=31)return null;
    return u;
  }catch{return null;}
}
function extractPhones(text:string){
  const out=new Map<string,string>();
  const add=(raw:string)=>{
    const key=normalizePhone(raw);
    if(key.length<10||key.length>11)return;
    if(!out.has(key))out.set(key,displayPhone(raw));
  };
  for(const m of String(text||'').matchAll(/(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g))add(m[0]);
  for(const m of String(text||'').matchAll(/tel(?:ephone)?["']?\s*[:=]\s*["']?([^"'<>\n]{7,30})/gi))add(m[1]);
  for(const m of String(text||'').matchAll(/href=["']tel:([^"']+)["']/gi))add(decodeURIComponent(m[1]));
  return Array.from(out.entries()).map(([key,value])=>({key,value}));
}
async function fetchContactEvidence(uri:string){
  const url=publicHttpUrl(uri);
  if(!url)return {uri,phones:[] as Array<{key:string,value:string}>};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6500);
  try{
    const response=await fetch(url.href,{
      method:'GET',
      headers:{
        'user-agent':'Mozilla/5.0 (LOKY Mobile Contact Verification)',
        'accept':'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5',
        'accept-language':'es-ES,es;q=0.9,en;q=0.8',
      },
      redirect:'follow',
      signal:controller.signal,
    });
    if(!response.ok)return {uri,phones:[] as Array<{key:string,value:string}>};
    const type=String(response.headers.get('content-type')||'').toLowerCase();
    if(!type.includes('text')&&!type.includes('html')&&!type.includes('json'))return {uri,phones:[] as Array<{key:string,value:string}>};
    const text=(await response.text()).slice(0,700000);
    return {uri,phones:extractPhones(text)};
  }catch{
    return {uri,phones:[] as Array<{key:string,value:string}>};
  }finally{
    clearTimeout(timer);
  }
}

function blockedPrivateContact(query: string) {
  const n = normalize(query);
  return /\b(?:telefono privado|numero privado|direccion privada|domicilio privado|direccion de su casa|donde vive exactamente|private phone|private address|home address)\b/.test(n);
}
function decodeHtml(value: string) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}
function cleanDuckUrl(raw: string) {
  const href = decodeHtml(raw);
  try {
    const absolute = href.startsWith("//") ? `https:${href}` : href;
    const u = new URL(absolute, "https://duckduckgo.com/");
    if (u.hostname.endsWith("duckduckgo.com") && u.pathname.startsWith("/l/")) {
      const target = u.searchParams.get("uddg");
      if (target) return target;
    }
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {}
  return "";
}
function parseDuckHtmlResults(html: string) {
  const links: Array<{title:string,uri:string}> = [];
  const snippets: string[] = [];

  const linkRe = /<a[^>]*(?:class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*class=["'][^"']*result__a[^"']*["'])[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) && links.length < 10) {
    const uri = cleanDuckUrl(match[1] || match[2] || "");
    const title = decodeHtml(match[3] || "");
    if (!uri || !title) continue;
    links.push({ title, uri });
  }

  const snippetRe = /<a[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = snippetRe.exec(html)) && snippets.length < 10) {
    snippets.push(decodeHtml(match[1]));
  }

  return links.slice(0,8).map((link,index)=>({
    ...link,
    snippet:String(snippets[index]||"").slice(0,700),
  }));
}

function parseDuckLiteResults(html: string) {
  const links: Array<{title:string,uri:string}> = [];
  const snippets: string[] = [];
  let match: RegExpExecArray | null;

  const linkRe = /<a[^>]*(?:href=["']([^"']+)["'][^>]*class=["'][^"']*result-link[^"']*["']|class=["'][^"']*result-link[^"']*["'][^>]*href=["']([^"']+)["'])[^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = linkRe.exec(html)) && links.length < 10) {
    const uri=cleanDuckUrl(match[1]||match[2]||"");
    const title=decodeHtml(match[3]||"");
    if(!uri||!title)continue;
    links.push({title,uri});
  }

  const snippetRe=/<td[^>]*class=["'][^"']*result-snippet[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi;
  while((match=snippetRe.exec(html))&&snippets.length<10){
    snippets.push(decodeHtml(match[1]));
  }

  return links.slice(0,8).map((link,index)=>({
    ...link,
    snippet:String(snippets[index]||"").slice(0,700),
  }));
}
function buildSearchQueries(query:string){
  const original=String(query||'').trim();
  const compact=original
    .replace(/^\s*loky[,:]?\s*/i,'')
    .replace(/^[¿?¡!\s]+|[¿?¡!\s]+$/g,'')
    .replace(/\b(?:busca|búscame|buscame|averigua|averíguame|averiguame|encuentra|investiga|consulta|consúltame|consultame)\b/gi,' ')
    .replace(/\b(?:por favor|please)\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim();

  const queries:string[]=[];
  const add=(q:string)=>{
    const clean=q.replace(/\s+/g,' ').trim();
    if(clean&&clean.length>=3&&!queries.includes(clean))queries.push(clean.slice(0,350));
  };

  const phone=compact.match(/(?:n[uú]mero\s+de\s+tel[eé]fono|tel[eé]fono)(?:\s+p[uú]blico)?\s+de\s+(.+)/i);
  if(phone){
    let target=phone[1].trim();
    let location='';
    const loc=target.match(/^(.+?)\s+en\s+(.+)$/i);
    if(loc){target=loc[1].trim();location=loc[2].trim();}
    add(`"${target}" phone number`);
    if(location)add(`"${target}" phone number ${location}`);
    add(`${target} phone number`);
    return queries.slice(0,3);
  }

  const address=compact.match(/(?:direcci[oó]n|address)\s+de\s+(.+)/i);
  if(address){
    add(`"${address[1].trim()}" address`);
    add(`${address[1].trim()} address`);
    return queries.slice(0,2);
  }

  const hours=compact.match(/(?:horario|horarios|hours)\s+de\s+(.+)/i);
  if(hours){
    add(`"${hours[1].trim()}" hours`);
    add(`${hours[1].trim()} hours`);
    return queries.slice(0,2);
  }

  const web=compact.match(/(?:p[aá]gina\s+web|sitio\s+web|sitio\s+oficial)\s+de\s+(.+)/i);
  if(web){
    add(`"${web[1].trim()}" official website`);
    add(`${web[1].trim()} official website`);
    return queries.slice(0,2);
  }

  const news=compact
    .replace(/\b(?:[uú]ltimas\s+noticias|noticias\s+recientes|qu[eé]\s+pas[oó]\s+hoy\s+con|qu[eé]\s+est[aá]\s+pasando\s+con)\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
  if(news!==compact){
    add(`${news} latest news`);
    add(news);
    return queries.slice(0,2);
  }

  const generic=compact
    .replace(/^(?:cu[aá]l\s+es|dime|quiero\s+saber|me\s+puedes\s+decir)\s+/i,'')
    .trim();
  add(generic||compact);
  return queries.slice(0,1);
}

function parseBingRss(xml: string) {
  const out:Array<{title:string,uri:string,snippet:string}>=[];
  const itemRe=/<item>([\s\S]*?)<\/item>/gi;
  let match:RegExpExecArray|null;
  while((match=itemRe.exec(xml))&&out.length<8){
    const block=match[1];
    const tag=(name:string)=>{
      const m=block.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`,'i'));
      return m?decodeHtml(m[1]):'';
    };
    const title=tag('title');
    const uri=tag('link');
    const snippet=tag('description').slice(0,700);
    if(!title||!/^https?:\/\//i.test(uri))continue;
    out.push({title,uri,snippet});
  }
  return out;
}

async function bingSearch(query:string){
  const queries=buildSearchQueries(query);
  const merged:Array<{title:string,uri:string,snippet:string}>=[];
  const seen=new Set<string>();
  let lastError='BING_RSS_NO_RESULTS';

  for(const searchQuery of queries){
    try{
      const url=`https://www.bing.com/search?format=rss&setlang=en-US&cc=US&q=${encodeURIComponent(searchQuery)}`;
      const response=await fetch(url,{
        method:'GET',
        headers:{
          'user-agent':'Mozilla/5.0',
          'accept':'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
          'accept-language':'es-ES,es;q=0.9,en;q=0.8',
        },
        redirect:'follow',
      });
      if(!response.ok){lastError=`BING_RSS_HTTP_${response.status}`;continue;}
      const xml=await response.text();
      const results=parseBingRss(xml);
      for(const item of results){
        if(seen.has(item.uri))continue;
        seen.add(item.uri);
        merged.push(item);
        if(merged.length>=8)break;
      }
      if(merged.length>=6)break;
    }catch(error){
      lastError=String((error as Error)?.message||error);
    }
  }

  if(!merged.length)throw new Error(lastError);
  return merged.slice(0,8);
}

function extractPublicFacts(results: Array<{title:string,uri:string,snippet:string}>) {
  const phoneMap=new Map<string,{value:string,sources:Set<string>}>();
  const emails = new Set<string>();

  const addPhone=(raw:string,source:string)=>{
    const key=normalizePhone(raw);
    if(key.length<10||key.length>11)return;
    const existing=phoneMap.get(key)||{value:displayPhone(raw),sources:new Set<string>()};
    existing.sources.add(source);
    phoneMap.set(key,existing);
  };

  for (const result of results) {
    const resultText=String(result.title||'')+" "+String(result.snippet||'');
    for(const phone of extractPhones(resultText))addPhone(phone.value,result.uri);
    for (const m of resultText.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
      const email = String(m[0]).trim();
      if (email) emails.add(email);
      if (emails.size >= 5) break;
    }
  }

  const phoneEvidence=Array.from(phoneMap.entries()).map(([key,item])=>({
    key,
    value:item.value,
    sourceCount:item.sources.size,
    sources:Array.from(item.sources),
  })).sort((a,b)=>b.sourceCount-a.sourceCount||a.value.localeCompare(b.value));

  return {
    phones:phoneEvidence.map(x=>x.value).slice(0,5),
    phoneEvidence:phoneEvidence.slice(0,5),
    verifiedPhone:phoneEvidence[0]||null,
    emails:Array.from(emails).slice(0,5),
  };
}
async function enrichContactFacts(query:string,results:Array<{title:string,uri:string,snippet:string}>,facts:any,scope:any=null){
  if(!phoneIntent(query))return facts;

  const map=new Map<string,{value:string,sources:Set<string>}>();
  const snippetKeys=new Set<string>();
  for(const item of facts.phoneEvidence||[]){
    map.set(item.key,{value:item.value,sources:new Set(item.sources||[])});
    snippetKeys.add(item.key);
  }

  const evidence=await Promise.all(results.slice(0,6).map(async result=>({
    result,
    page:await fetchContactEvidence(result.uri),
  })));

  for(const entry of evidence){
    for(const phone of entry.page.phones||[]){
      const existing=map.get(phone.key)||{value:phone.value,sources:new Set<string>()};
      existing.sources.add(entry.result.uri);
      map.set(phone.key,existing);
    }
  }

  const phoneEvidence=Array.from(map.entries()).map(([key,item])=>({
    key,
    value:item.value,
    sourceCount:item.sources.size,
    sources:Array.from(item.sources),
  })).sort((a,b)=>{
    const aSnippet=snippetKeys.has(a.key)?1:0;
    const bSnippet=snippetKeys.has(b.key)?1:0;
    return bSnippet-aSnippet||b.sourceCount-a.sourceCount||a.value.localeCompare(b.value);
  });

  let visible:any[]=[];
  if(scope?.locationNorm){
    visible=phoneEvidence.filter(x=>snippetKeys.has(x.key)||x.sourceCount>=2);
    if(scope.countryHint==='Puerto Rico'){
      const pr=phoneEvidence.filter(x=>/^(787|939)/.test(x.key));
      if(pr.length)visible=pr;
    }
    if(visible.some(x=>!tollFreePhone(x.value))){
      visible=visible.filter(x=>!tollFreePhone(x.value));
    }
    visible=visible.slice(0,4);
  }else{
    const trusted=phoneEvidence.filter(x=>x.sourceCount>=2);
    visible=(trusted.length?trusted:phoneEvidence.slice(0,1)).slice(0,3);
  }

  const visibleKeys=new Set(visible.map(x=>x.key));
  const localContacts:any[]=[];
  const contactIds=new Set<string>();
  if(scope?.locationNorm){
    for(const result of results){
      const snippetPhones=extractPhones(String(result.title||'')+" "+String(result.snippet||'')).filter(phone=>visibleKeys.has(phone.key));
      if(snippetPhones.length){
        const id=result.uri+"|"+snippetPhones.map(x=>x.key).join(",");
        if(!contactIds.has(id)){
          contactIds.add(id);
          localContacts.push({
            title:result.title,
            uri:result.uri,
            snippet:result.snippet,
            phones:snippetPhones.map(x=>x.value),
          });
        }
      }
    }
    for(const entry of evidence){
      const combined=new Map<string,string>();
      for(const phone of extractPhones(entry.result.snippet||'')){
        if(visibleKeys.has(phone.key))combined.set(phone.key,phone.value);
      }
      for(const phone of entry.page.phones||[]){
        if(visibleKeys.has(phone.key))combined.set(phone.key,phone.value);
      }
      if(combined.size){
        const id=entry.result.uri+"|"+Array.from(combined.keys()).join(",");
        if(!contactIds.has(id)){
          contactIds.add(id);
          localContacts.push({
            title:entry.result.title,
            uri:entry.result.uri,
            snippet:entry.result.snippet,
            phones:Array.from(combined.values()),
          });
        }
      }
    }
  }

  return {
    ...facts,
    phones:visible.map(x=>x.value),
    phoneEvidence:phoneEvidence.slice(0,8),
    verifiedPhone:visible[0]||null,
    localContacts:localContacts.slice(0,6),
    localScope:scope||null,
  };
}

function digestResults(query:string,results: Array<{title:string,uri:string,snippet:string}>, facts: any) {
  const lines:string[]=[];
  const scope=facts?.localScope||localScope(query);

  if(phoneIntent(query)&&scope?.location){
    const phones=Array.isArray(facts?.phones)?facts.phones:[];
    if(phones.length>1){
      lines.push("Encontré "+phones.length+" teléfonos de "+scope.entity+" que coinciden con "+scope.location+": "+phones.join(", ")+".");
      lines.push("Hay más de una sucursal coincidente; no mezclé teléfonos de otras ciudades.");
    }else if(phones.length===1){
      lines.push("Teléfono de "+scope.entity+" en "+scope.location+": "+phones[0]+".");
    }else{
      lines.push("No pude verificar un teléfono de "+scope.entity+" específicamente en "+scope.location+". No usaré un número de otra ciudad como reemplazo.");
    }

    const contacts=Array.isArray(facts?.localContacts)?facts.localContacts:[];
    if(contacts.length){
      lines.push("Sucursales/resultados locales:");
      contacts.slice(0,5).forEach((contact:any,index:number)=>{
        const suffix=contact.snippet?" — "+contact.snippet:"";
        lines.push((index+1)+". "+contact.title+": "+(contact.phones||[]).join(", ")+suffix);
      });
    }
  }else if(phoneIntent(query)){
    if(facts.verifiedPhone){
      const count=Number(facts.verifiedPhone.sourceCount||0);
      lines.push("Teléfono público más respaldado: "+facts.verifiedPhone.value+".");
      lines.push("Verificado en "+count+" fuente"+(count===1?"":"s")+" pública"+(count===1?"":"s")+" de los resultados.");
    }else{
      lines.push("No pude verificar un teléfono público en los resultados revisados.");
    }
  }

  lines.push("Resultados públicos encontrados en la web:");
  results.slice(0,6).forEach((result,index)=>{
    lines.push((index+1)+". "+result.title+": "+(result.snippet||"Sin snippet disponible."));
  });
  if(!scope?.location&&facts.phones?.length>1)lines.push("Otros teléfonos con respaldo múltiple: "+facts.phones.slice(1).join(", ")+".");
  if(facts.emails?.length)lines.push("Correos visibles: "+facts.emails.join(", ")+".");
  return lines.join("\n").slice(0,8000);
}

async function proxyDuckSearch(searchQuery:string){
  const searchUrl=`https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
  const rows=await dbRpc("loky_mobile_search_fetch",{search_url:searchUrl});
  const row=Array.isArray(rows)?rows[0]:null;
  if(!row||Number(row.status)!==200||!row.content)throw new Error("LOCAL_SEARCH_PROXY_FAILED");
  const results=parseDuckHtmlResults(String(row.content));
  if(!results.length)throw new Error("LOCAL_SEARCH_NO_RESULTS");
  return results;
}

async function localContactSearch(query:string,scope:any){
  const variants:string[]=[];
  const add=(value:string)=>{
    const clean=String(value||'').replace(/\s+/g,' ').trim();
    if(clean&&!variants.includes(clean))variants.push(clean);
  };
  const country=scope.countryHint?` ${scope.countryHint}`:'';
  add(`${scope.entity} ${scope.location}${country} phone number`);
  add(`"${scope.entity}" "${scope.location}"${country} phone`);
  add(`${scope.entity} ${scope.location}${country}`);

  const merged:Array<{title:string,uri:string,snippet:string}>=[];
  const seen=new Set<string>();
  for(const variant of variants){
    let batch:Array<{title:string,uri:string,snippet:string}>=[];
    try{batch=await proxyDuckSearch(variant)}catch{}
    for(const item of batch){
      if(seen.has(item.uri))continue;
      seen.add(item.uri);
      merged.push(item);
    }
    if(merged.filter(item=>locationResultMatch(item,scope)).length>=5)break;
  }

  const strict=merged.filter(item=>locationResultMatch(item,scope));
  if(!strict.length)throw new Error("LOCAL_LOCATION_NOT_FOUND");
  return strict.slice(0,10);
}

async function fetchDuck(url:string){
  const response=await fetch(url,{
    method:"GET",
    headers:{
      "user-agent":"Mozilla/5.0",
      "accept":"text/html,application/xhtml+xml",
      "accept-language":"es-ES,es;q=0.9,en;q=0.8",
    },
    redirect:"follow",
  });
  if(!response.ok)throw new Error(`SEARCH_HTTP_${response.status}`);
  return await response.text();
}

async function duckSearch(query: string) {
  const encoded=encodeURIComponent(query);
  const attempts=[
    {url:`https://lite.duckduckgo.com/lite/?q=${encoded}`,parser:parseDuckLiteResults},
    {url:`https://html.duckduckgo.com/html/?q=${encoded}`,parser:parseDuckHtmlResults},
    {url:`https://duckduckgo.com/html/?q=${encoded}`,parser:parseDuckHtmlResults},
  ];

  let lastError="SEARCH_NO_RESULTS";
  for(const attempt of attempts){
    try{
      const html=await fetchDuck(attempt.url);
      const results=attempt.parser(html);
      if(results.length)return results;
      lastError="SEARCH_NO_RESULTS";
    }catch(error){
      lastError=String((error as Error)?.message||error);
    }
  }
  throw new Error(lastError);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (!allowedOrigin(req)) return json(req, { ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403);

  if (req.method === "GET") {
    return json(req, {
      ok:true,
      service:"LOKY PC4 Mobile Web Search",
      version:VERSION,
      provider:PROVIDER,
      auth:"owner-or-invited-device-capability",
      synthesis:"gemini-live-existing-session",
    });
  }

  if (req.method !== "POST") return json(req,{ok:false,error:"METHOD_NOT_ALLOWED"},405);

  const auth = await authorize(req);
  if (!auth) return json(req,{ok:false,error:"DEVICE_NOT_AUTHORIZED"},401);

  let body:any={};
  try{body=await req.json()}catch{}
  const action=String(body?.action||"search");
  if(action!=="search")return json(req,{ok:false,error:"UNKNOWN_ACTION"},400);

  const query=cleanQuery(body?.query);
  if(query.length<3)return json(req,{ok:false,error:"QUERY_REQUIRED"},400);
  if(blockedPrivateContact(query))return json(req,{ok:false,error:"PRIVATE_CONTACT_SEARCH_NOT_SUPPORTED"},403);

  try{
    let results:Array<{title:string,uri:string,snippet:string}>=[];
    let provider=PROVIDER;
    const scope=localScope(query);

    if(scope){
      provider='duckduckgo-local-proxy-v1';
      results=await localContactSearch(query,scope);
    }else{
      try{
        results=await bingSearch(query);
        provider='bing-rss-v1';
      }catch(bingError){
        provider='duckduckgo-fallback-v1';
        results=await duckSearch(query);
      }
    }

    let facts=extractPublicFacts(results);
    facts=await enrichContactFacts(query,results,facts,scope);
    return json(req,{
      ok:true,
      answer:digestResults(query,results,facts),
      results,
      sources:results.map(({title,uri})=>({title,uri})),
      facts,
      provider,
      localScope:scope,
      realtime:true,
      searchedAt:new Date().toISOString(),
      synthesis:"gemini-live-existing-session",
      accessRole:auth.role,
    });
  }catch(error){
    return json(req,{
      ok:false,
      error:String((error as Error)?.message||error).slice(0,500),
    },502);
  }
});
